import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const SUBJECT_MAX = 200;
const BODY_MAX = 5000;

// Shape a DB row for the client, framed from the current user's perspective so
// the UI doesn't have to know which side they're on.
function shape(row, meId) {
  const mine = row.sender_id === meId;
  return {
    id: row.id,
    direction: mine ? 'sent' : 'inbox',
    sender: { id: row.sender_id, name: row.sender_name },
    recipient: { id: row.recipient_id, name: row.recipient_name },
    // The "other party" — who the user is corresponding with.
    counterparty: mine
      ? { id: row.recipient_id, name: row.recipient_name }
      : { id: row.sender_id, name: row.sender_name },
    subject: row.subject,
    body: row.body,
    // Optional in-app CTA (e.g. the resolution-survey link on a system message).
    link_url: row.link_url || null,
    link_label: row.link_label || null,
    is_read: !!row.is_read,
    created_at: row.created_at
  };
}

// GET /api/messages?box=inbox|sent — the current user's mail in one box.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const meId = req.user.sub;
    const box = req.query.box === 'sent' ? 'sent' : 'inbox';
    const where =
      box === 'sent'
        ? 'sender_id = ? AND sender_deleted = 0'
        : 'recipient_id = ? AND recipient_deleted = 0';
    const [rows] = await pool.query(
      `SELECT id, sender_id, sender_name, recipient_id, recipient_name,
              subject, body, link_url, link_label, is_read, created_at
         FROM messages
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT 200`,
      [meId]
    );
    res.json(rows.map((r) => shape(r, meId)));
  } catch (err) {
    next(err);
  }
});

// GET /api/messages/unread-count — unread inbox messages (drives the header badge).
router.get('/unread-count', requireAuth, async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS count
         FROM messages
        WHERE recipient_id = ? AND recipient_deleted = 0 AND is_read = 0`,
      [req.user.sub]
    );
    res.json({ count: Number(row.count) || 0 });
  } catch (err) {
    next(err);
  }
});

// POST /api/messages — send a message to another user.
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const recipientId = Number(req.body?.recipient_id);
    if (!Number.isInteger(recipientId) || recipientId <= 0) {
      return res.status(400).json({ error: 'recipient_id is required' });
    }
    if (recipientId === req.user.sub) {
      return res.status(400).json({ error: 'You cannot message yourself' });
    }
    const subject = String(req.body?.subject ?? '').trim().slice(0, SUBJECT_MAX);
    const body = String(req.body?.body ?? '').trim();
    if (!body) return res.status(400).json({ error: 'Message body is required' });
    if (body.length > BODY_MAX) {
      return res.status(400).json({ error: `Message is too long (max ${BODY_MAX} characters)` });
    }

    const [recipients] = await pool.query(
      'SELECT id, name FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
      [recipientId]
    );
    if (!recipients.length) return res.status(404).json({ error: 'Recipient not found' });

    const [result] = await pool.query(
      `INSERT INTO messages (sender_id, sender_name, recipient_id, recipient_name, subject, body)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.sub, req.user.name, recipientId, recipients[0].name, subject, body]
    );

    const [[row]] = await pool.query(
      `SELECT id, sender_id, sender_name, recipient_id, recipient_name,
              subject, body, link_url, link_label, is_read, created_at
         FROM messages WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json(shape(row, req.user.sub));
  } catch (err) {
    next(err);
  }
});

// POST /api/messages/:id/read — mark a received message as read (recipient only).
router.post('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
    await pool.query(
      `UPDATE messages
          SET is_read = 1, read_at = CURRENT_TIMESTAMP
        WHERE id = ? AND recipient_id = ? AND is_read = 0`,
      [id, req.user.sub]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/messages/read-all — clear the unread badge in one shot.
router.post('/read-all', requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE messages
          SET is_read = 1, read_at = CURRENT_TIMESTAMP
        WHERE recipient_id = ? AND recipient_deleted = 0 AND is_read = 0`,
      [req.user.sub]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/messages/:id — remove the message from the requester's box. Soft
// delete per side; once both sender and recipient have deleted it, drop the row.
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
    const meId = req.user.sub;

    const [[row]] = await pool.query(
      'SELECT sender_id, recipient_id, sender_deleted, recipient_deleted FROM messages WHERE id = ? LIMIT 1',
      [id]
    );
    if (!row || (row.sender_id !== meId && row.recipient_id !== meId)) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const iAmSender = row.sender_id === meId;
    const otherSideDeleted = iAmSender ? row.recipient_deleted : row.sender_deleted;

    if (otherSideDeleted) {
      await pool.query('DELETE FROM messages WHERE id = ?', [id]);
    } else {
      const col = iAmSender ? 'sender_deleted' : 'recipient_deleted';
      await pool.query(`UPDATE messages SET ${col} = 1 WHERE id = ?`, [id]);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
