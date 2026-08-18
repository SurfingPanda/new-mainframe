<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Post-resolution technician survey invite — ported from
 * server/src/lib/resolution-survey.js. When a work order is marked resolved,
 * drops a system message into the requester's Mailbox inviting them to rate
 * the technician. Guaranteed not to throw.
 *
 * Bug fix vs. Node original: resolution-survey.js references an undefined
 * `SYSTEM_SENDER_NAME` when logging the 'survey_sent' ticket_activity row (not
 * imported/defined in that file) — a ReferenceError that's silently swallowed
 * by the surrounding try/catch, so the Mailbox message still sends but the
 * timeline entry never gets recorded. Ported here using the same literal
 * ('Hubly') that server/src/lib/system-message.js's SENDER_NAME actually is.
 */
class ResolutionSurvey
{
    private static function formatTicketId(mixed $id): string
    {
        return 'WO' . str_pad((string) ($id ?? 0), 8, '0', STR_PAD_LEFT);
    }

    private static function resolveUser(mixed $identity): ?array
    {
        $value = trim((string) ($identity ?? ''));
        if (!$value) {
            return null;
        }
        $row = DB::table('users')->select('id', 'name')->where('is_active', 1)
            ->where(fn ($q) => $q->where('email', strtolower($value))->orWhere('name', $value))
            ->first();
        return $row ? (array) $row : null;
    }

    /** No-op when the transition doesn't qualify or a survey for this ticket already exists. */
    public static function maybeSend(array $ticket, ?string $previousStatus): void
    {
        try {
            if (($ticket['status'] ?? null) !== 'resolved') {
                return;
            }
            if ($previousStatus === 'resolved') {
                return; // not a fresh transition
            }
            if (empty($ticket['assignee'])) {
                return; // nothing/nobody to rate
            }

            if (DB::table('ticket_surveys')->where('ticket_id', $ticket['id'])->exists()) {
                return;
            }

            $respondent = self::resolveUser($ticket['requester'] ?? null);
            if (!$respondent) {
                return; // requester isn't a registered user — no mailbox
            }

            $technician = self::resolveUser($ticket['assignee']);
            if ($technician && $technician['id'] === $respondent['id']) {
                return; // don't ask someone to rate themselves
            }

            DB::table('ticket_surveys')->insert([
                'ticket_id' => $ticket['id'],
                'technician' => $ticket['assignee'],
                'technician_id' => $technician['id'] ?? null,
                'respondent_id' => $respondent['id'],
                'respondent_name' => $respondent['name'],
                'created_at' => now(),
            ]);

            $ref = self::formatTicketId($ticket['id']);
            $subject = "How did we do? — {$ref} resolved";
            $body = "Your work order {$ref}" . (!empty($ticket['title']) ? " \"{$ticket['title']}\"" : '') . ' has been resolved by '
                . "{$ticket['assignee']}.\n\nWe'd love your feedback. Please take a moment to rate your "
                . 'technician — it only takes a few seconds.';

            SystemMessage::send([
                'recipientId' => $respondent['id'],
                'recipientName' => $respondent['name'],
                'subject' => $subject,
                'body' => $body,
                'linkUrl' => "/survey/{$ticket['id']}",
                'linkLabel' => 'Rate your technician',
            ]);

            DB::table('ticket_activity')->insert([
                'ticket_id' => $ticket['id'], 'type' => 'change', 'actor' => 'Hubly',
                'field' => 'survey_sent', 'new_value' => mb_substr($respondent['name'], 0, 500),
                'created_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::error("[resolution-survey] failed: {$e->getMessage()}");
        }
    }
}
