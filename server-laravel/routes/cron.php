<?php

use App\Services\SlaMonitor;
use App\Services\SpaceNotify;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// HTTP fallback for Hostinger cron plans that can only fetch a URL (not run a
// CLI command — see app/Console/Commands/RunSlaMonitor.php for that path).
// Unprefixed (not under /api), like routes/uploads.php. Gated by a shared
// secret (CRON_SECRET) rather than user auth, since cron has no session/cookie.
// Example cron entry (every 10 minutes):
//   */10 * * * * wget -q -O /dev/null "https://api.example.com/cron/sla-monitor?token=SECRET"
Route::match(['get', 'post'], '/cron/sla-monitor', function (Request $request) {
    $secret = config('hubly.cron_secret');
    $given = $request->query('token') ?? $request->header('X-Cron-Secret');
    if (!$secret || !$given || !hash_equals($secret, (string) $given)) {
        return response()->json(['error' => 'Not found'], 404);
    }
    $fired = SlaMonitor::run();
    return response()->json(['ok' => true, 'fired' => $fired]);
});

// Same pattern as above, for the Spaces due/overdue digest (hourly cron entry
// is plenty — see app/Console/Commands/RunSpaceDueReminders.php).
Route::match(['get', 'post'], '/cron/space-due-reminders', function (Request $request) {
    $secret = config('hubly.cron_secret');
    $given = $request->query('token') ?? $request->header('X-Cron-Secret');
    if (!$secret || !$given || !hash_equals($secret, (string) $given)) {
        return response()->json(['error' => 'Not found'], 404);
    }
    $sent = SpaceNotify::runDueReminders();
    return response()->json(['ok' => true, 'sent' => $sent]);
});
