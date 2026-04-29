import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const ROLES = ['admin', 'agent', 'user'];

router.use(requireAuth, requireRole('admin'));

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, email, name, role, department, is_active, last_login_at, created_at, updated_at
         FROM users
        ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { email, password, name, role = 'user', department, is_active = true } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'invalid role' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(String(password), 10);
    const [result] = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, department, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        String(email).trim().toLowerCase(),
        hash,
        String(name).trim().slice(0, 120),
        role,
        department ? String(department).trim().slice(0, 80) : null,
        is_active ? 1 : 0
      ]
    );
    const [rows] = await pool.query(
      `SELECT id, email, name, role, department, is_active, last_login_at, created_at, updated_at
         FROM users WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A user with that email already exists' });
    }
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, role, department, is_active } = req.body || {};

    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(String(name).trim().slice(0, 120)); }
    if (role !== undefined) {
      if (!ROLES.includes(role)) return res.status(400).json({ error: 'invalid role' });
      fields.push('role = ?'); values.push(role);
    }
    if (department !== undefined) {
      fields.push('department = ?');
      values.push(department ? String(department).trim().slice(0, 80) : null);
    }
    if (is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'nothing to update' });
    }

    if (req.user.sub === id) {
      if (role !== undefined && role !== 'admin') {
        return res.status(400).json({ error: 'You cannot demote your own account.' });
      }
      if (is_active !== undefined && !is_active) {
        return res.status(400).json({ error: 'You cannot deactivate your own account.' });
      }
    }

    values.push(id);
    const [r] = await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'User not found' });

    const [rows] = await pool.query(
      `SELECT id, email, name, role, department, is_active, last_login_at, created_at, updated_at
         FROM users WHERE id = ?`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { password } = req.body || {};
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(String(password), 10);
    const [r] = await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
