<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Admin-editable request types + category tree (TaxonomyController /
 * TicketTaxonomy). Runs against the real schema, which must have
 * sql/add-ticket-taxonomy.sql applied (it seeds today's values).
 */
class TaxonomyTest extends TestCase
{
    use DatabaseTransactions;

    private string $admin;
    private string $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->disableCookieEncryption();
        $this->withCredentials();
        $this->admin = $this->loginAs('tax-admin@example.com', 'admin');
        $this->user = $this->loginAs('tax-user@example.com', 'user');
    }

    private function loginAs(string $email, string $role): string
    {
        DB::table('users')->insert([
            'email' => $email, 'password_hash' => Hash::make('CorrectHorse1!'), 'name' => "Tax {$role}",
            'role' => $role, 'department' => 'IT', 'is_active' => 1, 'token_version' => 0,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return $this->postJson('/api/auth/login', ['email' => $email, 'password' => 'CorrectHorse1!'])
            ->assertOk()->headers->getCookies()[0]->getValue();
    }

    private function as(string $token): static
    {
        return $this->withCookie('mf_token', $token);
    }

    private function catId(string $name, int $parentId = 0): int
    {
        return (int) DB::table('ticket_categories')->where('parent_id', $parentId)->where('name', $name)->value('id');
    }

    private function ticket(array $extra = []): int
    {
        return DB::table('tickets')->insertGetId(array_merge([
            'title' => 'Taxonomy test', 'requester' => 'Someone', 'priority' => 'normal', 'status' => 'open',
            'created_at' => now()->subDay(), 'updated_at' => now()->subDay(),
        ], $extra));
    }

    public function test_forms_get_the_seeded_active_taxonomy(): void
    {
        $res = $this->as($this->user)->getJson('/api/taxonomy')->assertOk();
        $this->assertContains('service_request', array_column($res->json('requestTypes'), 'key'));
        $top = array_column($res->json('categories'), 'name');
        $this->assertContains('Hardware', $top);
        $this->assertContains('HR Concerns', $top);
    }

    public function test_management_is_admin_only(): void
    {
        $this->as($this->user)->getJson('/api/taxonomy/manage')->assertStatus(403);
        $this->as($this->user)->postJson('/api/taxonomy/categories', ['name' => 'Nope'])->assertStatus(403);
        $this->as($this->admin)->getJson('/api/taxonomy/manage')->assertOk()
            ->assertJsonStructure(['requestTypes' => [['id', 'key', 'label', 'is_active', 'is_system', 'usage']], 'categories']);
    }

    public function test_new_request_type_is_usable_and_hiding_blocks_new_work_orders_only(): void
    {
        $created = $this->as($this->admin)->postJson('/api/taxonomy/request-types', [
            'label' => 'Hardware Refresh', 'description' => 'Scheduled replacement',
        ])->assertStatus(201);
        $this->assertSame('hardware_refresh', $created->json('key'));
        $id = $created->json('id');

        $this->as($this->user)->postJson('/api/tickets', [
            'title' => 'Replace laptop', 'requester' => 'Tax user', 'department' => 'IT',
            'request_type' => 'hardware_refresh',
        ])->assertStatus(201);

        $this->as($this->admin)->patchJson("/api/taxonomy/request-types/{$id}", ['is_active' => false])->assertOk();
        $this->as($this->user)->postJson('/api/tickets', [
            'title' => 'Another', 'requester' => 'Tax user', 'department' => 'IT',
            'request_type' => 'hardware_refresh',
        ])->assertStatus(400);

        // In use → can't delete; hiding was the way.
        $this->as($this->admin)->deleteJson("/api/taxonomy/request-types/{$id}")->assertStatus(409);
    }

    public function test_system_entries_are_protected(): void
    {
        $incident = DB::table('ticket_request_types')->where('type_key', 'incident')->value('id');
        $this->as($this->admin)->patchJson("/api/taxonomy/request-types/{$incident}", ['is_active' => false])->assertStatus(409);
        $this->as($this->admin)->deleteJson("/api/taxonomy/request-types/{$incident}")->assertStatus(409);

        $hr = $this->catId('HR Concerns');
        $this->as($this->admin)->patchJson("/api/taxonomy/categories/{$hr}", ['name' => 'People'])->assertStatus(409);
        $this->as($this->admin)->deleteJson("/api/taxonomy/categories/{$hr}")->assertStatus(409);
    }

    public function test_three_levels_max_and_sibling_names_unique(): void
    {
        $top = $this->as($this->admin)->postJson('/api/taxonomy/categories', ['name' => 'Facilities'])->assertStatus(201)->json('id');
        $sub = $this->as($this->admin)->postJson('/api/taxonomy/categories', ['parent_id' => $top, 'name' => 'Aircon'])->assertStatus(201)->json('id');
        $leaf = $this->as($this->admin)->postJson('/api/taxonomy/categories', ['parent_id' => $sub, 'name' => 'Not cooling'])->assertStatus(201)->json('id');
        $this->as($this->admin)->postJson('/api/taxonomy/categories', ['parent_id' => $leaf, 'name' => 'Too deep'])->assertStatus(400);
        $this->as($this->admin)->postJson('/api/taxonomy/categories', ['parent_id' => $top, 'name' => 'aircon'])->assertStatus(409);

        // New top-level category is immediately valid for work orders.
        $this->as($this->user)->postJson('/api/tickets', [
            'title' => 'Hot room', 'requester' => 'Tax user', 'department' => 'IT',
            'category' => 'Facilities', 'subcategory' => 'Aircon', 'subcategory2' => 'Not cooling',
        ])->assertStatus(201);
    }

    public function test_renaming_a_category_updates_work_orders_sla_policies_and_automation(): void
    {
        $hw = $this->catId('Hardware');
        $t1 = $this->ticket(['category' => 'Hardware', 'subcategory' => 'Desktops & Laptops']);
        $t2 = $this->ticket(['category' => 'Software']);
        DB::table('sla_policies')->insert(['name' => 'HW policy', 'category' => 'Hardware', 'resolution_minutes' => 60, 'is_active' => 1]);
        $ruleId = DB::table('automation_rules')->insertGetId([
            'name' => 'HW rule', 'trigger_event' => 'ticket.created', 'is_active' => 1, 'priority' => 100,
            'conditions' => json_encode(['match' => 'all', 'rules' => [
                ['field' => 'category', 'op' => 'eq', 'value' => 'Hardware'],
                ['field' => 'category', 'op' => 'in', 'value' => ['Hardware', 'Software']],
            ]]),
            'actions' => json_encode([['type' => 'set_field', 'field' => 'category', 'value' => 'Hardware']]),
        ]);
        $before = DB::table('tickets')->where('id', $t1)->value('updated_at');
        $hwCount = DB::table('tickets')->where('category', 'Hardware')->count(); // incl. pre-existing rows

        $this->as($this->admin)->patchJson("/api/taxonomy/categories/{$hw}", ['name' => 'Devices'])
            ->assertOk()->assertJsonPath('updated_work_orders', $hwCount);

        $this->assertSame('Devices', DB::table('tickets')->where('id', $t1)->value('category'));
        $this->assertSame($before, DB::table('tickets')->where('id', $t1)->value('updated_at'));
        $this->assertSame('Software', DB::table('tickets')->where('id', $t2)->value('category'));
        $this->assertTrue(DB::table('sla_policies')->where('name', 'HW policy')->where('category', 'Devices')->exists());
        $rule = DB::table('automation_rules')->where('id', $ruleId)->first();
        $this->assertStringContainsString('"Devices"', $rule->conditions);
        $this->assertStringNotContainsString('"Hardware"', $rule->conditions);
        $this->assertStringContainsString('"Devices"', $rule->actions);
    }

    public function test_renaming_a_subcategory_only_touches_that_parent(): void
    {
        $email = $this->catId('Email', $this->catId('Email & Communication'));
        $mine = $this->ticket(['category' => 'Email & Communication', 'subcategory' => 'Email']);
        $other = $this->ticket(['category' => 'Other', 'subcategory' => 'Email']);

        $this->as($this->admin)->patchJson("/api/taxonomy/categories/{$email}", ['name' => 'Mail'])->assertOk();

        $this->assertSame('Mail', DB::table('tickets')->where('id', $mine)->value('subcategory'));
        $this->assertSame('Email', DB::table('tickets')->where('id', $other)->value('subcategory'));
    }

    public function test_delete_rules(): void
    {
        $sw = $this->catId('Software');
        $this->as($this->admin)->deleteJson("/api/taxonomy/categories/{$sw}")->assertStatus(409); // has children

        $top = $this->as($this->admin)->postJson('/api/taxonomy/categories', ['name' => 'Temp'])->json('id');
        $this->ticket(['category' => 'Temp']);
        $this->as($this->admin)->deleteJson("/api/taxonomy/categories/{$top}")->assertStatus(409); // in use
        DB::table('tickets')->where('category', 'Temp')->delete();
        $this->as($this->admin)->deleteJson("/api/taxonomy/categories/{$top}")->assertOk();
    }

    public function test_hidden_category_disappears_from_forms_and_reorder_works(): void
    {
        $other = $this->catId('Other');
        $this->as($this->admin)->patchJson("/api/taxonomy/categories/{$other}", ['is_active' => false])->assertOk();
        $top = array_column($this->as($this->user)->getJson('/api/taxonomy')->json('categories'), 'name');
        $this->assertNotContains('Other', $top);

        $ids = [$this->catId('Software'), $this->catId('Hardware')];
        $this->as($this->admin)->postJson('/api/taxonomy/reorder', ['kind' => 'categories', 'ids' => $ids])->assertOk();
        $top = array_column($this->as($this->user)->getJson('/api/taxonomy')->json('categories'), 'name');
        $this->assertLessThan(array_search('Hardware', $top), array_search('Software', $top));
    }
}
