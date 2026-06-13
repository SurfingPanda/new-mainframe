import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { requireAuth, AUTH_COOKIE } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { effectivePermissions } from '../lib/permissions.js';
import { sendMailSafe, appUrl } from '../lib/mailer.js';
import { passwordResetLink } from '../lib/email-templates.js';
import { passwordPolicyError } from '../lib/password-policy.js';
import { avatarUpload, saveAvatar, removeAvatarFile, InvalidImageError } from '../lib/avatar-upload.js';
import { signatureUpload, saveSignature, removeSignatureFile } from '../lib/signature-upload.js';
import { slaStanding } from '../lib/sla.js';

const router = Router();

// Auth token lives in an httpOnly cookie so client-side script (and any XSS)
// can't read it. SameSite=Lax keeps it off cross-site mutation requests (CSRF
// defense); `secure` is on in production so it's only sent over HTTPS.
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7d, matches default JWT TTL
function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };
}
function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, { ...authCookieOptions(), maxAge: AUTH_COOKIE_MAX_AGE_MS });
}
function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, authCookieOptions());
}

// Throttle login attempts per client IP to blunt password brute-forcing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please wait a few minutes and try again.'
});

// Second login limiter keyed on the target email, not the IP. The per-IP limiter
// above can't stop an attacker rotating IPs against one account; this caps attempts
// per account regardless of source. Keyed independently, so the two compose.
const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts for this account. Please wait a few minutes and try again.',
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    return email ? `login:${email}` : null; // no email → let the handler 400
  }
});

// Throttle authenticated change-password by user id: current_password is checked
// with bcrypt, so without a cap a hijacked session could brute-force it.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password change attempts. Please wait a few minutes and try again.',
  keyGenerator: (req) => (req.user?.sub ? `pw:${req.user.sub}` : req.ip || 'unknown')
});

// Throttle password-reset requests to discourage enumeration / spam.
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many requests. Please wait a few minutes and try again.'
});

// Throttle profile-picture uploads so a client can't fill the disk.
const avatarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many photo uploads. Please wait a few minutes and try again.'
});

