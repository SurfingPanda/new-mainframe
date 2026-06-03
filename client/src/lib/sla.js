// Single source of truth for SLA rules used across the app.
//
// `slaInfo` / `slaPill` are an APPROXIMATION computed from a ticket alone — they
// do NOT subtract paused (on-hold / pending) time, because that needs the
// activity log. The exact, pause-aware figure is computed in
// pages/TicketDetail.jsx (`computeSla`), which imports the constants below.

export const SLA_DAYS = { low: 7, normal: 3, high: 2, urgent: 1 };
export const RESOLVED_STATUSES = new Set(['resolved', 'closed']);
// Statuses during which the SLA clock pauses — waiting on the customer
// (pending), parked (on_hold), or done (resolved/closed).
export const PAUSED_STATUSES = new Set(['pending', 'on_hold', ...RESOLVED_STATUSES]);

const DAY = 86400000;

// SLA standing for a single ticket. Prefers the pause-aware figure computed by
// the server list endpoint (`ticket.sla`, which subtracts pending/on-hold time);
// only falls back to the date-only approximation below for tickets that didn't
// come through that endpoint. Returns null when the ticket has no priority target
// or a missing/invalid created date.
export function slaInfo(ticket) {
  // The server attaches `sla` (object or null) when it has computed it — honor
  // that authoritative value, including an explicit null.
  if (ticket && Object.prototype.hasOwnProperty.call(ticket, 'sla')) return ticket.sla;

  const days = SLA_DAYS[ticket?.priority];
  const opened = ticket?.created_at ? new Date(ticket.created_at).getTime() : NaN;
  if (!days || Number.isNaN(opened)) return null;
  const totalMs = days * DAY;
  const resolved = RESOLVED_STATUSES.has(ticket.status);
  const ref = resolved ? new Date(ticket.updated_at || ticket.created_at).getTime() : Date.now();
  const elapsed = Math.max(0, ref - opened);
  return { resolved, elapsed, totalMs, remaining: totalMs - elapsed, overdue: elapsed > totalMs, days };
}

// Label + tone for an SLA badge, derived from slaInfo. `tone` is one of
// accent | amber | rose so callers can map it to their own classes.
export function slaPill(ticket) {
  const s = slaInfo(ticket);
  if (!s) return null;
  if (s.resolved) {
    return s.overdue ? { label: 'Breached SLA', tone: 'rose' } : { label: 'Met SLA', tone: 'accent' };
  }
  if (s.overdue) return { label: 'Overdue', tone: 'rose' };
  if (s.remaining < s.totalMs * 0.25) return { label: 'Due soon', tone: 'amber' };
  return { label: 'On track', tone: 'accent' };
}
