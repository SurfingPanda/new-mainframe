<?php

namespace App\Services;

/**
 * Pure, DB-free helpers for the Spaces routes — ported from
 * server/src/lib/spaces-helpers.js. Enums/labels, row -> API shapers, value
 * parsers/normalizers, and the per-space permission predicates. DB-coupled
 * helpers (loadAccess, recordHistory, generateSpaceKey, itemKeyOf, loadItem,
 * …) are in App\Services\SpaceAccess instead.
 */
class SpacesHelpers
{
    public const TYPES = ['epic', 'task', 'subtask'];
    public const STATUSES = ['todo', 'in_progress', 'done'];
    public const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

    public const NAME_MAX = 120;
    public const TITLE_MAX = 255;
    public const DESC_MAX = 20000;

    public const STATUS_LABEL = ['todo' => 'To Do', 'in_progress' => 'In Progress', 'done' => 'Done'];
    public const TYPE_LABEL = ['epic' => 'Epic', 'task' => 'Task', 'subtask' => 'Subtask'];
    public const PRIORITY_LABEL = ['low' => 'Low', 'normal' => 'Normal', 'high' => 'High', 'urgent' => 'Urgent'];

    public const SLA_MAX_DAYS = 3650;

    public static function shapeHistory(object $row): array
    {
        return [
            'id' => $row->id, 'actor_id' => $row->actor_id, 'actor_name' => $row->actor_name,
            'actor_avatar' => $row->actor_avatar ?? null, 'field' => $row->field,
            'old_value' => $row->old_value, 'new_value' => $row->new_value, 'created_at' => $row->created_at,
        ];
    }

    /** Bijective base-26 letters for task groups: 1->A, 2->B, … 26->Z, 27->AA, 28->AB… */
    public static function toGroupLetters(int $n): string
    {
        $x = $n;
        $s = '';
        while ($x > 0) {
            $x -= 1;
            $s = chr(65 + ($x % 26)) . $s;
            $x = intdiv($x, 26);
        }
        return $s ?: 'A';
    }

    public static function shapeSpace(object|array $row): array
    {
        $row = (array) $row;
        return [
            'id' => $row['id'], 'space_key' => $row['space_key'], 'name' => $row['name'],
            'description' => $row['description'], 'icon_url' => $row['icon_url'] ?? null,
            'owner_id' => $row['owner_id'], 'owner_name' => $row['owner_name'],
            'is_archived' => (bool) $row['is_archived'],
            'member_count' => isset($row['member_count']) ? (int) $row['member_count'] : null,
            'item_count' => isset($row['item_count']) ? (int) $row['item_count'] : null,
            'my_role' => $row['my_role'] ?? null,
            'is_member' => isset($row['my_role']) && $row['my_role'] !== null,
            'join_status' => $row['my_request_status'] ?? null,
            'created_at' => $row['created_at'], 'updated_at' => $row['updated_at'],
        ];
    }

    public static function shapeMember(object $row): array
    {
        return [
            'user_id' => $row->user_id, 'name' => $row->name, 'email' => $row->email,
            'avatar_url' => $row->avatar_url, 'user_role' => $row->user_role,
            'department' => $row->department, 'role' => $row->role, 'added_at' => $row->added_at,
        ];
    }

    public static function shapeItem(object|array $row): array
    {
        $row = (array) $row;
        return [
            'id' => $row['id'], 'space_id' => $row['space_id'], 'item_key' => $row['item_key'],
            'title' => $row['title'], 'description' => $row['description'], 'type' => $row['type'],
            'status' => $row['status'], 'priority' => $row['priority'],
            'assignee_id' => $row['assignee_id'], 'assignee_name' => $row['assignee_name'],
            'reporter_id' => $row['reporter_id'], 'reporter_name' => $row['reporter_name'],
            'parent_id' => $row['parent_id'], 'position' => $row['position'],
            'sla_days' => $row['sla_days'], 'due_at' => self::dateOnly($row['due_at'] ?? null),
            'start_date' => self::dateOnly($row['start_date'] ?? null), 'labels' => self::parseLabels($row['labels'] ?? null),
            'team' => $row['team'], 'completed_at' => $row['completed_at'],
            'created_at' => $row['created_at'], 'updated_at' => $row['updated_at'],
        ];
    }

