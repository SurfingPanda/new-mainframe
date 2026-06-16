import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { userWriteLimit } from '../middleware/rateLimit.js';
import { emitMailUpdate } from '../lib/socket.js';

const router = Router();

const SUBJECT_MAX = 200;
const BODY_MAX = 5000;

// Throttle outbound internal mail per user to blunt spam (placed before the
// upload so a throttled send never writes an attachment).
const sendLimiter = userWriteLimit({ max: 20 });

// --- Message attachments -----------------------------------------------------
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'messages');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp'
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      const stamp = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
      cb(null, `${stamp}-${safe}`);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    cb(null, true);
  }
});

// Wrap upload.single('file') so multer size/mime errors return JSON.
function attachmentMiddleware(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Attachment is larger than 15 MB.' });
    return res.status(400).json({ error: err.message || 'Could not process attachment.' });
  });
}

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
    // Optional single file attachment.
    attachment: row.attachment_url
      ? { url: row.attachment_url, filename: row.attachment_filename, mime: row.attachment_mime, size: row.attachment_size != null ? Number(row.attachment_size) : null }
      : null,
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
              subject, body, link_url, link_label,
              attachment_url, attachment_filename, attachment_mime, attachment_size,
              is_read, created_at
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

// POST /api/messages — send a message to another user. Accepts JSON or a
// multipart form with an optional `file` attachment.
router.post('/', requireAuth, sendLimiter, attachmentMiddleware, async (req, res, next) => {
  const cleanup = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const recipientId = Number(req.body?.recipient_id);
    if (!Number.isInteger(recipientId) || recipientId <= 0) {
      cleanup();
      return res.status(400).json({ error: 'recipient_id is required' });
    }
    if (recipientId === req.user.sub) {
      cleanup();
      return res.status(400).json({ error: 'You cannot message yourself' });
    }
    const subject = String(req.body?.subject ?? '').trim().slice(0, SUBJECT_MAX);
    const body = String(req.body?.body ?? '').trim();
    // A message needs either text or an attachment.
    if (!body && !req.file) { cleanup(); return res.status(400).json({ error: 'Message body is required' }); }
    if (body.length > BODY_MAX) {
      cleanup();
      return res.status(400).json({ error: `Message is too long (max ${BODY_MAX} characters)` });
    }

    const [recipients] = await pool.query(
      'SELECT id, name FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
      [recipientId]
    );
    if (!recipients.length) { cleanup(); return res.status(404).json({ error: 'Recipient not found' }); }

    const att = req.file
      ? { url: `/uploads/messages/${req.file.filename}`, name: req.file.originalname, mime: req.file.mimetype, size: req.file.size }
      : { url: null, name: null, mime: null, size: null };

    const [result] = await pool.query(
      `INSERT INTO messages (sender_id, sender_name, recipient_id, recipient_name, subject, body,
                             attachment_url, attachment_filename, attachment_mime, attachment_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.sub, req.user.name, recipientId, recipients[0].name, subject, body, att.url, att.name, att.mime, att.size]
    );

    const [[row]] = await pool.query(
      `SELECT id, sender_id, sender_name, recipient_id, recipient_name,
              subject, body, link_url, link_label,
              attachment_url, attachment_filename, attachment_mime, attachment_size,
              is_read, created_at
         FROM messages WHERE id = ?`,
      [result.insertId]
    );
    emitMailUpdate(recipientId); // real-time nudge for the recipient's inbox badge
    res.status(201).json(shape(row, req.user.sub));
  } catch (err) {
    cleanup();
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
      'SELECT sender_id, recipient_id, sender_deleted, recipient_deleted, attachment_url FROM messages WHERE id = ? LIMIT 1',
      [id]
    );
    if (!row || (row.sender_id !== meId && row.recipient_id !== meId)) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const iAmSender = row.sender_id === meId;
    const otherSideDeleted = iAmSender ? row.recipient_deleted : row.sender_deleted;

    if (otherSideDeleted) {
      await pool.query('DELETE FROM messages WHERE id = ?', [id]);
      if (row.attachment_url) fs.unlink(path.join(UPLOAD_DIR, path.basename(row.attachment_url)), () => {});
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
