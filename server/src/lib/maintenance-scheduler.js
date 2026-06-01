// Recurring work orders (preventive maintenance).
//
// A maintenance_schedules row is a work-order template plus a cadence. This
// module generates a ticket from a schedule when it's due and advances the
// schedule's next_run_at. It runs in-process (the server is single-process,
// the same assumption the in-memory rate limiter already relies on).

import { pool } from '../config/db.js';
import { notifyTicketCreated } from './ticket-emails.js';

const ACTOR = 'System (recurring)';
const MONTHS_PER_CADENCE = { monthly: 1, quarterly: 3, yearly: 12 };

// Normalize a DATE (mysql2 returns a JS Date) or 'YYYY-MM-DD' string to 'YYYY-MM-DD'.
export function toYmd(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

// Advance a 'YYYY-MM-DD' date by `count` cadence units. Month-based cadences use
// a simple month add (Jan 31 + 1mo may land in early March) — acceptable here.
export function addCadence(ymd, cadence, count) {
  const [y, m, d] = toYmd(ymd).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const n = Math.max(1, Number(count) || 1);
  if (cadence === 'daily') {
    date.setUTCDate(date.getUTCDate() + n);
  } else if (cadence === 'weekly') {
    date.setUTCDate(date.getUTCDate() + 7 * n);
  } else {
    const months = (MONTHS_PER_CADENCE[cadence] || 1) * n;
    date.setUTCMonth(date.getUTCMonth() + months);
  }
  return date.toISOString().slice(0, 10);
}

// Create one work order (ticket) from a schedule. Mirrors the INSERT in the
// POST / handler of routes/tickets.js. Returns the new ticket id.
export async function generateWorkOrder(schedule) {
  // Generated WOs have no human requester; fall back to a label so the activity
  // log and lists read sensibly. The assignee (if any) still gets notified.
  const requester = schedule.assignee || 'Preventive Maintenance';

  const [result] = await pool.query(
    `INSERT INTO tickets
       (title, description, priority, status, request_type, category, department, requester, assignee, asset_id, schedule_id)
     VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(schedule.title).trim().slice(0, 200),
      schedule.description ? String(schedule.description).trim() : null,
      schedule.priority,
      schedule.request_type,
      schedule.category || null,
      schedule.department || null,
      String(requester).trim().slice(0, 120),
      schedule.assignee ? String(schedule.assignee).trim().slice(0, 120) : null,
      schedule.asset_id || null,
      schedule.id
    ]
  );
  const ticketId = result.insertId;

  await pool.query(
    `INSERT INTO ticket_activity (ticket_id, type, actor, field, new_value)
     VALUES (?, 'change', ?, 'created', ?)`,
    [ticketId, ACTOR, String(schedule.title).trim().slice(0, 500)]
  );

  // notifyTicketCreated builds the URL and emails requester + assignee. The
  // 'Preventive Maintenance' label won't resolve to an email, so only a real
  // assignee is notified. sendMail is a safe no-op when SMTP isn't configured.
  await notifyTicketCreated(
    {
      id: ticketId,
      title: schedule.title,
      priority: schedule.priority,
      requester,
      assignee: schedule.assignee || null
    },
    ACTOR
  );

  return ticketId;
}

// Generate work orders for every active schedule whose next_run_at is due, then
// roll next_run_at forward to the next future occurrence. We generate at most
// one WO per due schedule per run — if the server was offline across several
// periods we skip ahead rather than backfilling a flood.
export async function runDueSchedules() {
  const [rows] = await pool.query(
    `SELECT * FROM maintenance_schedules WHERE is_active = 1 AND next_run_at <= CURDATE()`
  );

  const today = toYmd(new Date());
  let generated = 0;

  for (const schedule of rows) {
    try {
      await generateWorkOrder(schedule);
      let next = toYmd(schedule.next_run_at);
      do {
        next = addCadence(next, schedule.cadence, schedule.interval_count);
      } while (next <= today);
      await pool.query(
        `UPDATE maintenance_schedules SET next_run_at = ?, last_run_at = CURDATE() WHERE id = ?`,
        [next, schedule.id]
      );
      generated += 1;
    } catch (err) {
      // One bad schedule shouldn't stop the rest.
      console.error(`[maintenance] schedule ${schedule.id} failed:`, err.message);
    }
  }

  if (generated) console.log(`[maintenance] generated ${generated} work order(s)`);
  return generated;
}

const RUN_INTERVAL_MS = 60 * 60 * 1000; // hourly

// Run once on boot, then hourly. Hourly resolution is plenty for daily+ cadences.
export function startMaintenanceScheduler() {
  runDueSchedules().catch((err) =>
    console.error('[maintenance] initial run failed:', err.message)
  );
  const timer = setInterval(() => {
    runDueSchedules().catch((err) =>
      console.error('[maintenance] scheduled run failed:', err.message)
    );
  }, RUN_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
