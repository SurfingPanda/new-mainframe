import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pool } from '../config/db.js';

const router = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'tickets');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/heic',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip'
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const stamp = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    cb(null, `${stamp}-${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  }
});

const ALLOWED_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const ALLOWED_STATUSES = ['open', 'in_progress', 'on_hold', 'resolved', 'closed'];
const ALLOWED_REQUEST_TYPES = ['incident', 'service_request', 'question', 'change'];
const ALLOWED_CATEGORIES = [
  'Hardware',
  'Software',
  'Network & Connectivity',
  'Account & Access',
  'Email & Communication',
  'Security',
  'Printing & Peripherals',
  'Other'
];

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, description, status, priority, request_type, category,
              requester, assignee, asset_id, created_at, updated_at
         FROM tickets
        ORDER BY created_at DESC
        LIMIT 500`
    );

    if (rows.length === 0) return res.json([]);

    const ids = rows.map((r) => r.id);
    const [atts] = await pool.query(
      `SELECT id, ticket_id, original_filename, stored_filename, mime_type, size_bytes, uploaded_at
         FROM ticket_attachments
        WHERE ticket_id IN (?)
        ORDER BY uploaded_at ASC`,
      [ids]
    );
    const byTicket = new Map();
    for (const a of atts) {
      if (!byTicket.has(a.ticket_id)) byTicket.set(a.ticket_id, []);
      byTicket.get(a.ticket_id).push({
        id: a.id,
        filename: a.original_filename,
        url: `/uploads/tickets/${a.stored_filename}`,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        uploaded_at: a.uploaded_at
      });
    }
    for (const r of rows) r.attachments = byTicket.get(r.id) || [];

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  (req, res, next) => {
    upload.array('attachments', 5)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req, res, next) => {
    const cleanup = () => {
      for (const f of req.files || []) {
        fs.unlink(f.path, () => {});
      }
    };
    try {
      const {
        title,
        description,
        priority = 'normal',
        status = 'open',
        request_type = 'service_request',
        category,
        requester,
        assignee,
        asset_id
      } = req.body || {};

      if (!title || !requester) {
        cleanup();
        return res.status(400).json({ error: 'title and requester are required' });
      }
      if (!ALLOWED_PRIORITIES.includes(priority)) {
        cleanup();
        return res.status(400).json({ error: 'invalid priority' });
      }
      if (!ALLOWED_STATUSES.includes(status)) {
        cleanup();
        return res.status(400).json({ error: 'invalid status' });
      }
      if (!ALLOWED_REQUEST_TYPES.includes(request_type)) {
        cleanup();
        return res.status(400).json({ error: 'invalid request type' });
      }
      if (category && !ALLOWED_CATEGORIES.includes(category)) {
        cleanup();
        return res.status(400).json({ error: 'invalid category' });
      }

      const [result] = await pool.query(
        `INSERT INTO tickets
           (title, description, priority, status, request_type, category, requester, assignee, asset_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(title).trim().slice(0, 200),
          description ? String(description).trim() : null,
          priority,
          status,
          request_type,
          category || null,
          String(requester).trim().slice(0, 120),
          assignee ? String(assignee).trim().slice(0, 120) : null,
          asset_id ? Number(asset_id) : null
        ]
      );
      const ticketId = result.insertId;

      if (req.files && req.files.length) {
        const values = req.files.map((f) => [
          ticketId,
          f.originalname.slice(0, 255),
          path.basename(f.path),
          f.mimetype,
          f.size,
          requester
        ]);
        await pool.query(
          `INSERT INTO ticket_attachments
             (ticket_id, original_filename, stored_filename, mime_type, size_bytes, uploaded_by)
           VALUES ?`,
          [values]
        );
      }

      const [rows] = await pool.query(
        `SELECT id, title, description, status, priority, request_type, category,
                requester, assignee, asset_id, created_at, updated_at
           FROM tickets WHERE id = ?`,
        [ticketId]
      );
      const [atts] = await pool.query(
        `SELECT id, original_filename AS filename, stored_filename, mime_type, size_bytes, uploaded_at
           FROM ticket_attachments WHERE ticket_id = ?`,
        [ticketId]
      );
      const ticket = rows[0];
      ticket.attachments = atts.map((a) => ({
        id: a.id,
        filename: a.filename,
        url: `/uploads/tickets/${a.stored_filename}`,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        uploaded_at: a.uploaded_at
      }));

      res.status(201).json(ticket);
    } catch (err) {
      cleanup();
      next(err);
    }
  }
);

export { ALLOWED_CATEGORIES, ALLOWED_REQUEST_TYPES };
export default router;
