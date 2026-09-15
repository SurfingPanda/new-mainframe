<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\TicketNotifications;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Ported from server/src/routes/asset-requests.js. List/create: any signed-in
 * user. Update: IT reviewers only (see isAssetReviewer). Delete: admin. See
 * routes/api.php for the delete role gate; update is gated inline here since
 * it isn't a plain role check.
 */
class AssetRequestController extends Controller
{
    private const URGENCIES = ['low', 'normal', 'high', 'urgent'];
    private const STATUSES = ['pending', 'approved', 'denied', 'fulfilled'];

    private static function isItDepartment(array $user): bool
    {
        $department = strtoupper(trim((string) ($user['department'] ?? '')));
        return in_array($department, ['IT', 'IT DEPARTMENT'], true);
    }

    // Every member of IT may see the complete request queue. Admins retain
    // global visibility even when their account belongs to another department.
    private static function canViewAll(array $user): bool
    {
        return ($user['role'] ?? null) === 'admin' || self::isItDepartment($user);
    }

    // Requests always route to IT, so reviewing/approving them is IT's job:
    // any admin (global oversight), or any member of the IT department.
    private static function isAssetReviewer(array $user): bool
    {
        if (($user['role'] ?? null) === 'admin') return true;
        return self::isItDepartment($user);
    }

    public function index(Request $request)
    {
        $user = $request->authUser();
        $showAll = self::isAssetReviewer($user)
            || ($request->query('scope') === 'all' && self::canViewAll($user));

        $query = DB::table('asset_requests');
        if (!$showAll) {
            $query->where('requester_id', $user['sub']);
        }
        $status = $request->query('status');
        if ($status && in_array($status, self::STATUSES, true)) {
            $query->where('status', $status);
        }

        return response()->json($query->orderByDesc('created_at')->limit(200)->get());
    }

    public function store(Request $request)
    {
        $user = $request->authUser();
        $assetType = $request->input('asset_type');
        $justification = $request->input('justification');
        $urgency = $request->input('urgency');

        if (!$assetType || !$justification) {
            return response()->json(['error' => 'asset_type and justification are required'], 400);
        }
        if ($urgency && !in_array($urgency, self::URGENCIES, true)) {
            return response()->json(['error' => 'Invalid urgency level'], 400);
        }

        $qty = max(1, min((int) ($request->input('quantity') ?: 1), 50));

        $id = DB::table('asset_requests')->insertGetId([
            'requester_id' => $user['sub'],
            'requester_name' => $user['name'] ?? $user['email'],
            'asset_type' => mb_substr(trim((string) $assetType), 0, 60),
            'quantity' => $qty,
            'urgency' => $urgency ?: 'normal',
            'justification' => mb_substr(trim((string) $justification), 0, 2000),
            'department' => $request->input('department') ? mb_substr(trim((string) $request->input('department')), 0, 80) : null,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return response()->json(DB::table('asset_requests')->where('id', $id)->first(), 201);
    }

    public function show(Request $request, string $id)
    {
        $user = $request->authUser();
        if (!self::isAssetReviewer($user)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }
        $row = DB::table('asset_requests')->where('id', (int) $id)->first();
        if (!$row) {
            return response()->json(['error' => 'Request not found'], 404);
        }

        return response()->json($row);
    }

    public function update(Request $request, string $id)
    {
        $user = $request->authUser();
        if (!self::isAssetReviewer($user)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $id = (int) $id;
        $status = $request->input('status');
        if (!$status || !in_array($status, self::STATUSES, true)) {
            return response()->json(['error' => 'Valid status is required'], 400);
        }

        $updates = [
            'status' => $status,
            'reviewed_by' => $user['name'] ?? $user['email'],
            'reviewed_at' => now(),
            'updated_at' => now(),
        ];
        if ($request->has('admin_notes')) {
            $notes = trim((string) $request->input('admin_notes'));
            $updates['admin_notes'] = $notes !== '' ? mb_substr($notes, 0, 60000) : null;
        }

        $affected = DB::table('asset_requests')->where('id', $id)->update($updates);
        if (!$affected) {
            return response()->json(['error' => 'Request not found'], 404);
        }

        $row = DB::table('asset_requests')->where('id', $id)->first();
        TicketNotifications::notifyAssetRequestDecision((array) $row, $user['name'] ?? $user['email']);
        return response()->json($row);
    }

    public function storeNote(Request $request, string $id)
    {
        $user = $request->authUser();
        if (!self::isAssetReviewer($user)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $body = trim((string) $request->input('body'));
        if ($body === '') {
            return response()->json(['error' => 'Note is required'], 400);
        }
        if (mb_strlen($body) > 2000) {
            return response()->json(['error' => 'Note must be 2000 characters or fewer'], 400);
        }

        $id = (int) $id;
        $row = DB::table('asset_requests')->where('id', $id)->first();
        if (!$row) {
            return response()->json(['error' => 'Request not found'], 404);
        }

        $author = $user['name'] ?? $user['email'];
        $entry = '[' . now()->format('Y-m-d H:i') . '] ' . $author . "\n" . $body;
        $notes = trim((string) ($row->admin_notes ?? ''));
        $combined = $notes === '' ? $entry : $notes . "\n\n" . $entry;
        if (strlen($combined) > 60000) {
            return response()->json(['error' => 'The follow-up note history is full'], 422);
        }

        DB::table('asset_requests')->where('id', $id)->update([
            'admin_notes' => $combined,
            'updated_at' => now(),
        ]);

        return response()->json(DB::table('asset_requests')->where('id', $id)->first(), 201);
    }

    public function destroy(string $id)
    {
        $affected = DB::table('asset_requests')->where('id', (int) $id)->delete();
        if (!$affected) {
            return response()->json(['error' => 'Request not found'], 404);
        }
        return response()->json(['ok' => true]);
    }
}
