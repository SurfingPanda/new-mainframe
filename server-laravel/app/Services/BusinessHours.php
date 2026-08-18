<?php

namespace App\Services;

use DateTime;
use DateTimeZone;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Business-hours engine for SLA clocks — ported from
 * server/src/lib/business-hours.js. Given a calendar (weekly open windows +
 * holidays + timezone), businessMsBetween() returns how much *working* time
 * falls in [start, end). A NULL calendar means 24/7 (callers skip this and
 * use raw elapsed time).
 *
 * The Node original hand-rolls timezone math on top of Intl.DateTimeFormat
 * (JS has no native arbitrary-timezone DateTime). PHP's DateTime + DateTimeZone
 * does this natively, so the implementation is simpler here while producing
 * the same result for any given (start, end, calendar) triple.
 *
 * calendar shape: ['timezone' => .., 'hours' => ['mon' => [['09:00','18:00']], ...],
 * 'holidays' => ['YYYY-MM-DD', ...]]
 */
class BusinessHours
{
    private const HOUR_MS = 3_600_000;
    private const CACHE_KEY = 'sla_calendars_cache';

    private static function partsAt(int $ms, string $tz): array
    {
        $dt = new DateTime('@0');
        $dt->setTimestamp(intdiv($ms, 1000));
        $dt->setTimezone(new DateTimeZone($tz));
        return [
            'y' => (int) $dt->format('Y'),
            'mo' => (int) $dt->format('n'),
            'd' => (int) $dt->format('j'),
            'weekday' => strtolower($dt->format('D')), // mon, tue, ...
            'dateStr' => $dt->format('Y-m-d'),
        ];
    }

    private static function instantFromLocal(int $y, int $mo, int $d, int $h, int $mi, string $tz): int
    {
        $dt = new DateTime(sprintf('%04d-%02d-%02d %02d:%02d:00', $y, $mo, $d, $h, $mi), new DateTimeZone($tz));
        return $dt->getTimestamp() * 1000;
    }

    private static function localMidnight(int $ms, string $tz): int
    {
        $p = self::partsAt($ms, $tz);
        return self::instantFromLocal($p['y'], $p['mo'], $p['d'], 0, 0, $tz);
    }

    private static function nextLocalMidnight(int $ms, string $tz): int
    {
        $p = self::partsAt($ms + 26 * self::HOUR_MS, $tz); // +26h safely crosses any DST into the next day
        return self::instantFromLocal($p['y'], $p['mo'], $p['d'], 0, 0, $tz);
    }

    /** Working milliseconds in [startMs, endMs) under a calendar. */
    public static function businessMsBetween(int $startMs, int $endMs, ?array $calendar): int
    {
        if ($endMs <= $startMs) {
            return 0;
        }
        $tz = $calendar['timezone'] ?? 'UTC';
        $hours = $calendar['hours'] ?? [];
        $holidays = array_flip($calendar['holidays'] ?? []);

        $cursor = self::localMidnight($startMs, $tz);
        $total = 0;
        $guard = 0;
        while ($cursor < $endMs && $guard++ < 4000) {
            $p = self::partsAt($cursor, $tz);
            $windows = isset($holidays[$p['dateStr']]) ? [] : ($hours[$p['weekday']] ?? []);
            foreach ($windows as [$ws, $we]) {
                [$wsh, $wsm] = array_map('intval', explode(':', $ws));
                [$weh, $wem] = array_map('intval', explode(':', $we));
                $winStart = self::instantFromLocal($p['y'], $p['mo'], $p['d'], $wsh, $wsm, $tz);
                $winEnd = self::instantFromLocal($p['y'], $p['mo'], $p['d'], $weh, $wem, $tz);
                $lo = max($winStart, $startMs);
                $hi = min($winEnd, $endMs);
                if ($hi > $lo) {
                    $total += $hi - $lo;
                }
            }
            $cursor = self::nextLocalMidnight($cursor, $tz);
        }
        return $total;
    }

    public static function businessMinutesBetween(int $a, int $b, ?array $cal): float
    {
        return self::businessMsBetween($a, $b, $cal) / 60000;
    }

    // ── Calendar cache (Cache-backed — see SlaConfig's docblock for why) ──

    /** @return array<int, array> id => calendar */
    public static function loadCalendars(): array
    {
        $cals = DB::table('sla_calendars')->select('id', 'name', 'timezone', 'hours', 'is_default')->get();
        $holidayRows = DB::table('sla_holidays')->select('calendar_id', 'holiday_date')->get();

        $holidaysByCal = [];
        foreach ($holidayRows as $h) {
            $holidaysByCal[$h->calendar_id][] = substr((string) $h->holiday_date, 0, 10);
        }

        $next = [];
        foreach ($cals as $c) {
            $hours = is_string($c->hours) ? json_decode($c->hours, true) : $c->hours;
            $next[$c->id] = [
                'id' => $c->id,
                'name' => $c->name,
                'timezone' => $c->timezone,
                'hours' => $hours ?: [],
                'holidays' => $holidaysByCal[$c->id] ?? [],
                'is_default' => (bool) $c->is_default,
            ];
        }
        Cache::forever(self::CACHE_KEY, $next);
        return $next;
    }

    public static function getCalendarById(?int $id): ?array
    {
        if ($id === null) {
            return null;
        }
        $cache = Cache::rememberForever(self::CACHE_KEY, fn () => self::loadCalendars());
        return $cache[$id] ?? null;
    }

    /** One-time seed: a Mon–Fri 09:00–18:00 calendar so admins have a ready option. */
    public static function seedDefaultCalendarIfEmpty(string $timezone = 'Asia/Manila'): void
    {
        if (DB::table('sla_calendars')->count() > 0) {
            return;
        }
        $hours = json_encode([
            'mon' => [['09:00', '18:00']], 'tue' => [['09:00', '18:00']], 'wed' => [['09:00', '18:00']],
            'thu' => [['09:00', '18:00']], 'fri' => [['09:00', '18:00']], 'sat' => [], 'sun' => [],
        ]);
        DB::table('sla_calendars')->insert([
            'name' => 'Standard business hours (Mon–Fri 9–6)',
            'timezone' => $timezone,
            'hours' => $hours,
            'is_default' => 1,
        ]);
    }
}
