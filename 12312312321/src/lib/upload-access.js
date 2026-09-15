import { pool } from '../config/db.js';
import { hasPermission } from './permissions.js';
import { managesDepartment } from './department-managers.js';

const HR_CONCERNS = 'HR Concerns';

// Per-resource authorization for static `/uploads`. Being signed in isn't enough:
// a file is only viewable by someone who can see its parent ticket / chat room /
// mailbox thread / space. We map the request path back to the owning row and
// re-apply that resource's existing visibility rules. Default-deny: unknown
// categories or orphaned files are refused.
//
// Files live under category subdirs and the owning rows store the same
// `/uploads/<category>/<file>` path (except ticket_attachments, keyed by the
// bare stored_filename), so we look up by that path.

const GENERAL_ROOM = 'general';

function identities(user) {
  return [user?.name, user?.email].filter(Boolean).map((v) => String(v).trim().toLowerCase());
}

// Mirrors chat.js userCanAccessRoom, but derived from the room_key string so we
// don't have to import the route module.
async function canAccessRoom(user, roomKey) {
  if (!roomKey) return false;
  if (roomKey === GENERAL_ROOM) return true;
  const dm = /^dm:(\d+):(\d+)$/.exec(roomKey);
  if (dm) return user.sub === Number(dm[1]) || user.sub === Number(dm[2]);
  const grp = /^g:(\d+)$/.exec(roomKey);
  if (grp) {
    const [[row]] = await pool.query(
      'SELECT 1 AS ok FROM chat_room_members WHERE room_id = ? AND user_id = ? LIMIT 1',
      [Number(grp[1]), user.sub]
    );
    return !!row;
  }
  return false;
}

export async function canAccessUpload(user, fullPath) {
  if (!user) return false;
  const parts = fullPath.split('/').filter(Boolean); // ['uploads', '<category>', '<file>...']
  if (parts[0] !== 'uploads' || parts.length < 3) return false;
  const category = parts[1];

  // Avatars are surfaced app-wide (header, directory, chat, pickers) and
  // e-signatures are rendered onto shared documents (e.g. work-order printouts),
  // so any signed-in user may load them.
  if (category === 'avatars' || category === 'signatures') return true;

  if (category === 'chat') {
    const [[m]] = await pool.query(
      'SELECT room_key FROM chat_messages WHERE attachment_url = ? LIMIT 1',
      [fullPath]
    );
    return m ? canAccessRoom(user, m.room_key) : false;
  }

  if (category === 'messages') {
    const [[m]] = await pool.query(
      'SELECT sender_id, recipient_id FROM messages WHERE attachment_url = ? LIMIT 1',
      [fullPath]
    );
    return m ? m.sender_id === user.sub || m.recipient_id === user.sub : false;
  }

  if (category === 'spaces') {
    // Either a Documents-tab file (space_docs.file_path) or a comment attachment.
    const [[row]] = await pool.query(
      `SELECT space_id FROM space_docs WHERE file_path = ?
       UNION
       SELECT space_id FROM space_item_comments WHERE attachment_url = ?
       LIMIT 1`,
      [fullPath, fullPath]
    );
    if (!row) return false;
    if (hasPermission(user, 'spaces', 'manage')) return true; // oversight of every space
    const [[mem]] = await pool.query(
      'SELECT 1 AS ok FROM space_members WHERE space_id = ? AND user_id = ? LIMIT 1',
      [row.space_id, user.sub]
    );
    return !!mem;
  }

  if (category === 'tickets') {
    const stored = parts.slice(2).join('/'); // ticket_attachments keys by bare filename
    const [[att]] = await pool.query(
      'SELECT ticket_id FROM ticket_attachments WHERE stored_filename = ? LIMIT 1',
      [stored]
    );
    if (!att) return false;
    const [[t]] = await pool.query(
      'SELECT requester, assignee, department, category, approval_dept FROM tickets WHERE id = ? LIMIT 1',
      [att.ticket_id]
    );
    if (!t) return false;
    // Mirrors tickets.js canViewTicket: staff, or requester/assignee, or same dept.
    if (user.role === 'admin' || user.role === 'agent') return true;
    const ids = identities(user);
    if (t.requester && ids.includes(String(t.requester).trim().toLowerCase())) return true;
    if (t.assignee && ids.includes(String(t.assignee).trim().toLowerCase())) return true;
    // 'HR Concerns' are need-to-know (mirrors tickets.js canReadTicket): the
    // requester's department manager + whoever the request is routed to (HR staff
    // after approval). No generic same-department access.
    if (t.category === HR_CONCERNS) {
      if (await managesDepartment(user.sub, t.approval_dept)) return true;
      if (t.department && user.department && t.department === user.department) return true;
      if (await managesDepartment(user.sub, t.department)) return true;
      return false;
    }
    if (t.department && user.department && t.department === user.department) return true;
    return false;
  }

  return false; // unknown category — default deny
}

// Express middleware: run after requireAuth (needs req.user). Mounted at
// `/uploads`, so req.path is relative to that (e.g. '/chat/abc.png').
export function authorizeUpload(req, res, next) {
  const fullPath = `/uploads${decodeURIComponent(req.path)}`;
  canAccessUpload(req.user, fullPath)
    .then((ok) => (ok ? next() : res.status(403).json({ error: 'You do not have access to this file' })))
    .catch(next);
}
