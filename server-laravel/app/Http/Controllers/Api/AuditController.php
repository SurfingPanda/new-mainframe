<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * App-wide admin audit trail (read-only) — ported from
 * server/src/routes/audit.js. Admin role only (see routes/api.php's `role:admin`).
 */
class AuditController extends Controller
{
    public function meta()
    {
        return response()->json([
            'actions' => DB::table('audit_log')->distinct()->orderBy('action')->pluck('action'),
            'entityTypes' => DB::table('audit_log')->whereNotNull('entity_type')->distinct()->orderBy('entity_type')->pluck('entity_type'),
        ]);
    }

    public function index(Request $request)
    {
        $query = DB::table('audit_log');

        if ($request->filled('action')) {
            $query->where('action', (string) $request->query('action'));
        }
        if ($request->filled('entity_type')) {
            $query->where('entity_type', (string) $request->query('entity_type'));
        }
        if ($request->filled('entity_id')) {
            $query->where('entity_id', (string) $request->query('entity_id'));
        }
        if ($request->filled('actor_id')) {
            $query->where('actor_id', (int) $request->query('actor_id'));
        }
        if ($request->filled('from')) {
            $query->where('created_at', '>=', (string) $request->query('from'));
        }
        if ($request->filled('to')) {
            $query->where('created_at', '<=', (string) $request->query('to'));
        }
        if ($request->filled('q')) {
            $like = '%' . addcslashes((string) $request->query('q'), '%_\\') . '%';
            $query->where(function ($w) use ($like) {
                $w->where('actor_name', 'like', $like)
                    ->orWhere('entity_label', 'like', $like)
                    ->orWhere('action', 'like', $like);
            });
        }

        $page = max(1, (int) $request->query('page', 1));
        $pageSize = min(100, max(1, (int) $request->query('pageSize', 50)));
        $total = (clone $query)->count();
        $items = $query->select('id', 'actor_id', 'actor_name', 'action', 'entity_type', 'entity_id', 'entity_label', 'changes', 'ip', 'created_at')
            ->orderByDesc('id')->forPage($page, $pageSize)->get();

        return response()->json(['items' => $items, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize]);
    }
}
