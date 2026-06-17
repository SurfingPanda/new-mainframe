import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { sanitizePolicy, loadSlaPolicies } from '../lib/sla-policies.js';
import { loadSlaCalendars } from '../lib/business-hours.js';
import { ALLOWED_CATEGORIES, ALLOWED_REQUEST_TYPES } from './tickets.js';

const router = Router();

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Validate a weekly-hours object: each day is an array of ["HH:MM","HH:MM"] with
// start < end. Returns a normalized object or throws a 400-shaped error.
function sanitizeHours(raw) {
  const out = {};
  for (const d of WEEKDAYS) {
    const windows = Array.isArray(raw?.[d]) ? raw[d] : [];
    out[d] = [];
    for (const w of windows) {
      if (!Array.isArray(w) || w.length !== 2) continue;
      const [s, e] = w;
      if (!TIME_RE.test(s) || !TIME_RE.test(e) || s >= e) {
        const err = new Error(`Invalid hours for ${d}: ${JSON.stringify(w)}`); err.status = 400; throw err;
      }
      out[d].push([s, e]);
    }
  }
  return out;
}

const POLICY_COLUMNS = `id, name, priority, request_type, category, department,
  response_minutes, resolution_minutes, calendar_id, is_active, rank, created_at, updated_at`;

router.use(requireAuth, requirePermission('users', 'manage'));

// Matcher dropdown options for the policy builder.
router.get('/meta', async (_req, res, next) => {
  try {
    const [depts] = await pool.query('SELECT name FROM departments WHERE is_active = 1 ORDER BY name');
    res.json({
      priorities: ['low', 'normal', 'high', 'urgent'],
      requestTypes: ALLOWED_REQUEST_TYPES,
      categories: ALLOWED_CATEGORIES,
      departments: depts.map((d) => d.name)
    });
  } catch (err) {
    next(err);
  }
});

router.get('/policies', async (_req, res, next) => {
  try {
    // Most specific first so the order mirrors evaluation precedence.
    const [rows] = await pool.query(
      `SELECT ${POLICY_COLUMNS} FROM sla_policies
        ORDER BY (priority IS NOT NULL) + (request_type IS NOT NULL) + (category IS NOT NULL) + (department IS NOT NULL) DESC,
                 rank DESC, id ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/policies', async (req, res, next) => {
  try {
    const { value, error } = sanitizePolicy(req.body || {});
    if (error) return res.status(400).json({ error });
    const fields = Object.keys(value);
    const [result] = await pool.query(
      `INSERT INTO sla_policies (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
      fields.map((f) => value[f])
    );
    await loadSlaPolicies();
    const [rows] = await pool.query(`SELECT ${POLICY_COLUMNS} FROM sla_policies WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/policies/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
    const { value, error } = sanitizePolicy(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error });
    const fields = Object.keys(value);
    if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
    const params = fields.map((f) => value[f]);
    params.push(id);
    const [r] = await pool.query(
      `UPDATE sla_policies SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, params
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Policy not found' });
    await loadSlaPolicies();
    const [rows] = await pool.query(`SELECT ${POLICY_COLUMNS} FROM sla_policies WHERE id = ?`, [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/policies/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [r] = await pool.query('DELETE FROM sla_policies WHERE id = ?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Policy not found' });
    await loadSlaPolicies();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Business-hours calendars ──

const CAL_SELECT = `c.id, c.name, c.timezone, c.hours, c.is_default, c.created_at, c.updated_at`;

async function calendarWithHolidays(id) {
  const [[cal]] = await pool.query(`SELECT ${CAL_SELECT} FROM sla_calendars c WHERE c.id = ?`, [id]);
  if (!cal) return null;
  const [hols] = await pool.query(
    'SELECT id, holiday_date, label FROM sla_holidays WHERE calendar_id = ? ORDER BY holiday_date', [id]
  );
  cal.holidays = hols;
  return cal;
}

router.get('/calendars', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT ${CAL_SELECT} FROM sla_calendars c ORDER BY c.name`);
    const [hols] = await pool.query('SELECT id, calendar_id, holiday_date, label FROM sla_holidays ORDER BY holiday_date');
    const byCal = new Map();
    for (const h of hols) {
      if (!byCal.has(h.calendar_id)) byCal.set(h.calendar_id, []);
      byCal.get(h.calendar_id).push(h);
    }
    for (const c of rows) c.holidays = byCal.get(c.id) || [];
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/calendars', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const timezone = String(req.body?.timezone || 'Asia/Manila').trim().slice(0, 64);
    let hours;
    try { hours = sanitizeHours(req.body?.hours); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    const [result] = await pool.query(
      'INSERT INTO sla_calendars (name, timezone, hours) VALUES (?, ?, ?)',
      [name.slice(0, 120), timezone, JSON.stringify(hours)]
    );
    await loadSlaCalendars();
    res.status(201).json(await calendarWithHolidays(result.insertId));
  } catch (err) {
    next(err);
  }
});

router.patch('/calendars/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const fields = [];
    const values = [];
    if (req.body?.name !== undefined) {
      if (!String(req.body.name).trim()) return res.status(400).json({ error: 'name cannot be blank' });
      fields.push('name = ?'); values.push(String(req.body.name).trim().slice(0, 120));
    }
    if (req.body?.timezone !== undefined) { fields.push('timezone = ?'); values.push(String(req.body.timezone).trim().slice(0, 64)); }
    if (req.body?.hours !== undefined) {
      let hours;
      try { hours = sanitizeHours(req.body.hours); }
      catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
      fields.push('hours = ?'); values.push(JSON.stringify(hours));
    }
    if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
    values.push(id);
    const [r] = await pool.query(`UPDATE sla_calendars SET ${fields.join(', ')} WHERE id = ?`, values);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Calendar not found' });
    await loadSlaCalendars();
    res.json(await calendarWithHolidays(id));
  } catch (err) {
    next(err);
  }
});

router.delete('/calendars/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [r] = await pool.query('DELETE FROM sla_calendars WHERE id = ?', [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Calendar not found' });
    await loadSlaCalendars();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Holidays (add / remove one date at a time).
router.post('/calendars/:id/holidays', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const date = String(req.body?.holiday_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'holiday_date must be YYYY-MM-DD' });
    await pool.query(
      `INSERT INTO sla_holidays (calendar_id, holiday_date, label) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label)`,
      [id, date, req.body?.label ? String(req.body.label).slice(0, 120) : null]
    );
    await loadSlaCalendars();
    res.status(201).json(await calendarWithHolidays(id));
  } catch (err) {
    next(err);
  }
});

router.delete('/calendars/:id/holidays/:holidayId', async (req, res, next) => {
  try {
    const [r] = await pool.query(
      'DELETE FROM sla_holidays WHERE id = ? AND calendar_id = ?',
      [Number(req.params.holidayId), Number(req.params.id)]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Holiday not found' });
    await loadSlaCalendars();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
