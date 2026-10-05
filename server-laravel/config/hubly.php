<?php

// App-specific config ported from server/.env.example — mirrors the Node
// backend's env-driven behavior (see server/src/index.js, routes/auth.js).

return [
    'jwt_secret' => env('JWT_SECRET'),
    'jwt_expires_in' => env('JWT_EXPIRES_IN', '7d'),

    // httpOnly auth cookie name — must match the Node backend's if the two
    // ever run behind the same origin during a phased cutover.
    'auth_cookie' => 'mf_token',

    'cors_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('CORS_ORIGINS', ''))
    ))),

    // TRUST_PROXY itself is read directly via env() in bootstrap/app.php (not
    // here) — the proxy-trust middleware is configured before the config
    // repository is reliably available, same reason Laravel's own docs do it
    // that way.

    'app_base_url' => env('APP_BASE_URL', 'http://localhost:5173'),

    // Shared secret for the HTTP cron fallback (routes/cron.php) — for
    // Hostinger cron plans that can only fetch a URL, not run a CLI command
    // (see app/Console/Commands/RunSlaMonitor.php for the CLI alternative).
    // Required to trigger the endpoint; unset = endpoint always 404s.
    'cron_secret' => env('CRON_SECRET'),

    // Mailer — ported 1:1 from server/.env.example's env var names (not
    // Laravel's native MAIL_* convention) so this stays diffable against the
    // Node backend's config. See app/Services/Mailer.php: unconfigured = sends
    // are logged no-ops, matching the Node original's "app still works" design.
    // MAIL_DISABLED=1 forces every send to be a logged no-op even when credentials
    // are set — used by the Playwright e2e run so it can never email anyone.
    'mail_disabled' => (bool) env('MAIL_DISABLED', false),
    'resend_api_key' => env('RESEND_API_KEY'),
    'smtp_host' => env('SMTP_HOST'),
    'smtp_port' => env('SMTP_PORT', 587),
    'smtp_secure' => env('SMTP_SECURE', false),
    'smtp_user' => env('SMTP_USER'),
    'smtp_pass' => env('SMTP_PASS'),
    'mail_from' => env('MAIL_FROM', 'Hubly Ticketing <no-reply@mainframe.local>'),

    // UniFi Network Monitoring dashboard — unset UNIFI_HOST = mock data.
    'unifi_host' => env('UNIFI_HOST'),
    'unifi_username' => env('UNIFI_USERNAME'),
    'unifi_password' => env('UNIFI_PASSWORD'),
    'unifi_site' => env('UNIFI_SITE', 'default'),
    'unifi_os' => env('UNIFI_OS'),
    'unifi_insecure_tls' => env('UNIFI_INSECURE_TLS', true),
    'unifi_cookie' => env('UNIFI_COOKIE'),

    // Optional — Claude Vision chart extraction on the Network Reports page.
    'anthropic_api_key' => env('ANTHROPIC_API_KEY'),
    'anthropic_model' => env('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),
];
