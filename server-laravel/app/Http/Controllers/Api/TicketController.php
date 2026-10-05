<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DepartmentManagers;
use App\Services\DocumentController;
use App\Services\Sla;
use App\Services\SlaPolicies;
use App\Services\TicketNotifications;
use App\Services\TicketReports;
use App\Services\TicketTaxonomy;
use App\Services\TicketVisibility as TV;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Ported from server/src/routes/tickets.js (phase 2 — core ticketing). Side
 * effects deferred to later phases (email, mailbox, automation, realtime) are
 * routed through App\Services\TicketNotifications — see its docblock.
 */
class TicketController extends Controller
{
    public const ALLOWED_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
    public const ALLOWED_STATUSES = ['open', 'in_progress', 'on_hold', 'pending', 'resolved', 'closed', 'cancelled'];
    // Request types + categories are admin-editable — see App\Services\TicketTaxonomy.

    private const ALLOWED_MIME = [
        'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic',
        'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/zip',
    ];
    private const MAX_FILE_BYTES = 10 * 1024 * 1024;
    private const MAX_FILES = 5;

    private const LIST_COLUMNS = 'id, title, description, status, priority, request_type, category, subcategory, subcategory2, department,
              requester, assignee, asset_id, approval_status, approval_dept, created_at, updated_at,
              first_responded_at, sla_response_minutes, sla_resolution_minutes, sla_calendar_id';

    private const ROW_COLUMNS = 'id, title, description, status, priority, request_type, category, subcategory, subcategory2, department,
              requester, assignee, asset_id, overtime_report, created_at, updated_at';

    private const DETAIL_COLUMNS = 'id, title, description, status, priority, request_type, category, subcategory, subcategory2, department,
              requester, assignee, asset_id, overtime_report,
              approval_status, approval_dept, approver_name, approver_signature_url, approval_note, approval_decided_at,
              created_at, updated_at';

    // --- Per-record access -------------------------------------------------

    /**
     * Read policy: any signed-in user may VIEW any ordinary work order. 'HR
     * Concerns' are need-to-know only: requester/assignee, the manager
     * approving it, HR staff once routed, and admin/agent.
     */
    private function canReadTicket(?array $user, array $ticket): bool
    {
        if (!$user) {
            return false;
        }
        if (($ticket['category'] ?? null) !== TV::HR_CONCERNS) {
            return true;
        }
        if (TV::isStaff($user)) {
            return true;
        }
        if (TV::ownsTicket($ticket, TV::userIdentities($user))) {
            return true;
        }
        if (DepartmentManagers::managesDepartment($user['sub'] ?? null, $ticket['approval_dept'] ?? null)) {
            return true;
        }
        if (!empty($ticket['department'])) {
            if (TV::sameDepartment($user, $ticket)) {
                return true;
            }
            if (DepartmentManagers::managesDepartment($user['sub'] ?? null, $ticket['department'])) {
                return true;
            }
        }
        return false;
    }

    /** May this user act on a pending approval (approve/deny)? */
    private function canApprove(?array $user, array $ticket): bool
    {
        if (($ticket['approval_status'] ?? null) !== 'pending') {
            return false;
        }
        return TV::isStaff($user) || DepartmentManagers::managesDepartment($user['sub'] ?? null, $ticket['approval_dept'] ?? null);
    }

    /** Full-edit rights on a specific work order. */
    private function canManageTicket(?array $user, array $ticket): bool
    {
        if (TV::isStaff($user)) {
            return true;
        }
        if (in_array($ticket['assignee'] ?? null, TV::userIdentities($user), true)) {
            return true;
        }
        if (TV::sameDepartment($user, $ticket)) {
            return true;
        }
        return DepartmentManagers::managesDepartment($user['sub'] ?? null, $ticket['department'] ?? null);
    }

    /** Requesters, assigned staff, and the routed department may add notes. */
    private function canPostNote(?array $user, array $ticket): bool
    {
        if (!$this->canReadTicket($user, $ticket)) {
            return false;
        }

        return $this->canManageTicket($user, $ticket)
            || TV::ownsTicket($ticket, TV::userIdentities($user))
            || DepartmentManagers::managesDepartment($user['sub'] ?? null, $ticket['approval_dept'] ?? null);
    }

    /**
     * A requester may correct the information they supplied while their work
     * order is still active.
     */
    private function canRequesterEditTicket(?array $user, array $ticket): bool
    {
        if (!$user || in_array($ticket['status'] ?? null, ['resolved', 'closed', 'cancelled'], true)) {
            return false;
        }

        return in_array($ticket['requester'] ?? null, TV::userIdentities($user), true);
    }

    // --- List / detail -------------------------------------------------

    private const LIST_CAP = 2000;
    private const PAGE_SIZE_DEFAULT = 20;
    private const PAGE_SIZE_MAX = 100;
    private const ACTIVE_STATUSES = ['open', 'in_progress', 'on_hold', 'pending'];

    /**
     * Builder factory for the work orders $user may see in a list, or null when
     * they can see none. Non-staff only get those they requested/are assigned, or
     * that are routed to a department they belong to/manage, unless $all (browse
     * everything). 'HR Concerns' are need-to-know, so non-staff additionally only
     * get the ones they requested/are assigned, approve, or whose department they
     * belong to/manage (the SQL twin of TV::hrConcernVisibleToList).
     */
    private function visibleScope(?array $user, bool $all): ?\Closure
    {
        $staff = TV::isStaff($user);
        $identities = TV::userIdentities($user);
        $managedDepts = $staff ? [] : DepartmentManagers::managedDepartments($user['sub'] ?? null);
        $myDept = $user['department'] ?? null;

        if (!($staff || $all || $identities || !empty($myDept) || $managedDepts)) {
            return null;
        }

        return function () use ($staff, $all, $identities, $myDept, $managedDepts) {
            $query = DB::table('tickets');
            if (!$staff && !$all) {
                $query->where(function ($q) use ($identities, $myDept, $managedDepts) {
                    if ($identities) {
                        $q->orWhereIn('requester', $identities)->orWhereIn('assignee', $identities);
                    }
                    if (!empty($myDept)) {
                        $q->orWhere('department', $myDept);
                    }
                    if ($managedDepts) {
                        $q->orWhere(fn ($q2) => $q2->where('approval_status', 'pending')->whereIn('approval_dept', $managedDepts));
                    }
                });
            }
            if (!$staff) {
                $query->where(function ($q) use ($identities, $myDept, $managedDepts) {
                    $q->whereNull('category')->orWhere('category', '<>', TV::HR_CONCERNS);
                    if ($identities) {
                        $q->orWhereIn('requester', $identities)->orWhereIn('assignee', $identities);
                    }
                    if ($managedDepts) {
                        $q->orWhereIn('approval_dept', $managedDepts)->orWhereIn('department', $managedDepts);
                    }
                    if (!empty($myDept)) {
                        $q->orWhere('department', $myDept);
                    }
                });
            }
            return $query;
        };
    }

    /**
     * Work-order list. Without `page` it returns the whole visible set as a bare
     * array (capped at LIST_CAP, X-Result-Capped when truncated). With `page` it is
     * paginated server-side and returns
     * { items, total, page, pageSize, counts, facets, new_count, capped, role_counts }.
     *
     * scope = all (browse everything) | assigned (My Queue) | involved (Submitted:
     * I requested or am assigned; each item gets `my_role`) | omitted (default
     * visibility). Filters = status (comma list), priority, assignee ('unassigned'
     * ok), category, role (owner|assignee, involved only), active=1 (hide
     * resolved/closed/cancelled), q (title or WO id; assigned/involved also match
     * requester, assignee and description), overdue=1, sort =
     * newest|oldest|updated|priority. `counts`, `facets` and `new_count` describe
     * the whole scope, not the filtered result, so summary tiles and dropdowns stay
     * stable while filtering.
     */
    public function index(Request $request)
    {
        $user = $request->authUser();
        $scopeName = (string) $request->query('scope', '');
        $paged = $request->query->has('page');

        $makeScope = $this->visibleScope($user, $scopeName === 'all');
        if (!$makeScope) {
            return response()->json($paged ? $this->emptyPage($request) : []);
        }

        $identities = TV::userIdentities($user);
        $mine = in_array($scopeName, ['assigned', 'involved'], true);
        if ($mine) {
            $base = $makeScope;
            $makeScope = function () use ($base, $identities, $scopeName) {
                $q = $base();
                if (!$identities) {
                    return $q->whereRaw('1 = 0');
                }
                return $scopeName === 'assigned'
                    ? $q->whereIn('assignee', $identities)
                    : $q->where(fn ($w) => $w->whereIn('requester', $identities)->orWhereIn('assignee', $identities));
            };
        }

        if ($paged) {
            return $this->pagedIndex($request, $makeScope, $scopeName, $identities);
        }

        $rows = $makeScope()->selectRaw(self::LIST_COLUMNS)
            ->orderByDesc('created_at')
            ->limit(self::LIST_CAP)
            ->get()
            ->map(fn ($r) => (array) $r)
            ->all();
        $capped = count($rows) >= self::LIST_CAP;

        $rows = $this->withAttachments(Sla::attachStanding($rows));

        $response = response()->json($rows);
        if ($capped) {
            $response->headers->set('X-Result-Capped', '1');
        }
        return $response;
    }

