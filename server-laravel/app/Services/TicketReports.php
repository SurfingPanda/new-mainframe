<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Aggregates for the Work Order Reports page, computed server-side in a single
 * chunked pass so the browser never receives the queue. SLA figures use the same
 * pause- and business-hours-aware Sla::standing() as the list and detail views.
 * Reports cover every work order (staff-only route), filtered by creation date.
 */
class TicketReports
{
    private const STATUS_ORDER = ['open', 'in_progress', 'on_hold', 'pending', 'resolved', 'closed', 'cancelled'];
    private const PRIORITY_ORDER = ['low', 'normal', 'high', 'urgent'];
    private const DAY_MS = 86400000;
    private const COLUMNS = ['id', 'status', 'priority', 'request_type', 'department', 'assignee', 'created_at', 'updated_at',
        'first_responded_at', 'sla_response_minutes', 'sla_resolution_minutes', 'sla_calendar_id'];

    /**
     * @param string $fromYmd / $toYmd  YYYY-MM-DD in the caller's timezone ('' = unbounded)
     * @param int $tzOffsetMinutes      the caller's JS getTimezoneOffset() (UTC − local, minutes)
     */
    public static function build(string $fromYmd, string $toYmd, int $tzOffsetMinutes): array
    {
        $from = self::localDayBoundary($fromYmd, false, $tzOffsetMinutes);
        $to = self::localDayBoundary($toYmd, true, $tzOffsetMinutes);

        $zeroBy = fn (array $keys) => array_fill_keys($keys, 0);
        $byStatus = $zeroBy(self::STATUS_ORDER);
        $byPriority = $zeroBy(self::PRIORITY_ORDER);
        $incByStatus = $zeroBy(self::STATUS_ORDER);
        $incByPriority = $zeroBy(self::PRIORITY_ORDER);
        $breaches = $zeroBy(self::PRIORITY_ORDER);
        $resSum = $zeroBy(self::PRIORITY_ORDER);
        $resCount = $zeroBy(self::PRIORITY_ORDER);
        $byRequestType = [];
        $byDept = [];
        $openByAssignee = [];
        $monthAll = [];
        $monthInc = [];
        $minCreated = null;
        $total = $open = $incidents = $overdueOpen = 0;
        $resolvedTotal = $resolvedWithin = $resolvedBreached = 0;
        $health = ['on_track' => 0, 'due_soon' => 0, 'overdue' => 0];

        $query = DB::table('tickets')->select(self::COLUMNS);
        if ($from) {
            $query->where('created_at', '>=', $from);
        }
        if ($to) {
            $query->where('created_at', '<=', $to);
        }

        $query->orderBy('id')->chunkById(500, function ($chunk) use (
            &$byStatus, &$byPriority, &$incByStatus, &$incByPriority, &$breaches, &$resSum, &$resCount,
            &$byRequestType, &$byDept, &$openByAssignee, &$monthAll, &$monthInc, &$minCreated,
            &$total, &$open, &$incidents, &$overdueOpen, &$resolvedTotal, &$resolvedWithin, &$resolvedBreached, &$health,
            $tzOffsetMinutes
        ) {
            $rows = Sla::attachStanding($chunk->map(fn ($r) => (array) $r)->all());
            foreach ($rows as $t) {
                $total++;
                $status = $t['status'];
                $priority = $t['priority'];
                $isIncident = ($t['request_type'] ?? null) === 'incident';
                $terminal = in_array($status, Sla::TERMINAL_STATUSES, true);
                $isResolved = in_array($status, Sla::RESOLVED_STATUSES, true);
                $sla = $t['sla'];

                if (isset($byStatus[$status])) {
                    $byStatus[$status]++;
                }
                if (isset($byPriority[$priority])) {
                    $byPriority[$priority]++;
                }
                if (!empty($t['request_type'])) {
                    $byRequestType[$t['request_type']] = ($byRequestType[$t['request_type']] ?? 0) + 1;
                }
                $dept = trim((string) ($t['department'] ?? '')) ?: 'Unassigned';
                $byDept[$dept] = ($byDept[$dept] ?? 0) + 1;

                $createdTs = !empty($t['created_at']) ? strtotime((string) $t['created_at']) : null;
                if ($createdTs) {
                    $minCreated = $minCreated === null ? $createdTs : min($minCreated, $createdTs);
                    $key = self::monthKey($createdTs, $tzOffsetMinutes);
                    $monthAll[$key] = ($monthAll[$key] ?? 0) + 1;
                    if ($isIncident) {
                        $monthInc[$key] = ($monthInc[$key] ?? 0) + 1;
                    }
                }

                if ($isIncident) {
                    $incidents++;
                    if (isset($incByStatus[$status])) {
                        $incByStatus[$status]++;
                    }
                    if (isset($incByPriority[$priority])) {
                        $incByPriority[$priority]++;
                    }
                }

                if (!empty($sla['overdue']) && isset($breaches[$priority])) {
                    $breaches[$priority]++;
                }

                if (!$terminal) {
                    $open++;
                    $assignee = trim((string) ($t['assignee'] ?? '')) ?: 'Unassigned';
                    $openByAssignee[$assignee] = ($openByAssignee[$assignee] ?? 0) + 1;
                    if ($sla) {
                        if ($sla['overdue']) {
                            $overdueOpen++;
                            $health['overdue']++;
                        } elseif ($sla['remaining'] < $sla['totalMs'] * 0.25) {
                            $health['due_soon']++;
                        } else {
                            $health['on_track']++;
                        }
                    }
                }

                if ($isResolved) {
                    $resolvedTotal++;
                    if ($sla) {
                        $sla['overdue'] ? $resolvedBreached++ : $resolvedWithin++;
                    }
                    if (isset($resSum[$priority]) && $createdTs && !empty($t['updated_at'])) {
                        $resSum[$priority] += max(0, (strtotime((string) $t['updated_at']) - $createdTs) * 1000);
                        $resCount[$priority]++;
                    }
                }
            }
        });

        $top = function (array $map) {
            arsort($map);
            $out = [];
            foreach (array_slice($map, 0, 8, true) as $label => $value) {
                $out[] = ['label' => (string) $label, 'value' => $value];
            }
            return $out;
        };

        [$months, $monthKeys] = self::monthBuckets($fromYmd, $toYmd, $minCreated, $tzOffsetMinutes);
        $series = function (array $counts) use ($months, $monthKeys) {
            return array_map(fn ($b, $k) => ['y' => $b['y'], 'm' => $b['m'], 'count' => $counts[$k] ?? 0], $months, $monthKeys);
        };

        $avgDays = [];
        foreach (self::PRIORITY_ORDER as $p) {
            $avgDays[$p] = $resCount[$p] ? round(($resSum[$p] / $resCount[$p] / self::DAY_MS) * 10) / 10 : 0;
        }

        return [
            'scope_total' => DB::table('tickets')->count(),
            'stats' => [
                'total' => $total, 'open' => $open, 'incidents' => $incidents, 'overdue_open' => $overdueOpen,
                'within_pct' => $resolvedTotal ? (int) round($resolvedWithin / $resolvedTotal * 100) : null,
            ],
            'by_status' => $byStatus,
            'by_priority' => $byPriority,
            'by_request_type' => $byRequestType,
            'by_department' => $top($byDept),
            'open_by_assignee' => $top($openByAssignee),
            'volume_by_month' => $series($monthAll),
            'incidents_by_priority' => $incByPriority,
            'incidents_by_status' => $incByStatus,
            'incidents_by_month' => $series($monthInc),
            'sla_compliance' => ['within' => $resolvedWithin, 'breached' => $resolvedBreached],
            'open_sla_health' => $health,
            'breaches_by_priority' => $breaches,
            'avg_resolution_days' => $avgDays,
        ];
    }

