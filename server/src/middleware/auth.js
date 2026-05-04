import jwt from 'jsonwebtoken';
import { hasPermission } from '../lib/permissions.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
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
