<?php

namespace App\Http\Middleware;

use App\Services\JwtService;
use App\Services\Permissions;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ported from server/src/middleware/auth.js `requireAuth`. Verifies the JWT
 * (cookie preferred, Bearer header fallback), then re-loads the user from the
 * DB on every request so role/permission/active-status changes take effect
 * immediately — not whatever was true when the token was issued.
 *
 * Sets $request->attributes->set('auth_user', [...]) — see the `authUser()`
 * request macro registered in AppServiceProvider.
 */
class JwtAuthenticate
{
    // Matches the Node backend's in-memory presence throttle, but backed by
    // the (file-based) cache so it holds across PHP-FPM worker processes.
    private const PRESENCE_THROTTLE_SECONDS = 30;

    public function handle(Request $request, Closure $next): Response
    {
        $token = $this->tokenFromRequest($request);
        if (!$token) {
            return response()->json(['error' => 'Authentication required'], 401);
        }

        $payload = JwtService::verify($token);
        if (!$payload) {
            return response()->json(['error' => 'Invalid or expired token'], 401);
        }

        $userId = (int) ($payload['sub'] ?? 0);
        if ($userId <= 0) {
            return response()->json(['error' => 'Invalid or expired token'], 401);
        }

        $user = DB::table('users')
            ->select('id', 'email', 'name', 'role', 'department', 'permissions', 'is_active', 'token_version')
            ->where('id', $userId)
            ->first();

        if (!$user || !$user->is_active) {
            return response()->json(['error' => 'Account is inactive or no longer exists'], 401);
        }

        $tokenVersion = (int) ($payload['tv'] ?? 0);
        if ($tokenVersion !== (int) $user->token_version) {
            return response()->json(['error' => 'Session expired. Please sign in again.'], 401);
        }

        $userArray = (array) $user;
        $authUser = [
            'sub' => (int) $user->id,
            'email' => $user->email,
            'name' => $user->name,
            'role' => $user->role,
            'department' => $user->department,
            'permissions' => Permissions::effective($userArray),
        ];

        $request->attributes->set('auth_user', $authUser);
        $this->bumpPresence((int) $user->id);

        return $next($request);
    }

    private function tokenFromRequest(Request $request): ?string
    {
        $cookie = $request->cookie(config('hubly.auth_cookie'));
        if ($cookie) {
            return $cookie;
        }
        $header = (string) $request->header('Authorization', '');
        return str_starts_with($header, 'Bearer ') ? substr($header, 7) : null;
    }

    private function bumpPresence(int $userId): void
    {
        $key = "presence:{$userId}";
        if (Cache::has($key)) {
            return;
        }
        Cache::put($key, true, self::PRESENCE_THROTTLE_SECONDS);
        // Best-effort — never block the request on this write.
        try {
            DB::table('users')->where('id', $userId)->update(['last_seen_at' => now()]);
        } catch (\Throwable) {
            //
        }
    }
}
