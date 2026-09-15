<?php

namespace Tests\Unit;

use App\Services\Automation;
use PHPUnit\Framework\TestCase;

/** Mirrors server/test/automation.test.js. */
class AutomationTest extends TestCase
{
    private function ticket(): array
    {
        return [
            'id' => 1, 'title' => 'VPN not connecting', 'status' => 'open', 'priority' => 'high',
            'request_type' => 'incident', 'category' => 'Network', 'department' => null,
            'assignee' => null, 'requester' => 'Jane Doe',
        ];
    }

    public function test_matches_single_eq_rule_case_insensitive(): void
    {
        $this->assertTrue(Automation::matchesConditions($this->ticket(), [
            'match' => 'all', 'rules' => [['field' => 'category', 'op' => 'eq', 'value' => 'network']],
        ]));
    }

    public function test_all_match_requires_every_rule(): void
    {
        $conds = ['match' => 'all', 'rules' => [
            ['field' => 'category', 'op' => 'eq', 'value' => 'Network'],
            ['field' => 'priority', 'op' => 'eq', 'value' => 'low'],
        ]];
        $this->assertFalse(Automation::matchesConditions($this->ticket(), $conds));
    }

    public function test_any_match_passes_when_one_rule_passes(): void
    {
        $conds = ['match' => 'any', 'rules' => [
            ['field' => 'category', 'op' => 'eq', 'value' => 'Hardware'],
            ['field' => 'priority', 'op' => 'eq', 'value' => 'high'],
        ]];
        $this->assertTrue(Automation::matchesConditions($this->ticket(), $conds));
    }

    public function test_contains_in_is_empty_operators(): void
    {
        $t = $this->ticket();
        $this->assertTrue(Automation::matchesConditions($t, ['rules' => [['field' => 'title', 'op' => 'contains', 'value' => 'vpn']]]));
        $this->assertTrue(Automation::matchesConditions($t, ['rules' => [['field' => 'priority', 'op' => 'in', 'value' => ['high', 'urgent']]]]));
        $this->assertTrue(Automation::matchesConditions($t, ['rules' => [['field' => 'department', 'op' => 'is_empty']]]));
        $this->assertFalse(Automation::matchesConditions($t, ['rules' => [['field' => 'assignee', 'op' => 'is_not_empty']]]));
    }

    public function test_never_matches_empty_or_invalid_rule_set(): void
    {
        $t = $this->ticket();
        $this->assertFalse(Automation::matchesConditions($t, ['match' => 'all', 'rules' => []]));
        $this->assertFalse(Automation::matchesConditions($t, null));
        $this->assertFalse(Automation::matchesConditions($t, ['rules' => [['field' => 'bogus', 'op' => 'eq', 'value' => 'x']]]));
    }

    public function test_normalize_actions_keeps_valid_set_field_and_validates_enums(): void
    {
        $out = Automation::normalizeActions([
            ['type' => 'set_field', 'field' => 'priority', 'value' => 'urgent'],
            ['type' => 'set_field', 'field' => 'department', 'value' => 'IT'],
        ]);
        $this->assertSame([
            ['type' => 'set_field', 'field' => 'priority', 'value' => 'urgent'],
            ['type' => 'set_field', 'field' => 'department', 'value' => 'IT'],
        ], $out);
    }

    public function test_normalize_actions_drops_unknown_field_or_invalid_enum(): void
    {
        $out = Automation::normalizeActions([
            ['type' => 'set_field', 'field' => 'title', 'value' => 'nope'],
            ['type' => 'set_field', 'field' => 'priority', 'value' => 'critical'],
            ['type' => 'set_field', 'field' => 'status', 'value' => 'closed'],
            ['type' => 'set_field', 'field' => 'status', 'value' => 'cancelled'],
        ]);
        $this->assertSame([
            ['type' => 'set_field', 'field' => 'status', 'value' => 'closed'],
            ['type' => 'set_field', 'field' => 'status', 'value' => 'cancelled'],
        ], $out);
    }

    public function test_normalize_actions_keeps_notes_and_drops_empty(): void
    {
        $out = Automation::normalizeActions([
            ['type' => 'add_note', 'value' => '  Auto-triaged  '],
            ['type' => 'add_note', 'value' => '   '],
            ['type' => 'bogus', 'value' => 'x'],
        ]);
        $this->assertSame([['type' => 'add_note', 'value' => 'Auto-triaged']], $out);
    }

    public function test_normalize_actions_returns_empty_for_non_array_input(): void
    {
        $this->assertSame([], Automation::normalizeActions(null));
        $this->assertSame([], Automation::normalizeActions('{}'));
    }

    public function test_sanitize_conditions_keeps_valid_rules_defaults_to_all(): void
    {
        $out = Automation::sanitizeConditions(['rules' => [['field' => 'category', 'op' => 'eq', 'value' => 'Network']]]);
        $this->assertSame(['match' => 'all', 'rules' => [['field' => 'category', 'op' => 'eq', 'value' => 'Network']]], $out);
    }

    public function test_sanitize_conditions_preserves_explicit_any(): void
    {
        $out = Automation::sanitizeConditions(['match' => 'any', 'rules' => [['field' => 'priority', 'op' => 'eq', 'value' => 'high']]]);
        $this->assertSame('any', $out['match']);
    }

    public function test_sanitize_conditions_drops_unknown_fields_ops_and_missing_values(): void
    {
        $out = Automation::sanitizeConditions(['rules' => [
            ['field' => 'bogus', 'op' => 'eq', 'value' => 'x'],
            ['field' => 'status', 'op' => 'bogus', 'value' => 'open'],
            ['field' => 'priority', 'op' => 'eq', 'value' => ''],
            ['field' => 'department', 'op' => 'is_empty'],
        ]]);
        $this->assertSame(['match' => 'all', 'rules' => [['field' => 'department', 'op' => 'is_empty']]], $out);
    }

    public function test_sanitize_conditions_coerces_in_operator(): void
    {
        $out = Automation::sanitizeConditions(['rules' => [['field' => 'priority', 'op' => 'in', 'value' => ['high', 'urgent']]]]);
        $this->assertSame(['match' => 'all', 'rules' => [['field' => 'priority', 'op' => 'in', 'value' => ['high', 'urgent']]]], $out);
        $this->assertNull(Automation::sanitizeConditions(['rules' => [['field' => 'priority', 'op' => 'in', 'value' => []]]]));
    }

    public function test_sanitize_conditions_returns_null_when_nothing_valid_remains(): void
    {
        $this->assertNull(Automation::sanitizeConditions(['rules' => []]));
        $this->assertNull(Automation::sanitizeConditions(null));
    }
}
