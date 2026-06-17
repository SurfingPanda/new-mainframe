// SLA policy layer. A policy is a scoped matcher (priority / request_type /
// category / department — any NULL field is a wildcard) plus response and
// resolution targets in MINUTES. The most specific active policy wins; ties break
// by `rank` (desc) then id (asc). When no policy matches, the per-priority default
// from app_settings.sla_days is used (so behaviour is preserved with zero config).
//
// Targets are resolved at ticket creation and SNAPSHOTTED onto the ticket
// (sla_response_minutes / sla_resolution_minutes / sla_calendar_id), so later
// policy edits never retroactively move an existing work order's SLA.
//
// pickPolicy / effectiveTargets are pure (testable in node:test); the cache + CRUD
// touch the DB. The active-policy cache is loaded at boot and refreshed on save.

import { pool } from '../config/db.js';
import { getSlaDays } from './sla-config.js';

const MATCH_FIELDS = ['priority', 'request_type', 'category', 'department'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const REQUEST_TYPES = ['incident', 'service_request', 'question', 'change'];

let cache = []; // active policies

export async function loadSlaPolicies() {
  try {
    const [rows] = await pool.query('SELECT * FROM sla_policies WHERE is_active = 1');
    cache = rows;
  } catch (err) {
    console.error('loadSlaPolicies failed:', err.message);
  }
  return cache;
}

// Pure: best-matching policy for a ticket from a list. A policy matches only when
// every non-null matcher field equals the ticket's value (case-insensitive).
// Specificity = count of non-null matchers; ties → higher rank, then lower id.
export function pickPolicy(ticket, policies) {
  const norm = (v) => (v == null ? null : String(v).toLowerCase());
  const matches = (policies || []).filter((p) =>
    MATCH_FIELDS.every((f) => p[f] == null || norm(p[f]) === norm(ticket?.[f]))
  );
  if (!matches.length) return null;
  const score = (p) => MATCH_FIELDS.reduce((n, f) => n + (p[f] != null ? 1 : 0), 0);
  matches.sort((a, b) => score(b) - score(a) || (b.rank ?? 0) - (a.rank ?? 0) || a.id - b.id);
  return matches[0];
}

// Pure: the effective targets for a ticket — the matched policy, else the
// per-priority default resolution from sla_days (no response target).
export function effectiveTargets(ticket, policies = cache, slaDays = getSlaDays()) {
  const p = pickPolicy(ticket, policies);
  if (p) {
    return {
      policyId: p.id,
      responseMinutes: p.response_minutes ?? null,
      resolutionMinutes: p.resolution_minutes,
      calendarId: p.calendar_id ?? null
    };
  }
  const days = slaDays?.[ticket?.priority];
  return { policyId: null, responseMinutes: null, resolutionMinutes: days ? days * 1440 : null, calendarId: null };
}

// Validate/normalize a create (partial=false) or update (partial=true) payload.
// Returns { value } or { error }.
export function sanitizePolicy(body = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name) return { error: 'name is required' };
    out.name = name.slice(0, 120);
  }
  if (!partial || 'priority' in body) out.priority = PRIORITIES.includes(body.priority) ? body.priority : null;
  if (!partial || 'request_type' in body) out.request_type = REQUEST_TYPES.includes(body.request_type) ? body.request_type : null;
  if (!partial || 'category' in body) out.category = body.category ? String(body.category).trim().slice(0, 80) : null;
  if (!partial || 'department' in body) out.department = body.department ? String(body.department).trim().slice(0, 80) : null;
  if (!partial || 'response_minutes' in body) {
    const r = Number(body.response_minutes);
    out.response_minutes = Number.isInteger(r) && r > 0 ? r : null;
  }
  if (!partial || 'resolution_minutes' in body) {
    const r = Number(body.resolution_minutes);
    if (!Number.isInteger(r) || r <= 0) return { error: 'resolution_minutes must be a positive whole number of minutes' };
    out.resolution_minutes = r;
  }
  if (!partial || 'calendar_id' in body) {
    const n = Number(body.calendar_id);
    out.calendar_id = Number.isInteger(n) && n > 0 ? n : null;
  }
  if (!partial || 'is_active' in body) out.is_active = body.is_active === false ? 0 : 1;
  if (!partial || 'rank' in body) { const n = Number(body.rank); out.rank = Number.isInteger(n) ? n : 0; }
  return { value: out };
}

// One-time seed: turn the per-priority sla_days defaults into 4 wildcard policies
// so an existing install keeps its exact behaviour and the admin has rows to edit.
export async function seedDefaultPoliciesIfEmpty() {
  try {
    const [[{ c }]] = await pool.query('SELECT COUNT(*) AS c FROM sla_policies');
    if (c > 0) return;
    const days = getSlaDays();
    const rows = PRIORITIES.map((p) => [
      `${p[0].toUpperCase()}${p.slice(1)} priority (default)`,
      p, null, null, null, null, (days[p] || 3) * 1440, null, 1, 0
    ]);
    await pool.query(
      `INSERT INTO sla_policies
         (name, priority, request_type, category, department, response_minutes, resolution_minutes, calendar_id, is_active, rank)
       VALUES ?`,
      [rows]
    );
    console.log(`[sla] seeded ${rows.length} default SLA policies from sla_days`);
  } catch (err) {
    console.error('seedDefaultPolicies failed:', err.message);
  }
}
