// Daily SLA-breach reminders for work orders. A scheduled job (started in
// index.js, like the maintenance + space-due schedulers) that sends each
// technician one Mailbox digest per day listing the open work orders assigned to
// them that have breached their priority SLA target. Idempotent within a day via
// tickets.sla_reminded_at. Self-contained (mirrors lib/resolution-survey.js) and
// guaranteed not to throw.

import { pool } from '../config/db.js';
import { slaStanding } from './sla.js';

// System sender marker for Mailbox messages (no real user account).
const SYSTEM_SENDER_ID = 0;
const SYSTEM_SENDER_NAME = 'Hubly';
const SUBJECT_MAX = 200;
const BODY_MAX = 5000;
const DAY = 86400000;
const REMINDER_INTERVAL_MS = 60 * 60 * 1000; // hourly; the per-ticket guard keeps it to once/day

// Work-order display id (e.g. 22 -> "WO00000022"), matching the rest of the app.
const fmtWo = (id) => `WO${String(id ?? 0).padStart(8, '0')}`;

async function sendSystem(recipientId, recipientName, subject, body, linkUrl, linkLabel) {
  await pool.query(
    `INSERT INTO messages
       (sender_id, sender_name, recipient_id, recipient_name, subject, body, link_url, link_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      SYSTEM_SENDER_ID,
      SYSTEM_SENDER_NAME,
      recipientId,
      recipientName,
      String(subject).slice(0, SUBJECT_MAX),
      String(body).slice(0, BODY_MAX),
      linkUrl || null,
      linkLabel || null
    ]
  );
}

// tickets.assignee is free text (a display name OR an email). Resolve it to a
// real, active user so the reminder can be delivered to their Mailbox.
async function resolveAssignee(identity) {
  const value = String(identity || '').trim();
  if (!value) return null;
  const [[row]] = await pool.query(
    'SELECT id, name FROM users WHERE is_active = 1 AND (email = ? OR name = ?) LIMIT 1',
    [value.toLowerCase(), value]
  );
  return row || null;
}

export async function runSlaBreachReminders() {
  try {
    // Candidate set: open work orders with an assignee + priority that haven't
    // been reminded today. Breach itself is computed in JS (pause-aware).
    const [tickets] = await pool.query(
      `SELECT id, title, priority, status, assignee, created_at, updated_at
         FROM tickets
        WHERE status NOT IN ('resolved','closed')
          AND assignee IS NOT NULL AND assignee <> ''
          AND priority IS NOT NULL
          AND (sla_reminded_at IS NULL OR sla_reminded_at < CURDATE())`
    );
    if (!tickets.length) return 0;

    // Status-change history for these tickets in one query, for pause-aware SLA.
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

    // Keep only currently-breached tickets.
    const breached = [];
    for (const t of tickets) {
      const s = slaStanding(t, byTicket.get(t.id) || []);
      if (s && !s.resolved && s.overdue) breached.push({ t, over: s.elapsed - s.totalMs });
    }
    if (!breached.length) return 0;

    // Group by the resolved assignee user (skip assignees with no active account).
    const byUser = new Map(); // userId -> { name, items: [] }
    for (const b of breached) {
      const user = await resolveAssignee(b.t.assignee);
      if (!user) continue;
      if (!byUser.has(user.id)) byUser.set(user.id, { name: user.name, items: [] });
      byUser.get(user.id).items.push(b);
    }
    if (!byUser.size) return 0;

    let sent = 0;
    const remindedIds = [];
    for (const [userId, { name, items }] of byUser) {
      try {
        items.sort((a, b) => b.over - a.over); // most overdue first
        const lines = items.slice(0, 10).map(({ t, over }) =>
          `• ${fmtWo(t.id)} "${t.title}" — ${t.priority} priority, overdue by ${Math.max(1, Math.floor(over / DAY))}d`
        );
        const extra = items.length > 10 ? `\n…and ${items.length - 10} more.` : '';
        const subject = `${items.length} work order${items.length === 1 ? '' : 's'} breaching SLA`;
        const body =
          `Hi ${name?.split(' ')[0] || 'there'},\n\n` +
          `${items.length} work order${items.length === 1 ? '' : 's'} assigned to you ` +
          `${items.length === 1 ? 'has' : 'have'} breached the SLA target:\n\n` +
          `${lines.join('\n')}${extra}`;
        const single = items.length === 1;
        await sendSystem(
          userId,
          name,
          subject,
          body,
          single ? `/tickets/${items[0].t.id}` : '/tickets/my-queue',
          single ? 'View work order' : 'Open my queue'
        );
        for (const { t } of items) remindedIds.push(t.id);
        sent += 1;
      } catch (err) {
        console.error('[sla-reminder] user', userId, 'failed:', err.message);
      }
    }

    if (remindedIds.length) {
      await pool.query(
        `UPDATE tickets SET sla_reminded_at = CURDATE() WHERE id IN (${remindedIds.map(() => '?').join(',')})`,
        remindedIds
      );
    }
    if (sent) console.log(`[sla-reminder] sent ${sent} SLA-breach reminder(s)`);
    return sent;
  } catch (err) {
    console.error('[sla-reminder] run failed:', err.message);
    return 0;
  }
}

// Run once on boot, then hourly (resolution is plenty for a daily digest).
export function startSlaBreachReminders() {
  runSlaBreachReminders().catch((err) => console.error('[sla-reminder] initial run failed:', err.message));
  const timer = setInterval(() => {
    runSlaBreachReminders().catch((err) => console.error('[sla-reminder] scheduled run failed:', err.message));
  }, REMINDER_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