    public static function shapeComment(object $row): array
    {
        return [
            'id' => $row->id, 'item_id' => $row->item_id, 'author_id' => $row->author_id,
            'author_name' => $row->author_name, 'author_avatar' => $row->author_avatar ?? null,
            'body' => $row->body, 'attachment_url' => $row->attachment_url ?? null,
            'attachment_filename' => $row->attachment_filename ?? null, 'attachment_mime' => $row->attachment_mime ?? null,
            'attachment_size' => $row->attachment_size ?? null,
            'created_at' => $row->created_at, 'updated_at' => $row->updated_at,
        ];
    }

    /** Normalize a DATE/DATETIME value to a 'YYYY-MM-DD' string, or null. */
    public static function dateOnly(mixed $v): ?string
    {
        if (!$v) {
            return null;
        }
        $s = (string) $v;
        if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $s, $m)) {
            return $m[1];
        }
        $ts = strtotime($s);
        return $ts ? date('Y-m-d', $ts) : null;
    }

    /** Labels are stored as a comma-separated string; the API speaks arrays. */
    public static function parseLabels(mixed $raw): array
    {
        if (!$raw) {
            return [];
        }
        return array_values(array_filter(array_map('trim', explode(',', (string) $raw))));
    }

    public static function serializeLabels(mixed $value): ?string
    {
        $list = is_array($value) ? $value : (is_string($value) ? explode(',', $value) : []);
        $list = array_slice(array_values(array_filter(array_map(fn ($s) => trim((string) $s), $list))), 0, 20);
        $joined = mb_substr(implode(',', array_unique($list)), 0, 255);
        return $joined ?: null;
    }

    public static function intId(mixed $v): ?int
    {
        if (!is_numeric($v) || (int) $v != $v) {
            return null;
        }
        $n = (int) $v;
        return $n > 0 ? $n : null;
    }

    /** @return array{ok: bool, value?: ?int} */
    public static function parseSlaDays(mixed $raw): array
    {
        if ($raw === null || $raw === '') {
            return ['ok' => true, 'value' => null];
        }
        if (!is_numeric($raw) || (int) $raw != $raw || $raw < 1 || $raw > self::SLA_MAX_DAYS) {
            return ['ok' => false];
        }
        return ['ok' => true, 'value' => (int) $raw];
    }

    /** Derive a due date (YYYY-MM-DD) from a base date + SLA days. */
    public static function dueDateFrom(mixed $baseDate, ?int $slaDays): ?string
    {
        if ($slaDays === null) {
            return null;
        }
        $ts = is_numeric($baseDate) ? (int) ($baseDate / 1000) : strtotime((string) $baseDate);
        return date('Y-m-d', strtotime("+{$slaDays} days", $ts));
    }

    /** @return array{ok: bool, value?: ?string} */
    public static function parseDate(mixed $raw): array
    {
        if ($raw === null || $raw === '') {
            return ['ok' => true, 'value' => null];
        }
        $s = mb_substr((string) $raw, 0, 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) || !strtotime($s)) {
            return ['ok' => false];
        }
        return ['ok' => true, 'value' => $s];
    }

    // --- Per-space permission predicates ----------------------------------------

    public static function canManageAll(?array $user): bool
    {
        return Permissions::has($user, 'spaces', 'manage');
    }

    /** Write/admin actions (rename, archive, delete, membership): the space owner or admin oversight. */
    public static function canAdminister(array $access, ?array $user): bool
    {
        return ($access['membership']['role'] ?? null) === 'owner' || self::canManageAll($user);
    }

    /** Contributing is open to the PM and members, not the read-only 'project_owner'. */
    public static function canContribute(array $access, ?array $user): bool
    {
        return (!empty($access['membership']) && $access['membership']['role'] !== 'project_owner') || self::canManageAll($user);
    }

    /** Mutating an EXISTING item: its assignee, or the PM/admins. */
    public static function canEditItem(array $access, array $user, ?array $item): bool
    {
        if (self::canAdminister($access, $user)) {
            return true;
        }
        if (($access['membership']['role'] ?? null) !== 'member') {
            return false;
        }
        return $item && ($item['assignee_id'] ?? null) !== null && (int) $item['assignee_id'] === (int) $user['sub'];
    }
}
