import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { managedDepartments } from '../lib/department-managers.js';

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
// `identitySet` holds the signed-in user's name and email; `dept` is the user's
// department (for work orders routed to their team but not assigned to them).
function describe(row, identitySet, dept) {
  const actor = row.actor || 'Someone';
  const assignedToMe = row.field === 'assignee' && row.new_value != null && identitySet.has(row.new_value);
  const mine = row.ticket_assignee != null && identitySet.has(row.ticket_assignee);
  const assigned = assignedToMe || (row.field === 'created' && mine);

  let message;
  if (row.field === 'created') {
    message = mine ? 'New work order assigned to you' : `New work order in ${dept || 'your department'}`;
  } else if (row.field === 'assignee') {
    message = assignedToMe
      ? `${actor} assigned this work order to you`
      : row.new_value
        ? `${actor} assigned this work order to ${row.new_value}`
        : `${actor} unassigned this work order`;
  } else if (row.type === 'note') {
    message = `${actor} added a note`;
  } else if (row.field === 'status') {
    message = `${actor} set status to ${STATUS_LABELS[row.new_value] || row.new_value || '—'}`;
  } else if (row.field === 'priority') {
    message = `${actor} set priority to ${row.new_value || '—'}`;
  } else if (row.field === 'approval_requested') {
    message = `${actor} needs your approval`;
  } else if (row.field === 'approved') {
    message = `${actor} approved this request`;
  } else if (row.field === 'denied') {
    message = `${actor} declined this request`;
  } else if (row.field === 'attachment_removed') {
    message = `${actor} removed an attachment`;
  } else if (row.field === 'kb_link') {
    message = `${actor} linked a KB article`;
  } else if (row.field === 'kb_unlink') {
    message = `${actor} unlinked a KB article`;
  } else if (row.field) {
    message = `${actor} updated the ${row.field.replace(/_/g, ' ')}`;
  } else {
    message = `${actor} updated this work order`;
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
      return res.json({ count: 0, workOrders: 0, items: [], seenAt: null });
    }
    const identitySet = new Set(identities);
    const dept = req.user?.department || null;

    const [[me]] = await pool.query(
      'SELECT notifications_seen_at FROM users WHERE id = ? LIMIT 1',
      [req.user.sub]
    );
    const seenAt = me?.notifications_seen_at || null;
    const seenMs = seenAt ? new Date(seenAt).getTime() : 0;

    // Relevant activity: work orders assigned to the user, the moment one was
    // assigned to them, OR any work order routed to their department. A pending
    // HR request is deliberately unrouted (department NULL) so coworkers don't
    // get notified — its manager is surfaced via the approval clause instead.
    const managedDepts = await managedDepartments(req.user.sub);
    const deptClause = dept ? ' OR t.department = ?' : '';
    const approvalClause = managedDepts.length
      ? " OR (t.approval_status = 'pending' AND t.approval_dept IN (?))"
      : '';
    const params = [identities, identities];
    if (dept) params.push(dept);
    if (managedDepts.length) params.push(managedDepts);
    params.push(identities);

    const [rows] = await pool.query(
      `SELECT a.id, a.ticket_id, a.type, a.actor, a.field, a.new_value, a.created_at,
              t.title AS ticket_title, t.assignee AS ticket_assignee, t.requester AS ticket_requester,
              t.department AS ticket_department
         FROM ticket_activity a
         JOIN tickets t ON t.id = a.ticket_id
        WHERE ( t.assignee IN (?)
                OR (a.field = 'assignee' AND a.new_value IN (?))${deptClause}${approvalClause} )
          AND ( a.actor IS NULL OR a.actor NOT IN (?) )
          AND ( a.field IS NULL OR a.field <> 'survey_sent' )
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 40`,
      params
    );

    // Split unread work-order notifications by the nav view that holds the
    // ticket, so the Work Orders dropdown can badge each item: assigned to me →
    // My Queue, else I filed it → Submitted, else (dept-routed / approvals) →
    // All Work Orders. The three sum to the aggregate `workOrders` count.
    const byView = { myQueue: 0, submitted: 0, all: 0 };
    const items = rows.map((r) => {
      const { kind, message } = describe(r, identitySet, dept);
      const unread = new Date(r.created_at).getTime() > seenMs;
      if (unread) {
        if (r.ticket_assignee && identitySet.has(r.ticket_assignee)) byView.myQueue += 1;
        else if (r.ticket_requester && identitySet.has(r.ticket_requester)) byView.submitted += 1;
        else byView.all += 1;
      }
      return {
        id: `t-${r.id}`,
        link: `/tickets/${r.ticket_id}`,
        ticketId: r.ticket_id,
        ticketTitle: r.ticket_title,
        kind,
        message,
        actor: r.actor || null,
        createdAt: r.created_at,
        unread,
      };
    });

    // Admins also see pending password reset requests in the bell.
    if (req.user?.permissions?.users?.manage) {
      const [prRows] = await pool.query(
        `SELECT id, email, created_at
           FROM password_reset_requests
          WHERE status = 'pending'
          ORDER BY created_at DESC
          LIMIT 25`
      );
      for (const r of prRows) {
        items.push({
          id: `pr-${r.id}`,
          link: '/users/password-resets',
          kind: 'password_reset',
          message: 'Password reset requested',
          subtitle: r.email,
          createdAt: r.created_at,
          unread: new Date(r.created_at).getTime() > seenMs,
        });
      }
    }

    // Chat activity: messages from other people in rooms the user is part of
    // (the general channel, their DMs, and groups they belong to). Grouped to
    // one item per room (latest message wins). Unread is keyed off the same
    // notifications_seen_at mark as everything else in the bell — the precise
    // unread-message badge on the Chat nav item is tracked separately.
    const meId = req.user.sub;
    const [chatRows] = await pool.query(
      `SELECT m.id, m.room_key, m.user_name, m.body, m.attachment_filename, m.created_at
         FROM chat_messages m
        WHERE m.is_unsent = 0
          AND m.user_id <> ?
          AND ( m.room_key = 'general'
                OR m.room_key LIKE CONCAT('dm:', ?, ':%')
                OR m.room_key LIKE CONCAT('dm:%:', ?)
                OR m.room_key IN (SELECT CONCAT('g:', room_id) FROM chat_room_members WHERE user_id = ?) )
          AND m.created_at > DATE_SUB(NOW(), INTERVAL 14 DAY)
        ORDER BY m.id DESC
        LIMIT 60`,
      [meId, meId, meId, meId]
    );
    const seenRooms = new Set();
    for (const r of chatRows) {
      if (seenRooms.has(r.room_key)) continue; // keep only the latest per room
      seenRooms.add(r.room_key);
      const name = r.user_name || 'Someone';
      const message = r.room_key === 'general'
        ? `${name} posted in Team Chat`
        : r.room_key.startsWith('dm:')
          ? `${name} messaged you`
          : `${name} sent a message to a group`;
      const snippet = r.body?.trim()
        ? r.body.trim().slice(0, 80)
        : r.attachment_filename
          ? `📎 ${r.attachment_filename}`
          : 'Sent a message';
      items.push({
        id: `chat-${r.room_key}`,
        link: '/chat',
        kind: 'chat',
        message,
        subtitle: snippet,
        createdAt: r.created_at,
        unread: new Date(r.created_at).getTime() > seenMs,
      });
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      seenAt,
      count: items.filter((i) => i.unread).length,
      // Unread work-order notifications only (drives the Work Orders nav badge).
      workOrders: items.filter((i) => i.unread && i.ticketId).length,
      // Same total, split by destination view (My Queue / Submitted / All).
      workOrdersByView: byView,
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
