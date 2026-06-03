import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();

const ASPECTS = ['satisfaction', 'timeliness', 'professionalism'];
const COMMENT_MAX = 1000;

const isStaff = (user) => user?.role === 'admin' || user?.role === 'agent';

function shape(row, ticketTitle) {
  return {
    ticket_id: row.ticket_id,
    technician: row.technician,
    respondent_id: row.respondent_id,
    respondent_name: row.respondent_name,
    status: row.status,
    satisfaction: row.satisfaction,
    timeliness: row.timeliness,
    professionalism: row.professionalism,
    comment: row.comment,
    created_at: row.created_at,
    completed_at: row.completed_at,
    ticket_title: ticketTitle ?? null
  };
}

async function loadSurvey(ticketId) {
  const [rows] = await pool.query(
    `SELECT s.*, t.title AS ticket_title
       FROM ticket_surveys s
       LEFT JOIN tickets t ON t.id = s.ticket_id
      WHERE s.ticket_id = ? LIMIT 1`,
    [ticketId]
  );
  return rows[0] || null;
}

// GET /api/surveys — every survey, for the Survey Reports page. Admin-gated
// (same access as the rest of the Users section). Returns completed and pending
// rows so the report can show response rate; the client computes aggregates.
router.get('/', requireAuth, requirePermission('users', 'manage'), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.ticket_id, t.title AS ticket_title, s.technician, s.technician_id,
              s.respondent_name, s.status, s.satisfaction, s.timeliness, s.professionalism,
              s.comment, s.created_at, s.completed_at
         FROM ticket_surveys s
         LEFT JOIN tickets t ON t.id = s.ticket_id
        ORDER BY s.created_at DESC
        LIMIT 1000`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/surveys/:ticketId — the survey for a work order. Visible to the
// respondent (the requester) and to staff (so they can see results).
router.get('/:ticketId', requireAuth, async (req, res, next) => {
  try {
    const ticketId = Number(req.params.ticketId);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: 'invalid ticket id' });
    }
    const survey = await loadSurvey(ticketId);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    if (survey.respondent_id !== req.user.sub && !isStaff(req.user)) {
      return res.status(404).json({ error: 'Survey not found' });
    }
    res.json(shape(survey, survey.ticket_title));
  } catch (err) {
    next(err);
  }
});

// POST /api/surveys/:ticketId — submit the ratings. Respondent only, once.
router.post('/:ticketId', requireAuth, async (req, res, next) => {
  try {
    const ticketId = Number(req.params.ticketId);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: 'invalid ticket id' });
    }
    const survey = await loadSurvey(ticketId);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    if (survey.respondent_id !== req.user.sub) {
      return res.status(403).json({ error: 'This survey is not yours to complete' });
    }
    if (survey.status === 'completed') {
      return res.status(409).json({ error: 'This survey has already been submitted' });
    }

    const ratings = {};
    for (const aspect of ASPECTS) {
      const n = Number(req.body?.[aspect]);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        return res.status(400).json({ error: `${aspect} must be a rating from 1 to 5` });
      }
      ratings[aspect] = n;
    }
    const comment = String(req.body?.comment ?? '').trim().slice(0, COMMENT_MAX) || null;

    await pool.query(
      `UPDATE ticket_surveys
          SET satisfaction = ?, timeliness = ?, professionalism = ?, comment = ?,
              status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE ticket_id = ?`,
      [ratings.satisfaction, ratings.timeliness, ratings.professionalism, comment, ticketId]
    );

    const updated = await loadSurvey(ticketId);
    res.json(shape(updated, updated.ticket_title));
  } catch (err) {
    next(err);
  }
});

export default router;