    /**
     * GET /api/tickets/summary — what the staff dashboard shows, without shipping
     * the queue: total / open / high-priority counts plus the latest few work
     * orders (default visibility). Total and high-priority count every status, as
     * the dashboard always has.
     */
    public function summary(Request $request)
    {
        $makeScope = $this->visibleScope($request->authUser(), false);
        if (!$makeScope) {
            return response()->json(['total' => 0, 'open' => 0, 'high_priority' => 0, 'recent' => []]);
        }

        $row = $makeScope()->selectRaw(
            "COUNT(*) AS total,
             COALESCE(SUM(status NOT IN ('closed', 'resolved', 'cancelled')), 0) AS open_count,
             COALESCE(SUM(priority IN ('high', 'urgent')), 0) AS high_count"
        )->first();

        $limit = min(20, max(1, (int) $request->query('recent', 4)));
        $recent = $makeScope()->selectRaw(self::LIST_COLUMNS)
            ->orderByDesc('created_at')->orderByDesc('id')->limit($limit)
            ->get()->map(fn ($r) => (array) $r)->all();

        return response()->json([
            'total' => (int) $row->total,
            'open' => (int) $row->open_count,
            'high_priority' => (int) $row->high_count,
            'recent' => $this->withAttachments(Sla::attachStanding($recent)),
        ]);
    }

    /**
     * GET /api/tickets/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&tz_offset=<minutes> —
     * aggregates for the Work Order Reports page (staff only; see routes). The
     * date range is by creation date in the caller's timezone (`tz_offset` is JS
     * getTimezoneOffset()).
     */
    public function reports(Request $request)
    {
        return response()->json(TicketReports::build(
            (string) $request->query('from', ''),
            (string) $request->query('to', ''),
            (int) $request->query('tz_offset', 0)
        ));
    }

    private function emptyPage(Request $request): array
    {
        return [
            'items' => [], 'total' => 0, 'page' => 1, 'pageSize' => $this->pageSize($request),
            'counts' => (object) [], 'facets' => ['assignees' => [], 'categories' => []], 'new_count' => 0, 'capped' => false,
            'role_counts' => ['owner' => 0, 'assignee' => 0],
        ];
    }

    private function pageSize(Request $request): int
    {
        return min(self::PAGE_SIZE_MAX, max(1, (int) $request->query('pageSize', self::PAGE_SIZE_DEFAULT)));
    }

    /** Escape LIKE wildcards in user input. */
    private function likeEscape(string $v): string
    {
        return addcslashes($v, '%_\\');
    }

    private function pagedIndex(Request $request, \Closure $makeScope, string $scopeName, array $identities)
    {
        $page = max(1, (int) $request->query('page', 1));
        $pageSize = $this->pageSize($request);
        $mine = in_array($scopeName, ['assigned', 'involved'], true);

        // Whole-scope summaries (independent of the filters below).
        $counts = $makeScope()->selectRaw('status, COUNT(*) AS c')->groupBy('status')->pluck('c', 'status');
        $facets = ['assignees' => [], 'categories' => []];
        if (!$mine) {
            $facets = [
                'assignees' => $makeScope()->whereNotNull('assignee')->where('assignee', '<>', '')->distinct()->orderBy('assignee')->limit(500)->pluck('assignee'),
                'categories' => $makeScope()->whereNotNull('category')->where('category', '<>', '')->distinct()->orderBy('category')->limit(500)->pluck('category'),
            ];
        }
        $roleCounts = ['owner' => 0, 'assignee' => 0];
        if ($scopeName === 'involved' && $identities) {
            $in = implode(',', array_fill(0, count($identities), '?'));
            $r = $makeScope()->selectRaw(
                "COALESCE(SUM(requester IN ({$in})), 0) AS owner_count, COALESCE(SUM(assignee IN ({$in})), 0) AS assignee_count",
                array_merge($identities, $identities)
            )->first();
            $roleCounts = ['owner' => (int) $r->owner_count, 'assignee' => (int) $r->assignee_count];
        }
        $newCount = 0;
        $newSince = $request->query('new_since');
        if (is_numeric($newSince) && (float) $newSince > 0) {
            $newCount = $makeScope()->where('created_at', '>', \Illuminate\Support\Carbon::createFromTimestampMs((int) $newSince)->toDateTimeString())->count();
        }

        // Filters.
        $filtered = $makeScope();
        $statuses = array_values(array_intersect(array_filter(explode(',', (string) $request->query('status', ''))), self::ALLOWED_STATUSES));
        if ($statuses) {
            $filtered->whereIn('status', $statuses);
        }
        if ($request->boolean('active')) {
            $filtered->whereIn('status', self::ACTIVE_STATUSES);
        }
        $priority = (string) $request->query('priority', '');
        if (in_array($priority, self::ALLOWED_PRIORITIES, true)) {
            $filtered->where('priority', $priority);
        }
        $assignee = (string) $request->query('assignee', '');
        if ($assignee === 'unassigned') {
            $filtered->where(fn ($q) => $q->whereNull('assignee')->orWhere('assignee', ''));
        } elseif ($assignee !== '' && $assignee !== 'all') {
            $filtered->where('assignee', $assignee);
        }
        $category = (string) $request->query('category', '');
        if ($category !== '' && $category !== 'all') {
            $filtered->where('category', $category);
        }
        $role = (string) $request->query('role', '');
        if ($scopeName === 'involved' && $identities && in_array($role, ['owner', 'assignee'], true)) {
            $filtered->whereIn($role === 'owner' ? 'requester' : 'assignee', $identities);
        }
        $q = strtolower(trim((string) $request->query('q', '')));
        if ($q !== '') {
            $idExpr = "CONCAT('wo', LPAD(id, 8, '0'))";
            $like = '%' . $this->likeEscape($q) . '%';
            $filtered->where(function ($w) use ($q, $idExpr, $like, $mine) {
                $w->where('title', 'like', $like);
                if ($mine) {
                    $w->orWhere('requester', 'like', $like)->orWhere('assignee', 'like', $like)->orWhere('description', 'like', $like);
                }
                if (str_contains($q, '%')) {
                    // "WO%22" / "%22" = exactly work order 22; any other "%" is a wildcard over the whole id.
                    if (preg_match('/^(?:wo)?%0*(\d+)$/', $q, $m)) {
                        $w->orWhere('id', (int) $m[1]);
                    } else {
                        $w->orWhereRaw("{$idExpr} LIKE ?", [addcslashes($q, '_\\')]);
                    }
                } else {
                    $w->orWhereRaw("{$idExpr} LIKE ?", [$like]);
                }
            });
        }

        $sort = (string) $request->query('sort', 'newest');
        $order = function ($query) use ($sort) {
            match ($sort) {
                'oldest' => $query->orderBy('created_at')->orderBy('id'),
                'updated' => $query->orderByDesc('updated_at')->orderByDesc('id'),
                'priority' => $query->orderByRaw("FIELD(priority, 'urgent', 'high', 'normal', 'low')")->orderByDesc('created_at')->orderByDesc('id'),
                default => $query->orderByDesc('created_at')->orderByDesc('id'),
            };
            return $query;
        };

        $capped = false;
        if ($request->boolean('overdue')) {
            // Overdue is computed (business hours, pauses) in PHP, so it can't be a SQL
            // WHERE: scan the filtered set (capped), compute SLA, then page in memory.
            $rows = $order($filtered->selectRaw(self::LIST_COLUMNS))->limit(self::LIST_CAP)->get()->map(fn ($r) => (array) $r)->all();
            $capped = count($rows) >= self::LIST_CAP;
            $rows = array_values(array_filter(
                Sla::attachStanding($rows),
                fn ($r) => !empty($r['sla']['overdue']) && empty($r['sla']['resolved'])
            ));
            $total = count($rows);
            $items = array_slice($rows, ($page - 1) * $pageSize, $pageSize);
        } else {
            $total = (clone $filtered)->count();
            $rows = $order($filtered->selectRaw(self::LIST_COLUMNS))->forPage($page, $pageSize)->get()->map(fn ($r) => (array) $r)->all();
            $items = Sla::attachStanding($rows);
        }

        if ($scopeName === 'involved') {
            $ids = array_map(fn ($v) => strtolower(trim((string) $v)), $identities);
            foreach ($items as &$it) {
                $isOwner = in_array(strtolower(trim((string) ($it['requester'] ?? ''))), $ids, true);
                $isAssignee = in_array(strtolower(trim((string) ($it['assignee'] ?? ''))), $ids, true);
                $it['my_role'] = $isOwner && $isAssignee ? 'both' : ($isOwner ? 'owner' : 'assignee');
            }
            unset($it);
        }

        return response()->json([
            'items' => $this->withAttachments($items),
            'total' => $total, 'page' => $page, 'pageSize' => $pageSize,
            'counts' => $counts, 'facets' => $facets, 'new_count' => $newCount, 'capped' => $capped,
            'role_counts' => $roleCounts,
        ]);
    }

