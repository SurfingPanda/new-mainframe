import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { effectivePermissions } from '../lib/permissions.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const [rows] = await pool.query(
      'SELECT id, email, password_hash, name, role, department, is_active, permissions FROM users WHERE email = ? LIMIT 1',
      [email.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    const permissions = effectivePermissions(user);
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, name: user.name, permissions },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        permissions
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, email, name, role, department, permissions, last_login_at FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
      [req.user.sub]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const me = rows[0];
    me.permissions = effectivePermissions(me);
    res.json(me);
  } catch (err) {
    next(err);
  }
});

export default router;
