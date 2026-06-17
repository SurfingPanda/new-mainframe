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
import { getCalendarById, businessMsBetween } from './business-hours.js';

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

const MINUTE = 60000;

// Active (unpaused) elapsed ms between opened and `until`, walking the status
// timeline and accruing only non-paused segments. When `cal` is a business-hours
// calendar, each active segment counts only its working time; with cal = null it
// counts wall-clock (24/7) — identical to the previous "elapsed minus paused".
function activeElapsed(ticket, changes, opened, until, cal) {
  let segStart = opened;
  let segStatus = changes.length ? (changes[0].prev || 'open') : ticket.status;
  let active = 0;
  const accrue = (from, to, status) => {
    if (PAUSED_STATUSES.has(status)) return;
    const lo = Math.max(from, opened);
    const hi = Math.min(to, until);
    if (hi > lo) active += cal ? businessMsBetween(lo, hi, cal) : (hi - lo);
  };
  for (const c of changes) {
    accrue(segStart, c.at, segStatus);
    segStart = c.at;
    segStatus = c.status;
  }
  accrue(segStart, until, segStatus);
  return Math.max(0, active);
}

// Pause-aware SLA standing for a ticket given its status-change rows. Returns null
// when the ticket has no resolution target or a missing/invalid created date.
//
// The legacy resolution fields (resolved, elapsed, totalMs, remaining, overdue,
// days) are preserved for existing callers; `resolution` and `response` are the
// two-clock view. The resolution target comes from the ticket's snapshotted
// sla_resolution_minutes (pinned at creation), falling back to the per-priority
// default for tickets created before the policy layer existed.
export function slaStanding(ticket, changeRows) {
  const opened = ticket?.created_at ? new Date(ticket.created_at).getTime() : NaN;
  if (Number.isNaN(opened)) return null;

  const slaDays = getSlaDays();
  const resolutionMinutes = ticket?.sla_resolution_minutes != null
    ? Number(ticket.sla_resolution_minutes)
    : (slaDays[ticket?.priority] != null ? slaDays[ticket.priority] * 1440 : null);
  if (!resolutionMinutes) return null;

  const changes = normalizeStatusChanges(changeRows);
  const cal = getCalendarById(ticket?.sla_calendar_id); // null = 24/7
  const resolved = RESOLVED_STATUSES.has(ticket.status);
  const ref = resolved ? resolvedAtMs(ticket, changes) : Date.now();
  const elapsed = activeElapsed(ticket, changes, opened, ref, cal);
  const totalMs = resolutionMinutes * MINUTE;

  const result = {
    resolved, elapsed, totalMs,
    remaining: totalMs - elapsed,
    overdue: elapsed > totalMs,
    days: Math.round(resolutionMinutes / 1440), // back-compat display
    resolution: {
      target: totalMs, elapsed, remaining: totalMs - elapsed,
      breached: elapsed > totalMs, met: resolved && elapsed <= totalMs
    },
    response: null
  };

  // Response clock — only when a response target was snapshotted on the ticket.
  const responseMinutes = ticket?.sla_response_minutes != null ? Number(ticket.sla_response_minutes) : null;
  if (responseMinutes) {
    const firstAt = ticket?.first_responded_at ? new Date(ticket.first_responded_at).getTime() : null;
    const met = !!(firstAt && !Number.isNaN(firstAt));
    const respRef = met ? firstAt : Date.now();
    const respElapsed = activeElapsed(ticket, changes, opened, respRef, cal);
    const respTarget = responseMinutes * MINUTE;
    result.response = {
      target: respTarget, elapsed: respElapsed, remaining: respTarget - respElapsed,
      met, breached: !met && respElapsed > respTarget
    };
  }

  return result;
}
