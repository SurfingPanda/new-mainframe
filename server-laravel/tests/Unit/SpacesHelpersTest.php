<?php

namespace Tests\Unit;

use App\Services\SpacesHelpers as H;
use PHPUnit\Framework\TestCase;

/** Mirrors server/test/spaces-helpers.test.js. */
class SpacesHelpersTest extends TestCase
{
    private array $member;
    private array $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->member = ['sub' => 7, 'role' => 'user'];
        $this->admin = ['sub' => 1, 'role' => 'admin'];
    }

    public function test_can_manage_all_true_for_admin_false_for_member(): void
    {
        $this->assertTrue(H::canManageAll($this->admin));
        $this->assertFalse(H::canManageAll($this->member));
    }

    public function test_can_administer_allows_owner(): void
    {
        $this->assertTrue(H::canAdminister(['membership' => ['role' => 'owner']], $this->member));
    }

    public function test_can_administer_allows_admin_regardless_of_membership(): void
    {
        $this->assertTrue(H::canAdminister(['membership' => null], $this->admin));
    }

    public function test_can_administer_denies_member_and_project_owner(): void
    {
        $this->assertFalse(H::canAdminister(['membership' => ['role' => 'member']], $this->member));
        $this->assertFalse(H::canAdminister(['membership' => ['role' => 'project_owner']], $this->member));
    }

    public function test_can_contribute_allows_owner_and_member_denies_project_owner(): void
    {
        $this->assertTrue(H::canContribute(['membership' => ['role' => 'owner']], $this->member));
        $this->assertTrue(H::canContribute(['membership' => ['role' => 'member']], $this->member));
        $this->assertFalse(H::canContribute(['membership' => ['role' => 'project_owner']], $this->member));
    }

    public function test_can_contribute_allows_admin_oversight_without_membership(): void
    {
        $this->assertTrue(H::canContribute(['membership' => null], $this->admin));
    }

    public function test_can_edit_item_member_only_assigned_to_them(): void
    {
        $access = ['membership' => ['role' => 'member']];
        $this->assertTrue(H::canEditItem($access, $this->member, ['assignee_id' => 7]));
        $this->assertFalse(H::canEditItem($access, $this->member, ['assignee_id' => 99]));
        $this->assertFalse(H::canEditItem($access, $this->member, ['assignee_id' => null]));
    }

    public function test_can_edit_item_owner_edits_any(): void
    {
        $this->assertTrue(H::canEditItem(['membership' => ['role' => 'owner']], $this->member, ['assignee_id' => 99]));
    }

    public function test_can_edit_item_denies_project_owner_even_for_own(): void
    {
        $this->assertFalse(H::canEditItem(['membership' => ['role' => 'project_owner']], $this->member, ['assignee_id' => 7]));
    }

    public function test_parse_sla_days_treats_empty_as_clear(): void
    {
        $this->assertSame(['ok' => true, 'value' => null], H::parseSlaDays(''));
        $this->assertSame(['ok' => true, 'value' => null], H::parseSlaDays(null));
    }

    public function test_parse_sla_days_accepts_whole_days_in_range(): void
    {
        $this->assertSame(['ok' => true, 'value' => 5], H::parseSlaDays('5'));
        $this->assertSame(['ok' => true, 'value' => H::SLA_MAX_DAYS], H::parseSlaDays(H::SLA_MAX_DAYS));
    }

    public function test_parse_sla_days_rejects_invalid(): void
    {
        $this->assertFalse(H::parseSlaDays(0)['ok']);
        $this->assertFalse(H::parseSlaDays(-1)['ok']);
        $this->assertFalse(H::parseSlaDays(1.5)['ok']);
        $this->assertFalse(H::parseSlaDays(H::SLA_MAX_DAYS + 1)['ok']);
    }

    public function test_parse_date_accepts_ymd(): void
    {
        $this->assertSame(['ok' => true, 'value' => '2026-06-16'], H::parseDate('2026-06-16'));
    }

    public function test_parse_date_empty_clears_malformed_rejected(): void
    {
        $this->assertSame(['ok' => true, 'value' => null], H::parseDate(''));
        $this->assertFalse(H::parseDate('16/06/2026')['ok']);
        $this->assertFalse(H::parseDate('2026-13-40')['ok']);
    }

    public function test_labels_round_trip(): void
    {
        $this->assertSame('bug,ui', H::serializeLabels([' bug ', 'ui', 'bug']));
        $this->assertSame(['bug', 'ui'], H::parseLabels('bug,ui'));
    }

    public function test_labels_empty(): void
    {
        $this->assertNull(H::serializeLabels([]));
        $this->assertSame([], H::parseLabels(''));
        $this->assertSame([], H::parseLabels(null));
    }

    public function test_date_only_formats_and_passes_through_null(): void
    {
        $this->assertSame('2026-06-16', H::dateOnly('2026-06-16'));
        $this->assertSame('2026-06-16', H::dateOnly('2026-06-16 00:00:00'));
        $this->assertNull(H::dateOnly(null));
        $this->assertNull(H::dateOnly('not a date'));
    }

    public function test_due_date_from_adds_sla_days(): void
    {
        $this->assertSame('2026-06-21', H::dueDateFrom('2026-06-16', 5));
        $this->assertNull(H::dueDateFrom('2026-06-16', null));
    }

    public function test_int_id_accepts_positive_integers_only(): void
    {
        $this->assertSame(42, H::intId('42'));
        $this->assertNull(H::intId(0));
        $this->assertNull(H::intId(-3));
        $this->assertNull(H::intId('abc'));
        $this->assertNull(H::intId(2.5));
    }
}
