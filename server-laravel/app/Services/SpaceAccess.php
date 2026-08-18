<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * DB-coupled Spaces helpers — ported from the route-local functions in
 * server/src/routes/spaces.js (loadAccess, recordHistory, generateSpaceKey,
 * itemKeyOf, resolveAssignee, itemInSpace, loadItem). Kept separate from the
 * pure SpacesHelpers so those stay unit-testable without a DB.
 */
class SpaceAccess
{
    /**
     * Loads the space and the requester's membership. Returns null when the
     * space doesn't exist or the user may not see it (members + spaces.manage only).
     * @return array{space: array, membership: ?array}|null
     */
    public static function load(int $spaceId, array $user): ?array
    {
        $space = DB::table('spaces')->where('id', $spaceId)->first();
        if (!$space) {
            return null;
        }
        $membership = DB::table('space_members')->select('role')
            ->where('space_id', $spaceId)->where('user_id', $user['sub'])->first();
        if (!$membership && !SpacesHelpers::canManageAll($user)) {
            return null;
        }
        return ['space' => (array) $space, 'membership' => $membership ? (array) $membership : null];
    }

    /**
     * Append change entries to an item's history. $changes: [{field, old, new}, ...];
     * falsy entries are skipped.
     */
    public static function recordHistory(int $itemId, int $spaceId, array $actor, array $changes): void
    {
        $rows = array_values(array_filter($changes));
        if (!$rows) {
            return;
        }
        $insert = array_map(fn ($c) => [
            'item_id' => $itemId, 'space_id' => $spaceId, 'actor_id' => $actor['sub'], 'actor_name' => $actor['name'],
            'field' => $c['field'], 'old_value' => $c['old'] ?? null, 'new_value' => $c['new'] ?? null,
            'created_at' => now(),
        ], $rows);
        DB::table('space_item_history')->insert($insert);
    }

    public static function itemKeyOf(?int $itemId): ?string
    {
        if (!$itemId) {
            return null;
        }
        return DB::table('space_items')->where('id', $itemId)->value('item_key');
    }

    /**
     * Derive a short uppercase key from the space name, then ensure it's
     * unique by appending a numeric suffix within the 10-char column.
     */
    public static function generateSpaceKey(string $name): string
    {
        $upper = preg_replace('/[^A-Z0-9 ]/', ' ', strtoupper($name));
        $words = array_values(array_filter(preg_split('/\s+/', trim($upper))));
        $base = count($words) >= 2
            ? mb_substr(implode('', array_map(fn ($w) => $w[0], $words)), 0, 4)
            : mb_substr($words[0] ?? '', 0, 4);
        if (!$base) {
            $base = 'SP';
        }
        $key = $base;
        $n = 1;
        while (DB::table('spaces')->where('space_key', $key)->exists()) {
            $n += 1;
            $suffix = (string) $n;
            $key = mb_substr($base, 0, max(1, 10 - mb_strlen($suffix))) . $suffix;
        }
        return $key;
    }

    /** Resolve an assignee id to a name, requiring the user be a member of the space. */
    public static function resolveAssignee(int $spaceId, ?int $assigneeId): ?array
    {
        if ($assigneeId === null) {
            return ['id' => null, 'name' => null];
        }
        $row = DB::table('space_members as m')->join('users as u', 'u.id', '=', 'm.user_id')
            ->select('u.id', 'u.name')->where('m.space_id', $spaceId)->where('m.user_id', $assigneeId)->first();
        return $row ? ['id' => $row->id, 'name' => $row->name] : null;
    }

    public static function itemInSpace(int $spaceId, ?int $itemId): bool
    {
        if (!$itemId) {
            return false;
        }
        return DB::table('space_items')->where('id', $itemId)->where('space_id', $spaceId)->exists();
    }

    public static function loadItem(int $spaceId, int $itemId): ?array
    {
        $row = DB::table('space_items')->where('id', $itemId)->where('space_id', $spaceId)->first();
        return $row ? (array) $row : null;
    }
}
