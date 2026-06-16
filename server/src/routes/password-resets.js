import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { passwordPolicyError, BCRYPT_ROUNDS } from '../lib/password-policy.js';

const router = Router();

router.use(requireAuth, requirePermission('users', 'manage'));

const ALLOWED_STATUSES = ['pending', 'resolved', 'denied'];

router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const conditions = [];
    const values = [];
    if (status && ALLOWED_STATUSES.includes(status)) {
      conditions.push('r.status = ?');
      values.push(status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT r.id, r.user_id, r.email, r.status, r.resolved_by, r.resolved_at,
              r.admin_notes, r.created_at, r.updated_at,
              u.name AS user_name, u.role AS user_role, u.department AS user_department,
              u.is_active AS user_is_active
         FROM password_reset_requests r
         LEFT JOIN users u ON u.id = r.user_id
         ${where}
        ORDER BY (r.status = 'pending') DESC, r.created_at DESC
        LIMIT 200`,
      values
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status, admin_notes, new_password } = req.body || {};

    if (status && !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'invalid status' });
    }

    const [reqRows] = await pool.query(
      'SELECT id, user_id FROM password_reset_requests WHERE id = ? LIMIT 1',
      [id]
    );
    const request = reqRows[0];
    if (!request) return res.status(404).json({ error: 'Request not found' });

    // Optional: rotate the user's password as part of resolving the request.
    if (new_password !== undefined && new_password !== null && new_password !== '') {
      const policyError = passwordPolicyError(new_password);
      if (policyError) {
        return res.status(400).json({ error: policyError });
      }
      const hash = await bcrypt.hash(String(new_password), BCRYPT_ROUNDS);
      // Bump token_version so any sessions the user had open are invalidated.
      await pool.query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, request.user_id]);
    }

    const fields = [];
    const values = [];
    if (status !== undefined) {
      fields.push('status = ?');
      values.push(status);
      fields.push('resolved_by = ?');
      values.push(req.user.name || req.user.email);
      fields.push('resolved_at = CURRENT_TIMESTAMP');
    }
    if (admin_notes !== undefined) {
      fields.push('admin_notes = ?');
      values.push(admin_notes ? String(admin_notes).slice(0, 2000) : null);
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'nothing to update' });
    }
    values.push(id);
    await pool.query(
      `UPDATE password_reset_requests SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    const [rows] = await pool.query(
      `SELECT r.id, r.user_id, r.email, r.status, r.resolved_by, r.resolved_at,
              r.admin_notes, r.created_at, r.updated_at,
              u.name AS user_name, u.role AS user_role, u.department AS user_department,
              u.is_active AS user_is_active
         FROM password_reset_requests r
         LEFT JOIN users u ON u.id = r.user_id
        WHERE r.id = ?`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [r] = await pool.query('DELETE FROM password_reset_requests WHERE id = ?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Request not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
