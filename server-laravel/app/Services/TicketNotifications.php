<?php

namespace App\Services;

/**
 * Ticket-route side effects — thin delegation layer to the real services now
 * that email/mailbox/automation have all landed. Kept as a separate class
 * (rather than inlining these calls into TicketController) purely to
 * preserve the original stub-layer structure from Phase 2 — TicketController
 * has never needed to change as each dependency came online.
 *
 * Only `emitTicketNotifications` (Socket.IO realtime push) stays a no-op —
 * dropped per product decision (no realtime layer on shared hosting);
 * notifications remain pollable via routes/notifications.js.
 */
class TicketNotifications
{
    public static function notifyTicketCreated(array $ticket, ?string $actor): void
    {
        TicketEmails::notifyTicketCreated($ticket, $actor);
    }

    /** @param array{field: string, oldValue: mixed, newValue: mixed}[] $changes */
    public static function notifyTicketChanges(array $ticket, array $changes, ?string $actor): void
    {
        TicketEmails::notifyTicketChanges($ticket, $changes, $actor);
    }

    public static function notifyApprovalRequested(array $ticket, array $manager): void
    {
        HrApproval::notifyApprovalRequested($ticket, $manager);
    }

    public static function notifyApprovalDecision(array $ticket, string $decision, ?string $reason = null, ?string $hrName = null): void
    {
        HrApproval::notifyApprovalDecision($ticket, $decision, $reason, $hrName);
    }

    public static function notifyHrRoutedToTeam(array $ticket): void
    {
        HrApproval::notifyHrRoutedToTeam($ticket);
    }

    public static function emitTicketNotifications(array $ticket, array $changes): void
    {
        // Socket.IO push dropped per product decision; polling-based notifications
        // come from routes/notifications.js.
    }

    public static function maybeSendResolutionSurvey(array $ticket, ?string $previousStatus): void
    {
        ResolutionSurvey::maybeSend($ticket, $previousStatus);
    }

    public static function runAutomations(string $trigger, array $ticket, array $context = []): void
    {
        Automation::run($trigger, $ticket, $context);
    }

    /** Ported call site from routes/asset-requests.js. */
    public static function notifyAssetRequestDecision(array $assetRequest, ?string $actor): void
    {
        TicketEmails::notifyAssetRequestDecision($assetRequest, $actor);
    }
}
