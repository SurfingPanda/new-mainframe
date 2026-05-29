import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pool } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { hasPermission } from '../lib/permissions.js';

const router = Router();

// ── Article media uploads (images + PDF), embedded inline in article markdown ──
const KB_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'kb');
fs.mkdirSync(KB_UPLOAD_DIR, { recursive: true });

const KB_ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'
]);

const kbUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, KB_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      const stamp = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
      cb(null, `${stamp}-${safe}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!KB_ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: images and PDF.`));
    }
    cb(null, true);
  }
});

function kbUploadMiddleware(req, res, next) {
  kbUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File is larger than 10 MB.' });
    }
    return res.status(400).json({ error: err.message || 'Could not process the file.' });
  });
}

const CATEGORIES = [
  'Accounts', 'Networking', 'Hardware', 'Software',
  'Security', 'Email & Communication', 'Printing & Peripherals',
  'Troubleshooting', 'FAQ', 'Policies', 'General'
];

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 200);
}

router.get('/', requireAuth, requirePermission('kb', 'view'), async (req, res, next) => {
  try {
    const { category, q, published } = req.query;
    // Users who can manage KB can also see drafts; everyone else sees published only.
    const canManage = hasPermission(req.user, 'kb', 'manage');

    const conditions = [];
    const values = [];

    if (!canManage) {
      conditions.push('published = 1');
    } else if (published === '1') {
      conditions.push('published = 1');
    } else if (published === '0') {
      conditions.push('published = 0');
    }

    if (category) {
      conditions.push('category = ?');
      values.push(category);
    }

    if (q) {
      conditions.push('(title LIKE ? OR body LIKE ?)');
      values.push(`%${q}%`, `%${q}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT a.id, a.title, a.slug, a.category, a.author, a.published,
              a.created_at, a.updated_at,
              COUNT(l.id) AS link_count
         FROM kb_articles a
         LEFT JOIN ticket_kb_links l ON l.article_id = a.id
         ${where}
        GROUP BY a.id
        ORDER BY a.updated_at DESC
        LIMIT 200`,
      values
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/meta/categories', requireAuth, requirePermission('kb', 'view'), (_req, res) => {
  res.json(CATEGORIES);
});

// Upload an image/PDF to embed in an article. Authors only. Returns a URL the
// editor inserts into the markdown body.
router.post('/upload', requireAuth, requirePermission('kb', 'manage'), kbUploadMiddleware, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.status(201).json({
    url: `/uploads/kb/${req.file.filename}`,
    filename: req.file.originalname,
    mime: req.file.mimetype,
    isImage: req.file.mimetype.startsWith('image/')
  });
});

router.get('/:slug', requireAuth, requirePermission('kb', 'view'), async (req, res, next) => {
  try {
    const canManage = hasPermission(req.user, 'kb', 'manage');
    const extra = canManage ? '' : 'AND published = 1';
    const [rows] = await pool.query(
      `SELECT id, title, slug, category, body, author, published, created_at, updated_at
         FROM kb_articles WHERE slug = ? ${extra} LIMIT 1`,
      [req.params.slug]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Article not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Tickets that link to this article, shown on the article page to anyone who
// can view the KB. Returns [] for an unknown slug or an article with no links.
router.get('/:slug/tickets', requireAuth, requirePermission('kb', 'view'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.title, t.status, t.priority, t.created_at,
              l.created_at AS linked_at, l.linked_by
         FROM kb_articles a
         JOIN ticket_kb_links l ON l.article_id = a.id
         JOIN tickets t ON t.id = l.ticket_id
        WHERE a.slug = ?
        ORDER BY l.created_at DESC
        LIMIT 100`,
      [req.params.slug]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requirePermission('kb', 'manage'), async (req, res, next) => {
  try {
    const { title, category, body, author, published = true } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }
    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'invalid category' });
    }

    const baseSlug = slugify(title);
    let slug = baseSlug;
    // Ensure uniqueness
    const [existing] = await pool.query('SELECT slug FROM kb_articles WHERE slug LIKE ? LIMIT 20', [`${baseSlug}%`]);
    if (existing.length > 0) {
      const taken = new Set(existing.map((r) => r.slug));
      if (taken.has(slug)) {
        let i = 2;
        while (taken.has(`${baseSlug}-${i}`)) i++;
        slug = `${baseSlug}-${i}`;
      }
    }

    const [result] = await pool.query(
      `INSERT INTO kb_articles (title, slug, category, body, author, published)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        String(title).trim().slice(0, 200),
        slug,
        category || null,
        String(body).trim(),
        author ? String(author).trim().slice(0, 120) : null,
        published ? 1 : 0
      ]
    );
    const [rows] = await pool.query('SELECT * FROM kb_articles WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:slug', requireAuth, requirePermission('kb', 'manage'), async (req, res, next) => {
  try {
    const { title, category, body, author, published } = req.body || {};

    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'invalid category' });
    }

    const fields = [];
    const values = [];

    if (title !== undefined) { fields.push('title = ?'); values.push(String(title).trim().slice(0, 200)); }
    if (category !== undefined) { fields.push('category = ?'); values.push(category || null); }
    if (body !== undefined) { fields.push('body = ?'); values.push(String(body).trim()); }
    if (author !== undefined) { fields.push('author = ?'); values.push(author ? String(author).trim().slice(0, 120) : null); }
    if (published !== undefined) { fields.push('published = ?'); values.push(published ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'nothing to update' });
    }

    values.push(req.params.slug);
    const [r] = await pool.query(`UPDATE kb_articles SET ${fields.join(', ')} WHERE slug = ?`, values);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Article not found' });

    const [rows] = await pool.query('SELECT * FROM kb_articles WHERE slug = ?', [req.params.slug]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:slug', requireAuth, requirePermission('kb', 'manage'), async (req, res, next) => {
  try {
    const [r] = await pool.query('DELETE FROM kb_articles WHERE slug = ?', [req.params.slug]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Article not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
