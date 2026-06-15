// Pause-aware SLA standing, computed server-side so list endpoints can return an
// accurate figure without each client re-fetching every ticket's activity log.
//
// This mirrors the exact calculation in client/src/pages/TicketDetail.jsx
// (`computeSla`) — it subtracts time the ticket spent paused (pending / on-hold /
// resolved) using the status-change history, so only active working time counts
// against the target. The constants are kept in sync with client/src/lib/sla.js.
//
// The returned shape matches the client's `slaInfo()` so client/src/lib/sla.js can
// surface it verbatim.

import { getSlaDays } from './sla-config.js';

// Default targets; the live, admin-configurable values come from getSlaDays().
export const SLA_DAYS = { low: 7, normal: 3, high: 2, urgent: 1 };
export const RESOLVED_STATUSES = new Set(['resolved', 'closed']);
// Statuses during which the SLA clock pauses — waiting on the customer (pending),
// parked (on_hold), or done (resolved/closed).
export const PAUSED_STATUSES = new Set(['pending', 'on_hold', ...RESOLVED_STATUSES]);

const DAY = 86400000;

// Normalize raw ticket_activity status-change rows into an ordered timeline.
// Each entry: { at(ms), status, prev }.
export function normalizeStatusChanges(rows) {
  return (rows || [])
    .filter((a) => a.field === 'status' && a.new_value)
    .map((a) => ({ at: new Date(a.created_at).getTime(), status: a.new_value, prev: a.old_value }))
    .filter((c) => !Number.isNaN(c.at))
    .sort((a, b) => a.at - b.at);
}

// The actual resolution time: the most recent transition into a resolved/closed
// status. Falls back to updated_at only when the log doesn't record it, so a later
// edit to a resolved ticket can't move the resolution time.
function resolvedAtMs(ticket, changes) {
  let latest = null;
  for (const c of changes) {
    if (RESOLVED_STATUSES.has(c.status) && (latest === null || c.at > latest)) latest = c.at;
  }
  if (latest !== null) return latest;
  const u = new Date(ticket.updated_at).getTime();
  return Number.isNaN(u) ? Date.now() : u;
}

// Total time the ticket spent paused, clamped to [opened, until].
function pausedDurationMs(ticket, changes, opened, until) {
  let segStart = opened;
  let segStatus = changes.length ? (changes[0].prev || 'open') : ticket.status;
  let paused = 0;
  const accrue = (from, to, status) => {
    if (!PAUSED_STATUSES.has(status)) return;
    const lo = Math.max(from, opened);
    const hi = Math.min(to, until);
    if (hi > lo) paused += hi - lo;
  };
  for (const c of changes) {
    accrue(segStart, c.at, segStatus);
    segStart = c.at;
    segStatus = c.status;
  }
  accrue(segStart, until, segStatus);
  return paused;
}

// Pause-aware SLA standing for a ticket given its status-change rows. Returns null
// when the ticket has no priority target or a missing/invalid created date — same
// contract as the client's `slaInfo`.
export function slaStanding(ticket, changeRows) {
  const days = getSlaDays()[ticket?.priority];
  const opened = ticket?.created_at ? new Date(ticket.created_at).getTime() : NaN;
  if (!days || Number.isNaN(opened)) return null;

  const changes = normalizeStatusChanges(changeRows);
  const resolved = RESOLVED_STATUSES.has(ticket.status);
  const ref = resolved ? resolvedAtMs(ticket, changes) : Date.now();
  const pausedMs = pausedDurationMs(ticket, changes, opened, ref);

  const totalMs = days * DAY;
  const elapsed = Math.max(0, ref - opened - pausedMs);
  return { resolved, elapsed, totalMs, remaining: totalMs - elapsed, overdue: elapsed > totalMs, days };
}
