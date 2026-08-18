<?php

namespace Tests\Unit;

use App\Services\TicketVisibility as TV;
use PHPUnit\Framework\TestCase;

/** Mirrors server/test/ticket-visibility.test.js. */
class TicketVisibilityTest extends TestCase
{
    public function test_is_staff_true_for_admin_and_agent_only(): void
    {
        $this->assertTrue(TV::isStaff(['role' => 'admin']));
        $this->assertTrue(TV::isStaff(['role' => 'agent']));
        $this->assertFalse(TV::isStaff(['role' => 'user']));
        $this->assertFalse(TV::isStaff([]));
        $this->assertFalse(TV::isStaff(null));
    }

    public function test_user_identities_returns_name_and_email_dropping_falsy(): void
    {
        $this->assertSame(['Ada', 'ada@x.io'], TV::userIdentities(['name' => 'Ada', 'email' => 'ada@x.io']));
        $this->assertSame(['Ada'], TV::userIdentities(['name' => 'Ada']));
        $this->assertSame(['ada@x.io'], TV::userIdentities(['email' => 'ada@x.io']));
        $this->assertSame([], TV::userIdentities([]));
        $this->assertSame([], TV::userIdentities(null));
    }

    public function test_owns_ticket_matches_requester_or_assignee(): void
    {
        $ticket = ['requester' => 'Ada', 'assignee' => 'Bob'];
        $this->assertTrue(TV::ownsTicket($ticket, ['Ada']));
        $this->assertTrue(TV::ownsTicket($ticket, ['Bob']));
        $this->assertFalse(TV::ownsTicket($ticket, ['Cy']));
    }

    public function test_owns_ticket_email_fallback(): void
    {
        $this->assertTrue(TV::ownsTicket(['requester' => 'ada@x.io', 'assignee' => null], ['Ada', 'ada@x.io']));
    }

    public function test_owns_ticket_false_when_both_null(): void
    {
        $this->assertFalse(TV::ownsTicket(['requester' => null, 'assignee' => null], ['Ada']));
    }

    public function test_same_department_matches_only_non_empty_equal(): void
    {
        $this->assertTrue(TV::sameDepartment(['department' => 'IT'], ['department' => 'IT']));
        $this->assertFalse(TV::sameDepartment(['department' => 'IT'], ['department' => 'HR']));
        $this->assertFalse(TV::sameDepartment(['department' => null], ['department' => 'IT']));
        $this->assertFalse(TV::sameDepartment(['department' => 'IT'], ['department' => null]));
        $this->assertFalse(TV::sameDepartment([], []));
        $this->assertFalse(TV::sameDepartment(null, ['department' => 'IT']));
    }

    public function test_can_view_ticket_ordinary_work_order(): void
    {
        $ticket = ['requester' => 'Ada', 'assignee' => 'Bob', 'department' => 'IT'];
        $this->assertTrue(TV::canViewTicket(['role' => 'agent', 'name' => 'Cy', 'department' => 'Sales'], $ticket));
        $this->assertTrue(TV::canViewTicket(['role' => 'user', 'name' => 'Ada'], $ticket));
        $this->assertTrue(TV::canViewTicket(['role' => 'user', 'name' => 'Bob'], $ticket));
        $this->assertTrue(TV::canViewTicket(['role' => 'user', 'name' => 'Cy', 'department' => 'IT'], $ticket));
        $this->assertFalse(TV::canViewTicket(['role' => 'user', 'name' => 'Cy', 'department' => 'Sales'], $ticket));
    }

    private function ctxFor(array $user, array $managedDepts = []): array
    {
        return ['identities' => TV::userIdentities($user), 'myDept' => $user['department'] ?? null, 'managedDepts' => $managedDepts];
    }

    public function test_hr_concern_visible_to_list_shows_ordinary_rows(): void
    {
        $row = ['category' => 'Hardware', 'requester' => 'Ada', 'assignee' => 'Bob', 'department' => 'IT'];
        $this->assertTrue(TV::hrConcernVisibleToList($row, $this->ctxFor(['name' => 'Zed', 'department' => 'Sales'])));
    }

    public function test_hr_concern_hidden_from_uninvolved_coworker(): void
    {
        $row = ['category' => TV::HR_CONCERNS, 'requester' => 'Ada', 'assignee' => null, 'department' => null, 'approval_dept' => 'Sales'];
        $this->assertFalse(TV::hrConcernVisibleToList($row, $this->ctxFor(['name' => 'Zed', 'department' => 'Sales'])));
    }

    public function test_hr_concern_shown_to_requester(): void
    {
        $row = ['category' => TV::HR_CONCERNS, 'requester' => 'Ada', 'assignee' => null, 'department' => null, 'approval_dept' => 'Sales'];
        $this->assertTrue(TV::hrConcernVisibleToList($row, $this->ctxFor(['name' => 'Ada', 'department' => 'Sales'])));
    }

    public function test_hr_concern_shown_to_requester_dept_manager(): void
    {
        $row = ['category' => TV::HR_CONCERNS, 'requester' => 'Ada', 'assignee' => null, 'department' => null, 'approval_dept' => 'Sales'];
        $this->assertTrue(TV::hrConcernVisibleToList($row, $this->ctxFor(['name' => 'Mgr', 'department' => 'Sales'], ['Sales'])));
    }

    public function test_hr_concern_routed_shown_to_hr_staff_via_same_department(): void
    {
        $row = ['category' => TV::HR_CONCERNS, 'requester' => 'Ada', 'assignee' => null, 'department' => 'HR', 'approval_dept' => 'Sales'];
        $this->assertTrue(TV::hrConcernVisibleToList($row, $this->ctxFor(['name' => 'Hank', 'department' => 'HR'])));
    }

    public function test_hr_concern_routed_shown_to_manager_of_department_it_sits_in(): void
    {
        $row = ['category' => TV::HR_CONCERNS, 'requester' => 'Ada', 'assignee' => null, 'department' => 'HR', 'approval_dept' => 'Sales'];
        $this->assertTrue(TV::hrConcernVisibleToList($row, $this->ctxFor(['name' => 'Hmgr', 'department' => 'Ops'], ['HR'])));
    }

    public function test_hr_concern_routed_hidden_from_unrelated_department(): void
    {
        $row = ['category' => TV::HR_CONCERNS, 'requester' => 'Ada', 'assignee' => null, 'department' => 'HR', 'approval_dept' => 'Sales'];
        $this->assertFalse(TV::hrConcernVisibleToList($row, $this->ctxFor(['name' => 'Zed', 'department' => 'Engineering'])));
    }
}
