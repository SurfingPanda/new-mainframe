<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ported from server/src/middleware/auth.js `requireRole`.
 * Usage: ->middleware('role:admin,agent')
 */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->attributes->get('auth_user');
        if (!$user || !in_array($user['role'], $roles, true)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }
        return $next($request);
    }
}
