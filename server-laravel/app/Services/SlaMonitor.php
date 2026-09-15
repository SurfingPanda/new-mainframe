<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * SLA breach monitor — ported from server/src/lib/sla-monitor.js. Detects
 * response/resolution SLA breaches on open work orders and escalates them by
 * firing the automation engine's sla.* triggers (declarative escalation:
 * admins write automation rules — reassign, bump priority, notify).
 *
 * Each clock breaches at most once: a marker column is set atomically
 * (UPDATE ... WHERE col IS NULL), so a concurrent/overlapping run can't
 * double-fire. HR Concerns are excluded (their targets aren't routed until
 * approved). Self-contained and never throws.
 *
 * Node runs this on an in-process setInterval (lib/job-lock.js guards
 * multi-instance overlap). This port drops the in-process timer — it's
 * invoked instead by a Hostinger cron job hitting a secret-gated HTTP
 * endpoint or the `php artisan sla:monitor` console command (both call
 * self::run(), see routes/uploads.php-style cron.php and
 * app/Console/Commands/RunSlaMonitor.php) — JobLock still guards a single
 * run against itself if two triggers overlap.
 */
class SlaMonitor
{
    private const SYSTEM_ACTOR = 'System';

    /** Atomically claim a breach: true only for the run that flips the marker. */
    private static function claimBreach(int $ticketId, string $column): bool
    {
        $affected = DB::table('tickets')->where('id', $ticketId)->whereNull($column)->update([$column => now()]);
        return $affected > 0;
    }

    private static function logBreach(int $ticketId, string $kind): void
    {
        DB::table('ticket_activity')->insert([
            'ticket_id' => $ticketId, 'type' => 'change', 'actor' => self::SYSTEM_ACTOR,
            'field' => 'sla_breach', 'new_value' => $kind, 'created_at' => now(),
        ]);
    }

    public static function run(): int
    {
        return JobLock::run('sla-monitor', fn () => self::doRun()) ?? 0;
    }

    private static function doRun(): int
    {
        try {
            $tickets = DB::table('tickets')
                ->select(
                    'id', 'title', 'priority', 'status', 'request_type', 'category', 'department', 'requester', 'assignee',
                    'created_at', 'updated_at', 'first_responded_at',
                    'sla_response_minutes', 'sla_resolution_minutes', 'sla_calendar_id',
                    'sla_response_breached_at', 'sla_resolution_breached_at'
                )
                ->whereNotIn('status', ['resolved', 'closed', 'cancelled'])
                ->where(fn ($q) => $q->whereNull('category')->orWhere('category', '<>', TicketVisibility::HR_CONCERNS))
                ->where(fn ($q) => $q->whereNull('sla_response_breached_at')->orWhereNull('sla_resolution_breached_at'))
                ->get()
                ->map(fn ($r) => (array) $r)
                ->all();

            if (!$tickets) {
                return 0;
            }

            $ids = array_column($tickets, 'id');
            $changes = DB::table('ticket_activity')
                ->select('ticket_id', 'field', 'old_value', 'new_value', 'created_at')
                ->whereIn('ticket_id', $ids)->where('type', 'change')->where('field', 'status')
                ->orderBy('created_at')
                ->get();
            $byTicket = [];
            foreach ($changes as $c) {
                $byTicket[$c->ticket_id][] = (array) $c;
            }

            $fired = 0;
            foreach ($tickets as $t) {
                $s = Sla::standing($t, $byTicket[$t['id']] ?? []);
                if (!$s) {
                    continue;
                }

                if (($s['resolution']['breached'] ?? false) && !$t['sla_resolution_breached_at']
                    && self::claimBreach($t['id'], 'sla_resolution_breached_at')) {
                    self::logBreach($t['id'], 'resolution');
                    Automation::run('sla.resolution_breached', $t);
                    $fired++;
                }
                if (($s['response']['breached'] ?? false) && !$t['sla_response_breached_at']
                    && self::claimBreach($t['id'], 'sla_response_breached_at')) {
                    self::logBreach($t['id'], 'response');
                    Automation::run('sla.response_breached', $t);
                    $fired++;
                }
            }

            if ($fired) {
                Log::info("[sla-monitor] escalated {$fired} SLA breach(es)");
            }
            return $fired;
        } catch (\Throwable $e) {
            Log::error("[sla-monitor] run failed: {$e->getMessage()}");
            return 0;
        }
    }
}
