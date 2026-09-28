<?php

namespace Tests\Feature;

use App\Services\SlaMonitor;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * SLA "at risk" (75%) warnings + breach notices from SlaMonitor → SlaAlerts.
 *
 * SlaMonitor scans EVERY open work order, not just the ones made here, so
 * mail is pinned to a faked Resend endpoint: nothing can leave the machine
 * even when this runs on a server with real mail credentials, and the fake
 * lets us assert who was emailed. DB writes roll back (DatabaseTransactions).
 */
class SlaAlertsTest extends TestCase
{
    use DatabaseTransactions;

    private int $assigneeId;
    private int $managerId;

    protected function setUp(): void
    {
        parent::setUp();
        config(['hubly.resend_api_key' => 'test-key', 'hubly.smtp_host' => null]);
        Http::fake(['api.resend.com/*' => Http::response(['id' => 'fake'], 200)]);

        DB::table('departments')->insert(['name' => 'SLA Test Dept', 'is_active' => 1]);
        $this->assigneeId = $this->makeUser('sla-tech@example.com', 'Sla Tech');
        $this->managerId = $this->makeUser('sla-boss@example.com', 'Sla Boss');
        DB::table('departments')->where('name', 'SLA Test Dept')->update(['manager_id' => $this->managerId]);
    }

    private function makeUser(string $email, string $name, array $extra = []): int
    {
        return DB::table('users')->insertGetId(array_merge([
            'email' => $email, 'password_hash' => Hash::make('x'), 'name' => $name,
            'role' => 'agent', 'department' => 'SLA Test Dept', 'is_active' => 1,
            'token_version' => 0, 'created_at' => now(), 'updated_at' => now(),
        ], $extra));
    }

    /** A 24/7 (no calendar) open work order with a 100-minute resolution target. */
    private function makeTicket(int $minutesAgo, array $extra = []): int
    {
        return DB::table('tickets')->insertGetId(array_merge([
            'title' => 'SLA alert test', 'requester' => 'Someone', 'priority' => 'normal',
            'status' => 'open', 'assignee' => 'Sla Tech', 'department' => 'SLA Test Dept',
            'sla_resolution_minutes' => 100, 'sla_calendar_id' => null,
            'created_at' => now()->subMinutes($minutesAgo), 'updated_at' => now()->subMinutes($minutesAgo),
        ], $extra));
    }

    private function mailboxFor(int $userId, int $ticketId): int
    {
        return DB::table('messages')->where('recipient_id', $userId)->where('sender_id', 0)
            ->where('link_url', "/tickets/{$ticketId}")->count();
    }

    private function emailedCount(string $to, string $subjectPart): int
    {
        return count(Http::recorded(fn (HttpRequest $r) => $r['to'] === $to && str_contains($r['subject'], $subjectPart)));
    }

    public function test_warns_assignee_and_manager_once_at_75_percent(): void
    {
        $id = $this->makeTicket(80);

        SlaMonitor::run();

        $t = DB::table('tickets')->where('id', $id)->first();
        $this->assertNotNull($t->sla_resolution_warned_at);
        $this->assertNull($t->sla_resolution_breached_at);
        $this->assertTrue(DB::table('ticket_activity')->where('ticket_id', $id)
            ->where('field', 'sla_warning')->where('new_value', 'resolution')->exists());
        $this->assertSame(1, $this->mailboxFor($this->assigneeId, $id));
        $this->assertSame(1, $this->mailboxFor($this->managerId, $id));
        $this->assertSame(1, $this->emailedCount('sla-tech@example.com', 'Resolution SLA due in'));
        $this->assertSame(1, $this->emailedCount('sla-boss@example.com', 'Resolution SLA due in'));

        // Second run: already warned — nothing new.
        SlaMonitor::run();
        $this->assertSame(1, $this->mailboxFor($this->assigneeId, $id));
        $this->assertSame(1, $this->emailedCount('sla-tech@example.com', 'Resolution SLA due in'));
    }

    public function test_no_alert_below_threshold(): void
    {
        $id = $this->makeTicket(50);

        SlaMonitor::run();

        $this->assertNull(DB::table('tickets')->where('id', $id)->value('sla_resolution_warned_at'));
        $this->assertSame(0, $this->mailboxFor($this->assigneeId, $id));
    }

    public function test_breach_notifies_assignee_and_manager(): void
    {
        $id = $this->makeTicket(130);

        SlaMonitor::run();

        $t = DB::table('tickets')->where('id', $id)->first();
        $this->assertNotNull($t->sla_resolution_breached_at);
        $this->assertSame(1, $this->emailedCount('sla-tech@example.com', 'Resolution SLA breached'));
        $this->assertSame(1, $this->emailedCount('sla-boss@example.com', 'Resolution SLA breached'));
        $this->assertSame(1, $this->mailboxFor($this->managerId, $id));
    }

    public function test_response_clock_warns_until_first_response(): void
    {
        $open = $this->makeTicket(40, ['sla_response_minutes' => 50]);
        $answered = $this->makeTicket(40, ['sla_response_minutes' => 50, 'first_responded_at' => now()->subMinutes(30)]);

        SlaMonitor::run();

        $this->assertNotNull(DB::table('tickets')->where('id', $open)->value('sla_response_warned_at'));
        $this->assertNull(DB::table('tickets')->where('id', $answered)->value('sla_response_warned_at'));
    }

    public function test_opted_out_user_gets_mailbox_but_no_email(): void
    {
        DB::table('users')->where('id', $this->assigneeId)
            ->update(['preferences' => json_encode(['notifications' => ['email_sla_alerts' => false]])]);
        $id = $this->makeTicket(80);

        SlaMonitor::run();

        $this->assertSame(1, $this->mailboxFor($this->assigneeId, $id));
        $this->assertSame(0, $this->emailedCount('sla-tech@example.com', 'SLA'));
        $this->assertSame(1, $this->emailedCount('sla-boss@example.com', 'Resolution SLA due in'));
    }

    public function test_manager_who_is_assignee_gets_one_copy_and_unassigned_goes_to_manager(): void
    {
        $mine = $this->makeTicket(80, ['assignee' => 'Sla Boss']);
        $unassigned = $this->makeTicket(80, ['assignee' => null]);

        SlaMonitor::run();

        $this->assertSame(1, $this->mailboxFor($this->managerId, $mine));
        $this->assertSame(1, $this->mailboxFor($this->managerId, $unassigned));
        $this->assertSame(0, $this->mailboxFor($this->assigneeId, $unassigned));
    }
}
