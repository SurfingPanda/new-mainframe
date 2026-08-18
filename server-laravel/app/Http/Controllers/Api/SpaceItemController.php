<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SpaceAccess;
use App\Services\SpaceNotify;
use App\Services\SpacesHelpers as H;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Ported from server/src/routes/spaces.js — work items, comments, and linked
 * items. Space/member/join-request routes live in SpaceController.
 */
class SpaceItemController extends Controller
{
    private const DOC_ALLOWED_MIME = [
        'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    ];
    private const MAX_FILE_BYTES = 25 * 1024 * 1024;

    private function respondSpaceNotFound()
    {
        return response()->json(['error' => 'Space not found'], 404);
    }

    public function index(Request $request, string $id)
    {
        $id = H::intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid space id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }

        $query = DB::table('space_items')->where('space_id', $id);
        $status = $request->query('status');
        if (in_array($status, H::STATUSES, true)) {
            $query->where('status', $status);
        }
        $type = $request->query('type');
        if (in_array($type, H::TYPES, true)) {
            $query->where('type', $type);
        }
        $assignee = H::intId($request->query('assignee'));
        if ($assignee) {
            $query->where('assignee_id', $assignee);
        }

        $rows = $query->orderBy('position')->orderBy('id')->limit(2000)->get();
        return response()->json($rows->map(fn ($r) => H::shapeItem($r))->all());
    }

    public function store(Request $request, string $id)
    {
        $id = H::intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid space id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        if (!H::canContribute($access, $user)) {
            return response()->json(['error' => 'Only members can add items'], 403);
        }

        $title = trim((string) $request->input('title', ''));
        if (!$title) {
            return response()->json(['error' => 'Title is required'], 400);
        }
        if (mb_strlen($title) > H::TITLE_MAX) {
            return response()->json(['error' => 'Title must be ' . H::TITLE_MAX . ' characters or fewer'], 400);
        }
        $type = in_array($request->input('type'), H::TYPES, true) ? $request->input('type') : 'task';
        $status = in_array($request->input('status'), H::STATUSES, true) ? $request->input('status') : 'todo';
        $priority = in_array($request->input('priority'), H::PRIORITIES, true) ? $request->input('priority') : 'normal';
        $description = mb_substr(trim((string) $request->input('description', '')), 0, H::DESC_MAX) ?: null;

        $assignee = ['id' => null, 'name' => null];
        $assigneeIdRaw = $request->input('assignee_id');
        if ($assigneeIdRaw !== null && $assigneeIdRaw !== '') {
            $resolved = SpaceAccess::resolveAssignee($id, H::intId($assigneeIdRaw));
            if (!$resolved) {
                return response()->json(['error' => 'Assignee must be a member of this space'], 400);
            }
            $assignee = $resolved;
        }

        $sla = H::parseSlaDays($request->input('sla_days'));
        if (!$sla['ok']) {
            return response()->json(['error' => 'SLA must be a whole number of days between 1 and ' . H::SLA_MAX_DAYS], 400);
        }
        $dueAt = H::dueDateFrom(now(), $sla['value']);

        $parentId = null;
        $parentIdRaw = $request->input('parent_id');
        if ($parentIdRaw !== null && $parentIdRaw !== '') {
            $parentId = H::intId($parentIdRaw);
            $parent = DB::table('space_items')->select('id', 'assignee_id')->where('id', $parentId)->where('space_id', $id)->first();
            if (!$parent) {
                return response()->json(['error' => 'Parent must be an item in this space'], 400);
            }
            if (!H::canEditItem($access, $user, (array) $parent)) {
                return response()->json(['error' => "Only the task's assignee or the Project Manager can add subtasks"], 403);
            }
        }
        $start = H::parseDate($request->input('start_date'));
        if (!$start['ok']) {
            return response()->json(['error' => 'Invalid start date'], 400);
        }
        $labels = H::serializeLabels($request->input('labels'));
        $team = mb_substr(trim((string) $request->input('team', '')), 0, 120) ?: null;

        $itemId = DB::transaction(function () use ($id, $parentId, $title, $description, $type, $status, $priority, $assignee, $user, $sla, $dueAt, $start, $labels, $team) {
            $space = DB::table('spaces')->select('space_key', 'item_seq', 'group_seq')->where('id', $id)->lockForUpdate()->first();
            $position = (int) $space->item_seq + 1;
            $spaceLetter = strtoupper(mb_substr($space->space_key ?: 'S', 0, 1));

            if ($parentId === null) {
                $groupSeq = (int) $space->group_seq + 1;
                $groupLetter = H::toGroupLetters($groupSeq);
                $itemNo = 1;
                DB::table('spaces')->where('id', $id)->update(['item_seq' => $position, 'group_seq' => $groupSeq]);
            } else {
                $parent = DB::table('space_items')->select('group_letter')->where('id', $parentId)->where('space_id', $id)->first();
                $groupLetter = $parent->group_letter ?? H::toGroupLetters(1);
                $max = DB::table('space_items')->where('space_id', $id)->where('group_letter', $groupLetter)->max('item_no') ?? 0;
                $itemNo = $max + 1;
                DB::table('spaces')->where('id', $id)->update(['item_seq' => $position]);
            }
            $itemKey = "{$spaceLetter}{$groupLetter}-{$itemNo}";
            $completedAt = $status === 'done' ? now() : null;

            return DB::table('space_items')->insertGetId([
                'space_id' => $id, 'item_key' => $itemKey, 'title' => $title, 'description' => $description,
                'type' => $type, 'status' => $status, 'priority' => $priority,
                'assignee_id' => $assignee['id'], 'assignee_name' => $assignee['name'],
                'reporter_id' => $user['sub'], 'reporter_name' => $user['name'], 'position' => $position,
                'group_letter' => $groupLetter, 'item_no' => $itemNo, 'sla_days' => $sla['value'], 'due_at' => $dueAt,
                'start_date' => $start['value'], 'labels' => $labels, 'team' => $team, 'parent_id' => $parentId,
                'completed_at' => $completedAt, 'created_at' => now(), 'updated_at' => now(),
            ]);
        });

        SpaceAccess::recordHistory($itemId, $id, $user, [['field' => 'created', 'old' => null, 'new' => null]]);
        $item = DB::table('space_items')->where('id', $itemId)->first();
        SpaceNotify::notifyItemAssigned($access['space'], (array) $item, $assignee['id'], $user);
        return response()->json(H::shapeItem($item), 201);
    }

