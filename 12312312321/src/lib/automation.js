// Automation rules engine for work orders (tickets).
//
// A rule is a WHEN / IF / THEN triple stored in `automation_rules`:
//   - trigger_event (WHEN): 'ticket.created' | 'ticket.updated' | 'ticket.idle'
//   - conditions   (IF):    { match:'all'|'any', rules:[{ field, op, value }] }
//   - actions      (THEN):  [{ type:'set_field', field, value } | { type:'add_note', value }]
//
// `matchesConditions` and `normalizeActions` are PURE (no DB) so they're unit
// tested in isolation (see server/test/automation.test.js), mirroring how
// lib/permissions.js is tested. `runAutomations` is the DB-facing entry point,
// called from the ticket create/update routes; it is guaranteed not to throw.
//
// Loop safety: the engine writes ticket changes with a single direct UPDATE (it
// does NOT re-enter the route handlers), so a 'ticket.updated' action can't
// recursively re-trigger 'ticket.updated'. Every field write and note is logged
// to ticket_activity (actor 'Automation: <rule>' matches no real user, so the
// involved parties are notified via the existing activity-driven feed), and each
// rule that fires is recorded in `automation_runs` for debuggability.

import { pool } from '../config/db.js';

// Fields a condition may read from a ticket row.
export const CONDITION_FIELDS = [
  'title', 'description', 'status', 'priority', 'request_type',
  'category', 'subcategory', 'subcategory2', 'department', 'requester',
  'assignee', 'asset_id'
];

// Fields a `set_field` action may write, and the enum allowlist for each
// (null = free string, capped by length). Kept in sync with tickets schema.
const STATUSES = ['open', 'in_progress', 'on_hold', 'pending', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const REQUEST_TYPES = ['incident', 'service_request', 'question', 'change'];
export const SETTABLE_FIELDS = {
  status: STATUSES,
  priority: PRIORITIES,
  request_type: REQUEST_TYPES,
  category: null,
  department: null,
  assignee: null
};

// Operators a condition rule may use. Value-taking ops need a `value`; the
// presence ops (is_empty/is_not_empty) ignore it.
export const CONDITION_OPS = ['eq', 'neq', 'contains', 'in', 'is_empty', 'is_not_empty'];
const VALUELESS_OPS = new Set(['is_empty', 'is_not_empty']);

function parseJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw; // mysql2 returns JSON columns parsed
  try { return JSON.parse(raw); } catch { return null; }
}

function fieldVal(ticket, field) {
  const v = ticket?.[field];
  return v == null ? '' : String(v);
}

function evalRule(ticket, rule) {
  if (!rule || typeof rule !== 'object') return false;
  if (!CONDITION_FIELDS.includes(rule.field)) return false;
  const actual = fieldVal(ticket, rule.field).toLowerCase();
  const value = rule.value;
  switch (rule.op) {
    case 'eq': return actual === String(value ?? '').toLowerCase();
    case 'neq': return actual !== String(value ?? '').toLowerCase();
    case 'contains': return actual.includes(String(value ?? '').toLowerCase());
    case 'in': return Array.isArray(value)
      && value.map((x) => String(x).toLowerCase()).includes(actual);
    case 'is_empty': return actual === '';
    case 'is_not_empty': return actual !== '';
    default: return false;
  }
}

// Pure: does this ticket satisfy a rule's condition set? An empty/invalid rule
// set never matches (so a misconfigured rule can't silently fire on everything).
export function matchesConditions(ticket, conditions) {
  const parsed = parseJson(conditions);
  const rules = Array.isArray(parsed?.rules) ? parsed.rules : [];
  if (!rules.length) return false;
  const results = rules.map((r) => evalRule(ticket, r));
  return parsed.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

// Pure: strip a conditions payload to a valid, storable shape. Drops unknown
// fields/operators and rules missing a value where one is required. Returns null
// when nothing valid remains (so the route can reject a no-op rule set).
export function sanitizeConditions(raw) {
  const parsed = parseJson(raw);
  const rules = Array.isArray(parsed?.rules) ? parsed.rules : [];
  const out = [];
  for (const r of rules) {
    if (!r || typeof r !== 'object') continue;
    if (!CONDITION_FIELDS.includes(r.field)) continue;
    if (!CONDITION_OPS.includes(r.op)) continue;
    if (VALUELESS_OPS.has(r.op)) {
      out.push({ field: r.field, op: r.op });
    } else if (r.op === 'in') {
      const value = Array.isArray(r.value)
        ? r.value.map((x) => String(x).trim().slice(0, 120)).filter(Boolean)
        : [];
      if (!value.length) continue;
      out.push({ field: r.field, op: r.op, value });
    } else {
      if (r.value == null || String(r.value).trim() === '') continue;
      out.push({ field: r.field, op: r.op, value: String(r.value).trim().slice(0, 200) });
    }
  }
  if (!out.length) return null;
  return { match: parsed.match === 'any' ? 'any' : 'all', rules: out };
}

// Pure: strip an actions payload to only valid, allowlisted actions. Invalid
// `set_field` fields/enums and empty notes are dropped rather than throwing.
export function normalizeActions(raw) {
  const list = parseJson(raw);
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const a of list) {
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'set_field') {
      if (!(a.field in SETTABLE_FIELDS)) continue;
      let value = a.value;
      if (value === null || value === '') {
        value = null;
      } else {
        value = String(value).trim().slice(0, 120);
        const enumVals = SETTABLE_FIELDS[a.field];
        if (enumVals && !enumVals.includes(value)) continue;
      }
      out.push({ type: 'set_field', field: a.field, value });
    } else if (a.type === 'add_note') {
      const body = a.value == null ? '' : String(a.value).trim();
      if (!body) continue;
      out.push({ type: 'add_note', value: body.slice(0, 4000) });
    }
  }
  return out;
}

