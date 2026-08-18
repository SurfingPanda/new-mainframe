<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * In-app Mailbox notifications for the 'HR Concerns' manager-approval
 * workflow — ported from server/src/lib/hr-approval.js. All methods are
 * fire-and-forget and never throw.
 */
class HrApproval
{
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

    /** Tell a department manager a request is waiting for their approval. */
    public static function notifyApprovalRequested(array $ticket, array $manager): void
    {
        try {
            if (empty($manager['id'])) {
                return;
            }
            $ref = EmailTemplates::ticketCode($ticket['id']);
            SystemMessage::send([
                'recipientId' => $manager['id'],
                'recipientName' => $manager['name'],
                'subject' => "Approval needed — {$ref}",
                'body' => "{$ticket['requester']} submitted an HR request, {$ref}" . (!empty($ticket['title']) ? " \"{$ticket['title']}\"" : '') . ", "
                    . "that needs your approval before it goes to HR.\n\nReview it and approve or decline.",
                'linkUrl' => "/tickets/{$ticket['id']}",
                'linkLabel' => 'Review request',
            ]);
        } catch (\Throwable $e) {
            Log::error("[hr-approval] notifyApprovalRequested failed: {$e->getMessage()}");
        }
    }

    /**
     * An HR concern was routed to the HR department. Notify HR: in-app
     * Mailbox to every active HR member, plus a content-light email to the HR
     * department manager as the single triage owner (falls back to all HR
     * members when no manager is set).
     */
    public static function notifyHrRoutedToTeam(array $ticket): void
    {
        try {
            if (empty($ticket['id'])) {
                return;
            }
            $hr = DB::table('departments')->select('name', 'manager_id')->where('is_hr', 1)->where('is_active', 1)->first();
            if (!$hr?->name) {
                return;
            }

            $members = DB::table('users')->select('id', 'name', 'email')->where('is_active', 1)->where('department', $hr->name)->get();
            if ($members->isEmpty()) {
                return;
            }

            $ref = EmailTemplates::ticketCode($ticket['id']);
            $link = "/tickets/{$ticket['id']}";

            foreach ($members as $m) {
                SystemMessage::send([
                    'recipientId' => $m->id,
                    'recipientName' => $m->name,
                    'subject' => "New HR request — {$ref}",
                    'body' => "An HR request ({$ref}) was approved and routed to {$hr->name} for review.\n\n"
                        . 'Open it in Hubly to view the details and pick it up.',
                    'linkUrl' => $link,
                    'linkLabel' => 'Open request',
                ]);
            }

            $manager = $hr->manager_id ? $members->firstWhere('id', $hr->manager_id) : null;
            $emailTargets = $manager ? collect([$manager]) : $members;
            foreach ($emailTargets as $t) {
                if ($t->email) {
                    Mailer::sendSafe(array_merge(['to' => $t->email], EmailTemplates::hrConcernRouted($ref, Mailer::appUrl($link))));
                }
            }
        } catch (\Throwable $e) {
            Log::error("[hr-approval] notifyHrRoutedToTeam failed: {$e->getMessage()}");
        }
    }

    /** Tell the requester their request was approved (routed to HR) or denied. */
    public static function notifyApprovalDecision(array $ticket, string $decision, ?string $reason = null, ?string $hrName = null): void
    {
        try {
            $requester = self::resolveUser($ticket['requester'] ?? null);
            if (!$requester) {
                return;
            }
            $ref = EmailTemplates::ticketCode($ticket['id']);
            $approved = $decision === 'approved';
            $approverName = $ticket['approver_name'] ?? null;
            SystemMessage::send([
                'recipientId' => $requester['id'],
                'recipientName' => $requester['name'],
                'subject' => $approved ? "Approved — {$ref}" : "Declined — {$ref}",
                'body' => $approved
                    ? "Your HR request {$ref}" . (!empty($ticket['title']) ? " \"{$ticket['title']}\"" : '') . ' was approved'
                        . ($approverName ? " by {$approverName}" : '') . ' and forwarded to ' . ($hrName ?: 'HR') . '.'
                    : "Your HR request {$ref}" . (!empty($ticket['title']) ? " \"{$ticket['title']}\"" : '') . ' was declined'
                        . ($approverName ? " by {$approverName}" : '') . '.' . ($reason ? "\n\nReason: {$reason}" : ''),
                'linkUrl' => "/tickets/{$ticket['id']}",
                'linkLabel' => 'View request',
            ]);
        } catch (\Throwable $e) {
            Log::error("[hr-approval] notifyApprovalDecision failed: {$e->getMessage()}");
        }
    }
}
