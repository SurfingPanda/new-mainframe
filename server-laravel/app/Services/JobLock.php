<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Cross-process coordination via MySQL advisory locks — ported from
 * server/src/lib/job-lock.js. Guards a cron-triggered job against overlapping
 * runs (a slow run still executing when the next cron tick fires, or a manual
 * trigger racing the scheduled one).
 *
 * GET_LOCK is connection-scoped in MySQL. Node holds a dedicated pooled
 * connection for the lock's lifetime; a single PHP-FPM request is
 * single-threaded and reuses one PDO connection throughout, so no equivalent
 * "borrow a connection" step is needed here — DB::select()/statement() within
 * one request already run on the same connection.
 */
class JobLock
{
    private const LOCK_PREFIX = 'hubly:job:';

    /**
     * Run $fn while holding the named advisory lock, then release it. If the
     * lock is already held elsewhere, $fn is skipped (returns null). Never
     * throws — a lock failure is logged and treated as "skip this run".
     */
    public static function run(string $name, callable $fn): mixed
    {
        $lockName = mb_substr(self::LOCK_PREFIX . $name, 0, 64); // MySQL lock names cap at 64 chars
        $acquired = false;
        try {
            $ok = DB::selectOne('SELECT GET_LOCK(?, 0) AS ok', [$lockName]);
            if ((int) ($ok->ok ?? 0) !== 1) {
                return null; // held elsewhere
            }
            $acquired = true;
            return $fn();
        } catch (\Throwable $e) {
            Log::error("[job-lock] run \"{$name}\" failed: {$e->getMessage()}");
            return null;
        } finally {
            if ($acquired) {
                try {
                    DB::select('SELECT RELEASE_LOCK(?)', [$lockName]);
                } catch (\Throwable $e) {
                    Log::error("[job-lock] release \"{$name}\" failed: {$e->getMessage()}");
                }
            }
        }
    }
}
