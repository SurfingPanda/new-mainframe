<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * SLA "at risk" (75%) warnings and breach notices, sent by SlaMonitor once
 * per clock per work order. Recipients: the assignee and the manager of the
 * department the work order is routed to (deduped — a manager who is also
 * the assignee gets one copy). Each recipient always gets a Mailbox message;
 * the email is skipped if they turned off `notifications.email_sla_alerts`
 * in Settings. Never throws.
 */
class SlaAlerts
{
    /** Share of a clock's target that triggers the "at risk" warning. */
    public const WARN_RATIO = 0.75;

    /**
     * @param string $clock    'response' | 'resolution'
     * @param string $kind     'warning' | 'breach'
     * @param array  $standing that clock's Sla::standing() entry
     */
    public static function notify(array $ticket, string $clock, string $kind, array $standing): int
    {
        try {
            $recipients = [];
            $assignee = self::activeUser($ticket['assignee'] ?? null);
            if ($assignee) {
                $recipients[$assignee->id] = ['user' => $assignee, 'asManager' => false];
            }
            $manager = DepartmentManagers::managerOfDepartment($ticket['department'] ?? null);
            if ($manager && !isset($recipients[$manager['id']])) {
                $row = DB::table('users')->select('id', 'name', 'email', 'preferences')
                    ->where('id', $manager['id'])->where('is_active', 1)->first();
                if ($row) {
                    $recipients[$row->id] = ['user' => $row, 'asManager' => true];
                }
            }
            if (!$recipients) {
                return 0;
            }

            $code = EmailTemplates::ticketCode($ticket['id']);
            $url = Mailer::appUrl("/tickets/{$ticket['id']}");
            $t = array_merge($ticket, ['url' => $url]);
            $sent = 0;

            foreach ($recipients as $r) {
                $u = $r['user'];
                $mail = EmailTemplates::slaAlert($t, $clock, $kind, $standing, $u->name, $r['asManager']);

                SystemMessage::send([
                    'recipientId' => $u->id,
                    'recipientName' => $u->name,
                    'subject' => $mail['subject'],
                    'body' => self::plainIntro($mail['text']),
                    'linkUrl' => "/tickets/{$ticket['id']}",
                    'linkLabel' => "Open {$code}",
                ]);

                if ($u->email && self::wantsEmail($u->preferences ?? null)) {
                    Mailer::sendSafe(array_merge(['to' => $u->email], $mail));
                }
                $sent++;
            }
            return $sent;
        } catch (\Throwable $e) {
            Log::error("[sla-alerts] {$kind}/{$clock} notify for ticket {$ticket['id']} failed: {$e->getMessage()}");
            return 0;
        }
    }

    /**
     * tickets.assignee is free text (a display name OR an email) — resolve it
     * to an active user, same rule as TicketEmails::resolveEmail.
     */
    private static function activeUser(mixed $identity): ?object
    {
        $value = trim((string) ($identity ?? ''));
        if ($value === '') {
            return null;
        }
        return DB::table('users')->select('id', 'name', 'email', 'preferences')
            ->where('is_active', 1)
            ->where(fn ($q) => $q->where('email', strtolower($value))->orWhere('name', $value))
            ->first();
    }

    /** Opt-out: missing/unset preference means yes (matches the Settings default). */
    private static function wantsEmail(mixed $raw): bool
    {
        $prefs = is_string($raw) ? json_decode($raw, true) : $raw;
        return ($prefs['notifications']['email_sla_alerts'] ?? true) !== false;
    }

    /** The Mailbox copy: greeting + the one-line summary, without the details dump. */
    private static function plainIntro(string $text): string
    {
        $parts = explode("\n\n", $text);
        return implode("\n\n", array_slice($parts, 0, 2));
    }
}
