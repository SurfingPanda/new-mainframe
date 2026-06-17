// App-wide admin audit trail. Distinct from ticket_activity (per-ticket,
// user-visible): this records sensitive administrative actions — user/permission
// changes, department edits, password-reset decisions — for an admin-only log.
//
// recordAudit is fire-and-forget and swallows its own errors: an audit-write
// failure must never break the operation being audited. (Trade-off: a dropped
// write is silently lost; acceptable for an app-level trail. True tamper-evidence
// would need append-only storage / external shipping — out of scope here.)
//
// Actor + IP are taken from the request so callers don't repeat that plumbing.
// Labels are denormalized at write time so the trail stays readable after the
// actor or target is later renamed or removed.

import { pool } from '../config/db.js';

export async function recordAudit(req, { action, entityType = null, entityId = null, entityLabel = null, changes = null }) {
  try {
    if (!action) return;
    await pool.query(
      `INSERT INTO audit_log
         (actor_id, actor_name, action, entity_type, entity_id, entity_label, changes, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req?.user?.sub ?? null,
        (req?.user?.name || req?.user?.email || null),
        String(action).slice(0, 64),
        entityType ? String(entityType).slice(0, 40) : null,
        entityId != null ? String(entityId).slice(0, 64) : null,
        entityLabel ? String(entityLabel).slice(0, 160) : null,
        changes ? JSON.stringify(changes) : null,
        req?.ip ? String(req.ip).slice(0, 45) : null
      ]
    );
  } catch (err) {
    console.error('[audit] write failed:', err.message);
  }
}

// Build a { field: { from, to } } diff from a before-row and the patch that was
// applied. Only includes fields whose value actually changed. `redact` lists
// fields whose values must not be stored verbatim (logged as a boolean changed).
export function diffChanges(before, after, fields, redact = []) {
  const out = {};
  for (const f of fields) {
    const from = before?.[f] ?? null;
    const to = after?.[f] ?? null;
    const norm = (v) => (v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : v);
    if (norm(from) === norm(to)) continue;
    out[f] = redact.includes(f) ? { changed: true } : { from, to };
  }
  return Object.keys(out).length ? out : null;
}
