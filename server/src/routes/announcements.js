import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Announcements can be managed by admins and anyone in the IT department.
const canManage = (user) =>
  user?.role === 'admin' || String(user?.department || '').trim().toUpperCase() === 'IT';

const TYPES = ['info', 'maintenance', 'warning'];
const TITLE_MAX = 160;
const BODY_MAX = 4000;

// Normalize a datetime-local string ("YYYY-MM-DDTHH:MM") to a MySQL DATETIME
// ("YYYY-MM-DD HH:MM:SS"). Returns null for blank/invalid input.
function toDateTime(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).replace('T', ' ').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] || '00'}`;
}

function shape(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    is_active: !!row.is_active,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

router.use(requireAuth);

// GET /api/announcements — active announcements currently in their window
// (for everyone). Admins can pass ?all=1 to list everything for management.
router.get('/', async (req, res, next) => {
  try {
    if (canManage(req.user) && (req.query.all === '1' || req.query.all === 'true')) {
      const [rows] = await pool.query('SELECT * FROM announcements ORDER BY created_at DESC');
      return res.json(rows.map(shape));
    }
    const [rows] = await pool.query(
      `SELECT * FROM announcements
        WHERE is_active = 1
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (ends_at   IS NULL OR ends_at   >= NOW())
        ORDER BY (type = 'warning') DESC, (type = 'maintenance') DESC, created_at DESC`
    );
    res.json(rows.map(shape));
  } catch (err) {
    next(err);
  }
});

// Writes are restricted to admins and the IT department.
router.use((req, res, next) => {
  if (!canManage(req.user)) return res.status(403).json({ error: 'Only IT staff can manage announcements' });
  next();
});

router.post('/', async (req, res, next) => {
  try {
    const title = String(req.body?.title ?? '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (title.length > TITLE_MAX) return res.status(400).json({ error: `Title must be ${TITLE_MAX} characters or fewer` });
    const body = String(req.body?.body ?? '').trim().slice(0, BODY_MAX) || null;
    const type = TYPES.includes(req.body?.type) ? req.body.type : 'info';
    const startsAt = toDateTime(req.body?.starts_at);
    const endsAt = toDateTime(req.body?.ends_at);
    const isActive = req.body?.is_active === undefined ? 1 : (req.body.is_active ? 1 : 0);

    const [result] = await pool.query(
      `INSERT INTO announcements (title, body, type, starts_at, ends_at, is_active, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, body, type, startsAt, endsAt, isActive, req.user.sub, req.user.name]
    );
    const [[row]] = await pool.query('SELECT * FROM announcements WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json(shape(row));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });

    const sets = [];
    const params = [];
    if (req.body?.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ error: 'Title is required' });
      if (title.length > TITLE_MAX) return res.status(400).json({ error: `Title must be ${TITLE_MAX} characters or fewer` });
      sets.push('title = ?'); params.push(title);
    }
    if (req.body?.body !== undefined) { sets.push('body = ?'); params.push(String(req.body.body ?? '').trim().slice(0, BODY_MAX) || null); }
    if (req.body?.type !== undefined) {
      if (!TYPES.includes(req.body.type)) return res.status(400).json({ error: 'invalid type' });
      sets.push('type = ?'); params.push(req.body.type);
    }
    if (req.body?.starts_at !== undefined) { sets.push('starts_at = ?'); params.push(toDateTime(req.body.starts_at)); }
    if (req.body?.ends_at !== undefined) { sets.push('ends_at = ?'); params.push(toDateTime(req.body.ends_at)); }
    if (req.body?.is_active !== undefined) { sets.push('is_active = ?'); params.push(req.body.is_active ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(id);
    const [r] = await pool.query(`UPDATE announcements SET ${sets.join(', ')} WHERE id = ?`, params);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Announcement not found' });
    const [[row]] = await pool.query('SELECT * FROM announcements WHERE id = ? LIMIT 1', [id]);
    res.json(shape(row));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
    const [r] = await pool.query('DELETE FROM announcements WHERE id = ?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Announcement not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
