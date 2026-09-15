import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

// App-wide admin audit trail (read-only). Admin role only — this is sensitive
// oversight data, and a role gate avoids maintaining a new permission module
// (and its server/client ROLE_DEFAULTS mirror).
const router = Router();
router.use(requireAuth, requireRole('admin'));

const escapeLike = (s) => s.replace(/[%_\\]/g, '\\$&');

// Distinct actions + entity types so the client can populate filter dropdowns.
router.get('/meta', async (_req, res, next) => {
  try {
    const [actions] = await pool.query('SELECT DISTINCT action FROM audit_log ORDER BY action');
    const [types] = await pool.query('SELECT DISTINCT entity_type FROM audit_log WHERE entity_type IS NOT NULL ORDER BY entity_type');
    res.json({
      actions: actions.map((r) => r.action),
      entityTypes: types.map((r) => r.entity_type)
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const where = [];
    const params = [];

    if (req.query.action) { where.push('action = ?'); params.push(String(req.query.action)); }
    if (req.query.entity_type) { where.push('entity_type = ?'); params.push(String(req.query.entity_type)); }
    if (req.query.entity_id) { where.push('entity_id = ?'); params.push(String(req.query.entity_id)); }
    if (req.query.actor_id) { where.push('actor_id = ?'); params.push(Number(req.query.actor_id)); }
    if (req.query.from) { where.push('created_at >= ?'); params.push(String(req.query.from)); }
    if (req.query.to) { where.push('created_at <= ?'); params.push(String(req.query.to)); }
    if (req.query.q) {
      const like = `%${escapeLike(String(req.query.q))}%`;
      where.push('(actor_name LIKE ? OR entity_label LIKE ? OR action LIKE ?)');
      params.push(like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_log ${whereSql}`, params);
    const [items] = await pool.query(
      `SELECT id, actor_id, actor_name, action, entity_type, entity_id, entity_label, changes, ip, created_at
         FROM audit_log ${whereSql}
        ORDER BY id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ items, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

export default router;
