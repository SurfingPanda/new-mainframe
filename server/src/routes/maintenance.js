import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { generateWorkOrder, addCadence, toYmd } from '../lib/maintenance-scheduler.js';

const router = Router();

const CADENCES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const REQUEST_TYPES = ['incident', 'service_request', 'question', 'change'];

// Managing recurring work orders is a staff function.
router.use(requireAuth, requireRole('admin', 'agent'));

const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

function str(v, max) {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t.slice(0, max) : null;
}

// mysql2 returns DATE columns as JS Date objects at local midnight, which can
// shift a day when serialized to UTC JSON. Normalize the date fields to plain
// 'YYYY-MM-DD' strings so the client always sees the intended calendar date.
function shapeSchedule(row) {
  if (!row) return row;
  return {
    ...row,
    start_date: toYmd(row.start_date),
    next_run_at: toYmd(row.next_run_at),
    last_run_at: row.last_run_at ? toYmd(row.last_run_at) : null
  };
}

async function loadSchedule(id) {
  const [rows] = await pool.query(
    `SELECT s.*, a.asset_tag, a.type AS asset_type,
            (SELECT COUNT(*) FROM tickets t WHERE t.schedule_id = s.id) AS generated_count
       FROM maintenance_schedules s
       LEFT JOIN assets a ON a.id = s.asset_id
      WHERE s.id = ?
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

// GET /api/maintenance — all schedules, active first then by next due date.
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, a.asset_tag, a.type AS asset_type,
              (SELECT COUNT(*) FROM tickets t WHERE t.schedule_id = s.id) AS generated_count
         FROM maintenance_schedules s
         LEFT JOIN assets a ON a.id = s.asset_id
        ORDER BY s.is_active DESC, s.next_run_at ASC, s.id DESC`
    );
    res.json(rows.map(shapeSchedule));
  } catch (err) {
    next(err);
  }
});

// GET /api/maintenance/:id — schedule + the work orders it has generated.
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
    const schedule = await loadSchedule(id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    const [workOrders] = await pool.query(
      `SELECT id, title, status, priority, created_at
         FROM tickets WHERE schedule_id = ? ORDER BY created_at DESC, id DESC`,
      [id]
    );
    res.json({ ...shapeSchedule(schedule), work_orders: workOrders });
  } catch (err) {
    next(err);
  }
});

// POST /api/maintenance — create a schedule. next_run_at starts at start_date.
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const title = str(b.title, 200);
    const cadence = b.cadence;
    const priority = b.priority || 'normal';
    const requestType = b.request_type || 'service_request';
    const intervalCount = Math.max(1, Number(b.interval_count) || 1);

    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!CADENCES.includes(cadence)) return res.status(400).json({ error: 'invalid cadence' });
    if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'invalid priority' });
    if (!REQUEST_TYPES.includes(requestType)) return res.status(400).json({ error: 'invalid request type' });
    if (!isYmd(b.start_date)) return res.status(400).json({ error: 'start_date must be YYYY-MM-DD' });

    const assetId = b.asset_id ? Number(b.asset_id) : null;
    if (b.asset_id && (!Number.isInteger(assetId) || assetId <= 0)) {
      return res.status(400).json({ error: 'invalid asset_id' });
    }

    const createdBy = req.user?.name || req.user?.email || null;

    const [result] = await pool.query(
      `INSERT INTO maintenance_schedules
         (title, description, priority, request_type, category, department, assignee,
          asset_id, cadence, interval_count, start_date, next_run_at, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        str(b.description, 65535),
        priority,
        requestType,
        str(b.category, 80),
        str(b.department, 80),
        str(b.assignee, 120),
        assetId,
        cadence,
        intervalCount,
        b.start_date,
        b.start_date,
        b.is_active === false || b.is_active === 0 ? 0 : 1,
        createdBy
      ]
    );
    const schedule = await loadSchedule(result.insertId);
    res.status(201).json(shapeSchedule(schedule));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/maintenance/:id — update fields / toggle active / change cadence.
router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
    const existing = await loadSchedule(id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });

    const b = req.body || {};
    const sets = [];
    const vals = [];
    const set = (col, val) => { sets.push(`${col} = ?`); vals.push(val); };

    if (b.title !== undefined) {
      const title = str(b.title, 200);
      if (!title) return res.status(400).json({ error: 'title cannot be empty' });
      set('title', title);
    }
    if (b.description !== undefined) set('description', str(b.description, 65535));
    if (b.priority !== undefined) {
      if (!PRIORITIES.includes(b.priority)) return res.status(400).json({ error: 'invalid priority' });
      set('priority', b.priority);
    }
    if (b.request_type !== undefined) {
      if (!REQUEST_TYPES.includes(b.request_type)) return res.status(400).json({ error: 'invalid request type' });
      set('request_type', b.request_type);
    }
    if (b.category !== undefined) set('category', str(b.category, 80));
    if (b.department !== undefined) set('department', str(b.department, 80));
    if (b.assignee !== undefined) set('assignee', str(b.assignee, 120));
    if (b.asset_id !== undefined) {
      const assetId = b.asset_id ? Number(b.asset_id) : null;
      if (b.asset_id && (!Number.isInteger(assetId) || assetId <= 0)) {
        return res.status(400).json({ error: 'invalid asset_id' });
      }
      set('asset_id', assetId);
    }
    if (b.cadence !== undefined) {
      if (!CADENCES.includes(b.cadence)) return res.status(400).json({ error: 'invalid cadence' });
      set('cadence', b.cadence);
    }
    if (b.interval_count !== undefined) set('interval_count', Math.max(1, Number(b.interval_count) || 1));
    if (b.is_active !== undefined) set('is_active', b.is_active ? 1 : 0);
    if (b.start_date !== undefined) {
      if (!isYmd(b.start_date)) return res.status(400).json({ error: 'start_date must be YYYY-MM-DD' });
      set('start_date', b.start_date);
      // If it hasn't generated anything yet, keep next run aligned to the new start.
      if (existing.last_run_at == null) set('next_run_at', b.start_date);
    }

    if (!sets.length) return res.status(400).json({ error: 'no fields to update' });

    vals.push(id);
    await pool.query(`UPDATE maintenance_schedules SET ${sets.join(', ')} WHERE id = ?`, vals);
    res.json(shapeSchedule(await loadSchedule(id)));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/maintenance/:id — remove the schedule; keep its work orders but
// detach them (schedule_id -> NULL) so history isn't lost.
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
    const existing = await loadSchedule(id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    await pool.query(`UPDATE tickets SET schedule_id = NULL WHERE schedule_id = ?`, [id]);
    await pool.query(`DELETE FROM maintenance_schedules WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/maintenance/:id/run — generate a work order now and advance next_run_at.
router.post('/:id/run', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
    const schedule = await loadSchedule(id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const ticketId = await generateWorkOrder(schedule);

    // Advance next_run_at to the next future occurrence from where it was.
    const today = toYmd(new Date());
    let next = toYmd(schedule.next_run_at);
    do {
      next = addCadence(next, schedule.cadence, schedule.interval_count);
    } while (next <= today);
    await pool.query(
      `UPDATE maintenance_schedules SET next_run_at = ?, last_run_at = CURDATE() WHERE id = ?`,
      [next, id]
    );

    res.status(201).json({ work_order_id: ticketId, schedule: shapeSchedule(await loadSchedule(id)) });
  } catch (err) {
    next(err);
  }
});

export default router;
