import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pool } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

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

router.get('/', requireAuth, requirePermission('tickets', 'view'), async (req, res, next) => {
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

router.get('/:id', requireAuth, requirePermission('tickets', 'view'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'invalid ticket id' });
    }

    const [rows] = await pool.query(
      `SELECT id, title, description, status, priority, request_type, category,
              requester, assignee, asset_id, created_at, updated_at
         FROM tickets WHERE id = ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ticket not found' });

    const ticket = rows[0];

    const [atts] = await pool.query(
      `SELECT id, original_filename, stored_filename, mime_type, size_bytes, uploaded_by, uploaded_at
         FROM ticket_attachments
        WHERE ticket_id = ?
        ORDER BY uploaded_at ASC`,
      [id]
    );
    ticket.attachments = atts.map((a) => ({
      id: a.id,
      filename: a.original_filename,
      url: `/uploads/tickets/${a.stored_filename}`,
      mime_type: a.mime_type,
      size_bytes: a.size_bytes,
      uploaded_by: a.uploaded_by,
      uploaded_at: a.uploaded_at
    }));

    if (ticket.asset_id) {
      const [assetRows] = await pool.query(
        `SELECT id, asset_tag, type, model, serial_no, assignee, location, status
           FROM assets WHERE id = ?`,
        [ticket.asset_id]
      );
      ticket.asset = assetRows[0] || null;
    } else {
      ticket.asset = null;
    }

    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

const EDITABLE_FIELDS = {
  title: { max: 200 },
  description: { max: 4000 },
  status: { enum: ALLOWED_STATUSES },
  priority: { enum: ALLOWED_PRIORITIES },
  request_type: { enum: ALLOWED_REQUEST_TYPES },
  category: { enum: ALLOWED_CATEGORIES, nullable: true },
  requester: { max: 120 },
  assignee: { max: 120, nullable: true },
  asset_id: { numeric: true, nullable: true }
};

router.patch('/:id', requireAuth, requirePermission('tickets', 'create'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'invalid ticket id' });
    }

    const [existingRows] = await pool.query(
      `SELECT id, title, description, status, priority, request_type, category,
              requester, assignee, asset_id
         FROM tickets WHERE id = ?`,
      [id]
    );
    if (!existingRows.length) return res.status(404).json({ error: 'Ticket not found' });
    const before = existingRows[0];

    const updates = [];
    const values = [];
    const changes = []; // { field, oldValue, newValue }

    for (const [field, rules] of Object.entries(EDITABLE_FIELDS)) {
      if (!(field in (req.body || {}))) continue;
      let raw = req.body[field];
      let next;

      if (raw === null || raw === '') {
        if (!rules.nullable) {
          if (field === 'title' || field === 'requester') {
            return res.status(400).json({ error: `${field} cannot be empty` });
          }
        }
        next = null;
      } else if (rules.numeric) {
        const n = Number(raw);
        if (!Number.isInteger(n) || n <= 0) {
          return res.status(400).json({ error: `invalid ${field}` });
        }
        next = n;
      } else {
        next = String(raw).trim();
        if (rules.max) next = next.slice(0, rules.max);
        if (rules.enum && !rules.enum.includes(next)) {
          return res.status(400).json({ error: `invalid ${field}` });
        }
      }

      const prev = before[field] == null ? null : before[field];
      const same = (prev ?? null) === (next ?? null);
      if (same) continue;

      updates.push(`${field} = ?`);
      values.push(next);
      changes.push({ field, oldValue: prev, newValue: next });
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'no fields to update' });
    }

    values.push(id);
    await pool.query(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, values);

    const actor = req.user?.name || req.user?.email || 'system';
    if (changes.length) {
      const rows = changes.map((c) => [
        id,
        'change',
        actor,
        c.field,
        c.oldValue == null ? null : String(c.oldValue).slice(0, 500),
        c.newValue == null ? null : String(c.newValue).slice(0, 500),
        null
      ]);
      await pool.query(
        `INSERT INTO ticket_activity (ticket_id, type, actor, field, old_value, new_value, body)
         VALUES ?`,
        [rows]
      );
    }

    const [updatedRows] = await pool.query(
      `SELECT id, title, description, status, priority, request_type, category,
              requester, assignee, asset_id, created_at, updated_at
         FROM tickets WHERE id = ?`,
      [id]
    );
    res.json(updatedRows[0]);
  } catch (err) {
    next(err);
  }
});

async function loadActivity(ticketId) {
  const [rows] = await pool.query(
    `SELECT a.id, a.type, a.actor, a.field, a.old_value, a.new_value, a.body,
            a.attachment_id, a.created_at,
            att.original_filename AS att_filename,
            att.stored_filename   AS att_stored,
            att.mime_type         AS att_mime,
            att.size_bytes        AS att_size
       FROM ticket_activity a
       LEFT JOIN ticket_attachments att ON att.id = a.attachment_id
      WHERE a.ticket_id = ?
      ORDER BY a.created_at DESC, a.id DESC`,
    [ticketId]
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    actor: r.actor,
    field: r.field,
    old_value: r.old_value,
    new_value: r.new_value,
    body: r.body,
    created_at: r.created_at,
    attachment: r.attachment_id
      ? {
          id: r.attachment_id,
          filename: r.att_filename,
          url: `/uploads/tickets/${r.att_stored}`,
          mime_type: r.att_mime,
          size_bytes: r.att_size
        }
      : null
  }));
}

router.get('/:id/activity', requireAuth, requirePermission('tickets', 'view'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'invalid ticket id' });
    }

    const rows = await loadActivity(id);

    // Synthesize a "created" entry for tickets that pre-date the activity log.
    const hasCreated = rows.some((r) => r.type === 'change' && r.field === 'created');
    if (!hasCreated) {
      const [tRows] = await pool.query(
        `SELECT title, requester, created_at FROM tickets WHERE id = ? LIMIT 1`,
        [id]
      );
      if (tRows.length) {
        rows.push({
          id: -id,
          type: 'change',
          actor: tRows[0].requester,
          field: 'created',
          old_value: null,
          new_value: tRows[0].title,
          body: null,
          created_at: tRows[0].created_at,
          attachment: null,
          synthetic: true
        });
      }
    }

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/activity',
  requireAuth,
  requirePermission('tickets', 'create'),
  (req, res, next) => {
    upload.single('attachment')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req, res, next) => {
    const cleanupFile = () => {
      if (req.file) fs.unlink(req.file.path, () => {});
    };
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        cleanupFile();
        return res.status(400).json({ error: 'invalid ticket id' });
      }
      const body = String(req.body?.body || '').trim();
      if (!body && !req.file) {
        return res.status(400).json({ error: 'note body or attachment is required' });
      }

      const [exists] = await pool.query('SELECT id FROM tickets WHERE id = ? LIMIT 1', [id]);
      if (!exists.length) {
        cleanupFile();
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const actor = req.user?.name || req.user?.email || 'system';

      let attachmentId = null;
      if (req.file) {
        const [insAtt] = await pool.query(
          `INSERT INTO ticket_attachments
             (ticket_id, original_filename, stored_filename, mime_type, size_bytes, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            id,
            req.file.originalname.slice(0, 255),
            path.basename(req.file.path),
            req.file.mimetype,
            req.file.size,
            actor
          ]
        );
        attachmentId = insAtt.insertId;
      }

      const [result] = await pool.query(
        `INSERT INTO ticket_activity (ticket_id, type, actor, body, attachment_id)
         VALUES (?, 'note', ?, ?, ?)`,
        [id, actor, body ? body.slice(0, 4000) : null, attachmentId]
      );

      const [rows] = await pool.query(
        `SELECT a.id, a.type, a.actor, a.field, a.old_value, a.new_value, a.body,
                a.attachment_id, a.created_at,
                att.original_filename AS att_filename,
                att.stored_filename   AS att_stored,
                att.mime_type         AS att_mime,
                att.size_bytes        AS att_size
           FROM ticket_activity a
           LEFT JOIN ticket_attachments att ON att.id = a.attachment_id
          WHERE a.id = ?`,
        [result.insertId]
      );
      const r = rows[0];
      res.status(201).json({
        id: r.id,
        type: r.type,
        actor: r.actor,
        field: r.field,
        old_value: r.old_value,
        new_value: r.new_value,
        body: r.body,
        created_at: r.created_at,
        attachment: r.attachment_id
          ? {
              id: r.attachment_id,
              filename: r.att_filename,
              url: `/uploads/tickets/${r.att_stored}`,
              mime_type: r.att_mime,
              size_bytes: r.att_size
            }
          : null
      });
    } catch (err) {
      cleanupFile();
      next(err);
    }
  }
);

