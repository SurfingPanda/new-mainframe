<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Automation rules engine for work orders — ported from
 * server/src/lib/automation.js. A rule is a WHEN/IF/THEN triple stored in
 * automation_rules: trigger_event (WHEN), conditions (IF, JSON), actions
 * (THEN, JSON). matchesConditions/sanitizeConditions/normalizeActions are
 * pure (no DB) so they're unit-tested in isolation, mirroring Permissions.
 * run() is the DB-facing entry point, called from TicketController via
 * TicketNotifications::runAutomations() — it never throws.
 *
 * Loop safety: writes ticket changes with a single direct UPDATE (no re-entry
 * into TicketController), so a 'ticket.updated' action can't recursively
 * re-trigger 'ticket.updated'.
 */
class Automation
{
    public const CONDITION_FIELDS = [
        'title', 'description', 'status', 'priority', 'request_type',
        'category', 'subcategory', 'subcategory2', 'department', 'requester',
        'assignee', 'asset_id',
    ];

    private const STATUSES = ['open', 'in_progress', 'on_hold', 'pending', 'resolved', 'closed', 'cancelled'];
    private const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
    // null = free value. request_type's allowlist is admin-editable, so it's
    // filled in at runtime by settableFields() (TicketTaxonomy).
    public const SETTABLE_FIELDS = [
        'status' => self::STATUSES,
        'priority' => self::PRIORITIES,
        'request_type' => null,
        'category' => null,
        'department' => null,
        'assignee' => null,
    ];

    /** SETTABLE_FIELDS with the live request-type keys (incl. hidden ones). */
    public static function settableFields(): array
    {
        return array_merge(self::SETTABLE_FIELDS, ['request_type' => TicketTaxonomy::requestTypeKeys(false)]);
    }

    public const CONDITION_OPS = ['eq', 'neq', 'contains', 'in', 'is_empty', 'is_not_empty'];
    private const VALUELESS_OPS = ['is_empty', 'is_not_empty'];

    private static function parseJson(mixed $raw): mixed
    {
        if ($raw === null) {
            return null;
        }
        if (is_array($raw)) {
            return $raw;
        }
        if (is_string($raw)) {
            return json_decode($raw, true);
        }
        return null;
    }

    private static function fieldVal(array $ticket, string $field): string
    {
        $v = $ticket[$field] ?? null;
        return $v === null ? '' : (string) $v;
    }

    private static function evalRule(array $ticket, mixed $rule): bool
    {
        if (!is_array($rule)) {
            return false;
        }
        if (!in_array($rule['field'] ?? null, self::CONDITION_FIELDS, true)) {
            return false;
        }
        $actual = strtolower(self::fieldVal($ticket, $rule['field']));
        $value = $rule['value'] ?? null;
        return match ($rule['op'] ?? null) {
            'eq' => $actual === strtolower((string) ($value ?? '')),
            'neq' => $actual !== strtolower((string) ($value ?? '')),
            'contains' => str_contains($actual, strtolower((string) ($value ?? ''))),
            'in' => is_array($value) && in_array($actual, array_map(fn ($x) => strtolower((string) $x), $value), true),
            'is_empty' => $actual === '',
            'is_not_empty' => $actual !== '',
            default => false,
        };
    }

    /** Pure: does this ticket satisfy a rule's condition set? */
    public static function matchesConditions(array $ticket, mixed $conditions): bool
    {
        $parsed = self::parseJson($conditions);
        $rules = is_array($parsed['rules'] ?? null) ? $parsed['rules'] : [];
        if (!$rules) {
            return false;
        }
        $results = array_map(fn ($r) => self::evalRule($ticket, $r), $rules);
        if (($parsed['match'] ?? null) === 'any') {
            return in_array(true, $results, true);
        }
        return !in_array(false, $results, true);
    }

    /** Pure: strip a conditions payload to a valid, storable shape, or null. */
    public static function sanitizeConditions(mixed $raw): ?array
    {
        $parsed = self::parseJson($raw);
        $rules = is_array($parsed['rules'] ?? null) ? $parsed['rules'] : [];
        $out = [];
        foreach ($rules as $r) {
            if (!is_array($r)) {
                continue;
            }
            if (!in_array($r['field'] ?? null, self::CONDITION_FIELDS, true)) {
                continue;
            }
            if (!in_array($r['op'] ?? null, self::CONDITION_OPS, true)) {
                continue;
            }
            if (in_array($r['op'], self::VALUELESS_OPS, true)) {
                $out[] = ['field' => $r['field'], 'op' => $r['op']];
            } elseif ($r['op'] === 'in') {
                $value = is_array($r['value'] ?? null)
                    ? array_values(array_filter(array_map(fn ($x) => mb_substr(trim((string) $x), 0, 120), $r['value'])))
                    : [];
                if (!$value) {
                    continue;
                }
                $out[] = ['field' => $r['field'], 'op' => $r['op'], 'value' => $value];
            } else {
                if (($r['value'] ?? null) === null || trim((string) $r['value']) === '') {
                    continue;
                }
                $out[] = ['field' => $r['field'], 'op' => $r['op'], 'value' => mb_substr(trim((string) $r['value']), 0, 200)];
            }
        }
        if (!$out) {
            return null;
        }
        return ['match' => (($parsed['match'] ?? null) === 'any') ? 'any' : 'all', 'rules' => $out];
    }

