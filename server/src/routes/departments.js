import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();

// Shared projection: the department plus its manager's display name (LEFT JOIN
// so a department with no manager / a removed manager still returns a row).
const DEPT_SELECT = `
  SELECT d.id, d.name, d.description, d.manager_id, u.name AS manager_name,
         d.is_hr, d.is_active, d.created_at, d.updated_at
    FROM departments d
    LEFT JOIN users u ON u.id = d.manager_id`;

// At most one department is the HR/approvals target. Clear the flag everywhere
// else when a department is marked is_hr.
async function clearOtherHrFlags(keepId) {
  await pool.query('UPDATE departments SET is_hr = 0 WHERE id <> ?', [keepId]);
}

// Validate a manager_id from a request body against the department it will head.
// Returns { value } where value is undefined (not provided), null (clear), or a
// user id; throws a 400-shaped error otherwise. The manager must be an active
// user already labelled with this department — which also keeps a user from
// heading more than one department (users.department is a single value).
async function resolveManagerId(raw, deptName) {
  if (raw === undefined) return undefined;            // field omitted → leave as-is
  if (raw === null || raw === '') return null;        // explicit clear
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    const e = new Error('Invalid manager'); e.status = 400; throw e;
  }
  const [[u]] = await pool.query('SELECT id, is_active, department FROM users WHERE id = ? LIMIT 1', [id]);
  if (!u || !u.is_active) {
    const e = new Error('Manager must be an active user'); e.status = 400; throw e;
  }
  if ((u.department || '') !== deptName) {
    const e = new Error('The manager must belong to this department'); e.status = 400; throw e;
  }
  return id;
}

router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`${DEPT_SELECT} ORDER BY d.name ASC`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth, requirePermission('users', 'manage'));

router.post('/', async (req, res, next) => {
  try {
    const { name, description, is_active = true, manager_id, is_hr } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const deptName = String(name).trim().slice(0, 80);
    let managerId;
    try {
      managerId = await resolveManagerId(manager_id, deptName);
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }
    const [result] = await pool.query(
      `INSERT INTO departments (name, description, is_active, manager_id, is_hr) VALUES (?, ?, ?, ?, ?)`,
      [
        deptName,
        description ? String(description).trim().slice(0, 255) : null,
        is_active ? 1 : 0,
        managerId ?? null,
        is_hr ? 1 : 0
      ]
    );
    if (is_hr) await clearOtherHrFlags(result.insertId);
    const [rows] = await pool.query(`${DEPT_SELECT} WHERE d.id = ?`, [result.insertId]);
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
    const { name, description, is_active, manager_id, is_hr } = req.body || {};

    // The manager's department label must match this department's (possibly new)
    // name, so resolve the effective name first when validating manager_id.
    const [[current]] = await pool.query('SELECT name FROM departments WHERE id = ? LIMIT 1', [id]);
    if (!current) return res.status(404).json({ error: 'Department not found' });
    const effectiveName = name !== undefined && String(name).trim()
      ? String(name).trim().slice(0, 80)
      : current.name;

    const fields = [];
    const values = [];
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'name cannot be blank' });
      fields.push('name = ?'); values.push(effectiveName);
    }
    if (description !== undefined) {
      fields.push('description = ?');
      values.push(description ? String(description).trim().slice(0, 255) : null);
    }
    if (is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }
    if (manager_id !== undefined) {
      let managerId;
      try {
        managerId = await resolveManagerId(manager_id, effectiveName);
      } catch (e) {
        return res.status(e.status || 400).json({ error: e.message });
      }
      fields.push('manager_id = ?'); values.push(managerId);
    }
    if (is_hr !== undefined) {
      fields.push('is_hr = ?'); values.push(is_hr ? 1 : 0);
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'nothing to update' });
    }

    values.push(id);
    const [r] = await pool.query(`UPDATE departments SET ${fields.join(', ')} WHERE id = ?`, values);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Department not found' });
    if (is_hr) await clearOtherHrFlags(id);

    const [rows] = await pool.query(`${DEPT_SELECT} WHERE d.id = ?`, [id]);
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
