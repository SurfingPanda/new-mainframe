import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { hasPermission } from '../lib/permissions.js';

const router = Router();

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
      `SELECT id, title, slug, category, author, published, created_at, updated_at
         FROM kb_articles ${where}
        ORDER BY updated_at DESC
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
