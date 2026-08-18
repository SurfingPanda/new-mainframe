<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Shared helper for system ("Hubly") Mailbox messages — ported from
 * server/src/lib/system-message.js. Centralizes the INSERT so one place owns
 * the column set + length clamping. Node also pushes a Socket.IO 'mail'
 * signal here; that's dropped along with the rest of the realtime layer (see
 * TicketNotifications::emitTicketNotifications) — recipients pick up new mail
 * on the next /api/messages/unread-count poll instead.
 */
class SystemMessage
{
    private const SENDER_ID = 0;
    private const SENDER_NAME = 'Hubly';
    private const SUBJECT_MAX = 200;
    private const BODY_MAX = 5000;

    public static function send(array $params): void
    {
        DB::table('messages')->insert([
            'sender_id' => self::SENDER_ID,
            'sender_name' => self::SENDER_NAME,
            'recipient_id' => $params['recipientId'],
            'recipient_name' => $params['recipientName'],
            'subject' => mb_substr((string) ($params['subject'] ?? ''), 0, self::SUBJECT_MAX),
            'body' => mb_substr((string) ($params['body'] ?? ''), 0, self::BODY_MAX),
            'link_url' => $params['linkUrl'] ?? null,
            'link_label' => $params['linkLabel'] ?? null,
            'created_at' => now(),
        ]);
    }
}
