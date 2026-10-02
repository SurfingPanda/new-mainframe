<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The Document Controller — the single active user flagged
 * users.is_document_controller. Every new 'ERP Access' work order is assigned to
 * them (TicketController::store) and the department/assignee are then locked
 * for everyone except admins. Notifications are fire-and-forget and never throw.
 */
class DocumentController
{
    /** @return array{id: int, name: string, department: ?string}|null */
    public static function current(): ?array
    {
        $row = DB::table('users')->select('id', 'name', 'department')
            ->where('is_document_controller', 1)->where('is_active', 1)->first();
        return $row ? (array) $row : null;
    }

    /** Whether $user (authUser array) may not move this work order's department/assignee. */
    public static function isLockedFor(array $user, array $ticket): bool
    {
        return ($ticket['category'] ?? null) === TicketVisibility::ERP_ACCESS && ($user['role'] ?? null) !== 'admin';
    }

    /** In-app Mailbox message (the assignee email is sent separately by TicketEmails). */
    public static function notifyAssigned(array $ticket, array $controller): void
    {
        try {
            $ref = EmailTemplates::ticketCode($ticket['id']);
            SystemMessage::send([
                'recipientId' => $controller['id'],
                'recipientName' => $controller['name'],
                'subject' => "ERP Access request — {$ref}",
                'body' => ($ticket['requester'] ?? 'Someone') . " submitted an ERP Access request, {$ref}"
                    . (!empty($ticket['title']) ? " \"{$ticket['title']}\"" : '')
                    . ", and it was assigned to you as Document Controller.\n\nOpen it to review the request.",
                'linkUrl' => "/tickets/{$ticket['id']}",
                'linkLabel' => 'Open work order',
            ]);
        } catch (\Throwable $e) {
            Log::error("[document-controller] notifyAssigned failed: {$e->getMessage()}");
        }
    }
}
