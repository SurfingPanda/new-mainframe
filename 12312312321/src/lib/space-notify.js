// Spaces → Mailbox notifications. When something in a project Space concerns a
// specific person (an item assigned to them, a comment on their item, a join
// request, or its approval/denial), drop a system message into their in-app
// Mailbox so it reaches them via the header badge + inbox — instead of staying
// buried inside the board. Mirrors lib/resolution-survey.js: every function is
// fire-and-forget and guaranteed not to throw (callers don't await).

import { pool } from '../config/db.js';
import { sendMailSafe, appUrl } from './mailer.js';
import { spaceItemAssigned, spaceJoinRequest } from './email-templates.js';
import { sendSystemMessage } from './system-message.js';
import { runWithLock } from './job-lock.js';

// Thin positional wrapper over the shared system-message helper (which owns the
// INSERT, length clamping, and the real-time 'mail' push).
async function sendSystem(recipientId, recipientName, subject, body, linkUrl, linkLabel) {
  await sendSystemMessage({ recipientId, recipientName, subject, body, linkUrl, linkLabel });
}

// Resolve a user id to an active user row (or null) so we never message a
// deactivated/removed account.
async function activeUser(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [[row]] = await pool.query(
    'SELECT id, name, email FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
    [id]
  );
  return row || null;
}

const itemLink = (space, item) => `/spaces/${space.id}?item=${item.id}`;

// An item was assigned to someone (on create or reassignment). No-op if there's
// no assignee or the assignee is the person who made the change.
export async function notifyItemAssigned({ space, item, assigneeId, actor }) {
  try {
    if (!space || !item || !assigneeId) return;
    if (Number(assigneeId) === Number(actor?.sub)) return; // assigned to self
    const recipient = await activeUser(assigneeId);
    if (!recipient) return;
    await sendSystem(
      recipient.id,
      recipient.name,
      `You were assigned ${item.item_key}`,
      `${actor?.name || 'Someone'} assigned ${item.item_key} "${item.title}" to you in the ${space.name} space.`,
      itemLink(space, item),
      'View item'
    );
    if (recipient.email) {
      sendMailSafe({ to: recipient.email, ...spaceItemAssigned(item, space, appUrl(itemLink(space, item))) });
    }
  } catch (err) {
    console.error('[space-notify] item-assigned failed:', err.message);
  }
}

// Someone commented on an item — notify its assignee (unless they wrote it).
export async function notifyItemComment({ space, item, commenterId, commenterName }) {
  try {
    if (!space || !item || !item.assignee_id) return;
    if (Number(item.assignee_id) === Number(commenterId)) return; // commented on own item
    const recipient = await activeUser(item.assignee_id);
    if (!recipient) return;
    await sendSystem(
      recipient.id,
      recipient.name,
      `New comment on ${item.item_key}`,
      `${commenterName || 'Someone'} commented on ${item.item_key} "${item.title}" in the ${space.name} space.`,
      itemLink(space, item),
      'View item'
    );
  } catch (err) {
    console.error('[space-notify] item-comment failed:', err.message);
  }
}

// A user asked to join a space — notify every owner (except the requester, who
// can't be an owner anyway).
export async function notifyJoinRequested({ space, requester }) {
  try {
    if (!space || !requester) return;
    const [owners] = await pool.query(
      `SELECT user_id FROM space_members WHERE space_id = ? AND role = 'owner'`,
      [space.id]
    );
    for (const o of owners) {
      if (Number(o.user_id) === Number(requester.id)) continue;
      const recipient = await activeUser(o.user_id);
      if (!recipient) continue;
      await sendSystem(
        recipient.id,
        recipient.name,
        `Join request for ${space.name}`,
        `${requester.name || 'Someone'} requested to join the ${space.name} space. Review pending requests in the Members tab.`,
        `/spaces/${space.id}?view=members`,
        'Review request'
      );
      if (recipient.email) {
        sendMailSafe({ to: recipient.email, ...spaceJoinRequest(space, requester, appUrl(`/spaces/${space.id}?view=members`)) });
      }
    }
  } catch (err) {
    console.error('[space-notify] join-requested failed:', err.message);
  }
}

