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

// Escape LIKE wildcards so a query containing % or _ doesn't behave as a pattern.
const escapeLike = (s) => s.replace(/[%_\\]/g, '\\$&');

// Write a version-history snapshot capturing an article's content as it stands
// at `version` (its new current version). Used on create, edit, and restore.
async function snapshotVersion(articleId, version, { title, category, body, published, edited_by, change_note = null }) {
  await pool.query(
    `INSERT INTO kb_article_versions (article_id, version, title, category, body, published, edited_by, change_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      articleId, version,
      String(title).slice(0, 200), category ?? null, body,
      published ? 1 : 0,
      edited_by ? String(edited_by).slice(0, 120) : null,
      change_note ? String(change_note).slice(0, 255) : null
    ]
  );
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

// Deflection: suggest published articles relevant to a draft work order
// (typically the title the requester is typing on the Create form). Tokenizes
// the query, matches any token in title/body, and ranks by title-token hits,
// then helpful votes, then recency. An optional `category` floats same-category
// articles to the top. Registered before `/:slug` so the path isn't shadowed.
router.get('/suggest', requireAuth, requirePermission('kb', 'view'), async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.json([]);
    const category = req.query.category ? String(req.query.category).trim() : '';

    // Up to 6 meaningful tokens; fall back to the raw query if none qualify.
    const tokens = q.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 3).slice(0, 6);
    const terms = tokens.length ? tokens : [q];
    const likeOf = (t) => `%${escapeLike(t.toLowerCase())}%`;

    const titleHits = terms.map(() => '(LOWER(a.title) LIKE ?)').join(' + ');
    const titleParams = terms.map(likeOf);
    const whereOr = terms.map(() => '(LOWER(a.title) LIKE ? OR LOWER(a.body) LIKE ?)').join(' OR ');
    const whereParams = terms.flatMap((t) => [likeOf(t), likeOf(t)]);

    const orderParts = [];
    const orderParams = [];
    if (category) { orderParts.push('(a.category = ?) DESC'); orderParams.push(category); }
    orderParts.push('title_hits DESC', 'helpful_count DESC', 'a.updated_at DESC');

    const [rows] = await pool.query(
      `SELECT a.id, a.title, a.slug, a.category,
              (${titleHits}) AS title_hits,
              (SELECT COUNT(*) FROM kb_feedback f WHERE f.article_id = a.id AND f.helpful = 1) AS helpful_count
         FROM kb_articles a
        WHERE a.published = 1 AND (${whereOr})
        ORDER BY ${orderParts.join(', ')}
        LIMIT 5`,
      [...titleParams, ...whereParams, ...orderParams]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Feedback report for editors: per-article vote tallies (only articles that have
// received feedback), worst-rated first so gaps surface. Registered before the
// `/:slug` route so the literal path isn't shadowed by the slug param.
router.get('/feedback/report', requireAuth, requirePermission('kb', 'manage'), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.title, a.slug, a.category, a.published,
              SUM(f.helpful = 1) AS helpful_count,
              SUM(f.helpful = 0) AS not_helpful_count,
              COUNT(*) AS total
         FROM kb_feedback f
         JOIN kb_articles a ON a.id = f.article_id
        GROUP BY a.id
        ORDER BY not_helpful_count DESC, total DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
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
    const extra = canManage ? '' : 'AND a.published = 1';
    const [rows] = await pool.query(
      `SELECT a.id, a.title, a.slug, a.category, a.body, a.author, a.published, a.created_at, a.updated_at,
              (SELECT COUNT(*) FROM kb_feedback f WHERE f.article_id = a.id AND f.helpful = 1) AS helpful_count,
              (SELECT COUNT(*) FROM kb_feedback f WHERE f.article_id = a.id AND f.helpful = 0) AS not_helpful_count,
              (SELECT f.helpful FROM kb_feedback f WHERE f.article_id = a.id AND f.user_id = ? LIMIT 1) AS my_vote
         FROM kb_articles a WHERE a.slug = ? ${extra} LIMIT 1`,
      [req.user.sub, req.params.slug]
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

// Submit (or change) the current user's helpful/not vote on an article. Upsert,
// so re-voting overwrites the previous choice. Comment is optional.
router.post('/:slug/feedback', requireAuth, requirePermission('kb', 'view'), async (req, res, next) => {
  try {
    const { helpful, comment } = req.body || {};
    if (typeof helpful !== 'boolean') {
      return res.status(400).json({ error: 'helpful (boolean) is required' });
    }

    // Only votable on articles the user can actually see (published, unless staff).
    const canManage = hasPermission(req.user, 'kb', 'manage');
    const extra = canManage ? '' : 'AND published = 1';
    const [arts] = await pool.query(
      `SELECT id FROM kb_articles WHERE slug = ? ${extra} LIMIT 1`,
      [req.params.slug]
    );
    if (arts.length === 0) return res.status(404).json({ error: 'Article not found' });
    const articleId = arts[0].id;
    const note = comment ? String(comment).trim().slice(0, 1000) || null : null;

    await pool.query(
      `INSERT INTO kb_feedback (article_id, user_id, helpful, comment)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE helpful = VALUES(helpful), comment = VALUES(comment)`,
      [articleId, req.user.sub, helpful ? 1 : 0, note]
    );

    const [[agg]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM kb_feedback WHERE article_id = ? AND helpful = 1) AS helpful_count,
         (SELECT COUNT(*) FROM kb_feedback WHERE article_id = ? AND helpful = 0) AS not_helpful_count`,
      [articleId, articleId]
    );
    res.json({ ...agg, my_vote: helpful ? 1 : 0 });
  } catch (err) {
    next(err);
  }
});

