<?php

// Mirrors server/src/index.js's CORS setup: locked to CORS_ORIGINS in
// production, permissive (reflects the request origin) when unset — a
// startup warning for the permissive case is logged from AppServiceProvider.
//
// `supports_credentials: true` is required so the browser sends/accepts the
// httpOnly `mf_token` cookie — Laravel's HandleCors middleware reflects the
// request Origin (never a literal '*') whenever credentials are supported,
// so leaving allowed_origins as ['*'] here is safe with credentials on.

$origins = array_values(array_filter(array_map('trim', explode(',', (string) env('CORS_ORIGINS', '')))));

return [
    'paths' => ['api/*', 'uploads/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $origins ?: ['*'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    // JS needs to read this off responses (e.g. the list-cap signal on capped lists).
    'exposed_headers' => ['X-Result-Capped'],

    'max_age' => 0,

    'supports_credentials' => true,
];
