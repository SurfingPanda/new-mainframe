import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { hasPermission } from '../lib/permissions.js';

// Global search (⌘K command palette). One endpoint fans out across the modules
// the caller is allowed to see, each gated by its module permission and the
// module's own visibility rules. Every group is capped so the payload stays small.
const router = Router();
const LIMIT = 6;

// Escape LIKE wildcards so a user typing % or _ doesn't get wildcard behaviour.
const escapeLike = (s) => s.replace(/[%_\\]/g, '\\$&');

// Build an id-match SQL clause mirroring the client's matchesTicketId()
// (lib/ticket.js): "WO%22"/"%22" → exactly #22; other "%" patterns are a
// wildcard against the formatted id; plain text is a substring of "WO00000022"
// (so "22", "0022", and "wo00000022" all match). Returns { sql, param }.
function ticketIdMatch(q) {
  const fmt = "LOWER(CONCAT('WO', LPAD(id, 8, '0')))";
  const exact = /^(?:wo)?%0*(\d+)$/i.exec(q);
  if (exact) return { sql: 'id = ?', param: Number(exact[1]) };
  if (q.includes('%')) return { sql: `${fmt} LIKE ?`, param: q.toLowerCase() };
  return { sql: `${fmt} LIKE ?`, param: `%${escapeLike(q.toLowerCase())}%` };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const empty = { tickets: [], kb: [], spaces: [], assets: [], users: [] };
    if (q.length < 2) return res.json(empty);

    const like = `%${escapeLike(q)}%`;
    const user = req.user;
    const isStaff = user.role === 'admin' || user.role === 'agent';
    const out = { ...empty };

    // Each group runs independently and swallows its own errors so one failing
    // query can't blank the whole palette.
    const tasks = [];

    if (hasPermission(user, 'tickets', 'view')) {
      tasks.push((async () => {
        const idm = ticketIdMatch(q);
        const params = [like, like, idm.param];
        let where = `(title LIKE ? OR description LIKE ? OR ${idm.sql})`;
        if (!isStaff) {
          const ids = [user.name, user.email].filter(Boolean);
          const ors = ['requester IN (?)', 'assignee IN (?)'];
          params.push(ids, ids);
          if (user.department) { ors.push('department = ?'); params.push(user.department); }
          where += ` AND (${ors.join(' OR ')})`;
        }
        const [rows] = await pool.query(
          `SELECT id, title, status, priority FROM tickets WHERE ${where} ORDER BY updated_at DESC LIMIT ${LIMIT}`,
          params
        );
        out.tickets = rows;
      })().catch(() => {}));
    }

    if (hasPermission(user, 'kb', 'view')) {
      tasks.push((async () => {
        let where = '(title LIKE ? OR category LIKE ? OR body LIKE ?)';
        if (!hasPermission(user, 'kb', 'manage')) where += ' AND published = 1';
        const [rows] = await pool.query(
          `SELECT id, title, slug, category, published FROM kb_articles WHERE ${where} ORDER BY updated_at DESC LIMIT ${LIMIT}`,
          [like, like, like]
        );
        out.kb = rows;
      })().catch(() => {}));
    }

    if (hasPermission(user, 'spaces', 'view')) {
      tasks.push((async () => {
        const params = [like, like, like, like];
        let where = '(i.title LIKE ? OR i.item_key LIKE ? OR s.name LIKE ? OR s.space_key LIKE ?)';
        if (!hasPermission(user, 'spaces', 'manage')) {
          where += ' AND i.space_id IN (SELECT space_id FROM space_members WHERE user_id = ?)';
          params.push(user.sub);
        }
        const [rows] = await pool.query(
          `SELECT i.id, i.item_key, i.title, i.space_id, s.name AS space_name
             FROM space_items i JOIN spaces s ON s.id = i.space_id
            WHERE ${where} ORDER BY i.updated_at DESC LIMIT ${LIMIT}`,
          params
        );
        out.spaces = rows;
      })().catch(() => {}));
    }

    if (hasPermission(user, 'assets', 'view')) {
      tasks.push((async () => {
        const [rows] = await pool.query(
          `SELECT id, asset_tag, type, model, assignee FROM assets
            WHERE asset_tag LIKE ? OR type LIKE ? OR model LIKE ? OR serial_no LIKE ? OR assignee LIKE ?
            ORDER BY updated_at DESC LIMIT ${LIMIT}`,
          [like, like, like, like, like]
        );
        out.assets = rows;
      })().catch(() => {}));
    }

    // The Users group is an admin capability (links into user management).
    if (hasPermission(user, 'users', 'manage')) {
      tasks.push((async () => {
        const [rows] = await pool.query(
          `SELECT id, name, email, department, role, avatar_url FROM users
            WHERE is_active = 1 AND (name LIKE ? OR email LIKE ? OR department LIKE ?)
            ORDER BY name ASC LIMIT ${LIMIT}`,
          [like, like, like]
        );
        out.users = rows;
      })().catch(() => {}));
    }

    await Promise.all(tasks);
    res.json(out);
  } catch (err) {
    next(err);
  }
});

export default router;
