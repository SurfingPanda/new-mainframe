import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pool } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { hasPermission } from '../lib/permissions.js';
import { saveAvatar, removeAvatarFile, InvalidImageError } from '../lib/avatar-upload.js';

const router = Router();

// --- Document uploads (Documents tab) ----------------------------------------
const DOC_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'spaces');
fs.mkdirSync(DOC_UPLOAD_DIR, { recursive: true });

const DOC_ALLOWED_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
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

const docUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DOC_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      const stamp = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
      cb(null, `${stamp}-${safe}`);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!DOC_ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  }
});

// Wrap upload.single so multer size/mime errors come back as JSON.
function docUploadMiddleware(req, res, next) {
  docUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File is larger than 25 MB.' });
    }
    return res.status(400).json({ error: err.message || 'Could not process upload.' });
  });
}

// --- Space icon uploads ------------------------------------------------------
// Reuse the avatar pipeline (sharp-validated square WebP under /uploads/avatars).
const iconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|gif|webp|heic|heif|avif)$/.test(file.mimetype)) {
      return cb(new Error('Icon must be a PNG, JPEG, GIF, WebP, HEIC, or AVIF image.'));
    }
    cb(null, true);
  }
});

function iconUploadMiddleware(req, res, next) {
  iconUpload.single('icon')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Icon is larger than 5 MB.' });
    }
    return res.status(400).json({ error: err.message || 'Could not process the image.' });
  });
}

const TYPES = ['epic', 'task', 'subtask'];
const STATUSES = ['todo', 'in_progress', 'done'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const NAME_MAX = 120;
const TITLE_MAX = 255;
const DESC_MAX = 20000;

const STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
const TYPE_LABEL = { epic: 'Epic', task: 'Task', subtask: 'Subtask' };
const PRIORITY_LABEL = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

// Append change entries to an item's history. `changes` is an array of
// { field, old, new }; falsy entries are skipped.
async function recordHistory(itemId, spaceId, actor, changes) {
  const rows = changes.filter(Boolean);
  if (!rows.length) return;
  const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params = [];
  for (const c of rows) params.push(itemId, spaceId, actor.sub, actor.name, c.field, c.old ?? null, c.new ?? null);
  await pool.query(
    `INSERT INTO space_item_history (item_id, space_id, actor_id, actor_name, field, old_value, new_value)
     VALUES ${placeholders}`,
    params
  );
}

async function itemKeyOf(itemId) {
  if (!itemId) return null;
  const [[row]] = await pool.query('SELECT item_key FROM space_items WHERE id = ? LIMIT 1', [itemId]);
  return row?.item_key || null;
}

function shapeHistory(row) {
  return {
    id: row.id,
    actor_id: row.actor_id,
    actor_name: row.actor_name,
    actor_avatar: row.actor_avatar ?? null,
    field: row.field,
    old_value: row.old_value,
    new_value: row.new_value,
    created_at: row.created_at
  };
}

// All routes require the spaces module. Per-space access is then checked per
// request: a user must be a member, unless they hold spaces.manage (admin
// oversight = see/administer every space).
router.use(requireAuth, requirePermission('spaces', 'view'));

const canManageAll = (user) => hasPermission(user, 'spaces', 'manage');

// Derive a short uppercase key from the space name (e.g. "My Kanban Space" -> "MKS"),
// then ensure it is unique by appending a numeric suffix within the 10-char column.
async function generateSpaceKey(conn, name) {
  const words = String(name).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  let base = words.map((w) => w[0]).join('').slice(0, 4);
  if (!base) base = 'SP';
  let key = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [rows] = await conn.query('SELECT id FROM spaces WHERE space_key = ? LIMIT 1', [key]);
    if (!rows.length) return key;
    n += 1;
    const suffix = String(n);
    key = base.slice(0, Math.max(1, 10 - suffix.length)) + suffix;
  }
}

