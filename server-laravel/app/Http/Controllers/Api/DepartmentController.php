<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Audit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Ported from server/src/routes/departments.js. List is open to any signed-in
 * user (see routes/api.php); writes require `users.manage`.
 */
class DepartmentController extends Controller
{
    private const SELECT = ['d.id', 'd.name', 'd.description', 'd.manager_id', 'u.name as manager_name',
        'd.is_hr', 'd.is_active', 'd.created_at', 'd.updated_at'];

    private function baseQuery()
    {
        return DB::table('departments as d')->leftJoin('users as u', 'u.id', '=', 'd.manager_id')->select(self::SELECT);
    }

    /** At most one department is the HR/approvals target. */
    private function clearOtherHrFlags(int $keepId): void
    {
        DB::table('departments')->where('id', '<>', $keepId)->update(['is_hr' => 0]);
    }

    /**
     * Validate a manager_id against the department it will head. Only called
     * when the field is present in the request (callers check that via
     * $request->has() first — Node's `raw === undefined` early-return).
     * @return array{0: ?int, 1: ?string} [resolvedValue, error] — null value
     *   with no error means "explicitly clear the manager".
     */
    private function resolveManagerId(mixed $raw, string $deptName): array
    {
        if ($raw === null || $raw === '') {
            return [null, null];
        }
        if (!is_numeric($raw) || (int) $raw != $raw || (int) $raw <= 0) {
            return [null, 'Invalid manager'];
        }
        $id = (int) $raw;
        $u = DB::table('users')->select('id', 'is_active', 'department')->where('id', $id)->first();
        if (!$u || !$u->is_active) {
            return [null, 'Manager must be an active user'];
        }
        if (($u->department ?? '') !== $deptName) {
            return [null, 'The manager must belong to this department'];
        }
        return [$id, null];
    }

    public function index()
    {
        return response()->json($this->baseQuery()->orderBy('d.name')->get());
    }

    public function store(Request $request)
    {
        $name = trim((string) $request->input('name', ''));
        if (!$name) {
            return response()->json(['error' => 'name is required'], 400);
        }
        $deptName = mb_substr($name, 0, 80);

        $managerId = null;
        if ($request->has('manager_id')) {
            [$managerId, $err] = $this->resolveManagerId($request->input('manager_id'), $deptName);
            if ($err) {
                return response()->json(['error' => $err], 400);
            }
        }

        $isHr = (bool) $request->boolean('is_hr');
        try {
            $id = DB::table('departments')->insertGetId([
                'name' => $deptName,
                'description' => $request->input('description') ? mb_substr(trim((string) $request->input('description')), 0, 255) : null,
                'is_active' => $request->has('is_active') ? ($request->boolean('is_active') ? 1 : 0) : 1,
                'manager_id' => $managerId,
                'is_hr' => $isHr ? 1 : 0,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            if ((int) $e->getCode() === 23000) {
                return response()->json(['error' => 'A department with that name already exists'], 409);
            }
            throw $e;
        }
        if ($isHr) {
            $this->clearOtherHrFlags($id);
        }

        $row = $this->baseQuery()->where('d.id', $id)->first();
        Audit::record($request, [
            'action' => 'dept.create', 'entityType' => 'department', 'entityId' => $id, 'entityLabel' => $row->name,
            'changes' => ['manager_id' => $row->manager_id, 'is_hr' => (bool) $row->is_hr, 'is_active' => (bool) $row->is_active],
        ]);
        return response()->json($row, 201);
    }

    public function update(Request $request, string $id)
    {
        $id = (int) $id;
        $current = DB::table('departments')->select('name', 'description', 'is_active', 'manager_id', 'is_hr')->where('id', $id)->first();
        if (!$current) {
            return response()->json(['error' => 'Department not found'], 404);
        }

        $name = $request->input('name');
        $effectiveName = ($request->has('name') && trim((string) $name))
            ? mb_substr(trim((string) $name), 0, 80)
            : $current->name;

        $updates = [];
        if ($request->has('name')) {
            if (!trim((string) $name)) {
                return response()->json(['error' => 'name cannot be blank'], 400);
            }
            $updates['name'] = $effectiveName;
        }
        if ($request->has('description')) {
            $description = $request->input('description');
            $updates['description'] = $description ? mb_substr(trim((string) $description), 0, 255) : null;
        }
        if ($request->has('is_active')) {
            $updates['is_active'] = $request->boolean('is_active') ? 1 : 0;
        }
        if ($request->has('manager_id')) {
            [$managerId, $err] = $this->resolveManagerId($request->input('manager_id'), $effectiveName);
            if ($err) {
                return response()->json(['error' => $err], 400);
            }
            $updates['manager_id'] = $managerId;
        }
        $isHr = $request->has('is_hr') ? $request->boolean('is_hr') : null;
        if ($isHr !== null) {
            $updates['is_hr'] = $isHr ? 1 : 0;
        }
        if (!$updates) {
            return response()->json(['error' => 'nothing to update'], 400);
        }

        try {
            $updates['updated_at'] = now();
            $affected = DB::table('departments')->where('id', $id)->update($updates);
        } catch (\Illuminate\Database\QueryException $e) {
            if ((int) $e->getCode() === 23000) {
                return response()->json(['error' => 'A department with that name already exists'], 409);
            }
            throw $e;
        }
        if (!$affected) {
            return response()->json(['error' => 'Department not found'], 404);
        }
        if ($isHr) {
            $this->clearOtherHrFlags($id);
        }

        $row = $this->baseQuery()->where('d.id', $id)->first();
        $after = [
            'name' => $row->name, 'description' => $row->description,
            'is_active' => $row->is_active ? 1 : 0, 'manager_id' => $row->manager_id,
            'is_hr' => $row->is_hr ? 1 : 0,
        ];
        $before = (array) $current;
        $before['is_active'] = $current->is_active ? 1 : 0;
        $before['is_hr'] = $current->is_hr ? 1 : 0;
        $changes = Audit::diffChanges($before, $after, ['name', 'description', 'is_active', 'manager_id', 'is_hr']);
        if ($changes) {
            Audit::record($request, [
                'action' => 'dept.update', 'entityType' => 'department', 'entityId' => $id,
                'entityLabel' => $row->name, 'changes' => $changes,
            ]);
        }
        return response()->json($row);
    }

    public function destroy(Request $request, string $id)
    {
        $id = (int) $id;
        $existing = DB::table('departments')->select('name')->where('id', $id)->first();
        $affected = DB::table('departments')->where('id', $id)->delete();
        if (!$affected) {
            return response()->json(['error' => 'Department not found'], 404);
        }
        Audit::record($request, ['action' => 'dept.delete', 'entityType' => 'department', 'entityId' => $id, 'entityLabel' => $existing?->name]);
        return response()->json(['ok' => true]);
    }
}
