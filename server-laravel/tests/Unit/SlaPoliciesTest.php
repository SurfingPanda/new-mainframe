<?php

namespace Tests\Unit;

use App\Services\SlaPolicies;
use PHPUnit\Framework\TestCase;

/** Mirrors server/test/sla-policies.test.js. */
class SlaPoliciesTest extends TestCase
{
    private function policies(): array
    {
        return [
            ['id' => 1, 'priority' => null, 'request_type' => null, 'category' => null, 'department' => null, 'response_minutes' => null, 'resolution_minutes' => 4320, 'rank' => 0],
            ['id' => 2, 'priority' => 'high', 'request_type' => null, 'category' => null, 'department' => null, 'response_minutes' => 60, 'resolution_minutes' => 2880, 'rank' => 0],
            ['id' => 3, 'priority' => 'high', 'request_type' => null, 'category' => 'Security', 'department' => null, 'response_minutes' => 30, 'resolution_minutes' => 1440, 'rank' => 0],
        ];
    }

    public function test_pick_policy_picks_most_specific_match(): void
    {
        $p = SlaPolicies::pickPolicy(['priority' => 'high', 'category' => 'Security'], $this->policies());
        $this->assertSame(3, $p['id']);
    }

    public function test_pick_policy_falls_back_to_less_specific(): void
    {
        $p = SlaPolicies::pickPolicy(['priority' => 'high', 'category' => 'Hardware'], $this->policies());
        $this->assertSame(2, $p['id']);
    }

    public function test_pick_policy_matches_wildcard(): void
    {
        $p = SlaPolicies::pickPolicy(['priority' => 'low'], $this->policies());
        $this->assertSame(1, $p['id']);
    }

    public function test_pick_policy_case_insensitive(): void
    {
        $p = SlaPolicies::pickPolicy(['priority' => 'high', 'category' => 'security'], $this->policies());
        $this->assertSame(3, $p['id']);
    }

    public function test_pick_policy_returns_null_when_no_match(): void
    {
        $p = SlaPolicies::pickPolicy(['priority' => 'urgent'], [['id' => 9, 'priority' => 'low', 'resolution_minutes' => 10]]);
        $this->assertNull($p);
    }

    public function test_effective_targets_uses_matched_policy(): void
    {
        $t = SlaPolicies::effectiveTargets(['priority' => 'high', 'category' => 'Security'], $this->policies(), ['low' => 7, 'normal' => 3, 'high' => 2, 'urgent' => 1]);
        $this->assertSame(['policyId' => 3, 'responseMinutes' => 30, 'resolutionMinutes' => 1440, 'calendarId' => null], $t);
    }

    public function test_effective_targets_falls_back_to_sla_days(): void
    {
        $t = SlaPolicies::effectiveTargets(['priority' => 'urgent'], [], ['low' => 7, 'normal' => 3, 'high' => 2, 'urgent' => 1]);
        $this->assertSame(['policyId' => null, 'responseMinutes' => null, 'resolutionMinutes' => 1440, 'calendarId' => null], $t);
    }

    public function test_sanitize_requires_name_and_positive_resolution_on_create(): void
    {
        $this->assertArrayHasKey('error', SlaPolicies::sanitize(['resolution_minutes' => 60]));
        $this->assertArrayHasKey('error', SlaPolicies::sanitize(['name' => 'X']));
        $this->assertArrayHasKey('error', SlaPolicies::sanitize(['name' => 'X', 'resolution_minutes' => 0]));
    }

    public function test_sanitize_normalizes_valid_create_payload(): void
    {
        $result = SlaPolicies::sanitize([
            'name' => 'High SLA', 'priority' => 'high', 'request_type' => 'bogus',
            'category' => 'Security', 'response_minutes' => 60, 'resolution_minutes' => 2880,
        ]);
        $value = $result['value'];
        $this->assertSame('High SLA', $value['name']);
        $this->assertSame('high', $value['priority']);
        $this->assertNull($value['request_type']); // invalid enum dropped to wildcard
        $this->assertSame('Security', $value['category']);
        $this->assertSame(60, $value['response_minutes']);
        $this->assertSame(2880, $value['resolution_minutes']);
        $this->assertSame(1, $value['is_active']);
    }

    public function test_sanitize_partial_update_only_touches_provided_fields(): void
    {
        $result = SlaPolicies::sanitize(['response_minutes' => 15], true);
        $this->assertSame(['response_minutes' => 15], $result['value']);
    }
}
