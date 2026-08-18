<?php

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\JwtAuthenticate;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function () {
            // Unprefixed (not under /api) — see routes/uploads.php for why.
            Route::middleware('api')->group(__DIR__.'/../routes/uploads.php');
            Route::middleware('api')->group(__DIR__.'/../routes/cron.php');
        },
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Applied to every response, API + /uploads alike (defense in depth —
        // ported from server/src/middleware/securityHeaders.js).
        $middleware->append(SecurityHeaders::class);

        $middleware->alias([
            'auth.jwt' => JwtAuthenticate::class,
            'role' => EnsureRole::class,
            'permission' => EnsurePermission::class,
        ]);

        // TRUST_PROXY is configured from App\Providers\AppServiceProvider::boot()
        // instead of here — env() isn't reliably loaded yet at the point this
        // closure runs (it's invoked during bootstrap, before Laravel's
        // LoadEnvironmentVariables step), unlike AppServiceProvider::boot()
        // where the JWT-secret guard already depends on env() working.
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // This app is API-only — always render JSON, matching the Node
        // backend's central error handler + 404 handler in index.js.
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => true);
    })->create();
