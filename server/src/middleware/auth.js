import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { hasPermission, effectivePermissions } from '../lib/permissions.js';

// In-memory throttle so we don't UPDATE users.last_seen_at on every single
// authenticated request — once every 30s per user is plenty for an "online"
// indicator with a 90s online window.
const PRESENCE_THROTTLE_MS = 30_000;
const lastBumpAt = new Map();

function bumpPresence(userId) {
  const now = Date.now();
  const prev = lastBumpAt.get(userId) || 0;
  if (now - prev < PRESENCE_THROTTLE_MS) return;
  lastBumpAt.set(userId, now);
  // Fire-and-forget — never block the request on this write.
  pool
    .query('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', [userId])
    .catch(() => { /* presence is best-effort */ });
}

// Verifies the JWT, then re-loads the user from the database so role,
// permissions, and active status reflect the current state — not whatever was
// true when the token was issued. A deactivated account or a changed
// permission therefore takes effect immediately, without waiting for the
// token to expire.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userId = Number(payload?.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, email, name, role, department, permissions, is_active FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Account is inactive or no longer exists' });
    }

    req.user = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
      permissions: effectivePermissions(user)
    };
    bumpPresence(user.id);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export function requirePermission(module, action) {
  return (req, res, next) => {
    if (!req.user || !hasPermission(req.user, module, action)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
