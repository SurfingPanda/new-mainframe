import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { effectivePermissions } from '../lib/permissions.js';
import { sendMailSafe, appUrl } from '../lib/mailer.js';
import { passwordResetLink } from '../lib/email-templates.js';

const router = Router();

// Throttle login attempts per client IP to blunt password brute-forcing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please wait a few minutes and try again.'
});

// Throttle password-reset requests to discourage enumeration / spam.
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many requests. Please wait a few minutes and try again.'
});

router.post('/login', loginLimiter, async (req, res, next) => {
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

// Always respond with success so attackers can't enumerate which emails have
// accounts. If the email matches an active user we log the request server-side
// so an IT admin can follow up via the Users page reset-password flow.
router.post('/forgot-password', forgotLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ok = res.json.bind(res, { ok: true });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return ok();
    }

    const [rows] = await pool.query(
      'SELECT id, email, name, is_active FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];
    if (user && user.is_active) {
      // Coalesce repeats: if this user already has a pending request, just
      // bump it instead of stacking duplicate rows.
      const [existing] = await pool.query(
        `SELECT id FROM password_reset_requests
          WHERE user_id = ? AND status = 'pending'
          LIMIT 1`,
        [user.id]
      );
      if (existing.length) {
        await pool.query(
          'UPDATE password_reset_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [existing[0].id]
        );
      } else {
        await pool.query(
          'INSERT INTO password_reset_requests (user_id, email) VALUES (?, ?)',
          [user.id, user.email]
        );
      }

      // Issue a single-use, 1-hour self-service reset link. Only the SHA-256
      // hash is stored; the raw token lives only in the emailed URL.
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await pool.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [user.id, tokenHash, expiresAt]
      );
      sendMailSafe({
        to: user.email,
        ...passwordResetLink(user.name, appUrl(`/reset-password?token=${rawToken}`))
      });
    }
    return ok();
  } catch (err) {
    next(err);
  }
});

// Self-service reset: consume a token from the emailed link and set a new
// password. Public + rate-limited. Errors are generic (no enumeration).
router.post('/reset-password', forgotLimiter, async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = req.body?.new_password;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'token and new_password are required' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'new password must be at least 8 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [rows] = await pool.query(
      `SELECT id, user_id FROM password_reset_tokens
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
        LIMIT 1`,
      [tokenHash]
    );
    const row = rows[0];
    if (!row) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const hash = await bcrypt.hash(String(newPassword), 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, row.user_id]);
    await pool.query('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
    // Close any pending IT-queue request now that the user reset it themselves.
    await pool.query(
      `UPDATE password_reset_requests
          SET status = 'resolved', resolved_by = 'self-service', resolved_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND status = 'pending'`,
      [row.user_id]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, email, name, role, department, permissions, last_login_at, created_at FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
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

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }
    if (String(new_password).length < 8) {
      return res.status(400).json({ error: 'new password must be at least 8 characters' });
    }
    if (current_password === new_password) {
      return res.status(400).json({ error: 'new password must be different from current password' });
    }

    const [rows] = await pool.query(
      'SELECT id, password_hash FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
      [req.user.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const ok = await bcrypt.compare(String(current_password), rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(String(new_password), 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.sub]);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
