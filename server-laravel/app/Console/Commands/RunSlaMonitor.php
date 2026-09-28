<?php

namespace App\Console\Commands;

use App\Services\SlaMonitor;
use Illuminate\Console\Command;

/**
 * `php artisan sla:monitor` — for Hostinger cron plans that support running a
 * CLI command directly. See routes/cron.php for the HTTP-endpoint
 * alternative (for cron plans that can only fetch a URL). Both call the same
 * App\Services\SlaMonitor::run(), which is guarded by a MySQL advisory lock
 * (JobLock) so overlapping triggers can't double-fire a breach.
 *
 * Suggested cron entry (every 10 minutes, matching the Node scheduler's
 * cadence): `*\/10 * * * * php /path/to/artisan sla:monitor >> /dev/null 2>&1`
 */
class RunSlaMonitor extends Command
{
    protected $signature = 'sla:monitor';
    protected $description = 'Detect and escalate SLA breaches on open work orders';

    public function handle(): int
    {
        $fired = SlaMonitor::run();
        $this->info("SLA monitor: {$fired} breach(es)/at-risk warning(s) processed.");
        return self::SUCCESS;
    }
}
