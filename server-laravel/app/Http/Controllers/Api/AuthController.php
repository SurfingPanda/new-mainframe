<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\JwtService;
use App\Services\PasswordPolicy;
use App\Services\Permissions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Ported (partial — phase 1) from server/src/routes/auth.js. Covers: login,
 * /me (read + self-service name/job_title edit), change-password, logout.
 *
 * Deferred to later phases (not yet ported): forgot/reset-password (needs the
 * mailer + email templates), /me/stats (needs the SLA engine), avatar +
 * signature upload (needs a sharp/Imagick equivalent), preferences,
 * invalidate-sessions.
 */
class AuthController extends Controller
{
    private const ME_COLUMNS = [
        'id', 'email', 'name', 'role', 'department', 'job_title',
        'avatar_url', 'signature_url', 'permissions', 'preferences',
        'last_login_at', 'created_at',
    ];

    public function login(Request $request)
    {
        $email = (string) $request->input('email', '');
        $password = (string) $request->input('password', '');
        if (!$email || !$password) {
            return response()->json(['error' => 'Email and password are required'], 400);
        }

        $user = DB::table('users')
            ->select('id', 'email', 'password_hash', 'name', 'role', 'department', 'job_title',
                'avatar_url', 'signature_url', 'is_active', 'permissions', 'token_version')
            ->where('email', strtolower(trim($email)))
            ->first();

        if (!$user || !$user->is_active || !Hash::check($password, $user->password_hash)) {
            return response()->json(['error' => 'Invalid email or password'], 401);
        }

        DB::table('users')->where('id', $user->id)->update(['last_login_at' => now()]);

        $permissions = Permissions::effective((array) $user);
        $token = JwtService::issue([
            'sub' => $user->id,
            'email' => $user->email,
            'role' => $user->role,
            'name' => $user->name,
            'permissions' => $permissions,
            'tv' => (int) ($user->token_version ?? 0),
        ]);

        return $this->withAuthCookie(response()->json([
            'user' => [
                'id' => $user->id,
                'email' => $user->email,
                'name' => $user->name,
                'role' => $user->role,
                'department' => $user->department,
                'job_title' => $user->job_title,
                'avatar_url' => $user->avatar_url,
                'signature_url' => $user->signature_url,
                'permissions' => $permissions,
            ],
        ]), $token);
    }

    public function me(Request $request)
    {
        $me = DB::table('users')
            ->select(self::ME_COLUMNS)
            ->where('id', $request->authUser()['sub'])
            ->where('is_active', 1)
            ->first();

        if (!$me) {
            return response()->json(['error' => 'User not found'], 404);
        }

        return response()->json($this->serializeMe($me));
    }

    public function updateMe(Request $request)
    {
        $name = $request->input('name');
        $jobTitle = $request->input('job_title');
        $hasName = $request->has('name');
        $hasJobTitle = $request->has('job_title');

        if (!$hasName && !$hasJobTitle) {
            return response()->json(['error' => 'nothing to update'], 400);
        }

        $fields = [];
        if ($hasName) {
            if (!is_string($name) || trim($name) === '') {
                return response()->json(['error' => 'name cannot be empty'], 400);
            }
            $fields['name'] = mb_substr(trim($name), 0, 120);
        }
        if ($hasJobTitle) {
            $fields['job_title'] = $jobTitle ? mb_substr(trim((string) $jobTitle), 0, 120) : null;
        }

        $userId = $request->authUser()['sub'];
        DB::table('users')->where('id', $userId)->update($fields);

        $me = DB::table('users')
            ->select(self::ME_COLUMNS)
            ->where('id', $userId)
            ->where('is_active', 1)
            ->first();

        if (!$me) {
            return response()->json(['error' => 'User not found'], 404);
        }

        return response()->json($this->serializeMe($me));
    }

    public function changePassword(Request $request)
    {
        $current = (string) $request->input('current_password', '');
        $new = (string) $request->input('new_password', '');
        if (!$current || !$new) {
            return response()->json(['error' => 'current_password and new_password are required'], 400);
        }

        $policyError = PasswordPolicy::error($new);
        if ($policyError) {
            return response()->json(['error' => $policyError], 400);
        }
        if ($current === $new) {
            return response()->json(['error' => 'new password must be different from current password'], 400);
        }

        $userId = $request->authUser()['sub'];
        $row = DB::table('users')->select('id', 'password_hash')
            ->where('id', $userId)->where('is_active', 1)->first();
        if (!$row) {
            return response()->json(['error' => 'User not found'], 404);
        }
        if (!Hash::check($current, $row->password_hash)) {
            return response()->json(['error' => 'Current password is incorrect'], 401);
        }

        DB::table('users')->where('id', $userId)->update([
            'password_hash' => Hash::make($new),
            'token_version' => DB::raw('token_version + 1'),
        ]);

        $authUser = $request->authUser();
        $tv = DB::table('users')->where('id', $userId)->value('token_version');
        $token = JwtService::issue([
            'sub' => $userId,
            'email' => $authUser['email'],
            'role' => $authUser['role'],
            'name' => $authUser['name'],
            'permissions' => $authUser['permissions'],
            'tv' => (int) $tv,
        ]);

        // Re-set the cookie so THIS device keeps a valid token — the version
        // bump above invalidated the old one everywhere, including here.
        return $this->withAuthCookie(response()->json(['ok' => true]), $token);
    }

    public function logout()
    {
        return $this->withoutAuthCookie(response()->json(['ok' => true]));
    }

    private function serializeMe(object $me): array
    {
        $row = (array) $me;
        $row['permissions'] = Permissions::effective($row);
        return $row;
    }

    private function withAuthCookie(HttpResponse $response, string $token): HttpResponse
    {
        $sevenDays = 7 * 24 * 60 * 60;
        $response->headers->setCookie(Cookie::create(
            name: config('hubly.auth_cookie'),
            value: $token,
            expire: time() + $sevenDays,
            path: '/',
            domain: null,
            secure: config('app.env') === 'production',
            httpOnly: true,
            raw: false,
            sameSite: Cookie::SAMESITE_LAX,
        ));
        return $response;
    }

    private function withoutAuthCookie(HttpResponse $response): HttpResponse
    {
        $response->headers->setCookie(Cookie::create(
            name: config('hubly.auth_cookie'),
            value: '',
            expire: time() - 3600,
            path: '/',
            domain: null,
            secure: config('app.env') === 'production',
            httpOnly: true,
            raw: false,
            sameSite: Cookie::SAMESITE_LAX,
        ));
        return $response;
    }
}