    /** Local-calendar-day start/end (YYYY-MM-DD in the caller's tz) as an app-tz datetime string, or null. */
    private static function localDayBoundary(string $ymd, bool $endOfDay, int $tzOffsetMinutes): ?string
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $ymd, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            return null;
        }
        // Epoch of local midnight = UTC midnight + (UTC − local) offset.
        $epoch = gmmktime(0, 0, 0, (int) $m[2], (int) $m[3], (int) $m[1]) + $tzOffsetMinutes * 60;
        if ($endOfDay) {
            $epoch += 86400 - 1;
        }
        return Carbon::createFromTimestamp($epoch)->toDateTimeString();
    }

    /** "y-m" (m is 0-based like JS) of an epoch in the caller's timezone. */
    private static function monthKey(int $epoch, int $tzOffsetMinutes): string
    {
        $local = $epoch - $tzOffsetMinutes * 60;
        return gmdate('Y', $local) . '-' . ((int) gmdate('n', $local) - 1);
    }

    /**
     * Monthly buckets spanning the active range (or earliest work order → now for
     * "all time"), capped to the most recent 12 months.
     * @return array{0: array<int, array{y: int, m: int}>, 1: string[]}
     */
    private static function monthBuckets(string $fromYmd, string $toYmd, ?int $minCreated, int $tzOffsetMinutes): array
    {
        $now = time();
        $parse = function (string $ymd): ?array {
            return preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $ymd, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1])
                ? [(int) $m[1], (int) $m[2] - 1] : null;
        };
        $ym = fn (int $epoch) => [(int) gmdate('Y', $epoch - $tzOffsetMinutes * 60), (int) gmdate('n', $epoch - $tzOffsetMinutes * 60) - 1];

        [$ey, $em] = $parse($toYmd) ?? $ym($now);
        if ($start = $parse($fromYmd)) {
            [$y, $m] = $start;
        } elseif ($minCreated !== null) {
            [$y, $m] = $ym($minCreated);
        } else {
            [$y, $m] = [$ey, $em - 5];
            if ($m < 0) {
                $m += 12;
                $y -= 1;
            }
        }

        $months = [];
        while (($y < $ey || ($y === $ey && $m <= $em)) && count($months) < 24) {
            $months[] = ['y' => $y, 'm' => $m];
            if (++$m > 11) {
                $m = 0;
                $y += 1;
            }
        }
        $months = count($months) > 12 ? array_slice($months, -12) : $months;
        return [$months, array_map(fn ($b) => "{$b['y']}-{$b['m']}", $months)];
    }
}