function shapeSpace(row) {
  return {
    id: row.id,
    space_key: row.space_key,
    name: row.name,
    description: row.description,
    icon_url: row.icon_url ?? null,
    owner_id: row.owner_id,
    owner_name: row.owner_name,
    is_archived: !!row.is_archived,
    member_count: row.member_count != null ? Number(row.member_count) : undefined,
    item_count: row.item_count != null ? Number(row.item_count) : undefined,
    // Per-request viewer context (set by the list query): is the caller a member,
    // and the status of any join request they've made.
    my_role: row.my_role ?? null,
    is_member: row.my_role != null,
    join_status: row.my_request_status ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function shapeMember(row) {
  return {
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    avatar_url: row.avatar_url,
    user_role: row.user_role,
    department: row.department,
    role: row.role,
    added_at: row.added_at
  };
}

function shapeItem(row) {
  return {
    id: row.id,
    space_id: row.space_id,
    item_key: row.item_key,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    priority: row.priority,
    assignee_id: row.assignee_id,
    assignee_name: row.assignee_name,
    reporter_id: row.reporter_id,
    reporter_name: row.reporter_name,
    parent_id: row.parent_id,
    position: row.position,
    sla_days: row.sla_days,
    due_at: dateOnly(row.due_at),
    start_date: dateOnly(row.start_date),
    labels: parseLabels(row.labels),
    team: row.team,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function shapeComment(row) {
  return {
    id: row.id,
    item_id: row.item_id,
    author_id: row.author_id,
    author_name: row.author_name,
    author_avatar: row.author_avatar ?? null,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// Normalize a DATE value to a 'YYYY-MM-DD' string using local calendar parts.
// mysql2 returns DATE as a local-midnight Date; serializing it to ISO/UTC would
// shift the day, so we format from the local components instead.
function dateOnly(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Labels are stored as a comma-separated string; the API speaks arrays.
function parseLabels(raw) {
  if (!raw) return [];
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}
function serializeLabels(value) {
  let list = [];
  if (Array.isArray(value)) list = value;
  else if (typeof value === 'string') list = value.split(',');
  list = list.map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
  const joined = [...new Set(list)].join(',').slice(0, 255);
  return joined || null;
}

// Loads the space and the requester's membership. Returns null when the space
// doesn't exist or the user may not see it (members + spaces.manage only).
async function loadAccess(spaceId, user) {
  const [[space]] = await pool.query('SELECT * FROM spaces WHERE id = ? LIMIT 1', [spaceId]);
  if (!space) return null;
  const [[membership]] = await pool.query(
    'SELECT role FROM space_members WHERE space_id = ? AND user_id = ? LIMIT 1',
    [spaceId, user.sub]
  );
  if (!membership && !canManageAll(user)) return null;
  return { space, membership: membership || null };
}

// Write/admin actions (rename, archive, delete, membership) require the space
// owner role or admin oversight.
const canAdminister = (access, user) => access.membership?.role === 'owner' || canManageAll(user);

const intId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const SLA_MAX_DAYS = 3650;

// Parse an optional SLA (days-to-complete) value from a request body.
// Returns { ok, value } where value is an integer 1..SLA_MAX_DAYS, or null to clear.
function parseSlaDays(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > SLA_MAX_DAYS) return { ok: false };
  return { ok: true, value: n };
}

// Derive a due date (YYYY-MM-DD) from a base date + SLA days.
function dueDateFrom(baseDate, slaDays) {
  if (slaDays == null) return null;
  const d = new Date(baseDate);
  d.setDate(d.getDate() + Number(slaDays));
  return d.toISOString().slice(0, 10);
}

// Parse an optional YYYY-MM-DD date. Returns { ok, value } where value is the
// normalized string or null to clear; { ok:false } on a malformed value.
function parseDate(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  const s = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) return { ok: false };
  return { ok: true, value: s };
}

// GET /api/spaces — every (non-archived) space is discoverable. Each row is
// tagged with the caller's membership role and any join-request status so the
// client can show "Open" vs "Request to join". Space contents stay member-only.
router.get('/', async (req, res, next) => {
  try {
    const meId = req.user.sub;
    const [rows] = await pool.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM space_members m WHERE m.space_id = s.id) AS member_count,
              (SELECT COUNT(*) FROM space_items i WHERE i.space_id = s.id) AS item_count,
              (SELECT role FROM space_members m WHERE m.space_id = s.id AND m.user_id = ?) AS my_role,
              (SELECT status FROM space_join_requests r WHERE r.space_id = s.id AND r.user_id = ?) AS my_request_status
         FROM spaces s
        WHERE s.is_archived = 0
        ORDER BY s.updated_at DESC
        LIMIT 500`,
      [meId, meId]
    );
    res.json(rows.map(shapeSpace));
  } catch (err) {
    next(err);
  }
});

// POST /api/spaces — create a space. The creator becomes its owner + member.
router.post('/', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (name.length > NAME_MAX) return res.status(400).json({ error: `Name must be ${NAME_MAX} characters or fewer` });
    const description = String(req.body?.description ?? '').trim().slice(0, DESC_MAX) || null;

    await conn.beginTransaction();
    const spaceKey = await generateSpaceKey(conn, name);
    const [result] = await conn.query(
      `INSERT INTO spaces (space_key, name, description, owner_id, owner_name)
       VALUES (?, ?, ?, ?, ?)`,
      [spaceKey, name, description, req.user.sub, req.user.name]
    );
    await conn.query(
      `INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, 'owner')`,
      [result.insertId, req.user.sub]
    );
    await conn.commit();

    const [[space]] = await pool.query('SELECT * FROM spaces WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json(shapeSpace({ ...space, member_count: 1, item_count: 0 }));
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// GET /api/spaces/:id — space detail + members.
router.get('/:id', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid space id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });

    const [members] = await pool.query(
      `SELECT m.user_id, m.role, m.added_at,
              u.name, u.email, u.avatar_url, u.role AS user_role, u.department
         FROM space_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.space_id = ?
        ORDER BY (m.role = 'owner') DESC, u.name ASC`,
      [id]
    );
    const admin = canAdminister(access, req.user);
    let pendingJoinRequests = 0;
    if (admin) {
      const [[{ pending }]] = await pool.query(
        `SELECT COUNT(*) AS pending FROM space_join_requests WHERE space_id = ? AND status = 'pending'`,
        [id]
      );
      pendingJoinRequests = Number(pending) || 0;
    }
    res.json({
      ...shapeSpace(access.space),
      my_role: access.membership?.role || null,
      can_administer: admin,
      pending_join_requests: pendingJoinRequests,
      members: members.map(shapeMember)
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/spaces/:id — rename / description / archive (owner or manage).
router.patch('/:id', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid space id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!canAdminister(access, req.user)) return res.status(403).json({ error: 'Only the space owner can edit this space' });

    const sets = [];
    const params = [];
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'Name is required' });
      if (name.length > NAME_MAX) return res.status(400).json({ error: `Name must be ${NAME_MAX} characters or fewer` });
      sets.push('name = ?'); params.push(name);
    }
    if (req.body?.description !== undefined) {
      const description = String(req.body.description ?? '').trim().slice(0, DESC_MAX) || null;
      sets.push('description = ?'); params.push(description);
    }
    if (req.body?.is_archived !== undefined) {
      sets.push('is_archived = ?'); params.push(req.body.is_archived ? 1 : 0);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(id);
    await pool.query(`UPDATE spaces SET ${sets.join(', ')} WHERE id = ?`, params);
    const [[space]] = await pool.query('SELECT * FROM spaces WHERE id = ? LIMIT 1', [id]);
    res.json(shapeSpace(space));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/spaces/:id — delete the space (members + items cascade).
router.delete('/:id', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid space id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!canAdminister(access, req.user)) return res.status(403).json({ error: 'Only the space owner can delete this space' });

    await pool.query('DELETE FROM spaces WHERE id = ?', [id]);
    removeAvatarFile(access.space.icon_url); // best-effort icon cleanup
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/spaces/:id/icon — upload/replace the space profile icon (owner or manage).
router.post('/:id/icon', iconUploadMiddleware, async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid space id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!canAdminister(access, req.user)) return res.status(403).json({ error: 'Only the space owner can edit this space' });
    if (!req.file) return res.status(400).json({ error: 'An image is required' });

    let iconUrl;
    try {
      iconUrl = await saveAvatar(req.file.buffer);
    } catch (err) {
      if (err instanceof InvalidImageError) return res.status(400).json({ error: err.message });
      throw err;
    }
    await pool.query('UPDATE spaces SET icon_url = ? WHERE id = ?', [iconUrl, id]);
    removeAvatarFile(access.space.icon_url); // drop the previous file
    const [[space]] = await pool.query('SELECT * FROM spaces WHERE id = ? LIMIT 1', [id]);
    res.json(shapeSpace(space));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/spaces/:id/icon — remove the space profile icon (owner or manage).
router.delete('/:id/icon', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid space id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!canAdminister(access, req.user)) return res.status(403).json({ error: 'Only the space owner can edit this space' });

    await pool.query('UPDATE spaces SET icon_url = NULL WHERE id = ?', [id]);
    removeAvatarFile(access.space.icon_url);
    const [[space]] = await pool.query('SELECT * FROM spaces WHERE id = ? LIMIT 1', [id]);
    res.json(shapeSpace(space));
  } catch (err) {
    next(err);
  }
});

// POST /api/spaces/:id/members — add a member (owner or manage).
router.post('/:id/members', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid space id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!canAdminister(access, req.user)) return res.status(403).json({ error: 'Only the space owner can manage members' });

    const userId = intId(req.body?.user_id);
    if (!userId) return res.status(400).json({ error: 'A valid user is required' });
    const role = req.body?.role === 'owner' ? 'owner' : 'member';

    const [[u]] = await pool.query('SELECT id, is_active FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!u || !u.is_active) return res.status(400).json({ error: 'User not found or inactive' });

    await pool.query(
      `INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role)`,
      [id, userId, role]
    );

    const [[member]] = await pool.query(
      `SELECT m.user_id, m.role, m.added_at, u.name, u.email, u.avatar_url, u.role AS user_role, u.department
         FROM space_members m JOIN users u ON u.id = m.user_id
        WHERE m.space_id = ? AND m.user_id = ? LIMIT 1`,
      [id, userId]
    );
    res.status(201).json(shapeMember(member));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/spaces/:id/members/:userId — remove a member (owner or manage).
router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const userId = intId(req.params.userId);
    if (!id || !userId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!canAdminister(access, req.user)) return res.status(403).json({ error: 'Only the space owner can manage members' });

    const [[target]] = await pool.query(
      'SELECT role FROM space_members WHERE space_id = ? AND user_id = ? LIMIT 1',
      [id, userId]
    );
    if (!target) return res.status(404).json({ error: 'Member not found' });
    if (target.role === 'owner') {
      const [[{ owners }]] = await pool.query(
        `SELECT COUNT(*) AS owners FROM space_members WHERE space_id = ? AND role = 'owner'`,
        [id]
      );
      if (owners <= 1) return res.status(400).json({ error: 'A space must keep at least one owner' });
    }

    await pool.query('DELETE FROM space_members WHERE space_id = ? AND user_id = ?', [id, userId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/spaces/:id/join — a non-member requests to join the space. Any user
// with spaces.view can request (the space is discoverable); contents stay locked
// until an owner/admin approves.
router.post('/:id/join', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid space id' });
    const [[space]] = await pool.query('SELECT id, is_archived FROM spaces WHERE id = ? LIMIT 1', [id]);
    if (!space || space.is_archived) return res.status(404).json({ error: 'Space not found' });

    const [[member]] = await pool.query(
      'SELECT 1 AS yes FROM space_members WHERE space_id = ? AND user_id = ? LIMIT 1',
      [id, req.user.sub]
    );
    if (member) return res.status(400).json({ error: 'You are already a member of this space' });

    const message = String(req.body?.message ?? '').trim().slice(0, 500) || null;
    await pool.query(
      `INSERT INTO space_join_requests (space_id, user_id, user_name, status, message)
       VALUES (?, ?, ?, 'pending', ?)
       ON DUPLICATE KEY UPDATE status = 'pending', message = VALUES(message),
                               reviewed_by = NULL, reviewed_at = NULL, updated_at = CURRENT_TIMESTAMP`,
      [id, req.user.sub, req.user.name, message]
    );
    res.status(201).json({ ok: true, status: 'pending' });
  } catch (err) {
    next(err);
  }
});

// GET /api/spaces/:id/join-requests — pending requests for the space (owner/admin).
router.get('/:id/join-requests', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid space id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!canAdminister(access, req.user)) return res.status(403).json({ error: 'Only the space owner can review join requests' });

    const [rows] = await pool.query(
      `SELECT r.id, r.user_id, r.message, r.created_at,
              u.name, u.email, u.avatar_url, u.department
         FROM space_join_requests r
         JOIN users u ON u.id = r.user_id
        WHERE r.space_id = ? AND r.status = 'pending'
        ORDER BY r.created_at ASC`,
      [id]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      email: r.email,
      avatar_url: r.avatar_url,
      department: r.department,
      message: r.message,
      created_at: r.created_at
    })));
  } catch (err) {
    next(err);
  }
});

// POST /api/spaces/:id/join-requests/:reqId/(approve|deny) — owner/admin decision.
async function decideJoinRequest(req, res, next, decision) {
  try {
    const id = intId(req.params.id);
    const reqId = intId(req.params.reqId);
    if (!id || !reqId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!canAdminister(access, req.user)) return res.status(403).json({ error: 'Only the space owner can review join requests' });

    const [[jr]] = await pool.query(
      `SELECT user_id FROM space_join_requests WHERE id = ? AND space_id = ? AND status = 'pending' LIMIT 1`,
      [reqId, id]
    );
    if (!jr) return res.status(404).json({ error: 'Request not found' });

    if (decision === 'approved') {
      await pool.query(
        `INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, 'member')
         ON DUPLICATE KEY UPDATE role = role`,
        [id, jr.user_id]
      );
    }
    await pool.query(
      `UPDATE space_join_requests SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [decision, req.user.sub, reqId]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
router.post('/:id/join-requests/:reqId/approve', (req, res, next) => decideJoinRequest(req, res, next, 'approved'));
router.post('/:id/join-requests/:reqId/deny', (req, res, next) => decideJoinRequest(req, res, next, 'denied'));

// GET /api/spaces/:id/items — all work items (optional filters).
router.get('/:id/items', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid space id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });

    const where = ['space_id = ?'];
    const params = [id];
    if (STATUSES.includes(req.query.status)) { where.push('status = ?'); params.push(req.query.status); }
    if (TYPES.includes(req.query.type)) { where.push('type = ?'); params.push(req.query.type); }
    const assignee = intId(req.query.assignee);
    if (assignee) { where.push('assignee_id = ?'); params.push(assignee); }

    const [rows] = await pool.query(
      `SELECT * FROM space_items WHERE ${where.join(' AND ')}
        ORDER BY position ASC, id ASC LIMIT 2000`,
      params
    );
    res.json(rows.map(shapeItem));
  } catch (err) {
    next(err);
  }
});

