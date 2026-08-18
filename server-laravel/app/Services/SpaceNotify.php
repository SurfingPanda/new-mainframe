<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Spaces → Mailbox notifications — ported from server/src/lib/space-notify.js.
 * Every method is fire-and-forget and guaranteed not to throw. The daily
 * due/overdue digest (runDueReminders) drops Node's in-process
 * `startSpaceDueReminders` setInterval in favor of the same cron-trigger
 * pattern as SlaMonitor (see app/Console/Commands/RunSpaceDueReminders.php
 * and routes/cron.php), guarded by the same JobLock.
 */
class SpaceNotify
{
    private static function activeUser(mixed $userId): ?array
    {
        $id = SpacesHelpers::intId($userId);
        if (!$id) {
            return null;
        }
        $row = DB::table('users')->select('id', 'name', 'email')->where('id', $id)->where('is_active', 1)->first();
        return $row ? (array) $row : null;
    }

    private static function itemLink(array $space, array $item): string
    {
        return "/spaces/{$space['id']}?item={$item['id']}";
    }

    /** An item was assigned to someone. No-op if there's no assignee or they assigned it to themselves. */
    public static function notifyItemAssigned(array $space, array $item, ?int $assigneeId, array $actor): void
    {
        try {
            if (!$assigneeId || $assigneeId === ($actor['sub'] ?? null)) {
                return;
            }
            $recipient = self::activeUser($assigneeId);
            if (!$recipient) {
                return;
            }
            SystemMessage::send([
                'recipientId' => $recipient['id'], 'recipientName' => $recipient['name'],
                'subject' => "You were assigned {$item['item_key']}",
                'body' => ($actor['name'] ?? 'Someone') . " assigned {$item['item_key']} \"{$item['title']}\" to you in the {$space['name']} space.",
                'linkUrl' => self::itemLink($space, $item), 'linkLabel' => 'View item',
            ]);
            if (!empty($recipient['email'])) {
                Mailer::sendSafe(array_merge(
                    ['to' => $recipient['email']],
                    EmailTemplates::spaceItemAssigned($item, $space, Mailer::appUrl(self::itemLink($space, $item)))
                ));
            }
        } catch (\Throwable $e) {
            Log::error("[space-notify] item-assigned failed: {$e->getMessage()}");
        }
    }

    /** Someone commented on an item — notify its assignee (unless they wrote it). */
    public static function notifyItemComment(array $space, array $item, int $commenterId, ?string $commenterName): void
    {
        try {
            if (empty($item['assignee_id']) || (int) $item['assignee_id'] === $commenterId) {
                return;
            }
            $recipient = self::activeUser($item['assignee_id']);
            if (!$recipient) {
                return;
            }
            SystemMessage::send([
                'recipientId' => $recipient['id'], 'recipientName' => $recipient['name'],
                'subject' => "New comment on {$item['item_key']}",
                'body' => ($commenterName ?: 'Someone') . " commented on {$item['item_key']} \"{$item['title']}\" in the {$space['name']} space.",
                'linkUrl' => self::itemLink($space, $item), 'linkLabel' => 'View item',
            ]);
        } catch (\Throwable $e) {
            Log::error("[space-notify] item-comment failed: {$e->getMessage()}");
        }
    }

    /** A user asked to join a space — notify every owner (except the requester). */
    public static function notifyJoinRequested(array $space, array $requester): void
    {
        try {
            $owners = DB::table('space_members')->select('user_id')->where('space_id', $space['id'])->where('role', 'owner')->get();
            foreach ($owners as $o) {
                if ((int) $o->user_id === (int) $requester['id']) {
                    continue;
                }
                $recipient = self::activeUser($o->user_id);
                if (!$recipient) {
                    continue;
                }
                SystemMessage::send([
                    'recipientId' => $recipient['id'], 'recipientName' => $recipient['name'],
                    'subject' => "Join request for {$space['name']}",
                    'body' => ($requester['name'] ?? 'Someone') . " requested to join the {$space['name']} space. Review pending requests in the Members tab.",
                    'linkUrl' => "/spaces/{$space['id']}?view=members", 'linkLabel' => 'Review request',
                ]);
                if (!empty($recipient['email'])) {
                    Mailer::sendSafe(array_merge(
                        ['to' => $recipient['email']],
                        EmailTemplates::spaceJoinRequest($space, $requester, Mailer::appUrl("/spaces/{$space['id']}?view=members"))
                    ));
                }
            }
        } catch (\Throwable $e) {
            Log::error("[space-notify] join-requested failed: {$e->getMessage()}");
        }
    }

