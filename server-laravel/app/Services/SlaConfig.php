<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Ported from server/src/lib/sla-config.js. Configurable per-priority SLA
 * targets (days to resolve), stored in app_settings under 'sla_days'.
 *
 * Node keeps this in a module-level variable, loaded once at process boot and
 * refreshed on save — cheap because it's one process. PHP-FPM has no
 * equivalent "boot"; this uses the (file) cache instead so every worker sees
 * the same value and a save invalidates it for all of them immediately.
 */
class SlaConfig
{
    public const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
    public const DEFAULTS = ['low' => 7, 'normal' => 3, 'high' => 2, 'urgent' => 1];
    private const SETTING_KEY = 'sla_days';
    private const CACHE_KEY = 'sla_days_cache';

    /** Keep only known priorities mapped to a sane integer day count (1–365). */
    public static function sanitize(mixed $input): array
    {
        $out = [];
        if (is_array($input)) {
            foreach (self::PRIORITIES as $p) {
                $n = $input[$p] ?? null;
                if (is_numeric($n) && (int) $n == $n && $n >= 1 && $n <= 365) {
                    $out[$p] = (int) $n;
                }
            }
        }
        return $out;
    }

    /** Current SLA targets (always a full low/normal/high/urgent map). */
    public static function get(): array
    {
        return Cache::rememberForever(self::CACHE_KEY, function () {
            $raw = DB::table('app_settings')->where('setting_key', self::SETTING_KEY)->value('setting_value');
            $val = $raw ? (is_string($raw) ? json_decode($raw, true) : $raw) : null;
            return array_merge(self::DEFAULTS, self::sanitize($val));
        });
    }

    /** Persist new targets (merged over defaults) and refresh the cache. */
    public static function save(mixed $input, ?int $userId = null): array
    {
        $merged = array_merge(self::DEFAULTS, self::sanitize($input));
        DB::table('app_settings')->updateOrInsert(
            ['setting_key' => self::SETTING_KEY],
            ['setting_value' => json_encode($merged), 'updated_by' => $userId]
        );
        Cache::forever(self::CACHE_KEY, $merged);
        return $merged;
    }
}
