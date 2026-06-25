// SLA breach monitor. A scheduled job (started in index.js alongside the other
// workers) that detects response/resolution SLA breaches on open work orders and
// escalates them by firing the automation engine's sla.* triggers — so escalation
// is declarative (admins write automation rules: reassign, bump priority, notify).
//
// Each clock breaches at most once: a marker column (sla_response_breached_at /
// sla_resolution_breached_at) is set atomically (UPDATE ... WHERE col IS NULL), so
// a concurrent run or a later tick can't double-fire. Standing is computed
// pause-aware + business-hours via slaStanding. HR Concerns are excluded (their
// targets aren't routed until approved). Self-contained and never throws.

import { pool } from '../config/db.js';
import { slaStanding } from './sla.js';
import { runAutomations } from './automation.js';
import { HR_CONCERNS } from './ticket-visibility.js';
import { runWithLock } from './job-lock.js';

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes
const SYSTEM_ACTOR = 'System';

// Atomically claim a breach: returns true only for the run that flips the marker.
async function claimBreach(ticketId, column) {
  const [r] = await pool.query(
    `UPDATE tickets SET ${column} = NOW() WHERE id = ? AND ${column} IS NULL`,
    [ticketId]
  );
  return r.affectedRows > 0;
}

async function logBreach(ticketId, kind) {
  await pool.query(
    `INSERT INTO ticket_activity (ticket_id, type, actor, field, new_value)
     VALUES (?, 'change', ?, 'sla_breach', ?)`,
    [ticketId, SYSTEM_ACTOR, kind]
  );
}

export async function runSlaMonitor() {
  try {
    const [tickets] = await pool.query(
      `SELECT id, title, priority, status, request_type, category, department, requester, assignee,
              created_at, updated_at, first_responded_at,
              sla_response_minutes, sla_resolution_minutes, sla_calendar_id,
              sla_response_breached_at, sla_resolution_breached_at
         FROM tickets
        WHERE status NOT IN ('resolved','closed')
          AND (category IS NULL OR category <> ?)
          AND (sla_response_breached_at IS NULL OR sla_resolution_breached_at IS NULL)`,
      [HR_CONCERNS]
    );
    if (!tickets.length) return 0;

    // Status history for pause-aware standing, in one query.
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

    let fired = 0;
    for (const t of tickets) {
      const s = slaStanding(t, byTicket.get(t.id) || []);
      if (!s) continue;

      if (s.resolution?.breached && !t.sla_resolution_breached_at && await claimBreach(t.id, 'sla_resolution_breached_at')) {
        await logBreach(t.id, 'resolution');
        await runAutomations('sla.resolution_breached', t);
        fired++;
      }
      if (s.response?.breached && !t.sla_response_breached_at && await claimBreach(t.id, 'sla_response_breached_at')) {
        await logBreach(t.id, 'response');
        await runAutomations('sla.response_breached', t);
        fired++;
      }
    }
    if (fired) console.log(`[sla-monitor] escalated ${fired} SLA breach(es)`);
    return fired;
  } catch (err) {
    console.error('[sla-monitor] run failed:', err.message);
    return 0;
  }
}

// Guarded by a MySQL advisory lock so only one instance scans per tick (the
// per-breach claim already prevents double-firing; this just avoids the wasted
// duplicate scan + compute across instances).
export function startSlaMonitor() {
  const tick = () => runWithLock('sla-monitor', runSlaMonitor);
  tick();
  const timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
