<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Document Controller: the single user (users.is_document_controller) who is
 * auto-assigned every new 'ERP Access' work order, emailed + Mailboxed, and
 * whose assignment only an admin can change. Needs sql/add-document-controller.sql.
 */
class DocumentControllerTest extends TestCase
{
    use DatabaseTransactions;

    private string $admin;
    private string $requester;
    private int $dcId;
    private int $otherId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->disableCookieEncryption();
        $this->withCredentials();
        // A fake Resend transport so we can see what would have been emailed.
        config(['hubly.resend_api_key' => 'test-key']);
        Http::fake(['api.resend.com/*' => Http::response(['id' => 'fake'], 200)]);

        // Start from a clean slate: nobody else is the Document Controller in this transaction.
        DB::table('users')->update(['is_document_controller' => 0]);

        $this->dcId = $this->makeUser('dc-test@example.com', 'DC Person', 'agent', 'Doc Dept', 1);
        $this->otherId = $this->makeUser('dc-other@example.com', 'Other Person', 'agent', 'Other Dept', 0);
        $this->admin = $this->login('dc-admin@example.com', 'admin');
        $this->requester = $this->login('dc-req@example.com', 'user');
    }

    private function makeUser(string $email, string $name, string $role, string $dept, int $isDc): int
    {
        return DB::table('users')->insertGetId([
            'email' => $email, 'password_hash' => Hash::make('CorrectHorse1!'), 'name' => $name, 'role' => $role,
            'department' => $dept, 'is_active' => 1, 'is_document_controller' => $isDc, 'token_version' => 0,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function login(string $email, string $role): string
    {
        $this->makeUser($email, "Login {$role}", $role, 'Req Dept', 0);
        return $this->postJson('/api/auth/login', ['email' => $email, 'password' => 'CorrectHorse1!'])
            ->assertOk()->headers->getCookies()[0]->getValue();
    }

    private function as(string $token): static
    {
        return $this->withCookie('mf_token', $token);
    }

    private function createErp(string $token, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->as($token)->postJson('/api/tickets', array_merge([
            'title' => 'ERP access for tester', 'requester' => 'Login user', 'category' => 'ERP Access',
            'subcategory' => 'Finance & Accounting', 'subcategory2' => 'New access request',
            'department' => 'Wrong Dept', 'assignee' => 'Other Person',
        ], $extra));
    }

    public function test_erp_access_is_forced_to_the_document_controller(): void
    {
        $res = $this->createErp($this->requester)->assertCreated()->json();

        $this->assertSame('DC Person', $res['assignee']);   // submitter's assignee ignored
        $this->assertSame('Doc Dept', $res['department']);  // and so is the department

        $this->assertTrue(DB::table('ticket_activity')
            ->where('ticket_id', $res['id'])->where('field', 'assignee')->where('new_value', 'DC Person')->exists());
    }

    public function test_document_controller_gets_an_email_and_a_mailbox_message(): void
    {
        $res = $this->createErp($this->requester)->assertCreated()->json();

        Http::assertSent(fn ($req) => str_contains(json_encode($req->data()), 'dc-test@example.com'));
        $this->assertTrue(DB::table('messages')
            ->where('recipient_id', $this->dcId)->where('subject', 'like', 'ERP Access request%')->exists());
        $this->assertNotNull($res['id']);
    }

    public function test_other_categories_are_not_touched(): void
    {
        $res = $this->createErp($this->requester, ['category' => 'Hardware', 'subcategory' => null, 'subcategory2' => null])
            ->assertCreated()->json();
        $this->assertSame('Other Person', $res['assignee']);
        $this->assertSame('Wrong Dept', $res['department']);
    }

    public function test_without_a_document_controller_nothing_is_forced(): void
    {
        DB::table('users')->where('id', $this->dcId)->update(['is_document_controller' => 0]);
        $res = $this->createErp($this->requester)->assertCreated()->json();
        $this->assertSame('Other Person', $res['assignee']);
    }

    public function test_only_an_admin_can_move_an_erp_work_order(): void
    {
        $id = $this->createErp($this->requester)->assertCreated()->json('id');

        // The assignee (an agent) may not reassign it or change the department.
        $agent = $this->postJson('/api/auth/login', ['email' => 'dc-test@example.com', 'password' => 'CorrectHorse1!'])
            ->assertOk()->headers->getCookies()[0]->getValue();
        $this->as($agent)->patchJson("/api/tickets/{$id}", ['assignee' => 'Other Person'])->assertForbidden();
        $this->as($agent)->patchJson("/api/tickets/{$id}", ['department' => 'Other Dept'])->assertForbidden();
        $this->as($agent)->postJson("/api/tickets/{$id}/release")->assertForbidden();
        $bulk = $this->as($agent)->postJson('/api/tickets/bulk', ['ids' => [$id], 'field' => 'assignee', 'value' => 'Other Person'])
            ->assertOk()->json();
        $this->assertSame('locked', $bulk['skipped'][0]['reason']);

        // Other fields stay editable, and an admin can reassign.
        $this->as($agent)->patchJson("/api/tickets/{$id}", ['status' => 'in_progress'])->assertOk();
        $this->as($this->admin)->patchJson("/api/tickets/{$id}", ['assignee' => 'Other Person'])->assertOk();
        $this->assertSame('Other Person', DB::table('tickets')->where('id', $id)->value('assignee'));
    }

    public function test_only_one_active_user_can_hold_the_designation(): void
    {
        $this->as($this->admin)->patchJson("/api/users/{$this->otherId}", ['is_document_controller' => true])->assertOk();
        $this->assertSame(0, (int) DB::table('users')->where('id', $this->dcId)->value('is_document_controller'));
        $this->assertSame(1, (int) DB::table('users')->where('id', $this->otherId)->value('is_document_controller'));

        // An inactive account can't be made the Document Controller…
        $this->as($this->admin)->patchJson("/api/users/{$this->dcId}", ['is_active' => false, 'is_document_controller' => true])
            ->assertStatus(400);
        // …and deactivating the holder clears the designation.
        $this->as($this->admin)->patchJson("/api/users/{$this->otherId}", ['is_active' => false])->assertOk();
        $this->assertSame(0, (int) DB::table('users')->where('id', $this->otherId)->value('is_document_controller'));
    }
}
