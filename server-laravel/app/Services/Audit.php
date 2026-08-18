<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * App-wide admin audit trail — ported from server/src/lib/audit.js. Distinct
 * from ticket_activity (per-ticket, user-visible): records sensitive admin
 * actions for an admin-only log. record() is fire-and-forget and swallows its
 * own errors — an audit-write failure must never break the audited operation.
 */
class Audit
{
    public static function record(Request $request, array $entry): void
    {
        try {
            $action = $entry['action'] ?? null;
            if (!$action) {
                return;
            }
            $user = $request->authUser();
            $changes = $entry['changes'] ?? null;
            DB::table('audit_log')->insert([
                'actor_id' => $user['sub'] ?? null,
                'actor_name' => $user['name'] ?? $user['email'] ?? null,
                'action' => mb_substr((string) $action, 0, 64),
                'entity_type' => isset($entry['entityType']) ? mb_substr((string) $entry['entityType'], 0, 40) : null,
                'entity_id' => isset($entry['entityId']) ? mb_substr((string) $entry['entityId'], 0, 64) : null,
                'entity_label' => !empty($entry['entityLabel']) ? mb_substr((string) $entry['entityLabel'], 0, 160) : null,
                'changes' => $changes ? json_encode($changes) : null,
                'ip' => $request->ip() ? mb_substr($request->ip(), 0, 45) : null,
                'created_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::error("[audit] write failed: {$e->getMessage()}");
        }
    }

    /**
     * Build a { field: { from, to } } diff between a before-row and after-row.
     * Only includes fields whose value actually changed. $redact lists fields
     * whose values must not be stored verbatim (logged as ['changed' => true]).
     */
    public static function diffChanges(?array $before, ?array $after, array $fields, array $redact = []): ?array
    {
        $out = [];
        $norm = function ($v) {
            if ($v === null) {
                return null;
            }
            return is_array($v) ? json_encode($v) : $v;
        };
        foreach ($fields as $f) {
            $from = $before[$f] ?? null;
            $to = $after[$f] ?? null;
            if ($norm($from) === $norm($to)) {
                continue;
            }
            $out[$f] = in_array($f, $redact, true) ? ['changed' => true] : ['from' => $from, 'to' => $to];
        }
        return $out ? $out : null;
    }
}
