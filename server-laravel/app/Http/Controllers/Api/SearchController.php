<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DepartmentManagers;
use App\Services\Permissions;
use App\Services\TicketVisibility as TV;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SearchController extends Controller
{
    public function index(Request $request)
    {
        $term = trim((string) $request->query('q', ''));
        $empty = ['tickets' => [], 'spaces' => [], 'kb' => [], 'assets' => [], 'users' => []];
        if (mb_strlen($term) < 2) {
            return response()->json($empty);
        }

        $user = $request->authUser();
        $like = '%' . addcslashes(mb_substr($term, 0, 100), '%_\\') . '%';
        $result = $empty;

        if (Permissions::has($user, 'tickets', 'view')) {
            $tickets = DB::table('tickets')
                ->select('id', 'title', 'status')
                ->where(fn ($q) => $q->where('title', 'like', $like)->orWhere('description', 'like', $like));

            $hrDepartment = DepartmentManagers::hrDepartmentName();
            $isHrMember = $hrDepartment && ($user['department'] ?? null) === $hrDepartment;
            if (!$isHrMember) {
                $tickets->where(fn ($q) => $q->where('category', '<>', TV::HR_CONCERNS)->orWhereNull('category'));
            }

            if (!TV::isStaff($user)) {
                $identities = TV::userIdentities($user);
                $department = $user['department'] ?? null;
                $managed = DepartmentManagers::managedDepartments($user['sub'] ?? null);
                $tickets->where(function ($q) use ($identities, $department, $managed) {
                    $q->where('category', '<>', TV::HR_CONCERNS)->orWhereNull('category');
                    if ($identities) {
                        $q->orWhereIn('requester', $identities)->orWhereIn('assignee', $identities);
                    }
                    if ($department) {
                        $q->orWhere(fn ($hr) => $hr->where('category', TV::HR_CONCERNS)->where('department', $department));
                    }
                    if ($managed) {
                        $q->orWhereIn('approval_dept', $managed)
                            ->orWhereIn('department', $managed);
                    }
                });
            }
            $result['tickets'] = $tickets->orderByDesc('updated_at')->limit(5)->get();
        }

        if (Permissions::has($user, 'spaces', 'view')) {
            $spaces = DB::table('space_items as i')
                ->join('spaces as s', 's.id', '=', 'i.space_id')
                ->select('i.id', 'i.space_id', 'i.item_key', 'i.title', 's.name as space_name')
                ->where('s.is_archived', 0)
                ->where(fn ($q) => $q->where('i.title', 'like', $like)->orWhere('i.item_key', 'like', $like));
            if (!Permissions::has($user, 'spaces', 'manage')) {
                $spaces->whereExists(fn ($q) => $q->selectRaw('1')->from('space_members as m')
                    ->whereColumn('m.space_id', 's.id')->where('m.user_id', $user['sub'])
                    ->where('m.role', '<>', 'project_owner'));
            }
            $result['spaces'] = $spaces->orderByDesc('i.updated_at')->limit(5)->get();
        }

        if (Permissions::has($user, 'kb', 'view')) {
            $kb = DB::table('kb_articles')
                ->select('id', 'title', 'slug', 'category')
                ->where(fn ($q) => $q->where('title', 'like', $like)->orWhere('body', 'like', $like));
            if (!Permissions::has($user, 'kb', 'manage')) {
                $kb->where('published', 1);
            }
            $result['kb'] = $kb->orderByDesc('updated_at')->limit(5)->get();
        }

        if (Permissions::has($user, 'assets', 'view')) {
            $assets = DB::table('assets')
                ->select('id', 'asset_tag', 'type', 'model', 'assignee')
                ->where(fn ($q) => $q->where('asset_tag', 'like', $like)->orWhere('type', 'like', $like)
                    ->orWhere('model', 'like', $like)->orWhere('serial_no', 'like', $like));
            if (!TV::isStaff($user)) {
                $assets->whereRaw('LOWER(assignee) IN (?, ?)', [
                    strtolower((string) ($user['email'] ?? '')),
                    strtolower((string) ($user['name'] ?? '')),
                ]);
            }
            $result['assets'] = $assets->orderBy('asset_tag')->limit(5)->get();
        }

        if (Permissions::has($user, 'users', 'manage')) {
            $result['users'] = DB::table('users')
                ->select('id', 'name', 'email', 'avatar_url')
                ->where(fn ($q) => $q->where('name', 'like', $like)->orWhere('email', 'like', $like))
                ->orderBy('name')->limit(5)->get();
        }

        return response()->json($result);
    }
}
