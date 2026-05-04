import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();

const STATUSES = ['in_use', 'in_storage', 'repair', 'retired'];
const ASSET_TYPES = [
  'Laptop', 'Desktop', 'Monitor', 'Keyboard', 'Mouse',
  'Printer', 'Scanner', 'Phone', 'Tablet', 'Server',
  'Networking', 'UPS', 'Docking Station', 'Headset', 'Other'
];

router.get('/', requireAuth, requirePermission('assets', 'view'), async (req, res, next) => {
  try {
    const { status, type, q } = req.query;
    const conditions = [];
    const values = [];

    if (status && STATUSES.includes(status)) {
      conditions.push('status = ?'); values.push(status);
    }
    if (type) {
      conditions.push('type = ?'); values.push(type);
    }
    if (q) {
      conditions.push('(asset_tag LIKE ? OR model LIKE ? OR assignee LIKE ? OR serial_no LIKE ? OR location LIKE ?)');
      const like = `%${q}%`;
      values.push(like, like, like, like, like);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT id, asset_tag, type, model, serial_no, assignee, location, status, purchased_at, created_at, updated_at
         FROM assets ${where}
        ORDER BY asset_tag ASC
        LIMIT 500`,
      values
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/meta/types', requireAuth, requirePermission('assets', 'view'), (_req, res) => {
  res.json(ASSET_TYPES);
});

router.get('/:id', requireAuth, requirePermission('assets', 'view'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM assets WHERE id = ?',
      [Number(req.params.id)]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requirePermission('assets', 'manage'), async (req, res, next) => {
  try {
    const { asset_tag, type, model, serial_no, assignee, location, status = 'in_use', purchased_at } = req.body || {};
    if (!asset_tag || !type) {
      return res.status(400).json({ error: 'asset_tag and type are required' });
    }
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    const [result] = await pool.query(
      `INSERT INTO assets (asset_tag, type, model, serial_no, assignee, location, status, purchased_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(asset_tag).trim().toUpperCase().slice(0, 60),
        String(type).trim().slice(0, 60),
        model ? String(model).trim().slice(0, 120) : null,
        serial_no ? String(serial_no).trim().slice(0, 120) : null,
        assignee ? String(assignee).trim().slice(0, 120) : null,
        location ? String(location).trim().slice(0, 120) : null,
        status,
        purchased_at || null
      ]
    );
    const [rows] = await pool.query('SELECT * FROM assets WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An asset with that tag already exists' });
    }
    next(err);
  }
});

router.patch('/:id', requireAuth, requirePermission('assets', 'manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { asset_tag, type, model, serial_no, assignee, location, status, purchased_at } = req.body || {};

    const fields = [];
    const values = [];

    if (asset_tag !== undefined) { fields.push('asset_tag = ?'); values.push(String(asset_tag).trim().toUpperCase().slice(0, 60)); }
    if (type !== undefined)      { fields.push('type = ?');      values.push(String(type).trim().slice(0, 60)); }
    if (model !== undefined)     { fields.push('model = ?');     values.push(model ? String(model).trim().slice(0, 120) : null); }
    if (serial_no !== undefined) { fields.push('serial_no = ?'); values.push(serial_no ? String(serial_no).trim().slice(0, 120) : null); }
    if (assignee !== undefined)  { fields.push('assignee = ?');  values.push(assignee ? String(assignee).trim().slice(0, 120) : null); }
    if (location !== undefined)  { fields.push('location = ?');  values.push(location ? String(location).trim().slice(0, 120) : null); }
    if (status !== undefined) {
      if (!STATUSES.includes(status)) return res.status(400).json({ error: 'invalid status' });
      fields.push('status = ?'); values.push(status);
    }
    if (purchased_at !== undefined) { fields.push('purchased_at = ?'); values.push(purchased_at || null); }

    if (fields.length === 0) return res.status(400).json({ error: 'nothing to update' });

    values.push(id);
    const [r] = await pool.query(`UPDATE assets SET ${fields.join(', ')} WHERE id = ?`, values);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Asset not found' });

    const [rows] = await pool.query('SELECT * FROM assets WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An asset with that tag already exists' });
    }
    next(err);
  }
});

router.delete('/:id', requireAuth, requirePermission('assets', 'manage'), async (req, res, next) => {
  try {
    const [r] = await pool.query('DELETE FROM assets WHERE id = ?', [Number(req.params.id)]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