// Resolve an assignee id to a name, requiring the user be a member of the space.
async function resolveAssignee(spaceId, assigneeId) {
  if (assigneeId === null) return { id: null, name: null };
  const [[row]] = await pool.query(
    `SELECT u.id, u.name FROM space_members m JOIN users u ON u.id = m.user_id
      WHERE m.space_id = ? AND m.user_id = ? LIMIT 1`,
    [spaceId, assigneeId]
  );
  return row ? { id: row.id, name: row.name } : null;
}

// True when itemId belongs to spaceId.
async function itemInSpace(spaceId, itemId) {
  if (!itemId) return false;
  const [[row]] = await pool.query('SELECT id FROM space_items WHERE id = ? AND space_id = ? LIMIT 1', [itemId, spaceId]);
  return !!row;
}

// POST /api/spaces/:id/items — create a work item (any member).
router.post('/:id/items', async (req, res, next) => {
  const conn = await pool.getConnection();
  let started = false;
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid space id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!access.membership && !canManageAll(req.user)) {
      return res.status(403).json({ error: 'Only members can add items' });
    }

    const title = String(req.body?.title ?? '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (title.length > TITLE_MAX) return res.status(400).json({ error: `Title must be ${TITLE_MAX} characters or fewer` });
    const type = TYPES.includes(req.body?.type) ? req.body.type : 'task';
    const status = STATUSES.includes(req.body?.status) ? req.body.status : 'todo';
    const priority = PRIORITIES.includes(req.body?.priority) ? req.body.priority : 'normal';
    const description = String(req.body?.description ?? '').trim().slice(0, DESC_MAX) || null;

    let assignee = { id: null, name: null };
    if (req.body?.assignee_id != null && req.body.assignee_id !== '') {
      const resolved = await resolveAssignee(id, intId(req.body.assignee_id));
      if (!resolved) return res.status(400).json({ error: 'Assignee must be a member of this space' });
      assignee = resolved;
    }

    const sla = parseSlaDays(req.body?.sla_days);
    if (!sla.ok) return res.status(400).json({ error: `SLA must be a whole number of days between 1 and ${SLA_MAX_DAYS}` });
    const dueAt = dueDateFrom(new Date(), sla.value);

    let parentId = null;
    if (req.body?.parent_id != null && req.body.parent_id !== '') {
      parentId = intId(req.body.parent_id);
      if (!(await itemInSpace(id, parentId))) return res.status(400).json({ error: 'Parent must be an item in this space' });
    }
    const start = parseDate(req.body?.start_date);
    if (!start.ok) return res.status(400).json({ error: 'Invalid start date' });
    const labels = serializeLabels(req.body?.labels);
    const team = String(req.body?.team ?? '').trim().slice(0, 120) || null;

    await conn.beginTransaction();
    started = true;
    const [[space]] = await conn.query('SELECT space_key, item_seq FROM spaces WHERE id = ? FOR UPDATE', [id]);
    const seq = Number(space.item_seq) + 1;
    const itemKey = `${space.space_key}-${seq}`;
    await conn.query('UPDATE spaces SET item_seq = ? WHERE id = ?', [seq, id]);
    const completedAt = status === 'done' ? new Date() : null;
    const [result] = await conn.query(
      `INSERT INTO space_items
         (space_id, item_key, title, description, type, status, priority,
          assignee_id, assignee_name, reporter_id, reporter_name, position,
          sla_days, due_at, start_date, labels, team, parent_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, itemKey, title, description, type, status, priority,
       assignee.id, assignee.name, req.user.sub, req.user.name, seq,
       sla.value, dueAt, start.value, labels, team, parentId, completedAt]
    );
    await conn.commit();

    await recordHistory(result.insertId, id, req.user, [{ field: 'created', old: null, new: null }]);
    const [[item]] = await pool.query('SELECT * FROM space_items WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json(shapeItem(item));
  } catch (err) {
    if (started) await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// PATCH /api/spaces/:id/items/:itemId — edit / move / reassign / reorder.
router.patch('/:id/items/:itemId', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const itemId = intId(req.params.itemId);
    if (!id || !itemId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!access.membership && !canManageAll(req.user)) {
      return res.status(403).json({ error: 'Only members can edit items' });
    }

    const [[item]] = await pool.query('SELECT * FROM space_items WHERE id = ? AND space_id = ? LIMIT 1', [itemId, id]);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const sets = [];
    const params = [];
    const changes = []; // history entries
    const b = req.body || {};
    if (b.title !== undefined) {
      const title = String(b.title).trim();
      if (!title) return res.status(400).json({ error: 'Title is required' });
      if (title.length > TITLE_MAX) return res.status(400).json({ error: `Title must be ${TITLE_MAX} characters or fewer` });
      sets.push('title = ?'); params.push(title);
      if (title !== item.title) changes.push({ field: 'title', old: (item.title || '').slice(0, 255), new: title.slice(0, 255) });
    }
    if (b.description !== undefined) {
      const desc = String(b.description ?? '').trim().slice(0, DESC_MAX) || null;
      sets.push('description = ?'); params.push(desc);
      if (desc !== item.description) changes.push({ field: 'description', old: null, new: null });
    }
    if (b.type !== undefined) {
      if (!TYPES.includes(b.type)) return res.status(400).json({ error: 'Invalid type' });
      sets.push('type = ?'); params.push(b.type);
      if (b.type !== item.type) changes.push({ field: 'type', old: TYPE_LABEL[item.type], new: TYPE_LABEL[b.type] });
    }
    if (b.priority !== undefined) {
      if (!PRIORITIES.includes(b.priority)) return res.status(400).json({ error: 'Invalid priority' });
      sets.push('priority = ?'); params.push(b.priority);
      if (b.priority !== item.priority) changes.push({ field: 'priority', old: PRIORITY_LABEL[item.priority], new: PRIORITY_LABEL[b.priority] });
    }
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
      sets.push('status = ?'); params.push(b.status);
      if (b.status !== item.status) changes.push({ field: 'status', old: STATUS_LABEL[item.status], new: STATUS_LABEL[b.status] });
      // Keep completed_at in sync with the done state.
      if (b.status === 'done' && item.status !== 'done') {
        sets.push('completed_at = CURRENT_TIMESTAMP');
      } else if (b.status !== 'done' && item.status === 'done') {
        sets.push('completed_at = NULL');
      }
    }
    if (b.position !== undefined) {
      const pos = Number(b.position);
      if (!Number.isInteger(pos)) return res.status(400).json({ error: 'Invalid position' });
      sets.push('position = ?'); params.push(pos);
    }
    if (b.sla_days !== undefined) {
      const sla = parseSlaDays(b.sla_days);
      if (!sla.ok) return res.status(400).json({ error: `SLA must be a whole number of days between 1 and ${SLA_MAX_DAYS}` });
      // Due date is measured from the item's creation date so it stays stable.
      const dueAt = dueDateFrom(item.created_at, sla.value);
      sets.push('sla_days = ?', 'due_at = ?'); params.push(sla.value, dueAt);
      if ((sla.value ?? null) !== (item.sla_days ?? null)) {
        changes.push({ field: 'sla', old: item.sla_days != null ? `${item.sla_days} days` : 'None', new: sla.value != null ? `${sla.value} days` : 'None' });
      }
    }
    if (b.assignee_id !== undefined) {
      if (b.assignee_id === null || b.assignee_id === '') {
        sets.push('assignee_id = NULL', 'assignee_name = NULL');
        if (item.assignee_id) changes.push({ field: 'assignee', old: item.assignee_name || 'Unassigned', new: 'Unassigned' });
      } else {
        const resolved = await resolveAssignee(id, intId(b.assignee_id));
        if (!resolved) return res.status(400).json({ error: 'Assignee must be a member of this space' });
        sets.push('assignee_id = ?', 'assignee_name = ?'); params.push(resolved.id, resolved.name);
        if (resolved.id !== item.assignee_id) changes.push({ field: 'assignee', old: item.assignee_name || 'Unassigned', new: resolved.name });
      }
    }
    if (b.start_date !== undefined) {
      const start = parseDate(b.start_date);
      if (!start.ok) return res.status(400).json({ error: 'Invalid start date' });
      sets.push('start_date = ?'); params.push(start.value);
      const oldStart = dateOnly(item.start_date);
      if ((start.value ?? null) !== (oldStart ?? null)) changes.push({ field: 'start_date', old: oldStart || 'None', new: start.value || 'None' });
    }
    if (b.labels !== undefined) {
      const newLabels = serializeLabels(b.labels);
      sets.push('labels = ?'); params.push(newLabels);
      if ((newLabels ?? null) !== (item.labels ?? null)) {
        changes.push({ field: 'labels', old: parseLabels(item.labels).join(', ') || 'None', new: parseLabels(newLabels).join(', ') || 'None' });
      }
    }
    if (b.team !== undefined) {
      const team = String(b.team ?? '').trim().slice(0, 120) || null;
      sets.push('team = ?'); params.push(team);
      if ((team ?? null) !== (item.team ?? null)) changes.push({ field: 'team', old: item.team || 'None', new: team || 'None' });
    }
    if (b.parent_id !== undefined) {
      let newParentId = null;
      if (b.parent_id === null || b.parent_id === '') {
        sets.push('parent_id = NULL');
      } else {
        newParentId = intId(b.parent_id);
        if (newParentId === itemId) return res.status(400).json({ error: 'An item cannot be its own parent' });
        if (!(await itemInSpace(id, newParentId))) return res.status(400).json({ error: 'Parent must be an item in this space' });
        sets.push('parent_id = ?'); params.push(newParentId);
      }
      if ((newParentId ?? null) !== (item.parent_id ?? null)) {
        changes.push({ field: 'parent', old: (await itemKeyOf(item.parent_id)) || 'None', new: (await itemKeyOf(newParentId)) || 'None' });
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(itemId);
    await pool.query(`UPDATE space_items SET ${sets.join(', ')} WHERE id = ?`, params);
    await recordHistory(itemId, id, req.user, changes);
    const [[updated]] = await pool.query('SELECT * FROM space_items WHERE id = ? LIMIT 1', [itemId]);
    res.json(shapeItem(updated));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/spaces/:id/items/:itemId — delete a work item (any member).
router.delete('/:id/items/:itemId', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const itemId = intId(req.params.itemId);
    if (!id || !itemId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!access.membership && !canManageAll(req.user)) {
      return res.status(403).json({ error: 'Only members can delete items' });
    }

    const [result] = await pool.query('DELETE FROM space_items WHERE id = ? AND space_id = ?', [itemId, id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Item not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Load an item row within a space (or null).
async function loadItem(spaceId, itemId) {
  const [[row]] = await pool.query('SELECT * FROM space_items WHERE id = ? AND space_id = ? LIMIT 1', [itemId, spaceId]);
  return row || null;
}

// GET /api/spaces/:id/items/:itemId — full detail: the item plus its parent,
// subtasks, linked items, and comments (for the detail modal).
router.get('/:id/items/:itemId', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const itemId = intId(req.params.itemId);
    if (!id || !itemId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });

    const item = await loadItem(id, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const [parent] = item.parent_id
      ? (await pool.query('SELECT * FROM space_items WHERE id = ? LIMIT 1', [item.parent_id]))[0]
      : [null];

    const [subtasks] = await pool.query(
      'SELECT * FROM space_items WHERE parent_id = ? ORDER BY position ASC, id ASC', [itemId]
    );

    const [links] = await pool.query(
      `SELECT l.id AS link_id, si.*
         FROM space_item_links l
         JOIN space_items si ON si.id = CASE WHEN l.item_id = ? THEN l.linked_item_id ELSE l.item_id END
        WHERE l.item_id = ? OR l.linked_item_id = ?
        ORDER BY l.id DESC`,
      [itemId, itemId, itemId]
    );

    const [comments] = await pool.query(
      `SELECT c.*, u.avatar_url AS author_avatar
         FROM space_item_comments c
         LEFT JOIN users u ON u.id = c.author_id
        WHERE c.item_id = ? ORDER BY c.created_at ASC`,
      [itemId]
    );

    const [history] = await pool.query(
      `SELECT h.*, u.avatar_url AS actor_avatar
         FROM space_item_history h
         LEFT JOIN users u ON u.id = h.actor_id
        WHERE h.item_id = ? ORDER BY h.created_at DESC, h.id DESC`,
      [itemId]
    );

    res.json({
      item: shapeItem(item),
      parent: parent ? shapeItem(parent) : null,
      subtasks: subtasks.map(shapeItem),
      links: links.map((r) => ({ link_id: r.link_id, item: shapeItem(r) })),
      comments: comments.map(shapeComment),
      history: history.map(shapeHistory)
    });
  } catch (err) {
    next(err);
  }
});

/* ---- Comments ---- */

// POST /api/spaces/:id/items/:itemId/comments — add a comment (any member).
router.post('/:id/items/:itemId/comments', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const itemId = intId(req.params.itemId);
    if (!id || !itemId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!access.membership && !canManageAll(req.user)) return res.status(403).json({ error: 'Only members can comment' });
    if (!(await itemInSpace(id, itemId))) return res.status(404).json({ error: 'Item not found' });

    const body = String(req.body?.body ?? '').trim().slice(0, DESC_MAX);
    if (!body) return res.status(400).json({ error: 'Comment cannot be empty' });

    const [result] = await pool.query(
      `INSERT INTO space_item_comments (item_id, space_id, author_id, author_name, body)
       VALUES (?, ?, ?, ?, ?)`,
      [itemId, id, req.user.sub, req.user.name, body]
    );
    const [[row]] = await pool.query(
      `SELECT c.*, u.avatar_url AS author_avatar FROM space_item_comments c
         LEFT JOIN users u ON u.id = c.author_id WHERE c.id = ? LIMIT 1`,
      [result.insertId]
    );
    res.status(201).json(shapeComment(row));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/spaces/:id/items/:itemId/comments/:commentId — author or space owner/admin.
router.delete('/:id/items/:itemId/comments/:commentId', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const itemId = intId(req.params.itemId);
    const commentId = intId(req.params.commentId);
    if (!id || !itemId || !commentId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });

    const [[comment]] = await pool.query(
      'SELECT author_id FROM space_item_comments WHERE id = ? AND item_id = ? AND space_id = ? LIMIT 1',
      [commentId, itemId, id]
    );
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.author_id !== req.user.sub && !canAdminister(access, req.user)) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    await pool.query('DELETE FROM space_item_comments WHERE id = ?', [commentId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---- Linked work items ---- */

// POST /api/spaces/:id/items/:itemId/links — link to another item in the space.
router.post('/:id/items/:itemId/links', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const itemId = intId(req.params.itemId);
    if (!id || !itemId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!access.membership && !canManageAll(req.user)) return res.status(403).json({ error: 'Only members can link items' });
    if (!(await itemInSpace(id, itemId))) return res.status(404).json({ error: 'Item not found' });

    const linkedId = intId(req.body?.linked_item_id);
    if (!linkedId) return res.status(400).json({ error: 'A linked item is required' });
    if (linkedId === itemId) return res.status(400).json({ error: 'An item cannot be linked to itself' });
    if (!(await itemInSpace(id, linkedId))) return res.status(400).json({ error: 'Linked item must be in this space' });

    const [[existing]] = await pool.query(
      `SELECT id FROM space_item_links
        WHERE (item_id = ? AND linked_item_id = ?) OR (item_id = ? AND linked_item_id = ?) LIMIT 1`,
      [itemId, linkedId, linkedId, itemId]
    );
    if (existing) return res.status(409).json({ error: 'These items are already linked' });

    await pool.query(
      'INSERT INTO space_item_links (space_id, item_id, linked_item_id) VALUES (?, ?, ?)',
      [id, itemId, linkedId]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/spaces/:id/items/:itemId/links/:linkedItemId — unlink (either direction).
router.delete('/:id/items/:itemId/links/:linkedItemId', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const itemId = intId(req.params.itemId);
    const linkedId = intId(req.params.linkedItemId);
    if (!id || !itemId || !linkedId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!access.membership && !canManageAll(req.user)) return res.status(403).json({ error: 'Only members can unlink items' });

    await pool.query(
      `DELETE FROM space_item_links
        WHERE space_id = ? AND ((item_id = ? AND linked_item_id = ?) OR (item_id = ? AND linked_item_id = ?))`,
      [id, itemId, linkedId, linkedId, itemId]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---- Documents ---- */

const DOC_TITLE_MAX = 200;

function shapeDoc(row, withBody = true) {
  const out = {
    id: row.id,
    space_id: row.space_id,
    title: row.title,
    file_path: row.file_path ?? null,
    file_name: row.file_name ?? null,
    mime: row.mime ?? null,
    size: row.size != null ? Number(row.size) : null,
    author_id: row.author_id,
    author_name: row.author_name,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
  if (withBody) out.body = row.body;
  return out;
}

// GET /api/spaces/:id/docs — list (no body).
router.get('/:id/docs', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid space id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    const [rows] = await pool.query(
      'SELECT id, space_id, title, file_path, file_name, mime, size, author_id, author_name, created_at, updated_at FROM space_docs WHERE space_id = ? ORDER BY updated_at DESC',
      [id]
    );
    res.json(rows.map((r) => shapeDoc(r, false)));
  } catch (err) {
    next(err);
  }
});

// GET /api/spaces/:id/docs/:docId — full document.
router.get('/:id/docs/:docId', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const docId = intId(req.params.docId);
    if (!id || !docId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    const [[doc]] = await pool.query('SELECT * FROM space_docs WHERE id = ? AND space_id = ? LIMIT 1', [docId, id]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(shapeDoc(doc));
  } catch (err) {
    next(err);
  }
});

// POST /api/spaces/:id/docs — upload a document file (any member).
// Multipart form: `file` (required) + optional `title` (defaults to filename).
router.post('/:id/docs', docUploadMiddleware, async (req, res, next) => {
  const cleanup = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const id = intId(req.params.id);
    if (!id) { cleanup(); return res.status(400).json({ error: 'invalid space id' }); }
    const access = await loadAccess(id, req.user);
    if (!access) { cleanup(); return res.status(404).json({ error: 'Space not found' }); }
    if (!access.membership && !canManageAll(req.user)) { cleanup(); return res.status(403).json({ error: 'Only members can add documents' }); }
    if (!req.file) return res.status(400).json({ error: 'A file is required' });

    const title = (String(req.body?.title ?? '').trim() || req.file.originalname).slice(0, DOC_TITLE_MAX);
    const filePath = `/uploads/spaces/${req.file.filename}`;

    const [result] = await pool.query(
      'INSERT INTO space_docs (space_id, title, file_path, file_name, mime, size, author_id, author_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, filePath, req.file.originalname, req.file.mimetype, req.file.size, req.user.sub, req.user.name]
    );
    const [[doc]] = await pool.query('SELECT * FROM space_docs WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json(shapeDoc(doc));
  } catch (err) {
    cleanup();
    next(err);
  }
});

// PATCH /api/spaces/:id/docs/:docId — edit (any member).
router.patch('/:id/docs/:docId', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const docId = intId(req.params.docId);
    if (!id || !docId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!access.membership && !canManageAll(req.user)) return res.status(403).json({ error: 'Only members can edit documents' });

    const [[doc]] = await pool.query('SELECT id FROM space_docs WHERE id = ? AND space_id = ? LIMIT 1', [docId, id]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const sets = [];
    const params = [];
    if (req.body?.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ error: 'Title is required' });
      if (title.length > DOC_TITLE_MAX) return res.status(400).json({ error: `Title must be ${DOC_TITLE_MAX} characters or fewer` });
      sets.push('title = ?'); params.push(title);
    }
    if (req.body?.body !== undefined) { sets.push('body = ?'); params.push(String(req.body.body ?? '')); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(docId);
    await pool.query(`UPDATE space_docs SET ${sets.join(', ')} WHERE id = ?`, params);
    const [[updated]] = await pool.query('SELECT * FROM space_docs WHERE id = ? LIMIT 1', [docId]);
    res.json(shapeDoc(updated));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/spaces/:id/docs/:docId — author or space owner/admin.
router.delete('/:id/docs/:docId', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const docId = intId(req.params.docId);
    if (!id || !docId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    const [[doc]] = await pool.query('SELECT author_id, file_path FROM space_docs WHERE id = ? AND space_id = ? LIMIT 1', [docId, id]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.author_id !== req.user.sub && !canAdminister(access, req.user)) {
      return res.status(403).json({ error: 'You can only delete your own documents' });
    }
    await pool.query('DELETE FROM space_docs WHERE id = ?', [docId]);
    // Remove the backing file from disk (basename-guarded to the docs dir).
    if (doc.file_path) {
      const abs = path.join(DOC_UPLOAD_DIR, path.basename(doc.file_path));
      fs.unlink(abs, () => {});
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---- Goals ---- */

const GOAL_STATUSES = ['on_track', 'at_risk', 'off_track', 'done'];

function shapeGoal(row) {
  return {
    id: row.id,
    space_id: row.space_id,
    title: row.title,
    description: row.description,
    status: row.status,
    progress: row.progress,
    target_date: dateOnly(row.target_date),
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function parseProgress(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: 0 };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) return { ok: false };
  return { ok: true, value: n };
}

// GET /api/spaces/:id/goals — list goals.
router.get('/:id/goals', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid space id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    const [rows] = await pool.query('SELECT * FROM space_goals WHERE space_id = ? ORDER BY created_at DESC', [id]);
    res.json(rows.map(shapeGoal));
  } catch (err) {
    next(err);
  }
});

// POST /api/spaces/:id/goals — create (any member).
router.post('/:id/goals', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid space id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!access.membership && !canManageAll(req.user)) return res.status(403).json({ error: 'Only members can add goals' });

    const title = String(req.body?.title ?? '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (title.length > 200) return res.status(400).json({ error: 'Title must be 200 characters or fewer' });
    const description = String(req.body?.description ?? '').trim().slice(0, DESC_MAX) || null;
    const status = GOAL_STATUSES.includes(req.body?.status) ? req.body.status : 'on_track';
    const prog = parseProgress(req.body?.progress);
    if (!prog.ok) return res.status(400).json({ error: 'Progress must be 0–100' });
    const target = parseDate(req.body?.target_date);
    if (!target.ok) return res.status(400).json({ error: 'Invalid target date' });

    const [result] = await pool.query(
      'INSERT INTO space_goals (space_id, title, description, status, progress, target_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, title, description, status, prog.value, target.value, req.user.name]
    );
    const [[goal]] = await pool.query('SELECT * FROM space_goals WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json(shapeGoal(goal));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/spaces/:id/goals/:goalId — edit (any member).
router.patch('/:id/goals/:goalId', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const goalId = intId(req.params.goalId);
    if (!id || !goalId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!access.membership && !canManageAll(req.user)) return res.status(403).json({ error: 'Only members can edit goals' });

    const [[goal]] = await pool.query('SELECT id FROM space_goals WHERE id = ? AND space_id = ? LIMIT 1', [goalId, id]);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const sets = [];
    const params = [];
    const b = req.body || {};
    if (b.title !== undefined) {
      const title = String(b.title).trim();
      if (!title) return res.status(400).json({ error: 'Title is required' });
      sets.push('title = ?'); params.push(title.slice(0, 200));
    }
    if (b.description !== undefined) { sets.push('description = ?'); params.push(String(b.description ?? '').trim().slice(0, DESC_MAX) || null); }
    if (b.status !== undefined) {
      if (!GOAL_STATUSES.includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
      sets.push('status = ?'); params.push(b.status);
    }
    if (b.progress !== undefined) {
      const prog = parseProgress(b.progress);
      if (!prog.ok) return res.status(400).json({ error: 'Progress must be 0–100' });
      sets.push('progress = ?'); params.push(prog.value);
    }
    if (b.target_date !== undefined) {
      const target = parseDate(b.target_date);
      if (!target.ok) return res.status(400).json({ error: 'Invalid target date' });
      sets.push('target_date = ?'); params.push(target.value);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(goalId);
    await pool.query(`UPDATE space_goals SET ${sets.join(', ')} WHERE id = ?`, params);
    const [[updated]] = await pool.query('SELECT * FROM space_goals WHERE id = ? LIMIT 1', [goalId]);
    res.json(shapeGoal(updated));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/spaces/:id/goals/:goalId — any member.
router.delete('/:id/goals/:goalId', async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    const goalId = intId(req.params.goalId);
    if (!id || !goalId) return res.status(400).json({ error: 'invalid id' });
    const access = await loadAccess(id, req.user);
    if (!access) return res.status(404).json({ error: 'Space not found' });
    if (!access.membership && !canManageAll(req.user)) return res.status(403).json({ error: 'Only members can delete goals' });
    const [result] = await pool.query('DELETE FROM space_goals WHERE id = ? AND space_id = ?', [goalId, id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Goal not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
