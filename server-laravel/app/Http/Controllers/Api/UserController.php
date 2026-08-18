<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AvatarUpload;
use App\Services\Audit;
use App\Services\InvalidImageException;
use App\Services\PasswordPolicy;
use App\Services\Permissions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Ported from server/src/routes/users.js. `/assignable` and `/directory` are
 * open to any signed-in user; everything else requires `users.manage` (see
 * routes/api.php).
 */
class UserController extends Controller
{
    private const ROLES = ['admin', 'agent', 'user'];
    private const EMAIL_RE = '/^[^\s@]+@[^\s@]+\.[^\s@]+$/';

    private const USER_COLUMNS = ['id', 'email', 'name', 'role', 'department', 'job_title',
        'avatar_url', 'is_active', 'permissions', 'last_login_at', 'created_at', 'updated_at'];

    /** Readable random password (no ambiguous chars) for bulk-imported accounts. */
    private function generatePassword(int $len = 12): string
    {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
        $out = '';
        $bytes = random_bytes($len);
        for ($i = 0; $i < $len; $i++) {
            $out .= $chars[ord($bytes[$i]) % strlen($chars)];
        }
        return $out;
    }

    private function decoratePermissions(object $row): array
    {
        $row = (array) $row;
        $raw = $row['permissions'];
        $row['permissions'] = Permissions::sanitize($raw);
        $row['effective_permissions'] = Permissions::effective(['role' => $row['role'], 'permissions' => $raw]);
        return $row;
    }

    public function assignable()
    {
        return response()->json(
            DB::table('users')->select('id', 'name', 'email', 'role', 'department', 'avatar_url')
                ->where('is_active', 1)->orderBy('name')->get()
        );
    }

    public function directory()
    {
        return response()->json(
            DB::table('users')->select('id', 'name', 'email', 'role', 'department', 'avatar_url', 'last_seen_at')
                ->where('is_active', 1)->orderBy('name')->get()
        );
    }

    public function index()
    {
        $rows = DB::table('users')->select(self::USER_COLUMNS)->orderByDesc('created_at')->get();
        return response()->json($rows->map(fn ($r) => $this->decoratePermissions($r))->all());
    }