    /** Pure: strip an actions payload to only valid, allowlisted actions. */
    public static function normalizeActions(mixed $raw): array
    {
        $list = self::parseJson($raw);
        if (!is_array($list)) {
            return [];
        }
        $out = [];
        foreach ($list as $a) {
            if (!is_array($a)) {
                continue;
            }
            if (($a['type'] ?? null) === 'set_field') {
                if (!array_key_exists($a['field'] ?? '', self::SETTABLE_FIELDS)) {
                    continue;
                }
                $value = $a['value'] ?? null;
                if ($value === null || $value === '') {
                    $value = null;
                } else {
                    $value = mb_substr(trim((string) $value), 0, 120);
                    $enumVals = $a['field'] === 'request_type'
                        ? TicketTaxonomy::requestTypeKeys(false)
                        : self::SETTABLE_FIELDS[$a['field']];
                    if ($enumVals && !in_array($value, $enumVals, true)) {
                        continue;
                    }
                }
                $out[] = ['type' => 'set_field', 'field' => $a['field'], 'value' => $value];
            } elseif (($a['type'] ?? null) === 'add_note') {
                $body = $a['value'] ?? null;
                $body = $body === null ? '' : trim((string) $body);
                if (!$body) {
                    continue;
                }
                $out[] = ['type' => 'add_note', 'value' => mb_substr($body, 0, 4000)];
            }
        }
        return $out;
    }

    /**
     * Run all active rules for $trigger against a ticket row. Applies matched
     * field changes in one UPDATE, logs changes+notes to ticket_activity, and
     * records fired rules in automation_runs. Never throws.
     *
     * @param array{onlyRuleIds?: ?array} $context onlyRuleIds restricts
     *   evaluation to specific rules (for a future idle scheduler — unused,
     *   since the idle trigger itself is out of scope for this port).
     */
    public static function run(string $trigger, array $ticket, array $context = []): ?array
    {
        try {
            if (empty($ticket['id'])) {
                return null;
            }
            $onlyRuleIds = $context['onlyRuleIds'] ?? null;
            $restrict = is_array($onlyRuleIds) && count($onlyRuleIds) > 0;

            $query = DB::table('automation_rules')
                ->select('id', 'name', 'conditions', 'actions', 'stop_on_match')
                ->where('is_active', 1)->where('trigger_event', $trigger);
            if ($restrict) {
                $query->whereIn('id', $onlyRuleIds);
            }
            $rules = $query->orderBy('priority')->orderBy('id')->get();
            if ($rules->isEmpty()) {
                return null;
            }

            $working = $ticket;
            $fieldChangeByField = []; // field => ['oldValue'=>, 'newValue'=>, 'ruleName'=>]
            $notes = [];
            $fired = [];

            foreach ($rules as $rule) {
                if (!self::matchesConditions($working, $rule->conditions)) {
                    continue;
                }
                $actions = self::normalizeActions($rule->actions);
                $applied = [];
                foreach ($actions as $a) {
                    if ($a['type'] === 'set_field') {
                        $cur = $working[$a['field']] ?? null;
                        $cur = $cur === null ? null : (string) $cur;
                        if (($cur ?? null) === ($a['value'] ?? null)) {
                            continue;
                        }
                        $existing = $fieldChangeByField[$a['field']] ?? null;
                        $fieldChangeByField[$a['field']] = [
                            'oldValue' => $existing ? $existing['oldValue'] : $cur,
                            'newValue' => $a['value'],
                            'ruleName' => $rule->name,
                        ];
                        $working[$a['field']] = $a['value'];
                        $applied[] = $a;
                    } elseif ($a['type'] === 'add_note') {
                        $notes[] = ['body' => $a['value'], 'ruleName' => $rule->name];
                        $applied[] = $a;
                    }
                }
                if ($applied) {
                    $fired[] = ['ruleId' => $rule->id, 'applied' => $applied];
                }
                if ($rule->stop_on_match) {
                    break;
                }
            }

            $finals = array_filter($fieldChangeByField, fn ($c) => ($c['oldValue'] ?? null) !== ($c['newValue'] ?? null));

            if ($finals) {
                $sets = [];
                foreach ($finals as $field => $c) {
                    $sets[$field] = $c['newValue'];
                }
                DB::table('tickets')->where('id', $ticket['id'])->update($sets);
            }

            $activityRows = [];
            foreach ($finals as $field => $c) {
                $activityRows[] = [
                    'ticket_id' => $ticket['id'], 'type' => 'change',
                    'actor' => mb_substr("Automation: {$c['ruleName']}", 0, 120),
                    'field' => $field,
                    'old_value' => $c['oldValue'] === null ? null : mb_substr((string) $c['oldValue'], 0, 500),
                    'new_value' => $c['newValue'] === null ? null : mb_substr((string) $c['newValue'], 0, 500),
                    'body' => null, 'created_at' => now(),
                ];
            }
            foreach ($notes as $n) {
                $activityRows[] = [
                    'ticket_id' => $ticket['id'], 'type' => 'note',
                    'actor' => mb_substr("Automation: {$n['ruleName']}", 0, 120),
                    'field' => null, 'old_value' => null, 'new_value' => null,
                    'body' => mb_substr((string) $n['body'], 0, 4000), 'created_at' => now(),
                ];
            }
            if ($activityRows) {
                DB::table('ticket_activity')->insert($activityRows);
            }

            if ($fired) {
                $runRows = array_map(fn ($f) => [
                    'rule_id' => $f['ruleId'], 'ticket_id' => $ticket['id'],
                    'actions_applied' => json_encode($f['applied']), 'created_at' => now(),
                ], $fired);
                DB::table('automation_runs')->insert($runRows);
            }

            return ['changedFields' => array_keys($finals), 'notes' => count($notes), 'rulesFired' => count($fired)];
        } catch (\Throwable $e) {
            Log::error("[automation] run failed: {$e->getMessage()}");
            return null;
        }
    }
}