// Version history list (no bodies — keeps the payload small). Editors only.
router.get('/:slug/versions', requireAuth, requirePermission('kb', 'manage'), async (req, res, next) => {
  try {
    const [arts] = await pool.query('SELECT id FROM kb_articles WHERE slug = ? LIMIT 1', [req.params.slug]);
    if (arts.length === 0) return res.status(404).json({ error: 'Article not found' });
    const [rows] = await pool.query(
      `SELECT version, title, category, published, edited_by, change_note, created_at
         FROM kb_article_versions WHERE article_id = ? ORDER BY version DESC`,
      [arts[0].id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// A single version's full snapshot (incl. body) for viewing / diffing. Editors only.
router.get('/:slug/versions/:version', requireAuth, requirePermission('kb', 'manage'), async (req, res, next) => {
  try {
    const version = Number(req.params.version);
    if (!Number.isInteger(version) || version <= 0) return res.status(400).json({ error: 'invalid version' });
    const [rows] = await pool.query(
      `SELECT v.version, v.title, v.category, v.body, v.published, v.edited_by, v.change_note, v.created_at
         FROM kb_article_versions v
         JOIN kb_articles a ON a.id = v.article_id
        WHERE a.slug = ? AND v.version = ? LIMIT 1`,
      [req.params.slug, version]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Version not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Restore an old version: re-applies its content as a NEW version (non-destructive).
// Leaves the current published state untouched.
router.post('/:slug/versions/:version/restore', requireAuth, requirePermission('kb', 'manage'), async (req, res, next) => {
  try {
    const version = Number(req.params.version);
    if (!Number.isInteger(version) || version <= 0) return res.status(400).json({ error: 'invalid version' });

    const [arts] = await pool.query(
      'SELECT id, version, published FROM kb_articles WHERE slug = ? LIMIT 1', [req.params.slug]
    );
    if (arts.length === 0) return res.status(404).json({ error: 'Article not found' });
    const article = arts[0];

    const [snaps] = await pool.query(
      'SELECT title, category, body FROM kb_article_versions WHERE article_id = ? AND version = ? LIMIT 1',
      [article.id, version]
    );
    if (snaps.length === 0) return res.status(404).json({ error: 'Version not found' });
    const snap = snaps[0];

    const newVersion = article.version + 1;
    await pool.query(
      'UPDATE kb_articles SET title = ?, category = ?, body = ?, version = ? WHERE id = ?',
      [snap.title, snap.category ?? null, snap.body, newVersion, article.id]
    );
    await snapshotVersion(article.id, newVersion, {
      title: snap.title, category: snap.category, body: snap.body,
      published: article.published, edited_by: req.user?.name || req.user?.email,
      change_note: `Restored from v${version}`
    });

    const [rows] = await pool.query('SELECT * FROM kb_articles WHERE id = ?', [article.id]);
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
    const article = rows[0];
    await snapshotVersion(article.id, 1, {
      title: article.title, category: article.category, body: article.body,
      published: article.published, edited_by: req.user?.name || req.user?.email,
      change_note: 'Initial version'
    });
    res.status(201).json(article);
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

    const [beforeRows] = await pool.query(
      'SELECT id, title, category, body, published, author, version FROM kb_articles WHERE slug = ? LIMIT 1',
      [req.params.slug]
    );
    if (beforeRows.length === 0) return res.status(404).json({ error: 'Article not found' });
    const before = beforeRows[0];

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
    const after = rows[0];

    // Snapshot a new version only when the content (title/category/body) actually
    // changed — a bare publish toggle doesn't warrant a revision.
    const contentChanged =
      after.title !== before.title ||
      (after.category ?? null) !== (before.category ?? null) ||
      after.body !== before.body;
    if (contentChanged) {
      // Backfill a baseline for articles created before versioning existed, so
      // their history isn't missing the pre-edit starting point.
      const [[{ c }]] = await pool.query(
        'SELECT COUNT(*) AS c FROM kb_article_versions WHERE article_id = ?', [before.id]
      );
      if (c === 0) {
        await snapshotVersion(before.id, before.version, {
          title: before.title, category: before.category, body: before.body,
          published: before.published, edited_by: before.author || 'system', change_note: 'Baseline'
        });
      }
      const newVersion = before.version + 1;
      await pool.query('UPDATE kb_articles SET version = ? WHERE id = ?', [newVersion, before.id]);
      await snapshotVersion(before.id, newVersion, {
        title: after.title, category: after.category, body: after.body,
        published: after.published, edited_by: req.user?.name || req.user?.email,
        change_note: req.body?.change_note
      });
      after.version = newVersion;
    }

    res.json(after);
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
