import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  pending: 'Pending - Waiting for Customer',
  resolved: 'Resolved',
  closed: 'Closed',
};

// Turn a ticket_activity row into a human-readable notification.
// `identitySet` holds the signed-in user's name and email.
function describe(row, identitySet) {
  const actor = row.actor || 'Someone';
  const assigned =
    row.field === 'created' ||
    (row.field === 'assignee' && row.new_value != null && identitySet.has(row.new_value));

  let message;
  if (row.field === 'created') {
    message = 'New ticket assigned to you';
  } else if (row.field === 'assignee') {
    message = `${actor} assigned this ticket to you`;
  } else if (row.type === 'note') {
    message = `${actor} added a note`;
  } else if (row.field === 'status') {
    message = `${actor} set status to ${STATUS_LABELS[row.new_value] || row.new_value || '—'}`;
  } else if (row.field === 'priority') {
    message = `${actor} set priority to ${row.new_value || '—'}`;
  } else if (row.field === 'attachment_removed') {
    message = `${actor} removed an attachment`;
  } else if (row.field === 'kb_link') {
    message = `${actor} linked a KB article`;
  } else if (row.field === 'kb_unlink') {
    message = `${actor} unlinked a KB article`;
  } else if (row.field) {
    message = `${actor} updated the ${row.field.replace(/_/g, ' ')}`;
  } else {
    message = `${actor} updated this ticket`;
  }

  return { kind: assigned ? 'assigned' : 'update', message };
}

// GET /api/notifications — ticket activity relevant to the signed-in user:
// tickets currently assigned to them, plus the moment a ticket was assigned to
// them. Their own actions are excluded. `count` is how many are unread (newer
// than the user's last "seen" mark).
router.get('/', requireAuth, async (req, res, next) => {
  try {
    // tickets.assignee and ticket_activity.actor both store the user's name;
    // email is included as a fallback for legacy records.
    const identities = [req.user?.name, req.user?.email].filter(Boolean);
    if (!identities.length) {
      return res.json({ count: 0, items: [], seenAt: null });
    }
    const identitySet = new Set(identities);

    const [[me]] = await pool.query(
      'SELECT notifications_seen_at FROM users WHERE id = ? LIMIT 1',
      [req.user.sub]
    );
    const seenAt = me?.notifications_seen_at || null;
    const seenMs = seenAt ? new Date(seenAt).getTime() : 0;

    const [rows] = await pool.query(
      `SELECT a.id, a.ticket_id, a.type, a.actor, a.field, a.new_value, a.created_at,
              t.title AS ticket_title
         FROM ticket_activity a
         JOIN tickets t ON t.id = a.ticket_id
        WHERE ( t.assignee IN (?)
                OR (a.field = 'assignee' AND a.new_value IN (?)) )
          AND ( a.actor IS NULL OR a.actor NOT IN (?) )
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 40`,
      [identities, identities, identities]
    );

    const items = rows.map((r) => {
      const { kind, message } = describe(r, identitySet);
      return {
        id: r.id,
        ticketId: r.ticket_id,
        ticketTitle: r.ticket_title,
        kind,
        message,
        actor: r.actor || null,
        createdAt: r.created_at,
        unread: new Date(r.created_at).getTime() > seenMs,
      };
    });

    res.json({
      seenAt,
      count: items.filter((i) => i.unread).length,
      items,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/seen — mark everything up to now as read.
router.post('/seen', requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE users SET notifications_seen_at = NOW() WHERE id = ?',
      [req.user.sub]
    );
    res.json({ ok: true, seenAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;
