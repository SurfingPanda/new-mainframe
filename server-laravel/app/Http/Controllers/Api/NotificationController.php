<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DepartmentManagers;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Ported from server/src/routes/notifications.js — per-user notifications
 * from ticket activity, plus (for admins) pending password-reset requests.
 *
 * The chat-activity section of the Node original is dropped along with the
 * rest of the realtime/chat layer (product decision — see server-laravel/README.md).
 * `workOrders`/`workOrdersByView` are therefore ticket-activity-only here,
 * same numbers Node would produce with zero chat activity.
 */
class NotificationController extends Controller
{
    private const STATUS_LABELS = [
        'open' => 'Open', 'in_progress' => 'In Progress', 'on_hold' => 'On Hold',
        'pending' => 'Pending - Waiting for Customer', 'resolved' => 'Resolved', 'closed' => 'Closed',
    ];

    /** Turn a ticket_activity row into a human-readable notification. @return array{kind: string, message: string} */
    private function describe(object $row, array $identitySet, ?string $dept): array
    {
        $actor = $row->actor ?: 'Someone';
        $assignedToMe = $row->field === 'assignee' && $row->new_value !== null && in_array($row->new_value, $identitySet, true);
        $mine = $row->ticket_assignee !== null && in_array($row->ticket_assignee, $identitySet, true);
        $assigned = $assignedToMe || ($row->field === 'created' && $mine);

        $message = match (true) {
            $row->field === 'created' => $mine ? 'New work order assigned to you' : 'New work order in ' . ($dept ?: 'your department'),
            $row->field === 'assignee' => $assignedToMe
                ? "{$actor} assigned this work order to you"
                : ($row->new_value ? "{$actor} assigned this work order to {$row->new_value}" : "{$actor} unassigned this work order"),
            $row->type === 'note' => "{$actor} added a note",
            $row->field === 'status' => "{$actor} set status to " . (self::STATUS_LABELS[$row->new_value] ?? ($row->new_value ?: '—')),
            $row->field === 'priority' => "{$actor} set priority to " . ($row->new_value ?: '—'),
            $row->field === 'approval_requested' => "{$actor} needs your approval",
            $row->field === 'approved' => "{$actor} approved this request",
            $row->field === 'denied' => "{$actor} declined this request",
            $row->field === 'attachment_removed' => "{$actor} removed an attachment",
            $row->field === 'kb_link' => "{$actor} linked a KB article",
            $row->field === 'kb_unlink' => "{$actor} unlinked a KB article",
            !empty($row->field) => "{$actor} updated the " . str_replace('_', ' ', $row->field),
            default => "{$actor} updated this work order",
        };

        return ['kind' => $assigned ? 'assigned' : 'update', 'message' => $message];
    }

    public function index(Request $request)
    {
        $user = $request->authUser();
        $identities = array_values(array_filter([$user['name'] ?? null, $user['email'] ?? null]));
        if (!$identities) {
            return response()->json(['count' => 0, 'workOrders' => 0, 'items' => [], 'seenAt' => null]);
        }
        $dept = $user['department'] ?? null;

        $seenAt = DB::table('users')->where('id', $user['sub'])->value('notifications_seen_at');
        $seenMs = $seenAt ? strtotime((string) $seenAt) * 1000 : 0;

        $managedDepts = DepartmentManagers::managedDepartments($user['sub']);

        $rows = DB::table('ticket_activity as a')
            ->join('tickets as t', 't.id', '=', 'a.ticket_id')
            ->select('a.id', 'a.ticket_id', 'a.type', 'a.actor', 'a.field', 'a.new_value', 'a.created_at',
                't.title as ticket_title', 't.assignee as ticket_assignee', 't.requester as ticket_requester',
                't.department as ticket_department')
            ->where(function ($q) use ($identities, $dept, $managedDepts) {
                $q->whereIn('t.assignee', $identities)
                    ->orWhere(fn ($q2) => $q2->where('a.field', 'assignee')->whereIn('a.new_value', $identities));
                if ($dept) {
                    $q->orWhere('t.department', $dept);
                }
                if ($managedDepts) {
                    $q->orWhere(fn ($q2) => $q2->where('t.approval_status', 'pending')->whereIn('t.approval_dept', $managedDepts));
                }
            })
            ->where(fn ($q) => $q->whereNull('a.actor')->orWhereNotIn('a.actor', $identities))
            ->where(fn ($q) => $q->whereNull('a.field')->orWhere('a.field', '<>', 'survey_sent'))
            ->orderByDesc('a.created_at')->orderByDesc('a.id')
            ->limit(40)->get();

        $byView = ['myQueue' => 0, 'submitted' => 0, 'all' => 0];
        $items = [];
        foreach ($rows as $r) {
            ['kind' => $kind, 'message' => $message] = $this->describe($r, $identities, $dept);
            $unread = strtotime((string) $r->created_at) * 1000 > $seenMs;
            if ($unread) {
                if ($r->ticket_assignee && in_array($r->ticket_assignee, $identities, true)) {
                    $byView['myQueue']++;
                } elseif ($r->ticket_requester && in_array($r->ticket_requester, $identities, true)) {
                    $byView['submitted']++;
                } else {
                    $byView['all']++;
                }
            }
            $items[] = [
                'id' => "t-{$r->id}", 'link' => "/tickets/{$r->ticket_id}", 'ticketId' => $r->ticket_id,
                'ticketTitle' => $r->ticket_title, 'kind' => $kind, 'message' => $message,
                'actor' => $r->actor ?: null, 'createdAt' => $r->created_at, 'unread' => $unread,
            ];
        }

        // Admins also see pending password-reset requests in the bell.
        if (!empty($user['permissions']['users']['manage'])) {
            $prRows = DB::table('password_reset_requests')->select('id', 'email', 'created_at')
                ->where('status', 'pending')->orderByDesc('created_at')->limit(25)->get();
            foreach ($prRows as $r) {
                $items[] = [
                    'id' => "pr-{$r->id}", 'link' => '/users/password-resets', 'kind' => 'password_reset',
                    'message' => 'Password reset requested', 'subtitle' => $r->email,
                    'createdAt' => $r->created_at, 'unread' => strtotime((string) $r->created_at) * 1000 > $seenMs,
                ];
            }
        }

        usort($items, fn ($a, $b) => strtotime((string) $b['createdAt']) <=> strtotime((string) $a['createdAt']));

        return response()->json([
            'seenAt' => $seenAt,
            'count' => count(array_filter($items, fn ($i) => $i['unread'])),
            'workOrders' => count(array_filter($items, fn ($i) => $i['unread'] && !empty($i['ticketId']))),
            'workOrdersByView' => $byView,
            'items' => array_values($items),
        ]);
    }

    public function seen(Request $request)
    {
        $now = now();
        DB::table('users')->where('id', $request->authUser()['sub'])->update(['notifications_seen_at' => $now]);
        return response()->json(['ok' => true, 'seenAt' => $now->toIso8601String()]);
    }
}
