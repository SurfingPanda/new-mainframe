<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Ported from server/src/lib/department-managers.js. A user heads at most one
 * department (departments.manager_id); these answer "does this user manage
 * department X" for department-scoped oversight.
 */
class DepartmentManagers
{
    /** The department NAMES this user heads (normally 0 or 1). @return string[] */
    public static function managedDepartments(?int $userId): array
    {
        if (!$userId) {
            return [];
        }
        return DB::table('departments')->where('manager_id', $userId)->pluck('name')->all();
    }

    public static function managesDepartment(?int $userId, ?string $departmentName): bool
    {
        if (!$userId || !$departmentName) {
            return false;
        }
        return DB::table('departments')
            ->where('manager_id', $userId)
            ->where('name', $departmentName)
            ->exists();
    }

    /** The name of the designated HR department (is_hr = 1), or null if none is set. */
    public static function hrDepartmentName(): ?string
    {
        return DB::table('departments')->where('is_hr', 1)->value('name');
    }

    /** The active manager of the named department as ['id' => .., 'name' => ..], or null. */
    public static function managerOfDepartment(?string $departmentName): ?array
    {
        if (!$departmentName) {
            return null;
        }
        $row = DB::table('departments as d')
            ->join('users as u', 'u.id', '=', 'd.manager_id')
            ->where('d.name', $departmentName)
            ->where('u.is_active', 1)
            ->select('u.id', 'u.name')
            ->first();
        return $row ? ['id' => $row->id, 'name' => $row->name] : null;
    }
}
