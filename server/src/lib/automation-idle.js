// Idle-trigger scheduler for the automation engine. A scheduled job (started in
// index.js alongside the other workers) that fires 'ticket.idle' rules against
// work orders that have gone untouched past the rule's `idle_minutes`. Mirrors
// lib/auto-close.js and is guaranteed not to throw.
//
// "Idle" is measured from the most recent NON-automation activity (so the
// engine's own writes don't reset the clock). Dedupe is the same signal: a rule
// fires on a ticket at most once per idle stretch — it won't fire again until a
// human/system touch advances the last-touch time past the recorded run. This
// makes the worker safe to run repeatedly without re-escalating the same ticket.
//
// Excluded: resolved/closed work orders (idle escalation on a done item is
// meaningless) and HR Concerns (consistent with the create/update hooks).

import { pool } from '../config/db.js';
import { runAutomations, matchesConditions } from './automation.js';
import { HR_CONCERNS } from './ticket-visibility.js';
import { runWithLock } from './job-lock.js';

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes
const CANDIDATE_LIMIT = 500;              // safety cap per rule per tick

// Most recent non-automation activity for a ticket, falling back to its
// creation time. Reused by both the idle test and the dedupe NOT EXISTS so they
// stay consistent.
const LAST_TOUCH = `
  COALESCE((
    SELECT MAX(a.created_at) FROM ticket_activity a
     WHERE a.ticket_id = t.id AND (a.actor IS NULL OR a.actor NOT LIKE 'Automation:%')
  ), t.created_at)`;

export async function runIdleAutomations() {
  try {
    const [rules] = await pool.query(
      `SELECT id, name, conditions, idle_minutes
         FROM automation_rules
        WHERE is_active = 1 AND trigger_event = 'ticket.idle'
        ORDER BY priority ASC, id ASC`
    );
    if (!rules.length) return 0;

    let fired = 0;
    for (const rule of rules) {
      const minutes = Number(rule.idle_minutes);
      if (!Number.isInteger(minutes) || minutes <= 0) continue;

      const [tickets] = await pool.query(
        `SELECT t.* FROM tickets t
          WHERE t.status NOT IN ('resolved','closed')
            AND (t.category IS NULL OR t.category <> ?)
            AND ${LAST_TOUCH} <= (NOW() - INTERVAL ? MINUTE)
            AND NOT EXISTS (
              SELECT 1 FROM automation_runs r
               WHERE r.rule_id = ? AND r.ticket_id = t.id
                 AND r.created_at >= ${LAST_TOUCH}
            )
          LIMIT ${CANDIDATE_LIMIT}`,
        [HR_CONCERNS, minutes, rule.id]
      );

      for (const ticket of tickets) {
        // Re-check the rule's own conditions in JS (they're JSON, not SQL).
        if (!matchesConditions(ticket, rule.conditions)) continue;
        const result = await runAutomations('ticket.idle', ticket, { onlyRuleIds: [rule.id] });
        if (result?.rulesFired) fired++;
      }
    }

    if (fired) console.log(`[automation-idle] fired idle rules on ${fired} work order(s)`);
    return fired;
  } catch (err) {
    console.error('[automation-idle] run failed:', err.message);
    return 0;
  }
}

// Run once on boot, then on a fixed interval. Guarded by a MySQL advisory lock so
// two instances can't both fire idle rules and race the automation_runs dedupe.
export function startIdleAutomations() {
  const tick = () => runWithLock('automation-idle', runIdleAutomations);
  tick();
  const timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
