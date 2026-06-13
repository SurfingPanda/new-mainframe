// Auto-close stale resolved work orders. A scheduled job (started in index.js,
// alongside the maintenance + SLA-reminder schedulers) that moves a work order
// from 'resolved' to 'closed' once it has sat resolved for AUTO_CLOSE_DAYS with
// no further action. Self-contained (mirrors lib/sla-reminders.js) and
// guaranteed not to throw.
//
// Idempotent by construction: only status='resolved' rows are candidates, so a
// closed work order is never reconsidered. Each close is written to
// ticket_activity, which is the source for in-app notifications — actor 'System'
// matches no real user, so the assignee/requester are notified (their own
// actions are the only ones the notifications feed filters out).

import { pool } from '../config/db.js';

const DAY = 86400000;
// Days a work order may sit 'resolved' before it auto-closes. Env-overridable.
const AUTO_CLOSE_DAYS = Number(process.env.AUTO_CLOSE_DAYS) > 0 ? Number(process.env.AUTO_CLOSE_DAYS) : 7;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours; the day-cutoff makes timing non-critical
const SYSTEM_ACTOR = 'System';

export async function runAutoClose() {
  try {
    // Only currently-resolved work orders can auto-close.
    const [tickets] = await pool.query(
      `SELECT id, updated_at FROM tickets WHERE status = 'resolved'`
    );
    if (!tickets.length) return 0;

    // Age each one from the most recent transition INTO 'resolved' (not
    // updated_at, which any later edit to a resolved ticket would bump). Pull the
    // resolve transitions for all candidates in one query.
    const ids = tickets.map((t) => t.id);
    const [changes] = await pool.query(
      `SELECT ticket_id, created_at
         FROM ticket_activity
        WHERE ticket_id IN (?) AND type = 'change' AND field = 'status' AND new_value = 'resolved'
        ORDER BY created_at ASC`,
      [ids]
    );
    const resolvedAt = new Map(); // ticket_id -> latest resolved-at (ms)
    for (const c of changes) {
      const at = new Date(c.created_at).getTime();
      if (Number.isNaN(at)) continue;
      const prev = resolvedAt.get(c.ticket_id);
      if (prev == null || at > prev) resolvedAt.set(c.ticket_id, at);
    }

    const cutoff = Date.now() - AUTO_CLOSE_DAYS * DAY;
    const due = tickets.filter((t) => {
      // Fall back to updated_at for legacy rows whose resolve predates the log.
      const at = resolvedAt.get(t.id) ?? new Date(t.updated_at).getTime();
      return Number.isFinite(at) && at <= cutoff;
    });
    if (!due.length) return 0;

    const dueIds = due.map((t) => t.id);
    const placeholders = dueIds.map(() => '?').join(',');
    // Re-check status in the UPDATE so a concurrent reopen can't be clobbered.
    await pool.query(
      `UPDATE tickets SET status = 'closed' WHERE id IN (${placeholders}) AND status = 'resolved'`,
      dueIds
    );

    // Audit log (also drives the notification to the assignee/requester).
    const rows = dueIds.map((id) => [id, 'change', SYSTEM_ACTOR, 'status', 'resolved', 'closed', null]);
    await pool.query(
      `INSERT INTO ticket_activity (ticket_id, type, actor, field, old_value, new_value, body)
       VALUES ?`,
      [rows]
    );

    console.log(`[auto-close] closed ${dueIds.length} resolved work order(s) (>= ${AUTO_CLOSE_DAYS}d resolved)`);
    return dueIds.length;
  } catch (err) {
    console.error('[auto-close] run failed:', err.message);
    return 0;
  }
}

// Run once on boot, then every few hours.
export function startAutoClose() {
  runAutoClose().catch((err) => console.error('[auto-close] initial run failed:', err.message));
  const timer = setInterval(() => {
    runAutoClose().catch((err) => console.error('[auto-close] scheduled run failed:', err.message));
  }, CHECK_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
