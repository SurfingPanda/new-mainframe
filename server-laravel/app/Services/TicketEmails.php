<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Higher-level ticket/asset-request email notifiers — ported from
 * server/src/lib/ticket-emails.js. Every method is guaranteed not to throw.
 */
class TicketEmails
{
    private const EMAIL_RE = '/^[^\s@]+@[^\s@]+\.[^\s@]+$/';

    /**
     * tickets.requester/assignee are free-text (a display name OR an email).
     * Resolve to a real address via the users table; fall back to the raw
     * value only if it already looks like an email.
     */
    private static function resolveEmail(mixed $identity): ?string
    {
        $value = trim((string) ($identity ?? ''));
        if (!$value) {
            return null;
        }
        $email = DB::table('users')->where('is_active', 1)
            ->where(fn ($q) => $q->where('email', strtolower($value))->orWhere('name', $value))
            ->value('email');
        if ($email) {
            return $email;
        }
        return preg_match(self::EMAIL_RE, $value) ? $value : null;
    }

    private static function sameIdentity(mixed $a, mixed $b): bool
    {
        if (!$a || !$b) {
            return false;
        }
        return strtolower(trim((string) $a)) === strtolower(trim((string) $b));
    }

    public static function notifyTicketCreated(array $ticket, ?string $actor): void
    {
        try {
            $t = array_merge($ticket, ['url' => Mailer::appUrl("/tickets/{$ticket['id']}")]);
            $reqEmail = self::resolveEmail($ticket['requester'] ?? null);
            if ($reqEmail) {
                Mailer::sendSafe(array_merge(['to' => $reqEmail], EmailTemplates::ticketCreated($t)));
            }
            if (!empty($ticket['assignee']) && !self::sameIdentity($ticket['assignee'], $actor)) {
                $asgEmail = self::resolveEmail($ticket['assignee']);
                if ($asgEmail && $asgEmail !== $reqEmail) {
                    Mailer::sendSafe(array_merge(['to' => $asgEmail], EmailTemplates::ticketAssigned($t)));
                }
            }
        } catch (\Throwable $e) {
            Log::error("[ticket-emails] created notify failed: {$e->getMessage()}");
        }
    }

    /** @param array{field: string, oldValue: mixed, newValue: mixed}[] $changes */
    public static function notifyTicketChanges(array $ticket, array $changes, ?string $actor): void
    {
        try {
            $t = array_merge($ticket, ['url' => Mailer::appUrl("/tickets/{$ticket['id']}")]);
            foreach ($changes as $c) {
                if ($c['field'] === 'status' && !self::sameIdentity($ticket['requester'] ?? null, $actor)) {
                    $reqEmail = self::resolveEmail($ticket['requester'] ?? null);
                    if ($reqEmail) {
                        Mailer::sendSafe(array_merge(['to' => $reqEmail], EmailTemplates::ticketStatusChanged($t, $c['oldValue'] ?? null, $c['newValue'] ?? null)));
                    }
                } elseif ($c['field'] === 'assignee' && !empty($c['newValue']) && !self::sameIdentity($c['newValue'], $actor)) {
                    $asgEmail = self::resolveEmail($c['newValue']);
                    if ($asgEmail) {
                        Mailer::sendSafe(array_merge(['to' => $asgEmail], EmailTemplates::ticketAssigned($t)));
                    }
                }
            }
        } catch (\Throwable $e) {
            Log::error("[ticket-emails] change notify failed: {$e->getMessage()}");
        }
    }

    public static function notifyTicketNote(array $ticket, string $body, ?string $actor): void
    {
        try {
            $t = array_merge($ticket, ['url' => Mailer::appUrl("/tickets/{$ticket['id']}")]);
            $recipients = [];
            foreach ([$ticket['requester'] ?? null, $ticket['assignee'] ?? null] as $identity) {
                if ($identity && !self::sameIdentity($identity, $actor)) {
                    $email = self::resolveEmail($identity);
                    if ($email) {
                        $recipients[$email] = true;
                    }
                }
            }
            foreach (array_keys($recipients) as $to) {
                Mailer::sendSafe(array_merge(['to' => $to], EmailTemplates::ticketNote($t, $body, $actor)));
            }
        } catch (\Throwable $e) {
            Log::error("[ticket-emails] note notify failed: {$e->getMessage()}");
        }
    }

    public static function notifyAssetRequestDecision(array $request, ?string $actor): void
    {
        try {
            $email = null;
            if (!empty($request['requester_id'])) {
                $email = DB::table('users')->where('id', $request['requester_id'])->where('is_active', 1)->value('email');
            }
            if (!$email) {
                $email = self::resolveEmail($request['requester_name'] ?? null);
            }
            if ($email && !self::sameIdentity($email, $actor)) {
                Mailer::sendSafe(array_merge(['to' => $email], EmailTemplates::assetRequestDecision($request)));
            }
        } catch (\Throwable $e) {
            Log::error("[ticket-emails] asset-request notify failed: {$e->getMessage()}");
        }
    }
}