// --- Daily due / overdue reminders -------------------------------------------
// A scheduled job (started in index.js, like the maintenance scheduler) that
// sends each assignee one Mailbox digest per day listing their space work items
// that are due today or overdue. Idempotent within a day via space_items.due_reminded_at.

const REMINDER_INTERVAL_MS = 60 * 60 * 1000; // hourly; the per-item guard keeps it to once/day

export async function runSpaceDueReminders() {
  try {
    const [rows] = await pool.query(
      `SELECT i.id, i.item_key, i.title, i.space_id, i.assignee_id,
              DATE_FORMAT(i.due_at, '%Y-%m-%d') AS due,
              (i.due_at < CURDATE()) AS overdue,
              s.name AS space_name, u.name AS assignee_name
         FROM space_items i
         JOIN spaces s ON s.id = i.space_id
         JOIN users  u ON u.id = i.assignee_id AND u.is_active = 1
        WHERE i.status <> 'done'
          AND i.due_at IS NOT NULL
          AND i.due_at <= CURDATE()
          AND (i.due_reminded_at IS NULL OR i.due_reminded_at < CURDATE())
        ORDER BY i.assignee_id, i.due_at ASC, i.id ASC`
    );
    if (!rows.length) return 0;

    // One digest per assignee.
    const byUser = new Map();
    for (const r of rows) {
      if (!byUser.has(r.assignee_id)) byUser.set(r.assignee_id, []);
      byUser.get(r.assignee_id).push(r);
    }

    let sent = 0;
    for (const [userId, items] of byUser) {
      try {
        const overdue = items.filter((i) => Number(i.overdue) === 1).length;
        const name = items[0].assignee_name;
        const lines = items.slice(0, 10).map((i) =>
          `• ${i.item_key} "${i.title}" — ${Number(i.overdue) === 1 ? `overdue since ${i.due}` : 'due today'} (${i.space_name})`
        );
        const extra = items.length > 10 ? `\n…and ${items.length - 10} more.` : '';
        const subject = `${items.length} work item${items.length === 1 ? '' : 's'} ${overdue ? 'due or overdue' : 'due today'}`;
        const body =
          `Hi ${name?.split(' ')[0] || 'there'},\n\n` +
          `You have ${items.length} space work item${items.length === 1 ? '' : 's'} that need attention:\n\n` +
          `${lines.join('\n')}${extra}`;
        const single = items.length === 1;
        await sendSystem(
          userId,
          name,
          subject,
          body,
          single ? `/spaces/${items[0].space_id}?item=${items[0].id}` : '/dashboard',
          single ? 'View item' : 'View on Overview'
        );
        await pool.query(
          `UPDATE space_items SET due_reminded_at = CURDATE() WHERE id IN (${items.map(() => '?').join(',')})`,
          items.map((i) => i.id)
        );
        sent += 1;
      } catch (err) {
        console.error('[space-due] reminder for user', userId, 'failed:', err.message);
      }
    }
    if (sent) console.log(`[space-due] sent ${sent} due-item reminder(s)`);
    return sent;
  } catch (err) {
    console.error('[space-due] run failed:', err.message);
    return 0;
  }
}

// Run once on boot, then hourly (resolution is plenty for a daily digest).
// Guarded by a MySQL advisory lock so only one instance sends the digest.
export function startSpaceDueReminders() {
  const tick = () => runWithLock('space-due-reminders', runSpaceDueReminders);
  tick();
  const timer = setInterval(tick, REMINDER_INTERVAL_MS);
  timer.unref?.();
  return timer;
}

// An owner approved or denied a join request — tell the requester.
export async function notifyJoinDecision({ space, userId, decision, actor }) {
  try {
    if (!space || !userId) return;
    const recipient = await activeUser(userId);
    if (!recipient) return;
    const approved = decision === 'approved';
    await sendSystem(
      recipient.id,
      recipient.name,
      `Your request to join ${space.name} was ${approved ? 'approved' : 'declined'}`,
      approved
        ? `${actor?.name || 'An owner'} approved your request to join the ${space.name} space. You now have access to its board, documents, and goals.`
        : `Your request to join the ${space.name} space was declined.`,
      approved ? `/spaces/${space.id}` : '/spaces',
      approved ? 'Open space' : 'Browse spaces'
    );
  } catch (err) {
    console.error('[space-notify] join-decision failed:', err.message);
  }
}
