<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Placeholder secrets rejected outright — ported from server/src/index.js.
     * These are public (shipped in example env files), so a token signed with
     * one could be forged by anyone.
     */
    private const PLACEHOLDER_SECRETS = [
        'change-me-to-a-long-random-string',
        'change-me',
        'changeme',
        'your-secret-key',
        'your-jwt-secret',
        'secret',
    ];

    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        $this->guardJwtSecret();
        $this->warnOnPermissiveCors();
        $this->configureTrustedProxies();
        $this->registerRequestMacros();
        $this->registerRateLimiters();
    }

    /**
     * Ported from server/src/index.js's fail-fast startup guard.
     */
    private function guardJwtSecret(): void
    {
        $secret = config('hubly.jwt_secret');
        if (!$secret) {
            throw new \RuntimeException(
                'FATAL: JWT_SECRET is not set. Refusing to start. Set a long random value in .env.'
            );
        }
        if (in_array(strtolower(trim($secret)), self::PLACEHOLDER_SECRETS, true)) {
            throw new \RuntimeException(
                'FATAL: JWT_SECRET is set to a known placeholder value. Generate a unique random secret '
                . '(e.g. `php -r "echo bin2hex(random_bytes(48));"`). Refusing to start.'
            );
        }
        if (strlen($secret) < 32) {
            Log::warning('JWT_SECRET is shorter than 32 characters. Use a longer random value for production.');
        }
    }

    private function warnOnPermissiveCors(): void
    {
        if (empty(config('hubly.cors_origins'))) {
            Log::warning('CORS_ORIGINS is not set — allowing all origins. Set it to lock down the API in production.');
        }
    }

    /**
     * Ported from server/src/index.js's TRUST_PROXY handling. Behind a reverse
     * proxy (Hostinger's front-end web server, most PaaS), the rate limiters
     * key off $request->ip() — without this, every client resolves to the
     * proxy's address and shares one bucket (a global self-DoS). Unset
     * TRUST_PROXY = trust nothing (correct for local dev / a direct
     * connection). Laravel trusts by IP/CIDR, not Node's hop-count model —
     * for a single reverse-proxy hop (the usual shared-hosting shape) set
     * TRUST_PROXY=true to trust the calling IP as a proxy (Laravel's '*'
     * behavior — see Illuminate\Http\Middleware\TrustProxies::at()); for a
     * known proxy IP/CIDR, set that instead (comma-separated for multiple).
     *
     * Configured here rather than in bootstrap/app.php's ->withMiddleware()
     * closure: that closure runs before Laravel's LoadEnvironmentVariables
     * step, so env() isn't reliably populated there yet — boot() runs later,
     * after .env is loaded (same reason guardJwtSecret() above works).
     */
    private function configureTrustedProxies(): void
    {
        // env() auto-casts the literal strings "true"/"false" (case-insensitive)
        // to real PHP booleans — handle those before falling back to a string
        // (CIDR list), or `(string) true` silently becomes "1" and gets read
        // as a one-entry proxy list instead of "trust everything".
        $raw = env('TRUST_PROXY');
        if ($raw === null || $raw === false || $raw === '') {
            return;
        }
        if ($raw === true) {
            \Illuminate\Http\Middleware\TrustProxies::at('*');
            return;
        }
        $trustProxy = trim((string) $raw);
        if ($trustProxy === '' || strtolower($trustProxy) === 'false') {
            return;
        }
        \Illuminate\Http\Middleware\TrustProxies::at(
            strtolower($trustProxy) === 'true' ? '*' : array_map('trim', explode(',', $trustProxy))
        );
    }

    /**
     * $request->authUser() reads the array set by JwtAuthenticate middleware.
     */
    private function registerRequestMacros(): void
    {
        Request::macro('authUser', function () {
            /** @var Request $this */
            return $this->attributes->get('auth_user');
        });
    }

    /**
     * Ported from routes/auth.js's dual login limiter (per-IP + per-email) and
     * the change-password limiter (per authenticated user id).
     */
    private function registerRateLimiters(): void
    {
        RateLimiter::for('login-ip', function (Request $request) {
            return Limit::perMinutes(15, 10)->by('login-ip:' . $request->ip());
        });

        RateLimiter::for('login-email', function (Request $request) {
            $email = strtolower(trim((string) $request->input('email', '')));
            // No email to key on — let the handler 400 (matches Node's keyGenerator returning null).
            return $email ? Limit::perMinutes(15, 10)->by('login-email:' . $email) : Limit::none();
        });

        RateLimiter::for('change-password', function (Request $request) {
            $user = $request->authUser();
            $key = $user['sub'] ?? $request->ip();
            return Limit::perMinutes(15, 5)->by('pw:' . $key);
        });

        // Ported from routes/auth.js's forgotLimiter (forgot/reset-password: 5/15min per IP).
        RateLimiter::for('forgot-password', function (Request $request) {
            return Limit::perMinutes(15, 5)->by('forgot:' . $request->ip());
        });

        // Ported from middleware/rateLimit.js's userWriteLimit({ max: 30 }) —
        // throttles ticket creation + activity notes per authenticated user.
        RateLimiter::for('ticket-write', function (Request $request) {
            $user = $request->authUser();
            $key = $user['sub'] ?? $request->ip();
            return Limit::perMinute(30)->by('uw:' . $key);
        });

        // Ported from routes/users.js's avatarLimiter (admin avatar uploads: 40/15min).
        RateLimiter::for('avatar-admin', function (Request $request) {
            $user = $request->authUser();
            $key = $user['sub'] ?? $request->ip();
            return Limit::perMinutes(15, 40)->by('avatar:' . $key);
        });

        // Ported from routes/auth.js's avatarLimiter (self-service avatar +
        // signature uploads: 20/15min per authenticated user).
        RateLimiter::for('avatar-self', function (Request $request) {
            $user = $request->authUser();
            $key = $user['sub'] ?? $request->ip();
            return Limit::perMinutes(15, 20)->by('avatar-self:' . $key);
        });

        // Ported from routes/users.js's importLimiter (bulk user import: 10/15min).
        RateLimiter::for('user-import', function (Request $request) {
            $user = $request->authUser();
            $key = $user['sub'] ?? $request->ip();
            return Limit::perMinutes(15, 10)->by('import:' . $key);
        });

        // Ported from routes/messages.js's sendLimiter (userWriteLimit max 20/min).
        RateLimiter::for('message-send', function (Request $request) {
            $user = $request->authUser();
            $key = $user['sub'] ?? $request->ip();
            return Limit::perMinute(20)->by('uw:' . $key);
        });
    }
}
