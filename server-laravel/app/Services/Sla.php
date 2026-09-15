<?php

namespace App\Services;

/**
 * Pause-aware SLA standing — ported 1:1 from server/src/lib/sla.js. Mirrors
 * the calculation in client/src/pages/TicketDetail.jsx (`computeSla`): it
 * subtracts time the ticket spent paused (pending / on_hold / resolved) using
 * the status-change history, so only active working time counts against the
 * target.
 */
class Sla
{
    public const RESOLVED_STATUSES = ['resolved', 'closed'];
    public const TERMINAL_STATUSES = ['resolved', 'closed', 'cancelled'];
    public const PAUSED_STATUSES = ['pending', 'on_hold', 'resolved', 'closed', 'cancelled'];
    private const MINUTE = 60000;

    /**
     * Normalize raw ticket_activity status-change rows into an ordered timeline.
     * @return array{at: int, status: string, prev: ?string}[]
     */
    public static function normalizeStatusChanges(array $rows): array
    {
        $out = [];
        foreach ($rows as $a) {
            $a = (array) $a;
            if (($a['field'] ?? null) !== 'status' || empty($a['new_value'])) {
                continue;
            }
            $at = strtotime((string) $a['created_at']) * 1000;
            if (!$at) {
                continue;
            }
            $out[] = ['at' => $at, 'status' => $a['new_value'], 'prev' => $a['old_value'] ?? null];
        }
        usort($out, fn ($a, $b) => $a['at'] <=> $b['at']);
        return $out;
    }

    /** The most recent transition into a resolved/closed status, else updated_at. */
    private static function resolvedAtMs(array $ticket, array $changes): int
    {
        $latest = null;
        foreach ($changes as $c) {
            if (in_array($c['status'], self::TERMINAL_STATUSES, true) && ($latest === null || $c['at'] > $latest)) {
                $latest = $c['at'];
            }
        }
        if ($latest !== null) {
            return $latest;
        }
        $u = strtotime((string) ($ticket['updated_at'] ?? '')) * 1000;
        return $u ?: (int) (microtime(true) * 1000);
    }

    /**
     * Active (unpaused) elapsed ms between $opened and $until, walking the
     * status timeline. When $cal is set, each active segment counts only its
     * working time; with $cal = null it counts wall-clock (24/7).
     */
    private static function activeElapsed(array $ticket, array $changes, int $opened, int $until, ?array $cal): int
    {
        $segStart = $opened;
        $segStatus = $changes ? ($changes[0]['prev'] ?: 'open') : ($ticket['status'] ?? 'open');
        $active = 0;
        $accrue = function ($from, $to, $status) use (&$active, $opened, $until, $cal) {
            if (in_array($status, Sla::PAUSED_STATUSES, true)) {
                return;
            }
            $lo = max($from, $opened);
            $hi = min($to, $until);
            if ($hi > $lo) {
                $active += $cal ? BusinessHours::businessMsBetween($lo, $hi, $cal) : ($hi - $lo);
            }
        };
        foreach ($changes as $c) {
            $accrue($segStart, $c['at'], $segStatus);
            $segStart = $c['at'];
            $segStatus = $c['status'];
        }
        $accrue($segStart, $until, $segStatus);
        return max(0, $active);
    }

    /**
     * Pause-aware SLA standing for a ticket given its status-change rows.
     * Returns null when the ticket has no resolution target or a missing/
     * invalid created date. $ticket is a plain array (cast from a DB row).
     */
    public static function standing(array $ticket, array $changeRows): ?array
    {
        $opened = !empty($ticket['created_at']) ? strtotime((string) $ticket['created_at']) * 1000 : null;
        if (!$opened) {
            return null;
        }

        $slaDays = SlaConfig::get();
        $resolutionMinutes = $ticket['sla_resolution_minutes'] ?? null;
        $resolutionMinutes = $resolutionMinutes !== null
            ? (int) $resolutionMinutes
            : (($slaDays[$ticket['priority'] ?? ''] ?? null) !== null ? $slaDays[$ticket['priority']] * 1440 : null);
        if (!$resolutionMinutes) {
            return null;
        }

        $changes = self::normalizeStatusChanges($changeRows);
        $cal = BusinessHours::getCalendarById(isset($ticket['sla_calendar_id']) ? (int) $ticket['sla_calendar_id'] : null);
        $resolved = in_array($ticket['status'] ?? null, self::RESOLVED_STATUSES, true);
        $terminal = in_array($ticket['status'] ?? null, self::TERMINAL_STATUSES, true);
        $ref = $terminal ? self::resolvedAtMs($ticket, $changes) : (int) (microtime(true) * 1000);
        $elapsed = self::activeElapsed($ticket, $changes, $opened, $ref, $cal);
        $totalMs = $resolutionMinutes * self::MINUTE;

        $result = [
            'resolved' => $resolved,
            'elapsed' => $elapsed,
            'totalMs' => $totalMs,
            'remaining' => $totalMs - $elapsed,
            'overdue' => $elapsed > $totalMs,
            'days' => (int) round($resolutionMinutes / 1440),
            'resolution' => [
                'target' => $totalMs, 'elapsed' => $elapsed, 'remaining' => $totalMs - $elapsed,
                'breached' => $elapsed > $totalMs, 'met' => $resolved && $elapsed <= $totalMs,
            ],
            'response' => null,
        ];

        $responseMinutes = isset($ticket['sla_response_minutes']) && $ticket['sla_response_minutes'] !== null
            ? (int) $ticket['sla_response_minutes'] : null;
        if ($responseMinutes) {
            $firstAt = !empty($ticket['first_responded_at']) ? strtotime((string) $ticket['first_responded_at']) * 1000 : null;
            $met = (bool) $firstAt;
            $respRef = $met ? $firstAt : (int) (microtime(true) * 1000);
            $respElapsed = self::activeElapsed($ticket, $changes, $opened, $respRef, $cal);
            $respTarget = $responseMinutes * self::MINUTE;
            $result['response'] = [
                'target' => $respTarget, 'elapsed' => $respElapsed, 'remaining' => $respTarget - $respElapsed,
                'met' => $met, 'breached' => !$met && $respElapsed > $respTarget,
            ];
        }

        return $result;
    }
}
