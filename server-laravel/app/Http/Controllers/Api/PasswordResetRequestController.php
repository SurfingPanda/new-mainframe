<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Audit;
use App\Services\PasswordPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * IT-mediated password-reset queue — ported from
 * server/src/routes/password-resets.js. All routes require `users.manage`.
 */
class PasswordResetRequestController extends Controller
{
    private const ALLOWED_STATUSES = ['pending', 'resolved', 'denied'];

    private const SELECT = ['r.id', 'r.user_id', 'r.email', 'r.status', 'r.resolved_by', 'r.resolved_at',
        'r.admin_notes', 'r.created_at', 'r.updated_at',
        'u.name as user_name', 'u.role as user_role', 'u.department as user_department', 'u.is_active as user_is_active'];

    private function baseQuery()
    {
        return DB::table('password_reset_requests as r')->leftJoin('users as u', 'u.id', '=', 'r.user_id')->select(self::SELECT);
    }

    public function index(Request $request)
    {
        $query = $this->baseQuery();
        $status = $request->query('status');
        if ($status && in_array($status, self::ALLOWED_STATUSES, true)) {
            $query->where('r.status', $status);
        }
        $rows = $query->orderByRaw("(r.status = 'pending') DESC")->orderByDesc('r.created_at')->limit(200)->get();
        return response()->json($rows);
    }

    public function update(Request $request, string $id)
    {
        $id = (int) $id;
        $status = $request->input('status');
        if ($status && !in_array($status, self::ALLOWED_STATUSES, true)) {
            return response()->json(['error' => 'invalid status'], 400);
        }

        $prRequest = DB::table('password_reset_requests')->select('id', 'user_id')->where('id', $id)->first();
        if (!$prRequest) {
            return response()->json(['error' => 'Request not found'], 404);
        }

        $newPassword = $request->input('new_password');
        if ($newPassword !== null && $newPassword !== '') {
            $policyError = PasswordPolicy::error($newPassword);
            if ($policyError) {
                return response()->json(['error' => $policyError], 400);
            }
            DB::table('users')->where('id', $prRequest->user_id)->update([
                'password_hash' => Hash::make((string) $newPassword),
                'token_version' => DB::raw('token_version + 1'),
            ]);
        }

        $updates = [];
        if ($request->has('status')) {
            $user = $request->authUser();
            $updates['status'] = $status;
            $updates['resolved_by'] = $user['name'] ?? $user['email'];
            $updates['resolved_at'] = now();
        }
        if ($request->has('admin_notes')) {
            $notes = $request->input('admin_notes');
            $updates['admin_notes'] = $notes ? mb_substr((string) $notes, 0, 2000) : null;
        }
        if (!$updates) {
            return response()->json(['error' => 'nothing to update'], 400);
        }
        $updates['updated_at'] = now();
        DB::table('password_reset_requests')->where('id', $id)->update($updates);

        $row = $this->baseQuery()->where('r.id', $id)->first();
        if ($request->has('status') || $newPassword) {
            Audit::record($request, [
                'action' => 'password_reset.decide', 'entityType' => 'password_reset', 'entityId' => $id,
                'entityLabel' => $row->email ?? null,
                'changes' => ['status' => $status, 'password_rotated' => (bool) $newPassword],
            ]);
        }
        return response()->json($row);
    }

    public function destroy(Request $request, string $id)
    {
        $id = (int) $id;
        $existing = DB::table('password_reset_requests')->select('email')->where('id', $id)->first();
        $affected = DB::table('password_reset_requests')->where('id', $id)->delete();
        if (!$affected) {
            return response()->json(['error' => 'Request not found'], 404);
        }
        Audit::record($request, ['action' => 'password_reset.delete', 'entityType' => 'password_reset', 'entityId' => $id, 'entityLabel' => $existing?->email]);
        return response()->json(['ok' => true]);
    }
}