    public function update(Request $request, string $id, string $itemId)
    {
        $id = H::intId($id);
        $itemId = H::intId($itemId);
        if (!$id || !$itemId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }

        $item = SpaceAccess::loadItem($id, $itemId);
        if (!$item) {
            return response()->json(['error' => 'Item not found'], 404);
        }
        if (!H::canEditItem($access, $user, $item)) {
            return response()->json(['error' => 'Only the assignee or the Project Manager can change this task'], 403);
        }

        $updates = [];
        $changes = [];
        $notifyAssigneeId = null;
        $b = $request->all();

        if (array_key_exists('title', $b)) {
            $title = trim((string) $b['title']);
            if (!$title) {
                return response()->json(['error' => 'Title is required'], 400);
            }
            if (mb_strlen($title) > H::TITLE_MAX) {
                return response()->json(['error' => 'Title must be ' . H::TITLE_MAX . ' characters or fewer'], 400);
            }
            $updates['title'] = $title;
            if ($title !== $item['title']) {
                $changes[] = ['field' => 'title', 'old' => mb_substr($item['title'] ?? '', 0, 255), 'new' => mb_substr($title, 0, 255)];
            }
        }
        if (array_key_exists('description', $b)) {
            $desc = mb_substr(trim((string) ($b['description'] ?? '')), 0, H::DESC_MAX) ?: null;
            $updates['description'] = $desc;
            if ($desc !== $item['description']) {
                $changes[] = ['field' => 'description', 'old' => null, 'new' => null];
            }
        }
        if (array_key_exists('type', $b)) {
            if (!in_array($b['type'], H::TYPES, true)) {
                return response()->json(['error' => 'Invalid type'], 400);
            }
            $updates['type'] = $b['type'];
            if ($b['type'] !== $item['type']) {
                $changes[] = ['field' => 'type', 'old' => H::TYPE_LABEL[$item['type']] ?? null, 'new' => H::TYPE_LABEL[$b['type']] ?? null];
            }
        }
        if (array_key_exists('priority', $b)) {
            if (!in_array($b['priority'], H::PRIORITIES, true)) {
                return response()->json(['error' => 'Invalid priority'], 400);
            }
            $updates['priority'] = $b['priority'];
            if ($b['priority'] !== $item['priority']) {
                $changes[] = ['field' => 'priority', 'old' => H::PRIORITY_LABEL[$item['priority']] ?? null, 'new' => H::PRIORITY_LABEL[$b['priority']] ?? null];
            }
        }
        if (array_key_exists('status', $b)) {
            if (!in_array($b['status'], H::STATUSES, true)) {
                return response()->json(['error' => 'Invalid status'], 400);
            }
            $updates['status'] = $b['status'];
            if ($b['status'] !== $item['status']) {
                $changes[] = ['field' => 'status', 'old' => H::STATUS_LABEL[$item['status']] ?? null, 'new' => H::STATUS_LABEL[$b['status']] ?? null];
            }
            if ($b['status'] === 'done' && $item['status'] !== 'done') {
                $updates['completed_at'] = now();
            } elseif ($b['status'] !== 'done' && $item['status'] === 'done') {
                $updates['completed_at'] = null;
            }
        }
        if (array_key_exists('position', $b)) {
            if (!is_numeric($b['position']) || (int) $b['position'] != $b['position']) {
                return response()->json(['error' => 'Invalid position'], 400);
            }
            $updates['position'] = (int) $b['position'];
        }
        if (array_key_exists('sla_days', $b)) {
            $sla = H::parseSlaDays($b['sla_days']);
            if (!$sla['ok']) {
                return response()->json(['error' => 'SLA must be a whole number of days between 1 and ' . H::SLA_MAX_DAYS], 400);
            }
            $dueAt = H::dueDateFrom($item['created_at'], $sla['value']);
            $updates['sla_days'] = $sla['value'];
            $updates['due_at'] = $dueAt;
            if (($sla['value'] ?? null) !== ($item['sla_days'] ?? null)) {
                $changes[] = ['field' => 'sla', 'old' => $item['sla_days'] !== null ? "{$item['sla_days']} days" : 'None', 'new' => $sla['value'] !== null ? "{$sla['value']} days" : 'None'];
            }
        }
        if (array_key_exists('assignee_id', $b)) {
            $nextAssigneeId = ($b['assignee_id'] === null || $b['assignee_id'] === '') ? null : H::intId($b['assignee_id']);
            if ($nextAssigneeId !== ($item['assignee_id'] ?? null) && !H::canAdminister($access, $user)) {
                return response()->json(['error' => 'Only the Project Manager can change who a task is assigned to'], 403);
            }
            if ($b['assignee_id'] === null || $b['assignee_id'] === '') {
                $updates['assignee_id'] = null;
                $updates['assignee_name'] = null;
                if ($item['assignee_id']) {
                    $changes[] = ['field' => 'assignee', 'old' => $item['assignee_name'] ?: 'Unassigned', 'new' => 'Unassigned'];
                }
            } else {
                $resolved = SpaceAccess::resolveAssignee($id, H::intId($b['assignee_id']));
                if (!$resolved) {
                    return response()->json(['error' => 'Assignee must be a member of this space'], 400);
                }
                $updates['assignee_id'] = $resolved['id'];
                $updates['assignee_name'] = $resolved['name'];
                if ($resolved['id'] !== $item['assignee_id']) {
                    $changes[] = ['field' => 'assignee', 'old' => $item['assignee_name'] ?: 'Unassigned', 'new' => $resolved['name']];
                    $notifyAssigneeId = $resolved['id'];
                }
            }
        }
        if (array_key_exists('start_date', $b)) {
            $start = H::parseDate($b['start_date']);
            if (!$start['ok']) {
                return response()->json(['error' => 'Invalid start date'], 400);
            }
            $updates['start_date'] = $start['value'];
            $oldStart = H::dateOnly($item['start_date']);
            if (($start['value'] ?? null) !== ($oldStart ?? null)) {
                $changes[] = ['field' => 'start_date', 'old' => $oldStart ?: 'None', 'new' => $start['value'] ?: 'None'];
            }
        }
        if (array_key_exists('labels', $b)) {
            $newLabels = H::serializeLabels($b['labels']);
            $updates['labels'] = $newLabels;
            if (($newLabels ?? null) !== ($item['labels'] ?? null)) {
                $changes[] = ['field' => 'labels', 'old' => implode(', ', H::parseLabels($item['labels'])) ?: 'None', 'new' => implode(', ', H::parseLabels($newLabels)) ?: 'None'];
            }
        }
        if (array_key_exists('team', $b)) {
            $team = mb_substr(trim((string) ($b['team'] ?? '')), 0, 120) ?: null;
            $updates['team'] = $team;
            if (($team ?? null) !== ($item['team'] ?? null)) {
                $changes[] = ['field' => 'team', 'old' => $item['team'] ?: 'None', 'new' => $team ?: 'None'];
            }
        }
        if (array_key_exists('parent_id', $b)) {
            $newParentId = null;
            if ($b['parent_id'] === null || $b['parent_id'] === '') {
                $updates['parent_id'] = null;
            } else {
                $newParentId = H::intId($b['parent_id']);
                if ($newParentId === $itemId) {
                    return response()->json(['error' => 'An item cannot be its own parent'], 400);
                }
                if (!SpaceAccess::itemInSpace($id, $newParentId)) {
                    return response()->json(['error' => 'Parent must be an item in this space'], 400);
                }
                $updates['parent_id'] = $newParentId;
            }
            if (($newParentId ?? null) !== ($item['parent_id'] ?? null)) {
                $changes[] = ['field' => 'parent', 'old' => SpaceAccess::itemKeyOf($item['parent_id']) ?: 'None', 'new' => SpaceAccess::itemKeyOf($newParentId) ?: 'None'];
            }
        }
        if (!$updates) {
            return response()->json(['error' => 'Nothing to update'], 400);
        }

        $updates['updated_at'] = now();
        DB::table('space_items')->where('id', $itemId)->update($updates);
        SpaceAccess::recordHistory($itemId, $id, $user, $changes);
        $updated = DB::table('space_items')->where('id', $itemId)->first();
        if ($notifyAssigneeId) {
            SpaceNotify::notifyItemAssigned($access['space'], (array) $updated, $notifyAssigneeId, $user);
        }
        return response()->json(H::shapeItem($updated));
    }

