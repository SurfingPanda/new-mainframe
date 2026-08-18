<?php

namespace App\Http\Middleware;

use App\Services\Permissions;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ported from server/src/middleware/auth.js `requirePermission`.
 * Usage: ->middleware('permission:tickets,view')
 */
class EnsurePermission
{
    public function handle(Request $request, Closure $next, string $module, string $action): Response
    {
        $user = $request->attributes->get('auth_user');
        if (!$user || !Permissions::has($user, $module, $action)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }
        return $next($request);
    }
}
