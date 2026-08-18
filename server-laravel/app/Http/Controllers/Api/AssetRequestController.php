<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\TicketNotifications;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Ported from server/src/routes/asset-requests.js. List/create: any signed-in
 * user. Update: admin/agent. Delete: admin. See routes/api.php for the role
 * gates (this module predates the permission system — Node gates it by role,
 * not requirePermission — so this port matches with `role:` middleware).
 */
class AssetRequestController extends Controller
{
    private const URGENCIES = ['low', 'normal', 'high', 'urgent'];
    private const STATUSES = ['pending', 'approved', 'denied', 'fulfilled'];

    public function index(Request $request)
    {
        $user = $request->authUser();
        $isStaff = in_array($user['role'] ?? null, ['admin', 'agent'], true);

        $query = DB::table('asset_requests');
        if (!$isStaff) {
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

    public function update(Request $request, string $id)
    {
        $id = (int) $id;
        $status = $request->input('status');
        if (!$status || !in_array($status, self::STATUSES, true)) {
            return response()->json(['error' => 'Valid status is required'], 400);
        }

        $user = $request->authUser();
        $affected = DB::table('asset_requests')->where('id', $id)->update([
            'status' => $status,
            'admin_notes' => $request->input('admin_notes') ?: null,
            'reviewed_by' => $user['name'] ?? $user['email'],
            'reviewed_at' => now(),
            'updated_at' => now(),
        ]);
        if (!$affected) {
            return response()->json(['error' => 'Request not found'], 404);
        }

        $row = DB::table('asset_requests')->where('id', $id)->first();
        TicketNotifications::notifyAssetRequestDecision((array) $row, $user['name'] ?? $user['email']);
        return response()->json($row);
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
