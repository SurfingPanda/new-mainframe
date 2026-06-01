import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { effectivePermissions, sanitizePermissions } from '../lib/permissions.js';

const router = Router();
const ROLES = ['admin', 'agent', 'user'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Readable random password (no ambiguous chars) for bulk-imported accounts.
function generatePassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function decoratePermissions(row) {
  if (!row) return row;
  // Keep raw overrides under `permissions` (may be null when unset)
  // and expose the resolved view under `effective_permissions`.
  const raw = row.permissions;
  row.permissions = sanitizePermissions(raw);
  row.effective_permissions = effectivePermissions({ role: row.role, permissions: raw });
  return row;
}

router.get('/assignable', requireAuth, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, role, department
         FROM users
        WHERE is_active = 1
        ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/directory', requireAuth, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, role, department, last_seen_at
         FROM users
        WHERE is_active = 1
        ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth, requirePermission('users', 'manage'));

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, email, name, role, department, is_active, permissions, last_login_at, created_at, updated_at
         FROM users
        ORDER BY created_at DESC`
    );
    res.json(rows.map(decoratePermissions));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { email, password, name, role = 'user', department, is_active = true, permissions } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'invalid role' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }
    const cleanPerms = permissions === undefined ? null : sanitizePermissions(permissions);
    const hash = await bcrypt.hash(String(password), 10);
    const [result] = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, department, is_active, permissions)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(email).trim().toLowerCase(),
        hash,
        String(name).trim().slice(0, 120),
        role,
        department ? String(department).trim().slice(0, 80) : null,
        is_active ? 1 : 0,
        cleanPerms ? JSON.stringify(cleanPerms) : null
      ]
    );
    const [rows] = await pool.query(
      `SELECT id, email, name, role, department, is_active, permissions, last_login_at, created_at, updated_at
         FROM users WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json(decoratePermissions(rows[0]));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A user with that email already exists' });
    }
    next(err);
  }
});

// Bulk-create users from a parsed spreadsheet (CSV/XLSX parsed client-side).
// Body: { users: [{ name, email, department?, role? }, ...] }. A random
// password is generated per user and returned once so the admin can distribute
// it — passwords are never stored in plaintext. Each row reports its own
// outcome so a few bad rows don't fail the whole batch.
router.post('/import', async (req, res, next) => {
  try {
    const list = Array.isArray(req.body?.users) ? req.body.users : null;
    if (!list || !list.length) {
      return res.status(400).json({ error: 'users array is required' });
    }
    if (list.length > 500) {
      return res.status(400).json({ error: 'too many rows (max 500 per import)' });
    }

    const results = [];
    const seen = new Set();

    for (let i = 0; i < list.length; i++) {
      const raw = list[i] || {};
      const rowNum = i + 1;
      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
      const role = raw.role ? String(raw.role).trim().toLowerCase() : 'user';
      const department = raw.department ? String(raw.department).trim().slice(0, 80) : null;
      const base = { row: rowNum, name, email, department, role };

      if (!name || !email) {
        results.push({ ...base, status: 'error', error: 'name and email are required' });
        continue;
      }
      if (!EMAIL_RE.test(email)) {
        results.push({ ...base, status: 'error', error: 'invalid email' });
        continue;
      }
      if (!ROLES.includes(role)) {
        results.push({ ...base, status: 'error', error: `invalid role "${role}"` });
        continue;
      }
      if (seen.has(email)) {
        results.push({ ...base, status: 'skipped', error: 'duplicate email within file' });
        continue;
      }
      seen.add(email);

      const password = generatePassword();
      try {
        const hash = await bcrypt.hash(password, 10);
        await pool.query(
          `INSERT INTO users (email, password_hash, name, role, department, is_active)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [email, hash, name.slice(0, 120), role, department]
        );
        results.push({ ...base, status: 'created', password });
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          results.push({ ...base, status: 'skipped', error: 'email already exists' });
        } else {
          results.push({ ...base, status: 'error', error: 'could not create user' });
        }
      }
    }

    res.json({
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'error').length,
      results
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, role, department, is_active, permissions } = req.body || {};

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
    if (permissions !== undefined) {
      const cleanPerms = sanitizePermissions(permissions);
      fields.push('permissions = ?');
      values.push(cleanPerms ? JSON.stringify(cleanPerms) : null);
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
      if (permissions !== undefined) {
        return res.status(400).json({ error: 'You cannot change your own permissions.' });
      }
    }

    values.push(id);
    const [r] = await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'User not found' });

    const [rows] = await pool.query(
      `SELECT id, email, name, role, department, is_active, permissions, last_login_at, created_at, updated_at
         FROM users WHERE id = ?`,
      [id]
    );
    res.json(decoratePermissions(rows[0]));
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
