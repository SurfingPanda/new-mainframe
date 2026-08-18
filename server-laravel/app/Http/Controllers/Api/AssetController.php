<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\TicketVisibility as TV;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Ported from server/src/routes/assets.js. */
class AssetController extends Controller
{
    private const STATUSES = ['in_use', 'in_storage', 'repair', 'retired'];
    private const ASSET_TYPES = [
        'Laptop', 'Desktop', 'Monitor', 'Keyboard', 'Mouse',
        'Printer', 'Scanner', 'Phone', 'Tablet', 'Server',
        'Networking', 'UPS', 'Docking Station', 'Headset', 'Other',
    ];

    public function index(Request $request)
    {
        $user = $request->authUser();
        $query = DB::table('assets')->select(
            'id', 'asset_tag', 'type', 'model', 'serial_no', 'assignee', 'location', 'status', 'purchased_at', 'created_at', 'updated_at'
        );

        // Non-staff may only see assets assigned to them — enforced server-side
        // even though the UI already filters client-side.
        if (!TV::isStaff($user)) {
            $mine = [strtolower((string) ($user['email'] ?? '')), strtolower((string) ($user['name'] ?? ''))];
            $query->whereRaw('LOWER(assignee) IN (?, ?)', $mine);
        }

        $status = $request->query('status');
        if ($status && in_array($status, self::STATUSES, true)) {
            $query->where('status', $status);
        }
        $type = $request->query('type');
        if ($type) {
            $query->where('type', $type);
        }
        $q = $request->query('q');
        if ($q) {
            $like = "%{$q}%";
            $query->where(function ($w) use ($like) {
                $w->where('asset_tag', 'like', $like)
                    ->orWhere('model', 'like', $like)
                    ->orWhere('assignee', 'like', $like)
                    ->orWhere('serial_no', 'like', $like)
                    ->orWhere('location', 'like', $like);
            });
        }

        return response()->json($query->orderBy('asset_tag')->limit(500)->get());
    }

    public function metaTypes()
    {
        return response()->json(self::ASSET_TYPES);
    }

    public function show(Request $request, string $id)
    {
        $asset = DB::table('assets')->where('id', (int) $id)->first();
        if (!$asset) {
            return response()->json(['error' => 'Asset not found'], 404);
        }

        $user = $request->authUser();
        if (!TV::isStaff($user)) {
            $mine = [strtolower((string) ($user['email'] ?? '')), strtolower((string) ($user['name'] ?? ''))];
            // 404 (not 403) so the endpoint can't be used to probe which asset ids exist.
            if (!$asset->assignee || !in_array(strtolower((string) $asset->assignee), $mine, true)) {
                return response()->json(['error' => 'Asset not found'], 404);
            }
        }
        return response()->json($asset);
    }

    public function store(Request $request)
    {
        $assetTag = $request->input('asset_tag');
        $type = $request->input('type');
        $status = $request->input('status', 'in_use');
        if (!$assetTag || !$type) {
            return response()->json(['error' => 'asset_tag and type are required'], 400);
        }
        if (!in_array($status, self::STATUSES, true)) {
            return response()->json(['error' => 'invalid status'], 400);
        }

        try {
            $id = DB::table('assets')->insertGetId([
                'asset_tag' => mb_substr(strtoupper(trim((string) $assetTag)), 0, 60),
                'type' => mb_substr(trim((string) $type), 0, 60),
                'model' => $request->input('model') ? mb_substr(trim((string) $request->input('model')), 0, 120) : null,
                'serial_no' => $request->input('serial_no') ? mb_substr(trim((string) $request->input('serial_no')), 0, 120) : null,
                'assignee' => $request->input('assignee') ? mb_substr(trim((string) $request->input('assignee')), 0, 120) : null,
                'location' => $request->input('location') ? mb_substr(trim((string) $request->input('location')), 0, 120) : null,
                'status' => $status,
                'purchased_at' => $request->input('purchased_at') ?: null,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            if ((int) $e->getCode() === 23000) {
                return response()->json(['error' => 'An asset with that tag already exists'], 409);
            }
            throw $e;
        }

        return response()->json(DB::table('assets')->where('id', $id)->first(), 201);
    }

    public function update(Request $request, string $id)
    {
        $id = (int) $id;
        $updates = [];
        if ($request->has('asset_tag')) {
            $updates['asset_tag'] = mb_substr(strtoupper(trim((string) $request->input('asset_tag'))), 0, 60);
        }
        if ($request->has('type')) {
            $updates['type'] = mb_substr(trim((string) $request->input('type')), 0, 60);
        }
        if ($request->has('model')) {
            $model = $request->input('model');
            $updates['model'] = $model ? mb_substr(trim((string) $model), 0, 120) : null;
        }
        if ($request->has('serial_no')) {
            $serial = $request->input('serial_no');
            $updates['serial_no'] = $serial ? mb_substr(trim((string) $serial), 0, 120) : null;
        }
        if ($request->has('assignee')) {
            $assignee = $request->input('assignee');
            $updates['assignee'] = $assignee ? mb_substr(trim((string) $assignee), 0, 120) : null;
        }
        if ($request->has('location')) {
            $location = $request->input('location');
            $updates['location'] = $location ? mb_substr(trim((string) $location), 0, 120) : null;
        }
        if ($request->has('status')) {
            $status = $request->input('status');
            if (!in_array($status, self::STATUSES, true)) {
                return response()->json(['error' => 'invalid status'], 400);
            }
            $updates['status'] = $status;
        }
        if ($request->has('purchased_at')) {
            $updates['purchased_at'] = $request->input('purchased_at') ?: null;
        }
        if (!$updates) {
            return response()->json(['error' => 'nothing to update'], 400);
        }

        try {
            $updates['updated_at'] = now();
            $affected = DB::table('assets')->where('id', $id)->update($updates);
        } catch (\Illuminate\Database\QueryException $e) {
            if ((int) $e->getCode() === 23000) {
                return response()->json(['error' => 'An asset with that tag already exists'], 409);
            }
            throw $e;
        }
        if (!$affected) {
            return response()->json(['error' => 'Asset not found'], 404);
        }
        return response()->json(DB::table('assets')->where('id', $id)->first());
    }

    public function destroy(string $id)
    {
        $affected = DB::table('assets')->where('id', (int) $id)->delete();
        if (!$affected) {
            return response()->json(['error' => 'Asset not found'], 404);
        }
        return response()->json(['ok' => true]);
    }
}