router.delete(
  '/:id/attachments/:attachmentId',
  requireAuth,
  requirePermission('tickets', 'create'),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const attachmentId = Number(req.params.attachmentId);
      if (!Number.isInteger(id) || id <= 0 ||
          !Number.isInteger(attachmentId) || attachmentId <= 0) {
        return res.status(400).json({ error: 'invalid ids' });
      }

      const [rows] = await pool.query(
        `SELECT id, ticket_id, original_filename, stored_filename
           FROM ticket_attachments
          WHERE id = ? AND ticket_id = ?
          LIMIT 1`,
        [attachmentId, id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Attachment not found' });
      const att = rows[0];

      // Detach activity references first so the audit log keeps its rows.
      await pool.query(
        `UPDATE ticket_activity SET attachment_id = NULL WHERE attachment_id = ?`,
        [attachmentId]
      );
      await pool.query('DELETE FROM ticket_attachments WHERE id = ?', [attachmentId]);

      // Best-effort file removal — schema row is the source of truth.
      const filePath = path.join(UPLOAD_DIR, path.basename(att.stored_filename));
      fs.unlink(filePath, () => {});

      const actor = req.user?.name || req.user?.email || 'system';
      await pool.query(
        `INSERT INTO ticket_activity (ticket_id, type, actor, field, old_value)
         VALUES (?, 'change', ?, 'attachment_removed', ?)`,
        [id, actor, String(att.original_filename).slice(0, 500)]
      );

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id/kb', requireAuth, requirePermission('tickets', 'view'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'invalid ticket id' });
    }
    const [rows] = await pool.query(
      `SELECT k.id, k.title, k.slug, k.category, k.published,
              l.linked_by, l.created_at AS linked_at
         FROM ticket_kb_links l
         JOIN kb_articles k ON k.id = l.article_id
        WHERE l.ticket_id = ?
        ORDER BY l.created_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/kb', requireAuth, requirePermission('tickets', 'create'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'invalid ticket id' });
    }
    const articleId = Number(req.body?.article_id);
    if (!Number.isInteger(articleId) || articleId <= 0) {
      return res.status(400).json({ error: 'article_id is required' });
    }

    const [tExists] = await pool.query('SELECT id FROM tickets WHERE id = ? LIMIT 1', [id]);
    if (!tExists.length) return res.status(404).json({ error: 'Ticket not found' });

    const [aRows] = await pool.query(
      'SELECT id, title, slug, category, published FROM kb_articles WHERE id = ? LIMIT 1',
      [articleId]
    );
    if (!aRows.length) return res.status(404).json({ error: 'Article not found' });
    const article = aRows[0];

    const actor = req.user?.name || req.user?.email || 'system';
    try {
      await pool.query(
        `INSERT INTO ticket_kb_links (ticket_id, article_id, linked_by) VALUES (?, ?, ?)`,
        [id, articleId, actor]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Article is already linked to this ticket' });
      }
      throw err;
    }

    await pool.query(
      `INSERT INTO ticket_activity (ticket_id, type, actor, field, new_value)
       VALUES (?, 'change', ?, 'kb_link', ?)`,
      [id, actor, article.title.slice(0, 500)]
    );

    res.status(201).json({
      id: article.id,
      title: article.title,
      slug: article.slug,
      category: article.category,
      published: article.published,
      linked_by: actor,
      linked_at: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/kb/:articleId', requireAuth, requirePermission('tickets', 'create'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const articleId = Number(req.params.articleId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(articleId) || articleId <= 0) {
      return res.status(400).json({ error: 'invalid ids' });
    }

    const [aRows] = await pool.query(
      'SELECT title FROM kb_articles WHERE id = ? LIMIT 1',
      [articleId]
    );
    const articleTitle = aRows[0]?.title || `Article #${articleId}`;

    const [r] = await pool.query(
      'DELETE FROM ticket_kb_links WHERE ticket_id = ? AND article_id = ?',
      [id, articleId]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Link not found' });

    const actor = req.user?.name || req.user?.email || 'system';
    await pool.query(
      `INSERT INTO ticket_activity (ticket_id, type, actor, field, old_value)
       VALUES (?, 'change', ?, 'kb_unlink', ?)`,
      [id, actor, String(articleTitle).slice(0, 500)]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireAuth,
  requirePermission('tickets', 'create'),
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

      await pool.query(
        `INSERT INTO ticket_activity (ticket_id, type, actor, field, new_value)
         VALUES (?, 'change', ?, 'created', ?)`,
        [
          ticketId,
          String(requester).trim().slice(0, 120),
          String(title).trim().slice(0, 500)
        ]
      );

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
