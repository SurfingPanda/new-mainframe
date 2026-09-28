<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * SLA policy layer — ported from server/src/lib/sla-policies.js. A policy is
 * a scoped matcher (priority / request_type / category / department — NULL =
 * wildcard) plus response/resolution targets in minutes. Most specific active
 * policy wins; ties break by `rank` desc then id asc. No match → the
 * per-priority default from SlaConfig.
 *
 * pickPolicy / effectiveTargets are pure. loadPolicies/seed touch the DB and
 * are cached the same way as SlaConfig/BusinessHours.
 */
class SlaPolicies
{
    private const MATCH_FIELDS = ['priority', 'request_type', 'category', 'department'];
    private const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
    private const CACHE_KEY = 'sla_policies_cache';

    /** @return array[] */
    public static function loadPolicies(): array
    {
        $rows = DB::table('sla_policies')->where('is_active', 1)->get()->map(fn ($r) => (array) $r)->all();
        Cache::forever(self::CACHE_KEY, $rows);
        return $rows;
    }

    /** @return array[] */
    private static function cached(): array
    {
        return Cache::rememberForever(self::CACHE_KEY, fn () => self::loadPolicies());
    }

    /**
     * Best-matching policy for a ticket from a list. A policy matches only when
     * every non-null matcher field equals the ticket's value (case-insensitive).
     * Specificity = count of non-null matchers; ties → higher rank, then lower id.
     */
    public static function pickPolicy(array $ticket, array $policies): ?array
    {
        $norm = fn ($v) => $v === null ? null : strtolower((string) $v);
        $matches = array_values(array_filter($policies, function ($p) use ($ticket, $norm) {
            foreach (self::MATCH_FIELDS as $f) {
                if (($p[$f] ?? null) !== null && $norm($p[$f]) !== $norm($ticket[$f] ?? null)) {
                    return false;
                }
            }
            return true;
        }));
        if (empty($matches)) {
            return null;
        }
        $score = fn ($p) => array_reduce(self::MATCH_FIELDS, fn ($n, $f) => $n + (($p[$f] ?? null) !== null ? 1 : 0), 0);
        usort($matches, function ($a, $b) use ($score) {
            return ($score($b) <=> $score($a))
                ?: (($b['rank'] ?? 0) <=> ($a['rank'] ?? 0))
                ?: ($a['id'] <=> $b['id']);
        });
        return $matches[0];
    }

    /**
     * The effective targets for a ticket — the matched policy, else the
     * per-priority default resolution from SlaConfig (no response target).
     * @return array{policyId: ?int, responseMinutes: ?int, resolutionMinutes: ?int, calendarId: ?int}
     */
    public static function effectiveTargets(array $ticket, ?array $policies = null, ?array $slaDays = null): array
    {
        $policies ??= self::cached();
        $slaDays ??= SlaConfig::get();
        $p = self::pickPolicy($ticket, $policies);
        if ($p) {
            return [
                'policyId' => (int) $p['id'],
                'responseMinutes' => ($p['response_minutes'] ?? null) !== null ? (int) $p['response_minutes'] : null,
                'resolutionMinutes' => (int) $p['resolution_minutes'],
                'calendarId' => ($p['calendar_id'] ?? null) !== null ? (int) $p['calendar_id'] : null,
            ];
        }
        $days = $slaDays[$ticket['priority'] ?? ''] ?? null;
        return [
            'policyId' => null,
            'responseMinutes' => null,
            'resolutionMinutes' => $days ? $days * 1440 : null,
            'calendarId' => null,
        ];
    }

    /** Validate/normalize a create (partial=false) or update (partial=true) payload. */
    public static function sanitize(array $body, bool $partial = false): array
    {
        $out = [];
        if (!$partial || array_key_exists('name', $body)) {
            $name = trim((string) ($body['name'] ?? ''));
            if (!$name) {
                return ['error' => 'name is required'];
            }
            $out['name'] = mb_substr($name, 0, 120);
        }
        if (!$partial || array_key_exists('priority', $body)) {
            $out['priority'] = in_array($body['priority'] ?? null, self::PRIORITIES, true) ? $body['priority'] : null;
        }
        if (!$partial || array_key_exists('request_type', $body)) {
            $out['request_type'] = in_array($body['request_type'] ?? null, TicketTaxonomy::requestTypeKeys(false), true) ? $body['request_type'] : null;
        }
        if (!$partial || array_key_exists('category', $body)) {
            $out['category'] = !empty($body['category']) ? mb_substr(trim((string) $body['category']), 0, 80) : null;
        }
        if (!$partial || array_key_exists('department', $body)) {
            $out['department'] = !empty($body['department']) ? mb_substr(trim((string) $body['department']), 0, 80) : null;
        }
        if (!$partial || array_key_exists('response_minutes', $body)) {
            $r = $body['response_minutes'] ?? null;
            $out['response_minutes'] = (is_numeric($r) && (int) $r == $r && $r > 0) ? (int) $r : null;
        }
        if (!$partial || array_key_exists('resolution_minutes', $body)) {
            $r = $body['resolution_minutes'] ?? null;
            if (!is_numeric($r) || (int) $r != $r || $r <= 0) {
                return ['error' => 'resolution_minutes must be a positive whole number of minutes'];
            }
            $out['resolution_minutes'] = (int) $r;
        }
        if (!$partial || array_key_exists('calendar_id', $body)) {
            $n = $body['calendar_id'] ?? null;
            $out['calendar_id'] = (is_numeric($n) && (int) $n == $n && $n > 0) ? (int) $n : null;
        }
        if (!$partial || array_key_exists('is_active', $body)) {
            $out['is_active'] = ($body['is_active'] ?? true) === false ? 0 : 1;
        }
        if (!$partial || array_key_exists('rank', $body)) {
            $n = $body['rank'] ?? 0;
            $out['rank'] = is_numeric($n) ? (int) $n : 0;
        }
        return ['value' => $out];
    }

    /** One-time seed: turn the per-priority SlaConfig defaults into 4 wildcard policies. */
    public static function seedDefaultPoliciesIfEmpty(): void
    {
        if (DB::table('sla_policies')->count() > 0) {
            return;
        }
        $days = SlaConfig::get();
        $rows = array_map(fn ($p) => [
            'name' => ucfirst($p) . ' priority (default)',
            'priority' => $p,
            'request_type' => null,
            'category' => null,
            'department' => null,
            'response_minutes' => null,
            'resolution_minutes' => ($days[$p] ?? 3) * 1440,
            'calendar_id' => null,
            'is_active' => 1,
            'rank' => 0,
        ], self::PRIORITIES);
        DB::table('sla_policies')->insert($rows);
    }
}
