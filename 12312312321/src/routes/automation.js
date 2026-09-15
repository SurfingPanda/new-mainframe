import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  CONDITION_FIELDS,
  CONDITION_OPS,
  SETTABLE_FIELDS,
  sanitizeConditions,
  normalizeActions
} from '../lib/automation.js';
import { ALLOWED_CATEGORIES } from './tickets.js';

const router = Router();

const TRIGGERS = ['ticket.created', 'ticket.updated', 'ticket.idle', 'sla.response_breached', 'sla.resolution_breached'];

const RULE_SELECT = `
  SELECT id, name, description, trigger_event, conditions, actions,
         is_active, priority, stop_on_match, idle_minutes, created_by,
         created_at, updated_at
    FROM automation_rules`;

// Validate + normalize a create/update payload. Returns { value } on success or
// { error } (a 400 message). `partial` skips required-field checks for PATCH.
function buildRule(body, { partial = false } = {}) {
  const out = {};

  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name) return { error: 'name is required' };
    out.name = name.slice(0, 160);
  }
  if (!partial || body.trigger_event !== undefined) {
    if (!TRIGGERS.includes(body.trigger_event)) return { error: 'invalid trigger_event' };
    out.trigger_event = body.trigger_event;
  }
  if (!partial || body.conditions !== undefined) {
    const conditions = sanitizeConditions(body.conditions);
    if (!conditions) return { error: 'at least one valid condition is required' };
    out.conditions = JSON.stringify(conditions);
  }
  if (!partial || body.actions !== undefined) {
    const actions = normalizeActions(body.actions);
    if (!actions.length) return { error: 'at least one valid action is required' };
    out.actions = JSON.stringify(actions);
  }
  if (body.description !== undefined) {
    out.description = body.description ? String(body.description).trim().slice(0, 1000) : null;
  }
  if (body.is_active !== undefined) out.is_active = body.is_active ? 1 : 0;
  if (body.stop_on_match !== undefined) out.stop_on_match = body.stop_on_match ? 1 : 0;
  if (body.priority !== undefined) {
    const p = Number(body.priority);
    out.priority = Number.isInteger(p) ? p : 0;
  }
  if (body.trigger_event === 'ticket.idle' || body.idle_minutes !== undefined) {
    const m = Number(body.idle_minutes);
    out.idle_minutes = Number.isInteger(m) && m > 0 ? m : null;
  }
  return { value: out };
}

router.use(requireAuth, requirePermission('automation', 'manage'));

// Builder metadata so the client can populate dropdowns from one source.
router.get('/meta', (_req, res) => {
  res.json({
    triggers: TRIGGERS,
    conditionFields: CONDITION_FIELDS,
    conditionOps: CONDITION_OPS,
    settableFields: Object.fromEntries(
      Object.entries(SETTABLE_FIELDS).map(([k, v]) => [k, v || null])
    ),
    categories: ALLOWED_CATEGORIES
  });
});

// Recent run audit (optionally filtered by rule). Joins the rule name so a
// deleted rule still shows something sensible.
router.get('/runs', async (req, res, next) => {
  try {
    const ruleId = Number(req.query.rule_id);
    const where = Number.isInteger(ruleId) && ruleId > 0 ? 'WHERE r.rule_id = ?' : '';
    const params = where ? [ruleId] : [];
    const [rows] = await pool.query(
      `SELECT r.id, r.rule_id, r.ticket_id, r.actions_applied, r.created_at,
              ar.name AS rule_name
         FROM automation_runs r
         LEFT JOIN automation_rules ar ON ar.id = r.rule_id
         ${where}
        ORDER BY r.id DESC
        LIMIT 100`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `${RULE_SELECT} ORDER BY trigger_event ASC, priority ASC, id ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { value, error } = buildRule(req.body || {});
    if (error) return res.status(400).json({ error });
    value.created_by = req.user?.name || req.user?.email || null;
    const fields = Object.keys(value);
    const [result] = await pool.query(
      `INSERT INTO automation_rules (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
      fields.map((f) => value[f])
    );
    const [rows] = await pool.query(`${RULE_SELECT} WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
    const { value, error } = buildRule(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error });
    const fields = Object.keys(value);
    if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
    const sets = fields.map((f) => `${f} = ?`).join(', ');
    const params = fields.map((f) => value[f]);
    params.push(id);
    const [r] = await pool.query(`UPDATE automation_rules SET ${sets} WHERE id = ?`, params);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Rule not found' });
    const [rows] = await pool.query(`${RULE_SELECT} WHERE id = ?`, [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [r] = await pool.query('DELETE FROM automation_rules WHERE id = ?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