// Run all active rules for `trigger` against a ticket row. Applies matched field
// changes in one UPDATE, logs changes + notes to ticket_activity, and records
// fired rules in automation_runs. Fire-and-forget; never throws.
export async function runAutomations(trigger, ticket, { onlyRuleIds = null } = {}) {
  try {
    if (!ticket?.id) return;
    // `onlyRuleIds` restricts evaluation to specific rules (used by the idle
    // scheduler, which has already picked the due rule for this ticket).
    const restrict = Array.isArray(onlyRuleIds) && onlyRuleIds.length;
    const [rules] = await pool.query(
      `SELECT id, name, conditions, actions, stop_on_match
         FROM automation_rules
        WHERE is_active = 1 AND trigger_event = ?
        ${restrict ? 'AND id IN (?)' : ''}
        ORDER BY priority ASC, id ASC`,
      restrict ? [trigger, onlyRuleIds] : [trigger]
    );
    if (!rules.length) return;

    // Work on a copy so later rules see earlier rules' changes (e.g. a rule that
    // matches on the priority an earlier rule just set).
    const working = { ...ticket };
    const fieldChangeByField = new Map(); // field -> { oldValue, newValue, ruleName }
    const notes = [];                     // { body, ruleName }
    const fired = [];                     // { ruleId, applied }

    for (const rule of rules) {
      if (!matchesConditions(working, rule.conditions)) continue;
      const actions = normalizeActions(rule.actions);
      const applied = [];
      for (const a of actions) {
        if (a.type === 'set_field') {
          const cur = working[a.field] == null ? null : String(working[a.field]);
          if ((cur ?? null) === (a.value ?? null)) continue; // no-op
          // First writer records the true original old value; later writers win
          // on new value but keep the original old value for a clean audit line.
          const existing = fieldChangeByField.get(a.field);
          fieldChangeByField.set(a.field, {
            oldValue: existing ? existing.oldValue : cur,
            newValue: a.value,
            ruleName: rule.name
          });
          working[a.field] = a.value;
          applied.push(a);
        } else if (a.type === 'add_note') {
          notes.push({ body: a.value, ruleName: rule.name });
          applied.push(a);
        }
      }
      if (applied.length) fired.push({ ruleId: rule.id, applied });
      if (rule.stop_on_match) break;
    }

    const finals = [...fieldChangeByField.values()]
      .filter((c) => (c.oldValue ?? null) !== (c.newValue ?? null));
    // Re-derive the field name list aligned with finals for the UPDATE.
    const finalFields = [...fieldChangeByField.entries()]
      .filter(([, c]) => (c.oldValue ?? null) !== (c.newValue ?? null));

    if (finalFields.length) {
      const sets = finalFields.map(([field]) => `${field} = ?`).join(', ');
      const vals = finalFields.map(([, c]) => c.newValue);
      vals.push(ticket.id);
      await pool.query(`UPDATE tickets SET ${sets} WHERE id = ?`, vals);
    }

    const activityRows = [];
    for (const [field, c] of finalFields) {
      activityRows.push([
        ticket.id, 'change', `Automation: ${c.ruleName}`.slice(0, 120), field,
        c.oldValue == null ? null : String(c.oldValue).slice(0, 500),
        c.newValue == null ? null : String(c.newValue).slice(0, 500), null
      ]);
    }
    for (const n of notes) {
      activityRows.push([
        ticket.id, 'note', `Automation: ${n.ruleName}`.slice(0, 120),
        null, null, null, String(n.body).slice(0, 4000)
      ]);
    }
    if (activityRows.length) {
      await pool.query(
        `INSERT INTO ticket_activity (ticket_id, type, actor, field, old_value, new_value, body)
         VALUES ?`,
        [activityRows]
      );
    }

    if (fired.length) {
      const runRows = fired.map((f) => [f.ruleId, ticket.id, JSON.stringify(f.applied)]);
      await pool.query(
        `INSERT INTO automation_runs (rule_id, ticket_id, actions_applied) VALUES ?`,
        [runRows]
      );
    }

    if (fired.length) {
      console.log(`[automation] ${trigger} ticket #${ticket.id}: ${fired.length} rule(s) fired, ${finals.length} field change(s)`);
    }
    return { changedFields: finalFields.map(([f]) => f), notes: notes.length, rulesFired: fired.length };
  } catch (err) {
    console.error('[automation] run failed:', err.message);
  }
}