    public function store(Request $request)
    {
        $email = $request->input('email');
        $password = $request->input('password');
        $name = $request->input('name');
        $role = $request->input('role', 'user');
        $department = $request->input('department');
        $jobTitle = $request->input('job_title');
        $isActive = $request->has('is_active') ? $request->boolean('is_active') : true;
        $permissions = $request->input('permissions');

        if (!$email || !$password || !$name) {
            return response()->json(['error' => 'email, password, and name are required'], 400);
        }
        if (!in_array($role, self::ROLES, true)) {
            return response()->json(['error' => 'invalid role'], 400);
        }
        $policyError = PasswordPolicy::error($password);
        if ($policyError) {
            return response()->json(['error' => $policyError], 400);
        }
        $cleanPerms = $request->has('permissions') ? Permissions::sanitize($permissions) : null;

        try {
            $id = DB::table('users')->insertGetId([
                'email' => strtolower(trim((string) $email)),
                'password_hash' => Hash::make((string) $password),
                'name' => mb_substr(trim((string) $name), 0, 120),
                'role' => $role,
                'department' => $department ? mb_substr(trim((string) $department), 0, 80) : null,
                'job_title' => $jobTitle ? mb_substr(trim((string) $jobTitle), 0, 120) : null,
                'is_active' => $isActive ? 1 : 0,
                'permissions' => $cleanPerms ? json_encode($cleanPerms) : null,
                'token_version' => 0,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            if ((int) $e->getCode() === 23000) {
                return response()->json(['error' => 'A user with that email already exists'], 409);
            }
            throw $e;
        }

        $row = DB::table('users')->select(self::USER_COLUMNS)->where('id', $id)->first();
        Audit::record($request, [
            'action' => 'user.create', 'entityType' => 'user', 'entityId' => $id, 'entityLabel' => $row->name,
            'changes' => ['email' => $row->email, 'role' => $row->role, 'department' => $row->department, 'is_active' => (bool) $row->is_active],
        ]);
        return response()->json($this->decoratePermissions($row), 201);
    }

    public function import(Request $request)
    {
        $list = $request->input('users');
        if (!is_array($list) || !count($list)) {
            return response()->json(['error' => 'users array is required'], 400);
        }
        if (count($list) > 500) {
            return response()->json(['error' => 'too many rows (max 500 per import)'], 400);
        }

        $results = [];
        $seen = [];

        foreach (array_values($list) as $i => $raw) {
            $raw = is_array($raw) ? $raw : [];
            $rowNum = $i + 1;
            $name = is_string($raw['name'] ?? null) ? trim($raw['name']) : '';
            $email = is_string($raw['email'] ?? null) ? strtolower(trim($raw['email'])) : '';
            $role = !empty($raw['role']) ? strtolower(trim((string) $raw['role'])) : 'user';
            $department = !empty($raw['department']) ? mb_substr(trim((string) $raw['department']), 0, 80) : null;
            $base = ['row' => $rowNum, 'name' => $name, 'email' => $email, 'department' => $department, 'role' => $role];

            if (!$name || !$email) {
                $results[] = [...$base, 'status' => 'error', 'error' => 'name and email are required'];
                continue;
            }
            if (!preg_match(self::EMAIL_RE, $email)) {
                $results[] = [...$base, 'status' => 'error', 'error' => 'invalid email'];
                continue;
            }
            if (!in_array($role, self::ROLES, true)) {
                $results[] = [...$base, 'status' => 'error', 'error' => "invalid role \"{$role}\""];
                continue;
            }
            if (isset($seen[$email])) {
                $results[] = [...$base, 'status' => 'skipped', 'error' => 'duplicate email within file'];
                continue;
            }
            $seen[$email] = true;

            $password = $this->generatePassword();
            try {
                DB::table('users')->insert([
                    'email' => $email, 'password_hash' => Hash::make($password),
                    'name' => mb_substr($name, 0, 120), 'role' => $role, 'department' => $department,
                    'is_active' => 1, 'token_version' => 0, 'created_at' => now(), 'updated_at' => now(),
                ]);
                $results[] = [...$base, 'status' => 'created', 'password' => $password];
            } catch (\Illuminate\Database\QueryException $e) {
                if ((int) $e->getCode() === 23000) {
                    $results[] = [...$base, 'status' => 'skipped', 'error' => 'email already exists'];
                } else {
                    $results[] = [...$base, 'status' => 'error', 'error' => 'could not create user'];
                }
            }
        }

        $summary = [
            'created' => count(array_filter($results, fn ($r) => $r['status'] === 'created')),
            'skipped' => count(array_filter($results, fn ($r) => $r['status'] === 'skipped')),
            'failed' => count(array_filter($results, fn ($r) => $r['status'] === 'error')),
        ];
        if ($summary['created'] > 0) {
            Audit::record($request, ['action' => 'user.import', 'entityType' => 'user', 'changes' => $summary]);
        }
        return response()->json([...$summary, 'results' => $results]);
    }

    public function update(Request $request, string $id)
    {
        $id = (int) $id;
        $before = DB::table('users')->select('name', 'role', 'department', 'job_title', 'is_active', 'permissions')->where('id', $id)->first();
        $before = $before ? (array) $before : null;

        $role = $request->input('role');
        $isActive = $request->has('is_active') ? $request->boolean('is_active') : null;
        $permissions = $request->input('permissions');

        $updates = [];
        if ($request->has('name')) {
            $updates['name'] = mb_substr(trim((string) $request->input('name')), 0, 120);
        }
        if ($request->has('role')) {
            if (!in_array($role, self::ROLES, true)) {
                return response()->json(['error' => 'invalid role'], 400);
            }
            $updates['role'] = $role;
        }
        if ($request->has('department')) {
            $department = $request->input('department');
            $updates['department'] = $department ? mb_substr(trim((string) $department), 0, 80) : null;
        }
        if ($request->has('job_title')) {
            $jobTitle = $request->input('job_title');
            $updates['job_title'] = $jobTitle ? mb_substr(trim((string) $jobTitle), 0, 120) : null;
        }
        if ($request->has('is_active')) {
            $updates['is_active'] = $isActive ? 1 : 0;
        }
        if ($request->has('permissions')) {
            $cleanPerms = Permissions::sanitize($permissions);
            $updates['permissions'] = $cleanPerms ? json_encode($cleanPerms) : null;
        }
        if (!$updates) {
            return response()->json(['error' => 'nothing to update'], 400);
        }

        $me = $request->authUser();
        if (($me['sub'] ?? null) === $id) {
            if ($request->has('role') && $role !== 'admin') {
                return response()->json(['error' => 'You cannot demote your own account.'], 400);
            }
            if ($request->has('is_active') && !$isActive) {
                return response()->json(['error' => 'You cannot deactivate your own account.'], 400);
            }
            if ($request->has('permissions')) {
                return response()->json(['error' => 'You cannot change your own permissions.'], 400);
            }
        }

        $updates['updated_at'] = now();
        $affected = DB::table('users')->where('id', $id)->update($updates);
        if (!$affected) {
            return response()->json(['error' => 'User not found'], 404);
        }

        $row = DB::table('users')->select(self::USER_COLUMNS)->where('id', $id)->first();
        $after = [
            'name' => $row->name, 'role' => $row->role, 'department' => $row->department,
            'job_title' => $row->job_title, 'is_active' => $row->is_active ? 1 : 0,
            'permissions' => $row->permissions,
        ];
        $changes = Audit::diffChanges($before, $after, ['name', 'role', 'department', 'job_title', 'is_active', 'permissions']);
        if ($changes) {
            Audit::record($request, ['action' => 'user.update', 'entityType' => 'user', 'entityId' => $id, 'entityLabel' => $row->name, 'changes' => $changes]);
        }
        return response()->json($this->decoratePermissions($row));
    }

    public function avatarStore(Request $request, string $id)
    {
        $id = (int) $id;
        $file = $request->file('avatar');
        if (!$file || !$file->isValid()) {
            return response()->json(['error' => 'No image was uploaded.'], 400);
        }
        if (!in_array($file->getClientMimeType(), AvatarUpload::ALLOWED_MIME, true)) {
            return response()->json(['error' => 'Profile picture must be a PNG, JPEG, GIF, or WebP image.'], 400);
        }
        if ($file->getSize() > AvatarUpload::MAX_UPLOAD_BYTES) {
            return response()->json(['error' => 'Profile picture is larger than 5 MB.'], 400);
        }

        $prev = DB::table('users')->select('avatar_url')->where('id', $id)->first();
        if (!$prev) {
            return response()->json(['error' => 'User not found'], 404);
        }

        try {
            $avatarUrl = AvatarUpload::save(file_get_contents($file->getRealPath()));
        } catch (InvalidImageException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }

        DB::table('users')->where('id', $id)->update(['avatar_url' => $avatarUrl]);
        AvatarUpload::remove($prev->avatar_url);

        $row = DB::table('users')->select(self::USER_COLUMNS)->where('id', $id)->first();
        return response()->json($this->decoratePermissions($row));
    }

    public function avatarDestroy(string $id)
    {
        $id = (int) $id;
        $prev = DB::table('users')->select('avatar_url')->where('id', $id)->first();
        if (!$prev) {
            return response()->json(['error' => 'User not found'], 404);
        }
        DB::table('users')->where('id', $id)->update(['avatar_url' => null]);
        AvatarUpload::remove($prev->avatar_url);

        $row = DB::table('users')->select(self::USER_COLUMNS)->where('id', $id)->first();
        return response()->json($this->decoratePermissions($row));
    }

    public function resetPassword(Request $request, string $id)
    {
        $id = (int) $id;
        $password = $request->input('password');
        $policyError = PasswordPolicy::error($password);
        if ($policyError) {
            return response()->json(['error' => $policyError], 400);
        }

        $affected = DB::table('users')->where('id', $id)->update([
            'password_hash' => Hash::make((string) $password),
            'token_version' => DB::raw('token_version + 1'),
        ]);
        if (!$affected) {
            return response()->json(['error' => 'User not found'], 404);
        }

        $name = DB::table('users')->where('id', $id)->value('name');
        Audit::record($request, ['action' => 'user.reset_password', 'entityType' => 'user', 'entityId' => $id, 'entityLabel' => $name]);
        return response()->json(['ok' => true]);
    }
}
