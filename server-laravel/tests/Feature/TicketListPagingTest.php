<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Server-side pagination of GET /api/tickets (?page=…): paging, filters, sort,
 * WO-id search, whole-scope summaries and HR Concerns visibility. The local DB
 * already holds other work orders, so every assertion is scoped to a unique
 * title marker via `q`.
 */
class TicketListPagingTest extends TestCase
{
    use DatabaseTransactions;

    private const MARK = 'pgz-marker';

    private string $admin;
    private string $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->disableCookieEncryption();
        $this->withCredentials();
        $this->admin = $this->loginAs('pg-admin@example.com', 'admin');
        $this->user = $this->loginAs('pg-user@example.com', 'user');
    }

    private function loginAs(string $email, string $role): string
    {
        DB::table('users')->insert([
            'email' => $email, 'password_hash' => Hash::make('CorrectHorse1!'), 'name' => "Pg {$role}",
            'role' => $role, 'department' => 'Pg Dept', 'is_active' => 1, 'token_version' => 0,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return $this->postJson('/api/auth/login', ['email' => $email, 'password' => 'CorrectHorse1!'])
            ->assertOk()->headers->getCookies()[0]->getValue();
    }

    private function as(string $token): static
    {
        return $this->withCookie('mf_token', $token);
    }

    private function ticket(string $suffix, array $extra = []): int
    {
        return DB::table('tickets')->insertGetId(array_merge([
            'title' => self::MARK . " {$suffix}", 'requester' => 'Someone', 'priority' => 'normal', 'status' => 'open',
            'created_at' => now()->subDay(), 'updated_at' => now()->subDay(),
        ], $extra));
    }

    private function list(string $token, array $params = []): \Illuminate\Testing\TestResponse
    {
        $params = array_merge(['scope' => 'all', 'page' => 1, 'q' => self::MARK], $params);
        return $this->as($token)->getJson('/api/tickets?' . http_build_query($params))->assertOk();
    }

    public function test_pages_through_results_with_totals(): void
    {
        foreach (range(1, 5) as $i) {
            $this->ticket("n{$i}", ['created_at' => now()->subMinutes(10 - $i)]);
        }

        $p1 = $this->list($this->admin, ['pageSize' => 2])->json();
        $this->assertSame(5, $p1['total']);
        $this->assertCount(2, $p1['items']);
        $this->assertSame(self::MARK . ' n5', $p1['items'][0]['title']); // newest first

        $p3 = $this->list($this->admin, ['pageSize' => 2, 'page' => 3])->json();
        $this->assertCount(1, $p3['items']);
        $this->assertSame(self::MARK . ' n1', $p3['items'][0]['title']);

        $oldest = $this->list($this->admin, ['pageSize' => 2, 'sort' => 'oldest'])->json();
        $this->assertSame(self::MARK . ' n1', $oldest['items'][0]['title']);
    }

    public function test_page_size_is_capped_and_items_carry_sla_and_attachments(): void
    {
        $this->ticket('a');
        $res = $this->list($this->admin, ['pageSize' => 100000])->json();
        $this->assertSame(100, $res['pageSize']);
        $this->assertArrayHasKey('sla', $res['items'][0]);
        $this->assertSame([], $res['items'][0]['attachments']);
    }

    public function test_filters(): void
    {
        $this->ticket('open-high', ['priority' => 'high', 'assignee' => 'Pg Tech', 'category' => 'Pg Cat']);
        $this->ticket('closed-low', ['priority' => 'low', 'status' => 'closed']);
        $this->ticket('open-normal');

        $this->assertSame(1, $this->list($this->admin, ['priority' => 'high'])->json('total'));
        $this->assertSame(1, $this->list($this->admin, ['status' => 'closed'])->json('total'));
        $this->assertSame(3, $this->list($this->admin, ['status' => 'open,closed'])->json('total'));
        $this->assertSame(2, $this->list($this->admin, ['assignee' => 'unassigned'])->json('total'));
        $this->assertSame(1, $this->list($this->admin, ['assignee' => 'Pg Tech'])->json('total'));
        $this->assertSame(1, $this->list($this->admin, ['category' => 'Pg Cat'])->json('total'));
        // An unknown priority/status is ignored rather than erroring.
        $this->assertSame(3, $this->list($this->admin, ['priority' => 'bogus', 'status' => 'bogus'])->json('total'));
    }

    public function test_search_matches_title_and_work_order_id(): void
    {
        $id = $this->ticket('findme');
        $this->ticket('other');

        $byId = $this->list($this->admin, ['q' => 'wo%' . $id])->json();
        $this->assertSame(1, $byId['total']);
        $this->assertSame($id, $byId['items'][0]['id']);

        $padded = $this->list($this->admin, ['q' => sprintf('WO%08d', $id)])->json();
        $this->assertSame([$id], array_column($padded['items'], 'id'));

        $this->assertSame(1, $this->list($this->admin, ['q' => self::MARK . ' findme'])->json('total'));
        // LIKE wildcards typed by the user are literal in title search.
        $this->assertSame(0, $this->list($this->admin, ['q' => self::MARK . ' f_ndme'])->json('total'));
    }

    public function test_summaries_cover_the_whole_scope_not_the_filtered_page(): void
    {
        $this->ticket('s1');
        $this->ticket('s2', ['status' => 'closed', 'assignee' => 'Pg Tech', 'category' => 'Pg Cat']);

        $res = $this->list($this->admin, ['status' => 'closed', 'q' => self::MARK])->json();
        $this->assertSame(1, $res['total']);
        $this->assertGreaterThanOrEqual(1, $res['counts']['open']); // not narrowed by the status filter
        $this->assertContains('Pg Tech', $res['facets']['assignees']);
        $this->assertContains('Pg Cat', $res['facets']['categories']);

        $since = (now()->subDays(2)->getTimestamp()) * 1000;
        $this->assertGreaterThanOrEqual(2, $this->list($this->admin, ['new_since' => $since])->json('new_count'));
    }

    public function test_hr_concerns_are_hidden_from_unrelated_users_in_the_paged_list(): void
    {
        $this->ticket('plain');
        $this->ticket('hr', ['category' => 'HR Concerns', 'requester' => 'Somebody Else', 'department' => 'Other Dept']);

        $this->assertSame(1, $this->list($this->user)->json('total'));
        $this->assertSame(2, $this->list($this->admin)->json('total'));
        $this->assertSame(0, $this->list($this->user, ['q' => self::MARK . ' hr'])->json('total'));
    }

    public function test_without_page_the_list_is_still_a_bare_array(): void
    {
        $this->ticket('legacy');
        $rows = $this->as($this->admin)->getJson('/api/tickets')->assertOk()->json();
        $this->assertArrayHasKey(0, $rows);
        $this->assertArrayHasKey('sla', $rows[0]);
        $this->assertArrayNotHasKey('items', $rows);
    }

    // --- scope=assigned (My Queue) / scope=involved (Submitted) ------------------

    public function test_assigned_scope_returns_only_my_work_orders(): void
    {
        $this->ticket('mine-name', ['assignee' => 'Pg user']);
        $this->ticket('mine-email', ['assignee' => 'pg-user@example.com', 'status' => 'closed']);
        $this->ticket('someone-elses', ['assignee' => 'Pg Tech']);
        $this->ticket('with-desc', ['assignee' => 'Pg user', 'description' => 'needle-in-description']);

        $all = $this->list($this->user, ['scope' => 'assigned'])->json();
        $this->assertSame(3, $all['total']);
        $this->assertEquals(['open' => 2, 'closed' => 1], $all['counts']); // whole assigned scope, by status

        $active = $this->list($this->user, ['scope' => 'assigned', 'active' => 1])->json();
        $this->assertSame(2, $active['total']);

        $byDesc = $this->list($this->user, ['scope' => 'assigned', 'q' => 'needle-in-description'])->json();
        $this->assertSame(1, $byDesc['total']);
        // Staff are scoped the same way (their own assignments, not the whole queue).
        $this->assertSame(0, $this->list($this->admin, ['scope' => 'assigned'])->json('total'));
    }

    public function test_involved_scope_reports_my_role(): void
    {
        $this->ticket('i-own', ['requester' => 'Pg user', 'assignee' => 'Pg Tech']);
        $this->ticket('i-work', ['requester' => 'Someone', 'assignee' => 'Pg user']);
        $this->ticket('i-both', ['requester' => 'pg-user@example.com', 'assignee' => 'Pg user']);
        $this->ticket('unrelated', ['requester' => 'Someone', 'assignee' => 'Pg Tech']);

        $res = $this->list($this->user, ['scope' => 'involved'])->json();
        $this->assertSame(3, $res['total']);
        $roles = collect($res['items'])->pluck('my_role', 'title');
        $this->assertSame('owner', $roles[self::MARK . ' i-own']);
        $this->assertSame('assignee', $roles[self::MARK . ' i-work']);
        $this->assertSame('both', $roles[self::MARK . ' i-both']);
        $this->assertSame(['owner' => 2, 'assignee' => 2], $res['role_counts']);

        $this->assertSame(2, $this->list($this->user, ['scope' => 'involved', 'role' => 'owner'])->json('total'));    // owner + both
        $this->assertSame(2, $this->list($this->user, ['scope' => 'involved', 'role' => 'assignee'])->json('total')); // assignee + both
    }

    // --- /api/tickets/summary (dashboard) -----------------------------------------

    public function test_summary_counts_and_latest(): void
    {
        $before = $this->as($this->admin)->getJson('/api/tickets/summary')->assertOk()->json();

        $this->ticket('sum-open-high', ['priority' => 'high']);
        $this->ticket('sum-closed', ['status' => 'closed', 'priority' => 'urgent']);
        $this->ticket('sum-open-low', ['priority' => 'low']);

        $after = $this->as($this->admin)->getJson('/api/tickets/summary?recent=2')->assertOk()->json();
        $this->assertSame($before['total'] + 3, $after['total']);
        $this->assertSame($before['open'] + 2, $after['open']);                      // closed isn't open
        $this->assertSame($before['high_priority'] + 2, $after['high_priority']);    // high + urgent, any status
        $this->assertCount(2, $after['recent']);
        $this->assertArrayHasKey('sla', $after['recent'][0]);
    }

    public function test_summary_respects_hr_visibility(): void
    {
        $before = $this->as($this->user)->getJson('/api/tickets/summary')->json('total');
        $this->ticket('hr-hidden', ['category' => 'HR Concerns', 'requester' => 'Somebody Else', 'department' => 'Other Dept']);
        $this->assertSame($before, $this->as($this->user)->getJson('/api/tickets/summary')->json('total'));
    }

    // --- /api/tickets/reports -------------------------------------------------------

    private function reports(string $token, array $params = []): \Illuminate\Testing\TestResponse
    {
        return $this->as($token)->getJson('/api/tickets/reports?' . http_build_query($params));
    }

    public function test_reports_are_staff_only(): void
    {
        $this->reports($this->user)->assertForbidden();
        $this->reports($this->admin)->assertOk();
    }

    public function test_reports_aggregate_within_a_date_range(): void
    {
        $in = ['created_at' => '2001-03-15 10:00:00', 'updated_at' => '2001-03-15 10:00:00'];
        $this->ticket('r1', $in + ['request_type' => 'incident', 'priority' => 'high', 'assignee' => 'Rep Tech', 'department' => 'Rep Dept']);
        $this->ticket('r2', $in + ['request_type' => 'incident', 'priority' => 'high', 'assignee' => 'Rep Tech', 'department' => 'Rep Dept']);
        $this->ticket('r3', ['request_type' => 'service_request', 'priority' => 'low', 'status' => 'resolved', 'department' => 'Rep Dept',
            'created_at' => '2001-03-15 10:00:00', 'updated_at' => '2001-03-17 10:00:00']);
        $this->ticket('r4', $in + ['request_type' => 'service_request', 'priority' => 'normal', 'status' => 'cancelled']);
        $this->ticket('r5-outside-range', ['created_at' => '2001-04-10 10:00:00', 'updated_at' => '2001-04-10 10:00:00']);

        $r = $this->reports($this->admin, ['from' => '2001-03-01', 'to' => '2001-03-31'])->assertOk()->json();

        $this->assertSame(4, $r['stats']['total']);
        $this->assertSame(2, $r['stats']['open']);                 // the two incidents; resolved/cancelled are terminal
        $this->assertSame(2, $r['stats']['incidents']);
        $this->assertSame(2, $r['stats']['overdue_open']);         // opened in 2001, never resolved
        $this->assertSame(100, $r['stats']['within_pct']);         // r3 resolved in 2 days against a 7-day target
        $this->assertSame(2, $r['by_status']['open']);
        $this->assertSame(1, $r['by_status']['resolved']);
        $this->assertSame(1, $r['by_status']['cancelled']);
        $this->assertSame(2, $r['by_priority']['high']);
        $this->assertSame(2, $r['by_request_type']['incident']);
        $this->assertSame(2, $r['by_request_type']['service_request']);
        $this->assertSame('Rep Dept', $r['by_department'][0]['label']);
        $this->assertSame(3, $r['by_department'][0]['value']);
        $this->assertSame([['label' => 'Rep Tech', 'value' => 2]], $r['open_by_assignee']);
        $this->assertSame(['within' => 1, 'breached' => 0], $r['sla_compliance']);
        $this->assertSame(2, $r['open_sla_health']['overdue']);
        $this->assertSame(2, $r['breaches_by_priority']['high']);
        $this->assertEquals(2.0, $r['avg_resolution_days']['low']);
        $this->assertSame(2, $r['incidents_by_priority']['high']);
        $this->assertSame([['y' => 2001, 'm' => 2, 'count' => 4]], $r['volume_by_month']);
        $this->assertSame([['y' => 2001, 'm' => 2, 'count' => 2]], $r['incidents_by_month']);
        $this->assertGreaterThanOrEqual(5, $r['scope_total']);
    }

    public function test_reports_date_range_follows_the_callers_timezone(): void
    {
        // Manila is UTC+8, so JS getTimezoneOffset() is -480: local 15 Mar = 14 Mar 16:00 → 15 Mar 15:59:59 UTC.
        $this->ticket('tz-in', ['created_at' => '2001-03-15 03:00:00', 'updated_at' => '2001-03-15 03:00:00']);   // local 11:00 on the 15th
        $this->ticket('tz-out', ['created_at' => '2001-03-15 17:00:00', 'updated_at' => '2001-03-15 17:00:00']);  // local 01:00 on the 16th

        $manila = $this->reports($this->admin, ['from' => '2001-03-15', 'to' => '2001-03-15', 'tz_offset' => -480])->json();
        $this->assertSame(1, $manila['stats']['total']);
        $utc = $this->reports($this->admin, ['from' => '2001-03-15', 'to' => '2001-03-15', 'tz_offset' => 0])->json();
        $this->assertSame(2, $utc['stats']['total']);
    }
}