    /** An owner approved or denied a join request — tell the requester. */
    public static function notifyJoinDecision(array $space, int $userId, string $decision, ?array $actor): void
    {
        try {
            $recipient = self::activeUser($userId);
            if (!$recipient) {
                return;
            }
            $approved = $decision === 'approved';
            SystemMessage::send([
                'recipientId' => $recipient['id'], 'recipientName' => $recipient['name'],
                'subject' => "Your request to join {$space['name']} was " . ($approved ? 'approved' : 'declined'),
                'body' => $approved
                    ? (($actor['name'] ?? 'An owner') . " approved your request to join the {$space['name']} space. You now have access to its board, documents, and goals.")
                    : "Your request to join the {$space['name']} space was declined.",
                'linkUrl' => $approved ? "/spaces/{$space['id']}" : '/spaces',
                'linkLabel' => $approved ? 'Open space' : 'Browse spaces',
            ]);
        } catch (\Throwable $e) {
            Log::error("[space-notify] join-decision failed: {$e->getMessage()}");
        }
    }

    // --- Daily due/overdue reminders ---------------------------------------

    public static function runDueReminders(): int
    {
        return JobLock::run('space-due-reminders', fn () => self::doRunDueReminders()) ?? 0;
    }

    private static function doRunDueReminders(): int
    {
        try {
            $rows = DB::select(
                "SELECT i.id, i.item_key, i.title, i.space_id, i.assignee_id,
                        DATE_FORMAT(i.due_at, '%Y-%m-%d') AS due,
                        (i.due_at < CURDATE()) AS overdue,
                        s.name AS space_name, u.name AS assignee_name
                   FROM space_items i
                   JOIN spaces s ON s.id = i.space_id
                   JOIN users  u ON u.id = i.assignee_id AND u.is_active = 1
                  WHERE i.status <> 'done'
                    AND i.due_at IS NOT NULL
                    AND i.due_at <= CURDATE()
                    AND (i.due_reminded_at IS NULL OR i.due_reminded_at < CURDATE())
                  ORDER BY i.assignee_id, i.due_at ASC, i.id ASC"
            );
            if (!$rows) {
                return 0;
            }

            $byUser = [];
            foreach ($rows as $r) {
                $byUser[$r->assignee_id][] = $r;
            }

            $sent = 0;
            foreach ($byUser as $userId => $items) {
                try {
                    $overdue = count(array_filter($items, fn ($i) => (int) $i->overdue === 1));
                    $name = $items[0]->assignee_name;
                    $lines = array_map(fn ($i) => "• {$i->item_key} \"{$i->title}\" — "
                        . ((int) $i->overdue === 1 ? "overdue since {$i->due}" : 'due today') . " ({$i->space_name})", array_slice($items, 0, 10));
                    $extra = count($items) > 10 ? "\n…and " . (count($items) - 10) . ' more.' : '';
                    $count = count($items);
                    $subject = "{$count} work item" . ($count === 1 ? '' : 's') . ' ' . ($overdue ? 'due or overdue' : 'due today');
                    $firstName = $name ? explode(' ', $name)[0] : 'there';
                    $body = "Hi {$firstName},\n\n"
                        . "You have {$count} space work item" . ($count === 1 ? '' : 's') . " that need attention:\n\n"
                        . implode("\n", $lines) . $extra;
                    $single = $count === 1;

                    SystemMessage::send([
                        'recipientId' => $userId, 'recipientName' => $name, 'subject' => $subject, 'body' => $body,
                        'linkUrl' => $single ? "/spaces/{$items[0]->space_id}?item={$items[0]->id}" : '/dashboard',
                        'linkLabel' => $single ? 'View item' : 'View on Overview',
                    ]);
                    DB::table('space_items')->whereIn('id', array_map(fn ($i) => $i->id, $items))->update(['due_reminded_at' => now()->toDateString()]);
                    $sent++;
                } catch (\Throwable $e) {
                    Log::error("[space-due] reminder for user {$userId} failed: {$e->getMessage()}");
                }
            }
            return $sent;
        } catch (\Throwable $e) {
            Log::error("[space-due] run failed: {$e->getMessage()}");
            return 0;
        }
    }
}
