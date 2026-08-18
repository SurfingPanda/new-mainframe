<?php

namespace App\Console\Commands;

use App\Services\SpaceNotify;
use Illuminate\Console\Command;

/**
 * `php artisan spaces:due-reminders` — daily digest of due/overdue Spaces
 * work items. See app/Console/Commands/RunSlaMonitor.php for the same
 * cron-trigger pattern (HTTP fallback in routes/cron.php).
 *
 * Suggested cron entry (hourly is plenty — the per-item due_reminded_at
 * guard keeps each assignee to one digest per day regardless of cadence):
 *   0 * * * * php /path/to/artisan spaces:due-reminders >> /dev/null 2>&1
 */
class RunSpaceDueReminders extends Command
{
    protected $signature = 'spaces:due-reminders';
    protected $description = 'Send daily due/overdue digests for Spaces work items';

    public function handle(): int
    {
        $sent = SpaceNotify::runDueReminders();
        $this->info("Space due reminders: sent {$sent} digest(s).");
        return self::SUCCESS;
    }
}
