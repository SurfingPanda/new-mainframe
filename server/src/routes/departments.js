import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, description, is_active, created_at, updated_at
         FROM departments
        ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth, requirePermission('users', 'manage'));

router.post('/', async (req, res, next) => {
  try {
    const { name, description, is_active = true } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const [result] = await pool.query(
      `INSERT INTO departments (name, description, is_active) VALUES (?, ?, ?)`,
      [
        String(name).trim().slice(0, 80),
        description ? String(description).trim().slice(0, 255) : null,
        is_active ? 1 : 0
      ]
    );
    const [rows] = await pool.query(
      `SELECT id, name, description, is_active, created_at, updated_at
         FROM departments WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A department with that name already exists' });
    }
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, description, is_active } = req.body || {};

    const fields = [];
    const values = [];
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'name cannot be blank' });
      fields.push('name = ?'); values.push(String(name).trim().slice(0, 80));
    }
    if (description !== undefined) {
      fields.push('description = ?');
      values.push(description ? String(description).trim().slice(0, 255) : null);
    }
    if (is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'nothing to update' });
    }

    values.push(id);
    const [r] = await pool.query(`UPDATE departments SET ${fields.join(', ')} WHERE id = ?`, values);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Department not found' });

    const [rows] = await pool.query(
      `SELECT id, name, description, is_active, created_at, updated_at
         FROM departments WHERE id = ?`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A department with that name already exists' });
    }
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [r] = await pool.query('DELETE FROM departments WHERE id = ?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Department not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
