import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const URGENCIES = ['low', 'normal', 'high', 'urgent'];
const REQ_STATUSES = ['pending', 'approved', 'denied', 'fulfilled'];

// List requests — users see their own; admin/agent see all
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const isStaff = ['admin', 'agent'].includes(req.user.role);
    const { status } = req.query;

    const conditions = [];
    const values = [];

    if (!isStaff) {
      conditions.push('requester_id = ?');
      values.push(req.user.sub);
    }
    if (status && REQ_STATUSES.includes(status)) {
      conditions.push('status = ?');
      values.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT * FROM asset_requests ${where} ORDER BY created_at DESC LIMIT 200`,
      values
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Create a new request — any authenticated user
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { asset_type, quantity, urgency, justification, department } = req.body || {};

    if (!asset_type || !justification) {
      return res.status(400).json({ error: 'asset_type and justification are required' });
    }
    if (urgency && !URGENCIES.includes(urgency)) {
      return res.status(400).json({ error: 'Invalid urgency level' });
    }

    const qty = Math.max(1, Math.min(Number(quantity) || 1, 50));

    const [result] = await pool.query(
      `INSERT INTO asset_requests (requester_id, requester_name, asset_type, quantity, urgency, justification, department)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.sub,
        req.user.name || req.user.email,
        String(asset_type).trim().slice(0, 60),
        qty,
        urgency || 'normal',
        String(justification).trim().slice(0, 2000),
        department ? String(department).trim().slice(0, 80) : null
      ]
    );

    const [rows] = await pool.query('SELECT * FROM asset_requests WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Update request status — admin/agent only
router.patch('/:id', requireAuth, requireRole('admin', 'agent'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status, admin_notes } = req.body || {};

    if (!status || !REQ_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Valid status is required' });
    }

    const [r] = await pool.query(
      `UPDATE asset_requests
         SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, admin_notes || null, req.user.name || req.user.email, id]
    );

    if (r.affectedRows === 0) return res.status(404).json({ error: 'Request not found' });

    const [rows] = await pool.query('SELECT * FROM asset_requests WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Delete — admin only
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const [r] = await pool.query('DELETE FROM asset_requests WHERE id = ?', [Number(req.params.id)]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Request not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