router.post('/login', loginLimiter, loginEmailLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const [rows] = await pool.query(
      'SELECT id, email, password_hash, name, role, department, job_title, avatar_url, signature_url, is_active, permissions, token_version FROM users WHERE email = ? LIMIT 1',
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
      { sub: user.id, email: user.email, role: user.role, name: user.name, permissions, tv: user.token_version ?? 0 },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    setAuthCookie(res, token);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        job_title: user.job_title,
        avatar_url: user.avatar_url,
        signature_url: user.signature_url,
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
    const resetPolicyError = passwordPolicyError(newPassword);
    if (resetPolicyError) {
      return res.status(400).json({ error: resetPolicyError });
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
    // Bump token_version so any sessions opened before the reset are invalidated.
    await pool.query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, row.user_id]);
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

const ME_COLUMNS =
  'id, email, name, role, department, job_title, avatar_url, signature_url, permissions, preferences, last_login_at, created_at';

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${ME_COLUMNS} FROM users WHERE id = ? AND is_active = 1 LIMIT 1`,
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

// Technician scorecard for the signed-in user: work orders they're assigned that
// are on hold / resolved, how many breached SLA on their watch, and their average
// survey rating (1–5). tickets.assignee is free-text, so match on name + email.
router.get('/me/stats', requireAuth, async (req, res, next) => {
  try {
    const meId = req.user.sub;
    const identities = [req.user?.name, req.user?.email].filter(Boolean);
    if (!identities.length) {
      return res.json({ onHold: 0, resolved: 0, breached: 0, rating: { average: null, count: 0 } });
    }

    const [tickets] = await pool.query(
      `SELECT id, status, priority, created_at, updated_at
         FROM tickets WHERE assignee IN (?)`,
      [identities]
    );

    const onHold = tickets.filter((t) => t.status === 'on_hold').length;
    const resolved = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;

    // Pause-aware SLA breach across my tickets (resolved-late or currently overdue).
    let breached = 0;
    if (tickets.length) {
      const ids = tickets.map((t) => t.id);
      const [changes] = await pool.query(
        `SELECT ticket_id, field, old_value, new_value, created_at
           FROM ticket_activity
          WHERE ticket_id IN (?) AND type = 'change' AND field = 'status'
          ORDER BY created_at ASC`,
        [ids]
      );
      const byTicket = new Map();
      for (const c of changes) {
        if (!byTicket.has(c.ticket_id)) byTicket.set(c.ticket_id, []);
        byTicket.get(c.ticket_id).push(c);
      }
      for (const t of tickets) {
        if (slaStanding(t, byTicket.get(t.id) || [])?.overdue) breached += 1;
      }
    }

    // Average completed-survey rating where I'm the technician (mean of the three
    // 1–5 aspects), rounded to one decimal.
    const [[r]] = await pool.query(
      `SELECT COUNT(*) AS count,
              AVG((satisfaction + timeliness + professionalism) / 3) AS average
         FROM ticket_surveys
        WHERE technician_id = ? AND status = 'completed'`,
      [meId]
    );
    const count = Number(r.count) || 0;
    const average = count ? Math.round(Number(r.average) * 10) / 10 : null;

    res.json({ onHold, resolved, breached, rating: { average, count } });
  } catch (err) {
    next(err);
  }
});

// Self-service profile edit. Users may change their own display name and job
// title — role, email, and department remain admin-managed (routes/users.js).
router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { name, job_title } = req.body || {};
    const fields = [];
    const values = [];
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name cannot be empty' });
      }
      fields.push('name = ?');
      values.push(name.trim().slice(0, 120));
    }
    if (job_title !== undefined) {
      fields.push('job_title = ?');
      values.push(job_title ? String(job_title).trim().slice(0, 120) : null);
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'nothing to update' });
    }
    values.push(req.user.sub);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.query(
      `SELECT ${ME_COLUMNS} FROM users WHERE id = ? AND is_active = 1 LIMIT 1`,
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

// Upload / replace own profile picture. Returns the new avatar_url.
router.post('/me/avatar', requireAuth, avatarLimiter, avatarUpload, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image was uploaded.' });
    let avatarUrl;
    try {
      avatarUrl = await saveAvatar(req.file.buffer);
    } catch (err) {
      if (err instanceof InvalidImageError) return res.status(400).json({ error: err.message });
      throw err;
    }
    const [[prev]] = await pool.query('SELECT avatar_url FROM users WHERE id = ? LIMIT 1', [req.user.sub]);
    await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.sub]);
    removeAvatarFile(prev?.avatar_url);
    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    next(err);
  }
});

// Remove own profile picture (falls back to initials).
router.delete('/me/avatar', requireAuth, async (req, res, next) => {
  try {
    const [[prev]] = await pool.query('SELECT avatar_url FROM users WHERE id = ? LIMIT 1', [req.user.sub]);
    await pool.query('UPDATE users SET avatar_url = NULL WHERE id = ?', [req.user.sub]);
    removeAvatarFile(prev?.avatar_url);
    res.json({ avatar_url: null });
  } catch (err) {
    next(err);
  }
});

// Upload / replace own e-signature (a drawn or uploaded image). Returns the URL.
router.post('/me/signature', requireAuth, avatarLimiter, signatureUpload, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image was uploaded.' });
    let signatureUrl;
    try {
      signatureUrl = await saveSignature(req.file.buffer);
    } catch (err) {
      if (err instanceof InvalidImageError) return res.status(400).json({ error: err.message });
      throw err;
    }
    const [[prev]] = await pool.query('SELECT signature_url FROM users WHERE id = ? LIMIT 1', [req.user.sub]);
    await pool.query('UPDATE users SET signature_url = ? WHERE id = ?', [signatureUrl, req.user.sub]);
    removeSignatureFile(prev?.signature_url);
    res.json({ signature_url: signatureUrl });
  } catch (err) {
    next(err);
  }
});

// Remove own e-signature.
router.delete('/me/signature', requireAuth, async (req, res, next) => {
  try {
    const [[prev]] = await pool.query('SELECT signature_url FROM users WHERE id = ? LIMIT 1', [req.user.sub]);
    await pool.query('UPDATE users SET signature_url = NULL WHERE id = ?', [req.user.sub]);
    removeSignatureFile(prev?.signature_url);
    res.json({ signature_url: null });
  } catch (err) {
    next(err);
  }
});

// ---- User preferences (notification, chat, etc.) ---- //

const PREFERENCE_DEFAULTS = {
  notifications: {
    email_assigned: true,
    email_status_change: true,
    email_new_comment: true,
    email_hr_approval: true
  },
  chat: {
    sound_enabled: true,
    enter_to_send: true
  }
};

function mergedPreferences(raw) {
  const saved = (typeof raw === 'string' ? JSON.parse(raw) : raw) || {};
  return {
    notifications: { ...PREFERENCE_DEFAULTS.notifications, ...saved.notifications },
    chat: { ...PREFERENCE_DEFAULTS.chat, ...saved.chat }
  };
}

router.get('/me/preferences', requireAuth, async (req, res, next) => {
  try {
    const [[row]] = await pool.query('SELECT preferences FROM users WHERE id = ? LIMIT 1', [req.user.sub]);
    res.json(mergedPreferences(row?.preferences));
  } catch (err) {
    next(err);
  }
});

router.patch('/me/preferences', requireAuth, async (req, res, next) => {
  try {
    const patch = req.body;
    if (!patch || typeof patch !== 'object') {
      return res.status(400).json({ error: 'Request body must be an object' });
    }
    const [[row]] = await pool.query('SELECT preferences FROM users WHERE id = ? LIMIT 1', [req.user.sub]);
    const current = (typeof row?.preferences === 'string' ? JSON.parse(row.preferences) : row?.preferences) || {};
    // Shallow-merge each section
    if (patch.notifications && typeof patch.notifications === 'object') {
      current.notifications = { ...current.notifications, ...patch.notifications };
    }
    if (patch.chat && typeof patch.chat === 'object') {
      current.chat = { ...current.chat, ...patch.chat };
    }
    await pool.query('UPDATE users SET preferences = ? WHERE id = ?', [JSON.stringify(current), req.user.sub]);
    res.json(mergedPreferences(current));
  } catch (err) {
    next(err);
  }
});

// Invalidate all other sessions by bumping token_version, then re-issue a
// fresh token for THIS device so the user stays signed in.
router.post('/me/invalidate-sessions', requireAuth, async (req, res, next) => {
  try {
    await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.sub]);
    const [[u]] = await pool.query('SELECT token_version FROM users WHERE id = ? LIMIT 1', [req.user.sub]);
    const token = jwt.sign(
      {
        sub: req.user.sub,
        email: req.user.email,
        role: req.user.role,
        name: req.user.name,
        permissions: req.user.permissions,
        tv: u.token_version
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    setAuthCookie(res, token);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', requireAuth, changePasswordLimiter, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }
    const changePolicyError = passwordPolicyError(new_password);
    if (changePolicyError) {
      return res.status(400).json({ error: changePolicyError });
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
    // Bump token_version to invalidate sessions on other devices, then re-issue a
    // fresh token for THIS device so the user stays signed in here (per the UI).
    await pool.query(
      'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
      [hash, req.user.sub]
    );
    const [[u]] = await pool.query('SELECT token_version FROM users WHERE id = ? LIMIT 1', [req.user.sub]);
    const token = jwt.sign(
      {
        sub: req.user.sub,
        email: req.user.email,
        role: req.user.role,
        name: req.user.name,
        permissions: req.user.permissions,
        tv: u.token_version
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Re-set the cookie so THIS device keeps a valid token (the version bump
    // above invalidated the old one everywhere, including here).
    setAuthCookie(res, token);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Clear the auth cookie. Public + idempotent so even an already-expired
// session can tidy up after itself.
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

export default router;
