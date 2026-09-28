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
 * double-fire. The same pattern gives each clock one "at risk" warning once
 * it has used SlaAlerts::WARN_RATIO (75%) of its target
 * (sla_*_warned_at). Warnings and breaches both notify the assignee and the
 * routed department's manager via SlaAlerts (email + Mailbox). HR Concerns are excluded (their targets aren't routed until
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

    /** Atomically claim a breach/warning: true only for the run that flips the marker. */
    private static function claimBreach(int $ticketId, string $column): bool
    {
        $affected = DB::table('tickets')->where('id', $ticketId)->whereNull($column)->update([$column => now()]);
        return $affected > 0;
    }

    /** $field = 'sla_breach' | 'sla_warning'; $clock = 'response' | 'resolution'. */
    private static function logBreach(int $ticketId, string $clock, string $field = 'sla_breach'): void
    {
        DB::table('ticket_activity')->insert([
            'ticket_id' => $ticketId, 'type' => 'change', 'actor' => self::SYSTEM_ACTOR,
            'field' => $field, 'new_value' => $clock, 'created_at' => now(),
        ]);
    }

    /** Past the warning threshold but not yet breached. */
    private static function atRisk(?array $clock): bool
    {
        return $clock && empty($clock['breached']) && empty($clock['met'])
            && $clock['target'] > 0 && $clock['elapsed'] >= $clock['target'] * SlaAlerts::WARN_RATIO;
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
                    'sla_response_breached_at', 'sla_resolution_breached_at',
                    'sla_response_warned_at', 'sla_resolution_warned_at'
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
            $warned = 0;
            foreach ($tickets as $t) {
                $s = Sla::standing($t, $byTicket[$t['id']] ?? []);
                if (!$s) {
                    continue;
                }

                foreach (['resolution', 'response'] as $clock) {
                    $standing = $s[$clock] ?? null;
                    if (!$standing) {
                        continue;
                    }
                    $breachCol = "sla_{$clock}_breached_at";
                    $warnCol = "sla_{$clock}_warned_at";

                    if (!empty($standing['breached']) && !$t[$breachCol] && self::claimBreach($t['id'], $breachCol)) {
                        self::logBreach($t['id'], $clock);
                        Automation::run("sla.{$clock}_breached", $t);
                        SlaAlerts::notify($t, $clock, 'breach', $standing);
                        $fired++;
                    } elseif (self::atRisk($standing) && !$t[$warnCol] && self::claimBreach($t['id'], $warnCol)) {
                        self::logBreach($t['id'], $clock, 'sla_warning');
                        SlaAlerts::notify($t, $clock, 'warning', $standing);
                        $warned++;
                    }
                }
            }

            if ($fired || $warned) {
                Log::info("[sla-monitor] escalated {$fired} SLA breach(es), sent {$warned} at-risk warning(s)");
            }
            return $fired + $warned;
        } catch (\Throwable $e) {
            Log::error("[sla-monitor] run failed: {$e->getMessage()}");
            return 0;
        }
    }
}
