import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const MAX_BODY = 2000;
const PAGE_LIMIT = 100;
const POLL_LIMIT = 50;
const GENERAL_ROOM = 'general';
const MAX_GROUP_MEMBERS = 30;

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'chat');
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

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      const stamp = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
      cb(null, `${stamp}-${safe}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  }
});

// Wrap upload.single so multer's errors come back as JSON instead of the
// generic 500 handler. File-size / mime errors should tell the user what's up.
function attachmentMiddleware(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Attachment is larger than 10 MB.' });
    }
    return res.status(400).json({ error: err.message || 'Could not process attachment.' });
  });
}

// Room key conventions:
//   - 'general'           — the global channel
//   - 'dm:<lo>:<hi>'      — direct message, canonical sorted ids
//   - 'g:<id>'            — group chat, backed by chat_rooms / chat_room_members
function dmKey(a, b) {
  const x = Number(a);
  const y = Number(b);
  const [lo, hi] = x < y ? [x, y] : [y, x];
  return `dm:${lo}:${hi}`;
}

function parseDm(room) {
  const m = /^dm:(\d+):(\d+)$/.exec(room || '');
  return m ? { a: Number(m[1]), b: Number(m[2]) } : null;
}

function parseGroup(room) {
  const m = /^g:(\d+)$/.exec(room || '');
  return m ? { id: Number(m[1]) } : null;
}

function isValidRoom(room) {
  if (room === GENERAL_ROOM) return true;
  return parseDm(room) != null || parseGroup(room) != null;
}

// Async — group membership needs a DB lookup.
async function userCanAccessRoom(userId, room) {
  if (room === GENERAL_ROOM) return true;
  const dm = parseDm(room);
  if (dm) return dm.a === userId || dm.b === userId;
  const group = parseGroup(room);
  if (group) {
    const [[row]] = await pool.query(
      'SELECT 1 AS ok FROM chat_room_members WHERE room_id = ? AND user_id = ? LIMIT 1',
      [group.id, userId]
    );
    return !!row;
  }
  return false;
}

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || name || 'Member';
}

function defaultGroupName(members, meId) {
  const others = members.filter((m) => m.id !== meId);
  if (others.length === 0) return 'Group';
  const head = others.slice(0, 3).map((m) => firstName(m.name)).join(', ');
  return others.length > 3 ? `${head} +${others.length - 3}` : head;
}

router.get('/rooms', requireAuth, async (req, res, next) => {
  try {
    const me = Number(req.user.sub);

    // Last message in the general channel
    const [genRows] = await pool.query(
      `SELECT body, user_name, created_at, is_unsent FROM chat_messages
        WHERE room_key = ?
        ORDER BY id DESC LIMIT 1`,
      [GENERAL_ROOM]
    );
    const general = {
      key: GENERAL_ROOM,
      kind: 'channel',
      label: 'Team Chat',
      sub: 'Everyone in the org',
      last: genRows[0] || null
    };

    // DM rooms involving me
    const [dmRoomRows] = await pool.query(
      `SELECT room_key, MAX(id) AS last_id, MAX(created_at) AS last_at
         FROM chat_messages
        WHERE room_key LIKE 'dm:%'
        GROUP BY room_key
        ORDER BY last_at DESC
        LIMIT 200`
    );
    const myDms = [];
    for (const r of dmRoomRows) {
      const dm = parseDm(r.room_key);
      if (!dm) continue;
      if (dm.a !== me && dm.b !== me) continue;
      myDms.push({ key: r.room_key, last_id: r.last_id, last_at: r.last_at, otherId: dm.a === me ? dm.b : dm.a });
    }

    // Group rooms I belong to
    const [myGroupRows] = await pool.query(
      `SELECT r.id, r.name, r.created_by, r.created_at
         FROM chat_rooms r
         JOIN chat_room_members m ON m.room_id = r.id
        WHERE r.kind = 'group' AND m.user_id = ?
        ORDER BY r.created_at DESC`,
      [me]
    );
    const groupIds = myGroupRows.map((g) => g.id);
    const groupKeys = groupIds.map((id) => `g:${id}`);

    // Members for those groups
    let membersByGroup = new Map();
    if (groupIds.length) {
      const [memberRows] = await pool.query(
        `SELECT m.room_id, u.id, u.name, u.email, u.role, u.department, u.last_seen_at
           FROM chat_room_members m
           JOIN users u ON u.id = m.user_id
          WHERE m.room_id IN (?)
          ORDER BY u.name ASC`,
        [groupIds]
      );
      for (const r of memberRows) {
        if (!membersByGroup.has(r.room_id)) membersByGroup.set(r.room_id, []);
        membersByGroup.get(r.room_id).push({
          id: r.id,
          name: r.name,
          email: r.email,
          role: r.role,
          department: r.department,
          last_seen_at: r.last_seen_at
        });
      }
    }

    // Other-user info for DMs
    let userById = new Map();
    if (myDms.length) {
      const otherIds = [...new Set(myDms.map((d) => d.otherId))];
      const [userRows] = await pool.query(
        'SELECT id, name, email, role, department, last_seen_at FROM users WHERE id IN (?)',
        [otherIds]
      );
      userById = new Map(userRows.map((u) => [u.id, u]));
    }

    // Last message per room (DMs + groups in one batch)
    const allRoomKeys = [...myDms.map((d) => d.key), ...groupKeys];
    let lastByKey = new Map();
    if (allRoomKeys.length) {
      const [maxRows] = await pool.query(
        `SELECT room_key, MAX(id) AS max_id FROM chat_messages WHERE room_key IN (?) GROUP BY room_key`,
        [allRoomKeys]
      );
      if (maxRows.length) {
        const ids = maxRows.map((r) => r.max_id);
        const [lastRows] = await pool.query(
          `SELECT id, room_key, body, user_name, created_at, is_unsent FROM chat_messages WHERE id IN (?)`,
          [ids]
        );
        lastByKey = new Map(lastRows.map((l) => [l.room_key, l]));
      }
    }

    const dmsOut = myDms.map((d) => ({
      key: d.key,
      kind: 'dm',
      other: userById.get(d.otherId) || { id: d.otherId, name: 'Unknown', email: '', role: null, department: null },
      last: lastByKey.get(d.key) || null
    }));

    const groupsOut = myGroupRows.map((g) => {
      const members = membersByGroup.get(g.id) || [];
      return {
        key: `g:${g.id}`,
        kind: 'group',
        id: g.id,
        name: g.name || defaultGroupName(members, me),
        members,
        member_count: members.length,
        created_by: g.created_by,
        last: lastByKey.get(`g:${g.id}`) || null
      };
    });

    // Interleave DMs + groups by last activity
    const combined = [...dmsOut, ...groupsOut].sort((a, b) => {
      const ta = a.last?.created_at ? new Date(a.last.created_at).getTime() : 0;
      const tb = b.last?.created_at ? new Date(b.last.created_at).getTime() : 0;
      return tb - ta;
    });

    res.json([general, ...combined]);
  } catch (err) {
    next(err);
  }
});

// Create a group chat. Body: { name?, member_ids: [id, id, ...] }
// Caller is auto-added as a member; need at least 2 OTHER members to make
// it distinct from a DM.
router.post('/groups', requireAuth, async (req, res, next) => {
  const me = Number(req.user.sub);
  const name = req.body?.name ? String(req.body.name).trim().slice(0, 120) : null;
  const memberIds = Array.isArray(req.body?.member_ids)
    ? [...new Set(req.body.member_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n !== me))]
    : [];

  if (memberIds.length < 2) {
    return res.status(400).json({ error: 'Select at least 2 people to create a group' });
  }
  if (memberIds.length + 1 > MAX_GROUP_MEMBERS) {
    return res.status(400).json({ error: `Maximum ${MAX_GROUP_MEMBERS} members per group` });
  }

  const [users] = await pool.query(
    'SELECT id, name, email, role, department FROM users WHERE id IN (?) AND is_active = 1',
    [memberIds]
  );
  if (users.length !== memberIds.length) {
    return res.status(400).json({ error: 'One or more members are invalid or inactive' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO chat_rooms (kind, name, created_by) VALUES (?, ?, ?)',
      ['group', name, me]
    );
    const roomId = result.insertId;

    const allMemberIds = [me, ...memberIds];
    const values = allMemberIds.map((uid) => [roomId, uid]);
    await conn.query('INSERT INTO chat_room_members (room_id, user_id) VALUES ?', [values]);

    await conn.commit();

    const [memberRows] = await pool.query(
      'SELECT id, name, email, role, department FROM users WHERE id IN (?) ORDER BY name ASC',
      [allMemberIds]
    );

    res.status(201).json({
      key: `g:${roomId}`,
      kind: 'group',
      id: roomId,
      name: name || defaultGroupName(memberRows, me),
      members: memberRows,
      member_count: memberRows.length,
      created_by: me,
      last: null
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

router.post('/groups/:id/leave', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[room]] = await pool.query(
      `SELECT id FROM chat_rooms WHERE id = ? AND kind = 'group' LIMIT 1`,
      [id]
    );
    if (!room) return res.status(404).json({ error: 'Group not found' });

    const [result] = await pool.query(
      'DELETE FROM chat_room_members WHERE room_id = ? AND user_id = ?',
      [id, req.user.sub]
    );
    if (result.affectedRows === 0) {
      return res.status(400).json({ error: 'You are not a member of this group' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/messages', requireAuth, async (req, res, next) => {
  try {
    const room = String(req.query.room || GENERAL_ROOM);
    if (!isValidRoom(room)) return res.status(400).json({ error: 'invalid room' });
    if (!(await userCanAccessRoom(req.user.sub, room))) {
      return res.status(403).json({ error: 'not in room' });
    }

    const COLS = `id, room_key, user_id, user_name, user_role, user_department, body,
                  attachment_url, attachment_filename, attachment_mime, attachment_size,
                  is_unsent, unsent_at, created_at`;

    const since = Math.max(0, Number(req.query.since) || 0);
    if (since > 0) {
      // New messages since the last poll plus any older messages that were
      // unsent in the last minute, so the other end's UI catches the change.
      const [newRows] = await pool.query(
        `SELECT ${COLS} FROM chat_messages
          WHERE room_key = ? AND id > ?
          ORDER BY id ASC
          LIMIT ${POLL_LIMIT}`,
        [room, since]
      );
      const [unsentRows] = await pool.query(
        `SELECT ${COLS} FROM chat_messages
          WHERE room_key = ? AND id <= ? AND is_unsent = 1
                AND unsent_at IS NOT NULL
                AND unsent_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)
          ORDER BY id ASC
          LIMIT ${POLL_LIMIT}`,
        [room, since]
      );
      return res.json([...unsentRows, ...newRows]);
    }
    const [rows] = await pool.query(
      `SELECT ${COLS} FROM chat_messages
        WHERE room_key = ?
        ORDER BY id DESC
        LIMIT ${PAGE_LIMIT}`,
      [room]
    );
    res.json(rows.reverse());
  } catch (err) {
    next(err);
  }
});

router.post('/messages', requireAuth, attachmentMiddleware, async (req, res, next) => {
  try {
    const body = String(req.body?.body || '').trim();
    const room = String(req.body?.room || GENERAL_ROOM);
    const file = req.file;

    if (!body && !file) {
      return res.status(400).json({ error: 'message body or attachment is required' });
    }
    if (body.length > MAX_BODY) {
      // Clean up the upload before returning the error.
      if (file) fs.unlink(file.path, () => {});
      return res.status(400).json({ error: `message too long (max ${MAX_BODY})` });
    }
    if (!isValidRoom(room)) {
      if (file) fs.unlink(file.path, () => {});
      return res.status(400).json({ error: 'invalid room' });
    }
    if (!(await userCanAccessRoom(req.user.sub, room))) {
      if (file) fs.unlink(file.path, () => {});
      return res.status(403).json({ error: 'not in room' });
    }

    // For DMs, verify the other party still exists & is active.
    const dm = parseDm(room);
    if (dm) {
      const otherId = dm.a === req.user.sub ? dm.b : dm.a;
      const [[other]] = await pool.query(
        'SELECT id FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
        [otherId]
      );
      if (!other) {
        if (file) fs.unlink(file.path, () => {});
        return res.status(400).json({ error: 'recipient not found' });
      }
    }

    const [[meRow]] = await pool.query(
      'SELECT name, role, department FROM users WHERE id = ? LIMIT 1',
      [req.user.sub]
    );

    const attachmentUrl = file ? `/uploads/chat/${file.filename}` : null;
    const attachmentFilename = file ? file.originalname : null;
    const attachmentMime = file ? file.mimetype : null;
    const attachmentSize = file ? file.size : null;

    const [result] = await pool.query(
      `INSERT INTO chat_messages (room_key, user_id, user_name, user_role, user_department, body,
                                  attachment_url, attachment_filename, attachment_mime, attachment_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        room,
        req.user.sub,
        meRow?.name || req.user.name || req.user.email,
        meRow?.role || req.user.role || null,
        meRow?.department || null,
        body,
        attachmentUrl,
        attachmentFilename,
        attachmentMime,
        attachmentSize
      ]
    );

    const [rows] = await pool.query(
      `SELECT id, room_key, user_id, user_name, user_role, user_department, body,
              attachment_url, attachment_filename, attachment_mime, attachment_size,
              is_unsent, unsent_at, created_at
         FROM chat_messages WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
});

// "Unsend" — soft-deletes the message so the row stays in place as a
// placeholder ("You unsent a message"). Body + attachment metadata get
// wiped, and the file on disk is removed too.
router.delete('/messages/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[msg]] = await pool.query(
      'SELECT user_id, attachment_url, is_unsent FROM chat_messages WHERE id = ? LIMIT 1',
      [id]
    );
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.is_unsent) return res.json({ ok: true });

    const isOwn = msg.user_id === req.user.sub;
    const isAdmin = req.user.role === 'admin';
    if (!isOwn && !isAdmin) {
      return res.status(403).json({ error: 'Cannot delete this message' });
    }

    await pool.query(
      `UPDATE chat_messages
          SET is_unsent = 1,
              unsent_at = CURRENT_TIMESTAMP,
              body = '',
              attachment_url = NULL,
              attachment_filename = NULL,
              attachment_mime = NULL,
              attachment_size = NULL
        WHERE id = ?`,
      [id]
    );

    // Remove the file from disk too. Resolve explicitly against UPLOAD_DIR so a
    // tampered DB value can't escape it.
    if (msg.attachment_url) {
      const filename = path.basename(msg.attachment_url);
      const filePath = path.join(UPLOAD_DIR, filename);
      if (path.dirname(filePath) === UPLOAD_DIR) {
        fs.unlink(filePath, () => {});
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
