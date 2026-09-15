// Pure, DB-free helpers for the Spaces routes (routes/spaces.js): enums/labels,
// row -> API shapers, value parsers/normalizers, and the per-space permission
// predicates. Extracted so routes/spaces.js stays focused on routing and so this
// logic is unit-testable. DB-coupled helpers (loadAccess, recordHistory,
// generateSpaceKey, itemKeyOf, loadItem, …) remain in the route file.

import { hasPermission } from './permissions.js';

export const TYPES = ['epic', 'task', 'subtask'];
export const STATUSES = ['todo', 'in_progress', 'done'];
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export const NAME_MAX = 120;
export const TITLE_MAX = 255;
export const DESC_MAX = 20000;

export const STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
export const TYPE_LABEL = { epic: 'Epic', task: 'Task', subtask: 'Subtask' };
export const PRIORITY_LABEL = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

export const SLA_MAX_DAYS = 3650;

export function shapeHistory(row) {
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

// Bijective base-26 letters for task groups: 1->A, 2->B, … 26->Z, 27->AA, 28->AB…
export function toGroupLetters(n) {
  let x = Number(n);
  let s = '';
  while (x > 0) {
    x -= 1;
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26);
  }
  return s || 'A';
}

export function shapeSpace(row) {
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

export function shapeMember(row) {
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

export function shapeItem(row) {
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

export function shapeComment(row) {
  return {
    id: row.id,
    item_id: row.item_id,
    author_id: row.author_id,
    author_name: row.author_name,
    author_avatar: row.author_avatar ?? null,
    body: row.body,
    attachment_url: row.attachment_url ?? null,
    attachment_filename: row.attachment_filename ?? null,
    attachment_mime: row.attachment_mime ?? null,
    attachment_size: row.attachment_size ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// Normalize a DATE value to a 'YYYY-MM-DD' string using local calendar parts.
// mysql2 returns DATE as a local-midnight Date; serializing it to ISO/UTC would
// shift the day, so we format from the local components instead.
export function dateOnly(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Labels are stored as a comma-separated string; the API speaks arrays.
export function parseLabels(raw) {
  if (!raw) return [];
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}
export function serializeLabels(value) {
  let list = [];
  if (Array.isArray(value)) list = value;
  else if (typeof value === 'string') list = value.split(',');
  list = list.map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
  const joined = [...new Set(list)].join(',').slice(0, 255);
  return joined || null;
}

export const intId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Parse an optional SLA (days-to-complete) value from a request body.
// Returns { ok, value } where value is an integer 1..SLA_MAX_DAYS, or null to clear.
export function parseSlaDays(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > SLA_MAX_DAYS) return { ok: false };
  return { ok: true, value: n };
}

// Derive a due date (YYYY-MM-DD) from a base date + SLA days.
export function dueDateFrom(baseDate, slaDays) {
  if (slaDays == null) return null;
  const d = new Date(baseDate);
  d.setDate(d.getDate() + Number(slaDays));
  return d.toISOString().slice(0, 10);
}

// Parse an optional YYYY-MM-DD date. Returns { ok, value } where value is the
// normalized string or null to clear; { ok:false } on a malformed value.
export function parseDate(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  const s = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) return { ok: false };
  return { ok: true, value: s };
}

// --- Per-space permission predicates ----------------------------------------
export const canManageAll = (user) => hasPermission(user, 'spaces', 'manage');

// Write/admin actions (rename, archive, delete, membership) require the space
// owner role (the Project Manager / creator) or admin oversight.
export const canAdminister = (access, user) => access.membership?.role === 'owner' || canManageAll(user);

// Contributing (create/edit items, comment, link, docs, goals) is open to the
// Project Manager and regular members, but NOT to a 'project_owner' — that role
// is a read-only stakeholder confined to the Summary view. Admin oversight
// (spaces.manage) can always contribute.
export const canContribute = (access, user) =>
  (!!access.membership && access.membership.role !== 'project_owner') || canManageAll(user);

// Mutating an EXISTING item (move on the board, edit fields, add subtasks/links,
// delete) is limited to its assignee plus the Project Manager (owner) and admins
// (spaces.manage). Other members get view + comment only. Changing the assignee
// is further restricted to PM/admins — see the reassign guard in the item PATCH.
export function canEditItem(access, user, item) {
  if (canAdminister(access, user)) return true;
  if (access.membership?.role !== 'member') return false; // project_owner / non-members
  return !!item && item.assignee_id != null && item.assignee_id === user.sub;
}