    /** Add `attachments` to each list row (one query for all). */
    private function withAttachments(array $rows): array
    {
        if (!$rows) {
            return [];
        }
        $attachments = DB::table('ticket_attachments')
            ->select('id', 'ticket_id', 'original_filename', 'stored_filename', 'mime_type', 'size_bytes', 'uploaded_at')
            ->whereIn('ticket_id', array_column($rows, 'id'))
            ->orderBy('uploaded_at')
            ->get();
        $byTicket = [];
        foreach ($attachments as $a) {
            $byTicket[$a->ticket_id][] = $this->serializeAttachment($a);
        }
        foreach ($rows as &$r) {
            $r['attachments'] = $byTicket[$r['id']] ?? [];
        }
        unset($r);
        return $rows;
    }

    public function show(Request $request, string $id)
    {
        $id = $this->intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid ticket id'], 400);
        }

        $row = DB::table('tickets')->selectRaw(self::DETAIL_COLUMNS)->where('id', $id)->first();
        if (!$row) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }
        $ticket = (array) $row;

        $user = $request->authUser();
        if (!$this->canReadTicket($user, $ticket)) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }

        $atts = DB::table('ticket_attachments')
            ->select('id', 'original_filename', 'stored_filename', 'mime_type', 'size_bytes', 'uploaded_by', 'uploaded_at')
            ->where('ticket_id', $id)->orderBy('uploaded_at')->get();
        $ticket['attachments'] = $atts->map(fn ($a) => $this->serializeAttachment($a, true))->all();

        if (!empty($ticket['asset_id'])) {
            $asset = DB::table('assets')->select('id', 'asset_tag', 'type', 'model', 'serial_no', 'assignee', 'location', 'status')
                ->where('id', $ticket['asset_id'])->first();
            $ticket['asset'] = $asset ? (array) $asset : null;
        } else {
            $ticket['asset'] = null;
        }

        $ticket['can_edit'] = $this->canManageTicket($user, $ticket);
        $ticket['can_requester_edit'] = $this->canRequesterEditTicket($user, $ticket);
        $ticket['can_post_note'] = $this->canPostNote($user, $ticket);
        $ticket['can_approve'] = $this->canApprove($user, $ticket);

        return response()->json($ticket);
    }

    private const EDITABLE_FIELDS = [
        'title' => ['max' => 200],
        'description' => ['max' => 4000],
        'status' => ['enum' => self::ALLOWED_STATUSES],
        'priority' => ['enum' => self::ALLOWED_PRIORITIES],
        // 'taxonomy': validated against TicketTaxonomy (hidden entries allowed on edits).
        'request_type' => ['taxonomy' => true],
        'category' => ['taxonomy' => true, 'nullable' => true],
        'subcategory' => ['max' => 120, 'nullable' => true],
        'subcategory2' => ['max' => 120, 'nullable' => true],
        'department' => ['max' => 80, 'nullable' => true],
        'requester' => ['max' => 120],
        'assignee' => ['max' => 120, 'nullable' => true],
        'asset_id' => ['numeric' => true, 'nullable' => true],
    ];

    // Fields a requester may amend on an active ticket they submitted.  Assets
    // remain manager-only because they identify inventory records.
    private const REQUESTER_EDITABLE_FIELDS = [
        'description', 'status', 'priority', 'request_type', 'category',
        'subcategory', 'subcategory2', 'department', 'requester', 'assignee',
    ];

    // Routing and people may be corrected by any user who can view the work
    // order. Other fields keep the manager/requester rules above.
    private const PEOPLE_EDITABLE_FIELDS = ['department', 'requester', 'assignee'];
    private const ERP_LOCKED_MESSAGE = 'ERP Access work orders are routed to the Document Controller — only an admin can change the department or assignee.';

    public function update(Request $request, string $id)
    {
        $id = $this->intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid ticket id'], 400);
        }

        $before = DB::table('tickets')->selectRaw(
            'id, title, description, status, priority, request_type, category, subcategory, subcategory2, department, requester, assignee, asset_id, approval_status'
        )->where('id', $id)->first();
        if (!$before) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }
        $before = (array) $before;

        $user = $request->authUser();
        $canManage = $this->canManageTicket($user, $before);
        $canRequesterEdit = $this->canRequesterEditTicket($user, $before);
        $canEditPeople = $this->canReadTicket($user, $before);
        if (!$canManage && !$canRequesterEdit && !$canEditPeople) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $body = $request->all();

        if (array_key_exists('category', $body)) {
            $rawCat = $body['category'];
            $nextCat = ($rawCat === null || $rawCat === '') ? null : trim((string) $rawCat);
            $prevCat = $before['category'] ?? null;
            if ($nextCat !== $prevCat && ($nextCat === TV::HR_CONCERNS || $prevCat === TV::HR_CONCERNS)) {
                return response()->json([
                    'error' => "A work order can't be reclassified into or out of 'HR Concerns' after creation. File it as a new HR Concern so it routes for manager approval.",
                ], 400);
            }
        }
        if (($before['category'] ?? null) === TV::HR_CONCERNS && ($before['approval_status'] ?? null) === 'pending' && array_key_exists('department', $body)) {
            $rawDept = $body['department'];
            $nextDept = ($rawDept === null || $rawDept === '') ? null : mb_substr(trim((string) $rawDept), 0, 80);
            if (($nextDept ?? null) !== ($before['department'] ?? null)) {
                return response()->json([
                    'error' => 'This HR Concern is awaiting manager approval; approve or decline it instead of routing it manually.',
                ], 400);
            }
        }

        $updates = [];
        $changes = []; // ['field'=>, 'oldValue'=>, 'newValue'=>]

        foreach (self::EDITABLE_FIELDS as $field => $rules) {
            if (!array_key_exists($field, $body)) {
                continue;
            }
            $requesterMayEdit = $canRequesterEdit && in_array($field, self::REQUESTER_EDITABLE_FIELDS, true);
            $viewerMayEditPeople = $canEditPeople && in_array($field, self::PEOPLE_EDITABLE_FIELDS, true);
            if (!$canManage && !$requesterMayEdit && !$viewerMayEditPeople) {
                return response()->json(['error' => 'Forbidden'], 403);
            }
            $raw = $body[$field];
            $next = null;

            if ($raw === null || $raw === '') {
                if (empty($rules['nullable']) && in_array($field, ['title', 'requester'], true)) {
                    return response()->json(['error' => "{$field} cannot be empty"], 400);
                }
                $next = null;
            } elseif (!empty($rules['numeric'])) {
                if (!is_numeric($raw) || (int) $raw != $raw || (int) $raw <= 0) {
                    return response()->json(['error' => "invalid {$field}"], 400);
                }
                $next = (int) $raw;
            } else {
                $next = trim((string) $raw);
                if (!empty($rules['max'])) {
                    $next = mb_substr($next, 0, $rules['max']);
                }
                if (!empty($rules['enum']) && !in_array($next, $rules['enum'], true)) {
                    return response()->json(['error' => "invalid {$field}"], 400);
                }
                if (!empty($rules['taxonomy']) && !TicketTaxonomy::isAllowed($field, $next, false)) {
                    return response()->json(['error' => "invalid {$field}"], 400);
                }
            }

            $prev = $before[$field] ?? null;
            if (($prev ?? null) === ($next ?? null)) {
                continue;
            }
            if (in_array($field, self::PEOPLE_EDITABLE_FIELDS, true) && $field !== 'requester' && DocumentController::isLockedFor($user, $before)) {
                return response()->json(['error' => self::ERP_LOCKED_MESSAGE], 403);
            }

            $updates[$field] = $next;
            $changes[] = ['field' => $field, 'oldValue' => $prev, 'newValue' => $next];
        }

        if (empty($updates)) {
            return response()->json(['error' => 'no fields to update'], 400);
        }

        DB::table('tickets')->where('id', $id)->update($updates);

        $actor = $user['name'] ?? $user['email'] ?? 'system';
        if ($changes) {
            $this->logChanges($id, $actor, $changes);
        }

        $updated = (array) DB::table('tickets')->selectRaw(self::ROW_COLUMNS)->where('id', $id)->first();

        TicketNotifications::notifyTicketChanges($updated, $changes, $actor);
        if (collect($changes)->contains(fn ($c) => $c['field'] === 'status' && $c['newValue'] === 'resolved')) {
            TicketNotifications::maybeSendResolutionSurvey($updated, $before['status'] ?? null);
        }

        TicketNotifications::emitTicketNotifications($updated, $changes);
        if (($updated['category'] ?? null) !== TV::HR_CONCERNS) {
            TicketNotifications::runAutomations('ticket.updated', $updated, ['actor' => $actor]);
        }

        return response()->json($updated);
    }

    // --- Bulk update -----------------------------------------------------
    // Apply one field change (status/priority/assignee) across multiple
    // tickets in one request. Deliberately narrower than EDITABLE_FIELDS —
    // these are the 3 fields worth batch-editing from a list view. Each
    // ticket is independently authorized and reported, so a caller with mixed
    // access (e.g. browsing "All Work Orders") gets a partial result rather
    // than an all-or-nothing failure.

    private const BULK_FIELDS = ['status', 'priority', 'assignee'];
    private const MAX_BULK_IDS = 100;

    public function bulkUpdate(Request $request)
    {
        $field = $request->input('field');
        if (!in_array($field, self::BULK_FIELDS, true)) {
            return response()->json(['error' => 'field must be one of: ' . implode(', ', self::BULK_FIELDS)], 400);
        }
        $rules = self::EDITABLE_FIELDS[$field];

        $raw = $request->input('value');
        $nextValue = null;
        if ($raw === null || $raw === '') {
            if (empty($rules['nullable'])) {
                return response()->json(['error' => "{$field} cannot be empty"], 400);
            }
        } else {
            $nextValue = trim((string) $raw);
            if (!empty($rules['max'])) {
                $nextValue = mb_substr($nextValue, 0, $rules['max']);
            }
            if (!empty($rules['enum']) && !in_array($nextValue, $rules['enum'], true)) {
                return response()->json(['error' => "invalid {$field}"], 400);
            }
            if (!empty($rules['taxonomy']) && !TicketTaxonomy::isAllowed($field, $nextValue, false)) {
                return response()->json(['error' => "invalid {$field}"], 400);
            }
        }

        $rawIds = $request->input('ids');
        $ids = is_array($rawIds)
            ? array_values(array_unique(array_filter(array_map(fn ($v) => is_numeric($v) ? (int) $v : null, $rawIds), fn ($v) => $v !== null && $v > 0)))
            : [];
        if (!$ids) {
            return response()->json(['error' => 'ids must be a non-empty array of ticket ids'], 400);
        }
        if (count($ids) > self::MAX_BULK_IDS) {
            return response()->json(['error' => 'cannot update more than ' . self::MAX_BULK_IDS . ' tickets at once'], 400);
        }

        $user = $request->authUser();
        $actor = $user['name'] ?? $user['email'] ?? 'system';
        $updated = [];
        $skipped = [];

        foreach ($ids as $id) {
            $before = DB::table('tickets')->selectRaw(self::ROW_COLUMNS)->where('id', $id)->first();
            if (!$before) {
                $skipped[] = ['id' => $id, 'reason' => 'not_found'];
                continue;
            }
            $before = (array) $before;
            if (!$this->canManageTicket($user, $before)) {
                $skipped[] = ['id' => $id, 'reason' => 'forbidden'];
                continue;
            }

            if ($field === 'assignee' && DocumentController::isLockedFor($user, $before)) {
                $skipped[] = ['id' => $id, 'reason' => 'locked'];
                continue;
            }

            $prev = $before[$field] ?? null;
            if (($prev ?? null) === ($nextValue ?? null)) {
                $skipped[] = ['id' => $id, 'reason' => 'unchanged'];
                continue;
            }

            DB::table('tickets')->where('id', $id)->update([$field => $nextValue]);
            $changes = [['field' => $field, 'oldValue' => $prev, 'newValue' => $nextValue]];
            $this->logChanges($id, $actor, $changes);

            $ticketAfter = (array) DB::table('tickets')->selectRaw(self::ROW_COLUMNS)->where('id', $id)->first();

            TicketNotifications::notifyTicketChanges($ticketAfter, $changes, $actor);
            if ($field === 'status' && $nextValue === 'resolved') {
                TicketNotifications::maybeSendResolutionSurvey($ticketAfter, $before['status'] ?? null);
            }
            TicketNotifications::emitTicketNotifications($ticketAfter, $changes);
            if (($ticketAfter['category'] ?? null) !== TV::HR_CONCERNS) {
                TicketNotifications::runAutomations('ticket.updated', $ticketAfter, ['actor' => $actor]);
            }

            $updated[] = $id;
        }

        return response()->json(['updated' => $updated, 'skipped' => $skipped]);
    }

    // --- Self-assign ---------------------------------------------------

    private function setSelfAssignment(Request $request, string $id, bool $assign)
    {
        $id = $this->intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid ticket id'], 400);
        }
        $row = DB::table('tickets')->selectRaw(
            'id, title, description, status, priority, request_type, category, subcategory, subcategory2, department, requester, assignee, asset_id, overtime_report, approval_status, created_at, updated_at'
        )->where('id', $id)->first();
        if (!$row) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }
        $ticket = (array) $row;
        $user = $request->authUser();

        if (($ticket['category'] ?? null) === TV::HR_CONCERNS && ($ticket['approval_status'] ?? null) !== 'approved') {
            return response()->json(['error' => 'HR requests are handled through approval, not self-assignment.'], 400);
        }
        if (!TV::canViewTicket($user, $ticket)) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }
        if (!TV::isStaff($user) && !TV::sameDepartment($user, $ticket)) {
            return response()->json(['error' => 'You can only assign work orders routed to your department'], 403);
        }

        if (DocumentController::isLockedFor($user, $ticket)) {
            return response()->json(['error' => self::ERP_LOCKED_MESSAGE], 403);
        }

        $me = $user['name'] ?? $user['email'] ?? null;
        if (!$me) {
            return response()->json(['error' => 'your account has no name or email to assign'], 400);
        }

        $newValue = $assign ? $me : null;
        if ($assign && !empty($ticket['assignee']) && $ticket['assignee'] !== $me && !TV::isStaff($user)) {
            return response()->json(['error' => 'This work order is already assigned to someone else'], 409);
        }
        if (!$assign && ($ticket['assignee'] ?? null) !== $me && !TV::isStaff($user)) {
            return response()->json(['error' => 'You can only release a work order assigned to you'], 403);
        }
        if (($ticket['assignee'] ?? null) === ($newValue ?? null)) {
            return response()->json($ticket);
        }

        DB::table('tickets')->where('id', $id)->update(['assignee' => $newValue]);
        DB::table('ticket_activity')->insert([
            'ticket_id' => $id, 'type' => 'change', 'actor' => $me, 'field' => 'assignee',
            'old_value' => $ticket['assignee'] ? mb_substr((string) $ticket['assignee'], 0, 500) : null,
            'new_value' => $newValue,
            'created_at' => now(),
        ]);

        $updated = (array) DB::table('tickets')->selectRaw(self::ROW_COLUMNS)->where('id', $id)->first();
        TicketNotifications::notifyTicketChanges($updated, [['field' => 'assignee', 'oldValue' => $ticket['assignee'] ?? null, 'newValue' => $newValue]], $me);
        return response()->json($updated);
    }

    public function claim(Request $request, string $id)
    {
        return $this->setSelfAssignment($request, $id, true);
    }

    public function release(Request $request, string $id)
    {
        return $this->setSelfAssignment($request, $id, false);
    }

    // --- Approval workflow ----------------------------------------------

    private function loadForApproval(Request $request, string $id): array
    {
        $intId = $this->intId($id);
        if (!$intId) {
            return [null, response()->json(['error' => 'invalid ticket id'], 400)];
        }
        $ticket = DB::table('tickets')->select('id', 'title', 'requester', 'category', 'approval_status', 'approval_dept')
            ->where('id', $intId)->first();
        if (!$ticket) {
            return [null, response()->json(['error' => 'Ticket not found'], 404)];
        }
        $ticket = (array) $ticket;
        if (($ticket['approval_status'] ?? null) !== 'pending') {
            return [null, response()->json(['error' => 'This request is not awaiting approval'], 409)];
        }
        if (!$this->canApprove($request->authUser(), $ticket)) {
            return [null, response()->json(['error' => 'Only the department manager can decide this request'], 403)];
        }
        return [$ticket, null];
    }

    public function approve(Request $request, string $id)
    {
        [$ticket, $errorResponse] = $this->loadForApproval($request, $id);
        if (!$ticket) {
            return $errorResponse;
        }
        $ticketId = $ticket['id'];
        $user = $request->authUser();
        $actor = $user['name'] ?? $user['email'] ?? 'system';
        $hrName = DepartmentManagers::hrDepartmentName();
        $approver = DB::table('users')->select('signature_url')->where('id', $user['sub'])->first();

        DB::table('tickets')->where('id', $ticketId)->update([
            'approval_status' => 'approved',
            'department' => $hrName,
            'approver_name' => mb_substr((string) $actor, 0, 120),
            'approver_signature_url' => $approver?->signature_url,
            'approval_decided_at' => now(),
        ]);
        DB::table('ticket_activity')->insert([
            'ticket_id' => $ticketId, 'type' => 'change', 'actor' => mb_substr((string) $actor, 0, 120),
            'field' => 'approved', 'new_value' => mb_substr((string) ($hrName ?: 'HR'), 0, 500),
            'created_at' => now(),
        ]);

        $updated = (array) DB::table('tickets')->selectRaw(self::DETAIL_COLUMNS)->where('id', $ticketId)->first();
        TicketNotifications::notifyApprovalDecision($updated, 'approved', null, $hrName);
        TicketNotifications::notifyHrRoutedToTeam($updated);
        return response()->json($updated);
    }

    public function deny(Request $request, string $id)
    {
        $reason = trim((string) $request->input('reason', ''));
        if (!$reason) {
            return response()->json(['error' => 'A reason is required to decline a request'], 400);
        }
        [$ticket, $errorResponse] = $this->loadForApproval($request, $id);
        if (!$ticket) {
            return $errorResponse;
        }
        $ticketId = $ticket['id'];
        $user = $request->authUser();
        $actor = $user['name'] ?? $user['email'] ?? 'system';

        DB::table('tickets')->where('id', $ticketId)->update([
            'approval_status' => 'denied',
            'status' => 'closed',
            'approver_name' => mb_substr((string) $actor, 0, 120),
            'approval_note' => mb_substr($reason, 0, 1000),
            'approval_decided_at' => now(),
        ]);
        DB::table('ticket_activity')->insert([
            'ticket_id' => $ticketId, 'type' => 'change', 'actor' => mb_substr((string) $actor, 0, 120),
            'field' => 'denied', 'new_value' => mb_substr($reason, 0, 500),
            'created_at' => now(),
        ]);

        $updated = (array) DB::table('tickets')->selectRaw(self::DETAIL_COLUMNS)->where('id', $ticketId)->first();
        TicketNotifications::notifyApprovalDecision($updated, 'denied', $reason, null);
        return response()->json($updated);
    }

    // --- Activity / notes -------------------------------------------------

    private function loadActivity(int $ticketId): array
    {
        $rows = DB::table('ticket_activity as a')
            ->leftJoin('ticket_attachments as att', 'att.id', '=', 'a.attachment_id')
            ->where('a.ticket_id', $ticketId)
            ->orderByDesc('a.created_at')->orderByDesc('a.id')
            ->select(
                'a.id', 'a.type', 'a.actor', 'a.field', 'a.old_value', 'a.new_value', 'a.body',
                'a.attachment_id', 'a.created_at',
                'att.original_filename as att_filename', 'att.stored_filename as att_stored',
                'att.mime_type as att_mime', 'att.size_bytes as att_size'
            )->get();

        return $rows->map(fn ($r) => $this->serializeActivity($r))->all();
    }

    public function activityIndex(Request $request, string $id)
    {
        $id = $this->intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid ticket id'], 400);
        }
        $owner = DB::table('tickets')->select('requester', 'assignee', 'department', 'category', 'approval_status', 'approval_dept')
            ->where('id', $id)->first();
        if (!$owner) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }
        if (!$this->canReadTicket($request->authUser(), (array) $owner)) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }

        $rows = $this->loadActivity($id);

        $hasCreated = collect($rows)->contains(fn ($r) => $r['type'] === 'change' && $r['field'] === 'created');
        if (!$hasCreated) {
            $t = DB::table('tickets')->select('title', 'requester', 'created_at')->where('id', $id)->first();
            if ($t) {
                $rows[] = [
                    'id' => -$id, 'type' => 'change', 'actor' => $t->requester, 'field' => 'created',
                    'old_value' => null, 'new_value' => $t->title, 'body' => null,
                    'created_at' => $t->created_at, 'attachment' => null, 'synthetic' => true,
                ];
            }
        }

        return response()->json($rows);
    }

    public function activityStore(Request $request, string $id)
    {
        $id = $this->intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid ticket id'], 400);
        }

        $file = $request->file('attachment');
        if ($file && !$file->isValid()) {
            return response()->json(['error' => 'Upload failed'], 400);
        }
        $mimeError = $file ? $this->validateUpload($file) : null;
        if ($mimeError) {
            return response()->json(['error' => $mimeError], 400);
        }

        $body = trim((string) $request->input('body', ''));
        if (!$body && !$file) {
            return response()->json(['error' => 'note body or attachment is required'], 400);
        }

        $exists = DB::table('tickets')->select('id', 'title', 'requester', 'assignee', 'department', 'category', 'approval_dept')
            ->where('id', $id)->first();
        if (!$exists) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }
        $exists = (array) $exists;

        $user = $request->authUser();
        $staff = TV::isStaff($user);
        $managesDept = DepartmentManagers::managesDepartment($user['sub'] ?? null, $exists['department']);
        $managesApprovalDept = DepartmentManagers::managesDepartment($user['sub'] ?? null, $exists['approval_dept']);
        if (!$this->canPostNote($user, $exists)) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }
        $ids = TV::userIdentities($user);
        $isResponder = $staff || $managesDept || $managesApprovalDept || TV::sameDepartment($user, $exists)
            || (!empty($exists['assignee']) && in_array($exists['assignee'], $ids, true));

        $actor = $user['name'] ?? $user['email'] ?? 'system';

        $attachmentId = null;
        if ($file) {
            $stored = $this->storeUpload($file);
            $attachmentId = DB::table('ticket_attachments')->insertGetId([
                'ticket_id' => $id,
                'original_filename' => mb_substr($file->getClientOriginalName(), 0, 255),
                'stored_filename' => $stored,
                'mime_type' => $file->getClientMimeType(),
                'size_bytes' => $file->getSize(),
                'uploaded_by' => $actor,
                'uploaded_at' => now(),
            ]);
        }

        $activityId = DB::table('ticket_activity')->insertGetId([
            'ticket_id' => $id, 'type' => 'note', 'actor' => $actor,
            'body' => $body ? mb_substr($body, 0, 4000) : null,
            'attachment_id' => $attachmentId,
            'created_at' => now(),
        ]);

        if ($isResponder) {
            DB::table('tickets')->where('id', $id)->whereNull('first_responded_at')->update(['first_responded_at' => now()]);
        }

        $row = DB::table('ticket_activity as a')
            ->leftJoin('ticket_attachments as att', 'att.id', '=', 'a.attachment_id')
            ->where('a.id', $activityId)
            ->select(
                'a.id', 'a.type', 'a.actor', 'a.field', 'a.old_value', 'a.new_value', 'a.body',
                'a.attachment_id', 'a.created_at',
                'att.original_filename as att_filename', 'att.stored_filename as att_stored',
                'att.mime_type as att_mime', 'att.size_bytes as att_size'
            )->first();

        return response()->json($this->serializeActivity($row), 201);
    }

    public function attachmentDestroy(Request $request, string $id, string $attachmentId)
    {
        $id = $this->intId($id);
        $attachmentId = $this->intId($attachmentId);
        if (!$id || !$attachmentId) {
            return response()->json(['error' => 'invalid ids'], 400);
        }

        $ticket = DB::table('tickets')->select('id', 'department')->where('id', $id)->first();
        if (!$ticket) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }
        if (!$this->canManageTicket($request->authUser(), (array) $ticket)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $att = DB::table('ticket_attachments')->select('id', 'ticket_id', 'original_filename', 'stored_filename')
            ->where('id', $attachmentId)->where('ticket_id', $id)->first();
        if (!$att) {
            return response()->json(['error' => 'Attachment not found'], 404);
        }

        DB::table('ticket_activity')->where('attachment_id', $attachmentId)->update(['attachment_id' => null]);
        DB::table('ticket_attachments')->where('id', $attachmentId)->delete();

        Storage::disk('tickets')->delete(basename($att->stored_filename));

        $actor = $request->authUser()['name'] ?? $request->authUser()['email'] ?? 'system';
        DB::table('ticket_activity')->insert([
            'ticket_id' => $id, 'type' => 'change', 'actor' => $actor,
            'field' => 'attachment_removed', 'old_value' => mb_substr((string) $att->original_filename, 0, 500),
            'created_at' => now(),
        ]);

        return response()->json(['ok' => true]);
    }

    // --- KB links -----------------------------------------------------

    public function kbIndex(Request $request, string $id)
    {
        $id = $this->intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid ticket id'], 400);
        }
        $owner = DB::table('tickets')->select('requester', 'assignee', 'department', 'category', 'approval_status', 'approval_dept')
            ->where('id', $id)->first();
        if (!$owner) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }
        if (!$this->canReadTicket($request->authUser(), (array) $owner)) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }

        $rows = DB::table('ticket_kb_links as l')
            ->join('kb_articles as k', 'k.id', '=', 'l.article_id')
            ->where('l.ticket_id', $id)
            ->orderByDesc('l.created_at')
            ->select('k.id', 'k.title', 'k.slug', 'k.category', 'k.published', 'l.linked_by', 'l.created_at as linked_at')
            ->get();

        return response()->json($rows);
    }

    public function kbStore(Request $request, string $id)
    {
        $id = $this->intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid ticket id'], 400);
        }
        $articleId = $this->intId((string) $request->input('article_id'));
        if (!$articleId) {
            return response()->json(['error' => 'article_id is required'], 400);
        }

        $ticket = DB::table('tickets')->select('id', 'department')->where('id', $id)->first();
        if (!$ticket) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }
        if (!$this->canManageTicket($request->authUser(), (array) $ticket)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $article = DB::table('kb_articles')->select('id', 'title', 'slug', 'category', 'published')->where('id', $articleId)->first();
        if (!$article) {
            return response()->json(['error' => 'Article not found'], 404);
        }

        $actor = $request->authUser()['name'] ?? $request->authUser()['email'] ?? 'system';
        if (DB::table('ticket_kb_links')->where('ticket_id', $id)->where('article_id', $articleId)->exists()) {
            return response()->json(['error' => 'Article is already linked to this ticket'], 409);
        }
        DB::table('ticket_kb_links')->insert(['ticket_id' => $id, 'article_id' => $articleId, 'linked_by' => $actor, 'created_at' => now()]);

        DB::table('ticket_activity')->insert([
            'ticket_id' => $id, 'type' => 'change', 'actor' => $actor,
            'field' => 'kb_link', 'new_value' => mb_substr($article->title, 0, 500),
            'created_at' => now(),
        ]);

        return response()->json([
            'id' => $article->id, 'title' => $article->title, 'slug' => $article->slug,
            'category' => $article->category, 'published' => $article->published,
            'linked_by' => $actor, 'linked_at' => now()->toIso8601String(),
        ], 201);
    }

    public function kbDestroy(Request $request, string $id, string $articleId)
    {
        $id = $this->intId($id);
        $articleId = $this->intId($articleId);
        if (!$id || !$articleId) {
            return response()->json(['error' => 'invalid ids'], 400);
        }

        $ticket = DB::table('tickets')->select('id', 'department')->where('id', $id)->first();
        if (!$ticket) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }
        if (!$this->canManageTicket($request->authUser(), (array) $ticket)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $articleTitle = DB::table('kb_articles')->where('id', $articleId)->value('title') ?? "Article #{$articleId}";

        $deleted = DB::table('ticket_kb_links')->where('ticket_id', $id)->where('article_id', $articleId)->delete();
        if (!$deleted) {
            return response()->json(['error' => 'Link not found'], 404);
        }

        $actor = $request->authUser()['name'] ?? $request->authUser()['email'] ?? 'system';
        DB::table('ticket_activity')->insert([
            'ticket_id' => $id, 'type' => 'change', 'actor' => $actor,
            'field' => 'kb_unlink', 'old_value' => mb_substr((string) $articleTitle, 0, 500),
            'created_at' => now(),
        ]);

        return response()->json(['ok' => true]);
    }

    // --- Watchers -------------------------------------------------------
    // Third parties (managers, coworkers who reported an issue secondhand) can
    // follow a ticket's activity without being its requester/assignee. Blocked
    // entirely on 'HR Concerns' (need-to-know) — category is immutable after
    // creation, so this is a stable, once-only check.

    public function watchersIndex(Request $request, string $id)
    {
        $id = $this->intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid ticket id'], 400);
        }
        $owner = DB::table('tickets')->select('requester', 'assignee', 'department', 'category', 'approval_status', 'approval_dept')
            ->where('id', $id)->first();
        if (!$owner) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }
        if (!$this->canReadTicket($request->authUser(), (array) $owner)) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }

        $rows = DB::table('ticket_watchers as w')
            ->join('users as u', 'u.id', '=', 'w.user_id')
            ->where('w.ticket_id', $id)->where('u.is_active', 1)
            ->orderBy('w.added_at')
            ->select('u.id', 'u.name', 'u.email', 'u.avatar_url', 'u.department', 'w.added_by', 'w.added_at')
            ->get();

        return response()->json($rows);
    }

    public function watchersStore(Request $request, string $id)
    {
        $id = $this->intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid ticket id'], 400);
        }
        $ticket = DB::table('tickets')->select('id', 'requester', 'assignee', 'department', 'category', 'approval_status', 'approval_dept')
            ->where('id', $id)->first();
        if (!$ticket) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }
        $ticket = (array) $ticket;

        $user = $request->authUser();
        $raw = $request->input('user_id');
        $targetId = ($raw === null || $raw === '') ? ($user['sub'] ?? null) : $this->intId((string) $raw);
        if (!$targetId) {
            return response()->json(['error' => 'invalid user_id'], 400);
        }
        $isSelf = $targetId === ($user['sub'] ?? null);

        // Check permission BEFORE the HR-Concerns block below, so an
        // unauthorized caller gets the same 404/403 they'd get anywhere else
        // on this ticket — never a message that incidentally confirms it's
        // an HR Concern.
        if ($isSelf) {
            if (!$this->canReadTicket($user, $ticket)) {
                return response()->json(['error' => 'Ticket not found'], 404);
            }
        } elseif (!$this->canManageTicket($user, $ticket)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        if (($ticket['category'] ?? null) === TV::HR_CONCERNS) {
            return response()->json(['error' => "Watchers aren't available on 'HR Concerns' tickets."], 400);
        }

        $target = DB::table('users')->select('id', 'name', 'email', 'avatar_url', 'department')
            ->where('id', $targetId)->where('is_active', 1)->first();
        if (!$target) {
            return response()->json(['error' => 'User not found'], 404);
        }

        $actor = $user['name'] ?? $user['email'] ?? 'system';
        if (DB::table('ticket_watchers')->where('ticket_id', $id)->where('user_id', $targetId)->exists()) {
            return response()->json(['error' => 'Already watching this ticket'], 409);
        }
        DB::table('ticket_watchers')->insert([
            'ticket_id' => $id, 'user_id' => $targetId, 'added_by' => $actor, 'added_at' => now(),
        ]);

        DB::table('ticket_activity')->insert([
            'ticket_id' => $id, 'type' => 'change', 'actor' => $actor,
            'field' => 'watcher_added', 'new_value' => mb_substr($target->name, 0, 500),
            'created_at' => now(),
        ]);

        return response()->json([
            'id' => $target->id, 'name' => $target->name, 'email' => $target->email,
            'avatar_url' => $target->avatar_url, 'department' => $target->department,
            'added_by' => $actor, 'added_at' => now()->toIso8601String(),
        ], 201);
    }

    public function watchersDestroy(Request $request, string $id, string $userId)
    {
        $id = $this->intId($id);
        $userId = $this->intId($userId);
        if (!$id || !$userId) {
            return response()->json(['error' => 'invalid ids'], 400);
        }

        $ticket = DB::table('tickets')->select('id', 'department')->where('id', $id)->first();
        if (!$ticket) {
            return response()->json(['error' => 'Ticket not found'], 404);
        }

        $user = $request->authUser();
        $isSelf = $userId === ($user['sub'] ?? null);
        if (!$isSelf && !$this->canManageTicket($user, (array) $ticket)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $watcherName = DB::table('users')->where('id', $userId)->value('name') ?? "User #{$userId}";

        $deleted = DB::table('ticket_watchers')->where('ticket_id', $id)->where('user_id', $userId)->delete();
        if (!$deleted) {
            return response()->json(['error' => 'Not watching this ticket'], 404);
        }

        $actor = $user['name'] ?? $user['email'] ?? 'system';
        DB::table('ticket_activity')->insert([
            'ticket_id' => $id, 'type' => 'change', 'actor' => $actor,
            'field' => 'watcher_removed', 'old_value' => mb_substr((string) $watcherName, 0, 500),
            'created_at' => now(),
        ]);

        return response()->json(['ok' => true]);
    }

    // --- Create -------------------------------------------------------

    public function store(Request $request)
    {
        $user = $request->authUser();
        $body = $request->all();

        $title = $body['title'] ?? null;
        $description = $body['description'] ?? null;
        $priority = $body['priority'] ?? 'normal';
        $status = $body['status'] ?? 'open';
        $requestType = $body['request_type'] ?? 'service_request';
        $category = $body['category'] ?? null;
        $subcategory = $body['subcategory'] ?? null;
        $subcategory2 = $body['subcategory2'] ?? null;
        $overtimeReport = $body['overtime_report'] ?? null;
        $department = $body['department'] ?? null;
        $requester = $body['requester'] ?? null;
        $assignee = $body['assignee'] ?? null;
        $assetId = $body['asset_id'] ?? null;

        $clampSub = fn ($v) => $v ? mb_substr(trim((string) $v), 0, 120) : null;
        $subcat = $category ? $clampSub($subcategory) : null;
        $subcat2 = $subcat ? $clampSub($subcategory2) : null;

        $overtimeJson = null;
        if ($overtimeReport) {
            $parsed = is_string($overtimeReport) ? json_decode($overtimeReport, true) : $overtimeReport;
            if (is_array($parsed) && !empty($parsed)) {
                $clean = array_map(fn ($r) => [
                    'name' => mb_substr((string) ($r['name'] ?? ''), 0, 120),
                    'otIn' => mb_substr((string) ($r['otIn'] ?? ''), 0, 10),
                    'otOut' => mb_substr((string) ($r['otOut'] ?? ''), 0, 10),
                    'hours' => mb_substr((string) ($r['hours'] ?? ''), 0, 20),
                    'signature' => mb_substr((string) ($r['signature'] ?? ''), 0, 120),
                    'signatureUrl' => mb_substr((string) ($r['signatureUrl'] ?? ''), 0, 255),
                ], array_slice($parsed, 0, 50));
                $overtimeJson = json_encode($clean);
            }
        }

        // Any authenticated user may file on somebody else's behalf. Requester
        // remains free text so the reported person need not have an account.
        $requesterName = $requester;

        if (!$title || !trim((string) ($requesterName ?? ''))) {
            return response()->json(['error' => 'title and requester are required'], 400);
        }
        if (!in_array($priority, self::ALLOWED_PRIORITIES, true)) {
            return response()->json(['error' => 'invalid priority'], 400);
        }
        if (!in_array($status, self::ALLOWED_STATUSES, true)) {
            return response()->json(['error' => 'invalid status'], 400);
        }
        if (!TicketTaxonomy::isAllowed('request_type', $requestType, true)) {
            return response()->json(['error' => 'invalid request type'], 400);
        }
        if ($category && !TicketTaxonomy::isAllowed('category', $category, true)) {
            return response()->json(['error' => 'invalid category'], 400);
        }

        $files = $this->normalizedFiles($request, 'attachments');
        if (count($files) > self::MAX_FILES) {
            return response()->json(['error' => 'Too many files (max ' . self::MAX_FILES . ')'], 400);
        }
        foreach ($files as $f) {
            $err = $this->validateUpload($f);
            if ($err) {
                return response()->json(['error' => $err], 400);
            }
        }

        $departmentValue = $department ? mb_substr(trim((string) $department), 0, 80) : null;
        $approvalStatus = 'not_required';
        $approvalDept = null;
        $approverName = null;
        $approvalDecidedAt = null;
        $pendingManager = null;
        $hrName = null;

        if ($category === TV::HR_CONCERNS) {
            $homeDept = null;
            $requesterUserId = null;
            if (in_array($requesterName, TV::userIdentities($user), true)) {
                $homeDept = $user['department'] ?? null;
                $requesterUserId = $user['sub'] ?? null;
            } else {
                $lookup = trim((string) $requesterName);
                $ru = DB::table('users')->select('id', 'department')
                    ->where('is_active', 1)
                    ->where(fn ($q) => $q->where('email', strtolower($lookup))->orWhere('name', $lookup))
                    ->first();
                $homeDept = $ru->department ?? null;
                $requesterUserId = $ru->id ?? null;
            }
            $manager = $homeDept ? DepartmentManagers::managerOfDepartment($homeDept) : null;
            $hrName = DepartmentManagers::hrDepartmentName();

            if ($manager && $manager['id'] !== $requesterUserId) {
                $approvalStatus = 'pending';
                $approvalDept = $homeDept;
                $departmentValue = null;
                $pendingManager = $manager;
            } else {
                $approvalStatus = 'approved';
                $approvalDept = $homeDept;
                $approverName = $manager ? $manager['name'] : 'Auto-approved';
                $approvalDecidedAt = now();
                $departmentValue = $hrName;
            }
        }

        // ERP Access requests always go to the designated Document Controller —
        // assignee and department are forced (the form shows them read-only). The
        // assignee email below (TicketEmails::notifyTicketCreated) notifies them.
        $docController = $category === TV::ERP_ACCESS ? DocumentController::current() : null;
        $docControllerAssigned = false;
        if ($docController) {
            $assignee = $docController['name'];
            $docControllerAssigned = true;
            if ($docController['department']) {
                $departmentValue = mb_substr($docController['department'], 0, 80);
            }
        }

        $sla = SlaPolicies::effectiveTargets([
            'priority' => $priority, 'request_type' => $requestType,
            'category' => $category ?: null, 'department' => $departmentValue,
        ]);

        $ticketId = DB::table('tickets')->insertGetId([
            'title' => mb_substr(trim((string) $title), 0, 200),
            'description' => $description ? trim((string) $description) : null,
            'priority' => $priority, 'status' => $status, 'request_type' => $requestType,
            'category' => $category ?: null, 'subcategory' => $subcat, 'subcategory2' => $subcat2,
            'overtime_report' => $overtimeJson, 'department' => $departmentValue,
            'requester' => mb_substr(trim((string) $requesterName), 0, 120),
            'assignee' => $assignee ? mb_substr(trim((string) $assignee), 0, 120) : null,
            'asset_id' => $assetId ? (int) $assetId : null,
            'approval_status' => $approvalStatus, 'approval_dept' => $approvalDept,
            'approver_name' => $approverName, 'approval_decided_at' => $approvalDecidedAt,
            'sla_response_minutes' => $sla['responseMinutes'], 'sla_resolution_minutes' => $sla['resolutionMinutes'],
            'sla_calendar_id' => $sla['calendarId'],
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $creator = $user['name'] ?? $user['email'] ?? 'system';
        DB::table('ticket_activity')->insert([
            'ticket_id' => $ticketId, 'type' => 'change', 'actor' => mb_substr(trim((string) $creator), 0, 120),
            'field' => 'created', 'new_value' => mb_substr(trim((string) $title), 0, 500),
            'created_at' => now(),
        ]);

        if ($docControllerAssigned) {
            DB::table('ticket_activity')->insert([
                'ticket_id' => $ticketId, 'type' => 'change', 'actor' => 'System', 'field' => 'assignee',
                'old_value' => null, 'new_value' => mb_substr((string) $assignee, 0, 500),
                'created_at' => now(),
            ]);
        }

        if ($files) {
            $rows = [];
            foreach ($files as $f) {
                $stored = $this->storeUpload($f);
                $rows[] = [
                    'ticket_id' => $ticketId,
                    'original_filename' => mb_substr($f->getClientOriginalName(), 0, 255),
                    'stored_filename' => $stored,
                    'mime_type' => $f->getClientMimeType(),
                    'size_bytes' => $f->getSize(),
                    'uploaded_by' => $requesterName,
                    'uploaded_at' => now(),
                ];
            }
            DB::table('ticket_attachments')->insert($rows);
        }

        if ($approvalStatus === 'pending' && $pendingManager) {
            DB::table('ticket_activity')->insert([
                'ticket_id' => $ticketId, 'type' => 'change', 'actor' => mb_substr(trim((string) $creator), 0, 120),
                'field' => 'approval_requested', 'new_value' => mb_substr($pendingManager['name'], 0, 500),
                'created_at' => now(),
            ]);
            TicketNotifications::notifyApprovalRequested(['id' => $ticketId, 'title' => $title, 'requester' => $requesterName], $pendingManager);
        } elseif ($approvalStatus === 'approved' && $category === TV::HR_CONCERNS) {
            DB::table('ticket_activity')->insert([
                'ticket_id' => $ticketId, 'type' => 'change', 'actor' => mb_substr(trim((string) $creator), 0, 120),
                'field' => 'approved', 'new_value' => mb_substr((string) ($hrName ?: 'HR'), 0, 500),
                'created_at' => now(),
            ]);
            TicketNotifications::notifyHrRoutedToTeam(['id' => $ticketId]);
        }

        $ticket = (array) DB::table('tickets')->selectRaw(self::DETAIL_COLUMNS)->where('id', $ticketId)->first();
        $atts = DB::table('ticket_attachments')->select('id', 'original_filename as filename', 'stored_filename', 'mime_type', 'size_bytes', 'uploaded_at')
            ->where('ticket_id', $ticketId)->get();
        $ticket['attachments'] = $atts->map(fn ($a) => [
            'id' => $a->id, 'filename' => $a->filename, 'url' => "/uploads/tickets/{$a->stored_filename}",
            'mime_type' => $a->mime_type, 'size_bytes' => $a->size_bytes, 'uploaded_at' => $a->uploaded_at,
        ])->all();

        if ($approvalStatus !== 'pending') {
            TicketNotifications::notifyTicketCreated($ticket, $user['name'] ?? $user['email'] ?? null);
        }

        if ($docControllerAssigned && ($docController['id'] ?? null) !== ($user['sub'] ?? null)) {
            DocumentController::notifyAssigned(['id' => $ticketId, 'title' => $title, 'requester' => $requesterName], $docController);
        }

        TicketNotifications::emitTicketNotifications($ticket, []);
        if (($ticket['category'] ?? null) !== TV::HR_CONCERNS) {
            TicketNotifications::runAutomations('ticket.created', $ticket, ['actor' => $creator]);
        }

        return response()->json($ticket, 201);
    }

    // --- Attachment serving ------------------------------------------------

    /**
     * Scoped, auth-gated ticket-attachment serving — a narrow port of the
     * ticket branch of server/src/lib/upload-access.js (the general /uploads
     * gate covering avatars/chat/spaces/messages is deferred to the phase
     * that ports each of those). Mirrors index.js's headers: force download,
     * never MIME-sniff (uploaded files are user-controlled content).
     */
    public function serveAttachment(Request $request, string $filename)
    {
        $filename = basename($filename); // defense in depth against path traversal
        $att = DB::table('ticket_attachments')->select('ticket_id', 'original_filename', 'mime_type')
            ->where('stored_filename', $filename)->first();
        if (!$att) {
            return response()->json(['error' => 'Not found'], 404);
        }

        $ticket = DB::table('tickets')->select(
            'id', 'requester', 'assignee', 'department', 'category', 'approval_status', 'approval_dept'
        )->where('id', $att->ticket_id)->first();
        if (!$ticket || !$this->canReadTicket($request->authUser(), (array) $ticket)) {
            return response()->json(['error' => 'Not found'], 404);
        }

        $disk = Storage::disk('tickets');
        if (!$disk->exists($filename)) {
            return response()->json(['error' => 'Not found'], 404);
        }

        return response($disk->get($filename), 200, [
            'Content-Type' => $att->mime_type ?: 'application/octet-stream',
            'Content-Disposition' => 'attachment; filename="' . addslashes($att->original_filename) . '"',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    // --- Helpers --------------------------------------------------------

    private function intId(?string $v): ?int
    {
        if ($v === null || $v === '' || !is_numeric($v)) {
            return null;
        }
        $n = (int) $v;
        return $n > 0 ? $n : null;
    }

    private function logChanges(int $ticketId, string $actor, array $changes): void
    {
        $rows = array_map(fn ($c) => [
            'ticket_id' => $ticketId, 'type' => 'change', 'actor' => $actor, 'field' => $c['field'],
            'old_value' => $c['oldValue'] === null ? null : mb_substr((string) $c['oldValue'], 0, 500),
            'new_value' => $c['newValue'] === null ? null : mb_substr((string) $c['newValue'], 0, 500),
            'body' => null, 'created_at' => now(),
        ], $changes);
        DB::table('ticket_activity')->insert($rows);
    }

    private function serializeAttachment(object $a, bool $withUploader = false): array
    {
        $out = [
            'id' => $a->id,
            'filename' => $a->original_filename,
            'url' => "/uploads/tickets/{$a->stored_filename}",
            'mime_type' => $a->mime_type,
            'size_bytes' => $a->size_bytes,
        ];
        if ($withUploader) {
            $out['uploaded_by'] = $a->uploaded_by;
        }
        $out['uploaded_at'] = $a->uploaded_at;
        return $out;
    }

    private function serializeActivity(object $r): array
    {
        return [
            'id' => $r->id, 'type' => $r->type, 'actor' => $r->actor, 'field' => $r->field,
            'old_value' => $r->old_value, 'new_value' => $r->new_value, 'body' => $r->body,
            'created_at' => $r->created_at,
            'attachment' => $r->attachment_id ? [
                'id' => $r->attachment_id, 'filename' => $r->att_filename,
                'url' => "/uploads/tickets/{$r->att_stored}",
                'mime_type' => $r->att_mime, 'size_bytes' => $r->att_size,
            ] : null,
        ];
    }

    /** @return UploadedFile[] */
    private function normalizedFiles(Request $request, string $key): array
    {
        $files = $request->file($key);
        if (!$files) {
            return [];
        }
        $files = is_array($files) ? $files : [$files];
        return array_values(array_filter($files, fn ($f) => $f instanceof UploadedFile && $f->isValid()));
    }

    /** Mirrors multer's fileFilter + size/count limits. Returns an error string, or null if OK. */
    private function validateUpload(UploadedFile $file): ?string
    {
        if (!in_array($file->getClientMimeType(), self::ALLOWED_MIME, true)) {
            return "Unsupported file type: {$file->getClientMimeType()}";
        }
        if ($file->getSize() > self::MAX_FILE_BYTES) {
            return 'File is too large (max 10MB)';
        }
        return null;
    }

    /** Stores an already-validated upload under the 'tickets' disk; returns the stored filename. */
    private function storeUpload(UploadedFile $file): string
    {
        $safe = mb_substr(preg_replace('/[^a-zA-Z0-9._-]/', '_', $file->getClientOriginalName()), 0, 80);
        $stamp = base_convert((string) round(microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(4));
        $storedName = "{$stamp}-{$safe}";
        Storage::disk('tickets')->putFileAs('', $file, $storedName);
        return $storedName;
    }
}