    public function destroy(Request $request, string $id, string $itemId)
    {
        $id = H::intId($id);
        $itemId = H::intId($itemId);
        if (!$id || !$itemId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        if (!H::canAdminister($access, $user)) {
            return response()->json(['error' => 'Only the Project Manager can delete tasks'], 403);
        }

        $affected = DB::table('space_items')->where('id', $itemId)->where('space_id', $id)->delete();
        if (!$affected) {
            return response()->json(['error' => 'Item not found'], 404);
        }
        return response()->json(['ok' => true]);
    }

    public function show(Request $request, string $id, string $itemId)
    {
        $id = H::intId($id);
        $itemId = H::intId($itemId);
        if (!$id || !$itemId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }

        $item = SpaceAccess::loadItem($id, $itemId);
        if (!$item) {
            return response()->json(['error' => 'Item not found'], 404);
        }

        $parent = $item['parent_id'] ? DB::table('space_items')->where('id', $item['parent_id'])->first() : null;
        $subtasks = DB::table('space_items')->where('parent_id', $itemId)->orderBy('position')->orderBy('id')->get();

        $links = DB::table('space_item_links as l')
            ->join('space_items as si', 'si.id', '=', DB::raw("CASE WHEN l.item_id = {$itemId} THEN l.linked_item_id ELSE l.item_id END"))
            ->select('l.id as link_id', 'si.*')
            ->where('l.item_id', $itemId)->orWhere('l.linked_item_id', $itemId)
            ->orderByDesc('l.id')->get();

        $comments = DB::table('space_item_comments as c')
            ->leftJoin('users as u', 'u.id', '=', 'c.author_id')
            ->select('c.*', 'u.avatar_url as author_avatar')
            ->where('c.item_id', $itemId)->orderBy('c.created_at')->get();

        $history = DB::table('space_item_history as h')
            ->leftJoin('users as u', 'u.id', '=', 'h.actor_id')
            ->select('h.*', 'u.avatar_url as actor_avatar')
            ->where('h.item_id', $itemId)->orderByDesc('h.created_at')->orderByDesc('h.id')->get();

        return response()->json([
            'item' => H::shapeItem($item),
            'parent' => $parent ? H::shapeItem($parent) : null,
            'subtasks' => $subtasks->map(fn ($r) => H::shapeItem($r))->all(),
            'links' => $links->map(fn ($r) => ['link_id' => $r->link_id, 'item' => H::shapeItem($r)])->all(),
            'comments' => $comments->map(fn ($r) => H::shapeComment($r))->all(),
            'history' => $history->map(fn ($r) => H::shapeHistory($r))->all(),
        ]);
    }

    // --- Comments -------------------------------------------------------

    public function commentsStore(Request $request, string $id, string $itemId)
    {
        $id = H::intId($id);
        $itemId = H::intId($itemId);
        if (!$id || !$itemId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        if (!H::canContribute($access, $user)) {
            return response()->json(['error' => 'Only members can comment'], 403);
        }
        $item = SpaceAccess::loadItem($id, $itemId);
        if (!$item) {
            return response()->json(['error' => 'Item not found'], 404);
        }

        $body = mb_substr(trim((string) $request->input('body', '')), 0, H::DESC_MAX);
        $file = $request->file('file');
        if ($file && !$file->isValid()) {
            return response()->json(['error' => 'Upload failed'], 400);
        }
        if ($file) {
            $err = $this->validateUpload($file);
            if ($err) {
                return response()->json(['error' => $err], 400);
            }
        }
        if (!$body && !$file) {
            return response()->json(['error' => 'Comment cannot be empty'], 400);
        }

        $attachmentUrl = null;
        if ($file) {
            $stored = $this->storeUpload($file);
            $attachmentUrl = "/uploads/spaces/{$stored}";
        }

        $commentId = DB::table('space_item_comments')->insertGetId([
            'item_id' => $itemId, 'space_id' => $id, 'author_id' => $user['sub'], 'author_name' => $user['name'],
            'body' => $body, 'attachment_url' => $attachmentUrl,
            'attachment_filename' => $file?->getClientOriginalName(), 'attachment_mime' => $file?->getClientMimeType(),
            'attachment_size' => $file?->getSize(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $row = DB::table('space_item_comments as c')->leftJoin('users as u', 'u.id', '=', 'c.author_id')
            ->select('c.*', 'u.avatar_url as author_avatar')->where('c.id', $commentId)->first();

        SpaceNotify::notifyItemComment($access['space'], $item, $user['sub'], $user['name']);
        return response()->json(H::shapeComment($row), 201);
    }

    public function commentsDestroy(Request $request, string $id, string $itemId, string $commentId)
    {
        $id = H::intId($id);
        $itemId = H::intId($itemId);
        $commentId = H::intId($commentId);
        if (!$id || !$itemId || !$commentId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }

        $comment = DB::table('space_item_comments')->select('author_id', 'attachment_url')
            ->where('id', $commentId)->where('item_id', $itemId)->where('space_id', $id)->first();
        if (!$comment) {
            return response()->json(['error' => 'Comment not found'], 404);
        }
        if ((int) $comment->author_id !== $user['sub'] && !H::canAdminister($access, $user)) {
            return response()->json(['error' => 'You can only delete your own comments'], 403);
        }

        DB::table('space_item_comments')->where('id', $commentId)->delete();
        if ($comment->attachment_url) {
            Storage::disk('spaces')->delete(basename($comment->attachment_url));
        }
        return response()->json(['ok' => true]);
    }

    // --- Linked items -----------------------------------------------------

    public function linksStore(Request $request, string $id, string $itemId)
    {
        $id = H::intId($id);
        $itemId = H::intId($itemId);
        if (!$id || !$itemId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        $linkItem = DB::table('space_items')->select('id', 'assignee_id')->where('id', $itemId)->where('space_id', $id)->first();
        if (!$linkItem) {
            return response()->json(['error' => 'Item not found'], 404);
        }
        if (!H::canEditItem($access, $user, (array) $linkItem)) {
            return response()->json(['error' => 'Only the assignee or the Project Manager can link items'], 403);
        }

        $linkedId = H::intId($request->input('linked_item_id'));
        if (!$linkedId) {
            return response()->json(['error' => 'A linked item is required'], 400);
        }
        if ($linkedId === $itemId) {
            return response()->json(['error' => 'An item cannot be linked to itself'], 400);
        }
        if (!SpaceAccess::itemInSpace($id, $linkedId)) {
            return response()->json(['error' => 'Linked item must be in this space'], 400);
        }

        $existing = DB::table('space_item_links')
            ->where(fn ($q) => $q->where('item_id', $itemId)->where('linked_item_id', $linkedId))
            ->orWhere(fn ($q) => $q->where('item_id', $linkedId)->where('linked_item_id', $itemId))
            ->exists();
        if ($existing) {
            return response()->json(['error' => 'These items are already linked'], 409);
        }

        DB::table('space_item_links')->insert(['space_id' => $id, 'item_id' => $itemId, 'linked_item_id' => $linkedId, 'created_at' => now()]);
        return response()->json(['ok' => true], 201);
    }

    public function linksDestroy(Request $request, string $id, string $itemId, string $linkedItemId)
    {
        $id = H::intId($id);
        $itemId = H::intId($itemId);
        $linkedId = H::intId($linkedItemId);
        if (!$id || !$itemId || !$linkedId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        $unlinkItem = DB::table('space_items')->select('id', 'assignee_id')->where('id', $itemId)->where('space_id', $id)->first();
        if (!$unlinkItem) {
            return response()->json(['error' => 'Item not found'], 404);
        }
        if (!H::canEditItem($access, $user, (array) $unlinkItem)) {
            return response()->json(['error' => 'Only the assignee or the Project Manager can unlink items'], 403);
        }

        DB::table('space_item_links')->where('space_id', $id)
            ->where(fn ($q) => $q->where('item_id', $itemId)->where('linked_item_id', $linkedId))
            ->orWhere(fn ($q) => $q->where('item_id', $linkedId)->where('linked_item_id', $itemId))
            ->delete();
        return response()->json(['ok' => true]);
    }

    private function validateUpload(UploadedFile $file): ?string
    {
        if (!in_array($file->getClientMimeType(), self::DOC_ALLOWED_MIME, true)) {
            return "Unsupported file type: {$file->getClientMimeType()}";
        }
        if ($file->getSize() > self::MAX_FILE_BYTES) {
            return 'File is larger than 25 MB.';
        }
        return null;
    }

    private function storeUpload(UploadedFile $file): string
    {
        $safe = mb_substr(preg_replace('/[^a-zA-Z0-9._-]/', '_', $file->getClientOriginalName()), 0, 80);
        $stamp = base_convert((string) round(microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(4));
        $storedName = "{$stamp}-{$safe}";
        Storage::disk('spaces')->putFileAs('', $file, $storedName);
        return $storedName;
    }
}
