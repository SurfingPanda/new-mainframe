<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Endpoints the client calls that the initial port had left out:
 * /api/auth/me/preferences, /api/auth/me/invalidate-sessions,
 * /api/settings/sla and /api/announcements. Same real-schema +
 * rolled-back-transaction setup as AuthTest.
 */
class SelfServiceSettingsTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->disableCookieEncryption();
        $this->withCredentials();
    }

    /** Creates a user and returns a valid auth cookie token for them. */
    private function loginAs(array $overrides = []): string
    {
        $email = $overrides['email'] ?? 'selfservice-test@example.com';
        DB::table('users')->insert(array_merge([
            'email' => $email,
            'password_hash' => Hash::make('CorrectHorse1!'),
            'name' => 'Self Service Tester',
            'role' => 'user',
            'is_active' => 1,
            'token_version' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));

        return $this->postJson('/api/auth/login', ['email' => $email, 'password' => 'CorrectHorse1!'])
            ->assertOk()->headers->getCookies()[0]->getValue();
    }

    public function test_preferences_default_then_merge_patch(): void
    {
        $token = $this->loginAs();

        $this->withCookie('mf_token', $token)->getJson('/api/auth/me/preferences')
            ->assertOk()
            ->assertJsonPath('notifications.email_assigned', true)
            ->assertJsonPath('chat.enter_to_send', true);

        $this->withCookie('mf_token', $token)
            ->patchJson('/api/auth/me/preferences', ['notifications' => ['email_assigned' => false]])
            ->assertOk()
            ->assertJsonPath('notifications.email_assigned', false)
            ->assertJsonPath('notifications.email_status_change', true);

        // Persisted, and a second patch to another key keeps the first.
        $this->withCookie('mf_token', $token)
            ->patchJson('/api/auth/me/preferences', ['notifications' => ['email_new_comment' => false]])
            ->assertOk()
            ->assertJsonPath('notifications.email_assigned', false)
            ->assertJsonPath('notifications.email_new_comment', false);
    }

    public function test_invalidate_sessions_kills_other_tokens_but_keeps_this_device(): void
    {
        $token = $this->loginAs();
        $otherDevice = $this->postJson('/api/auth/login', [
            'email' => 'selfservice-test@example.com',
            'password' => 'CorrectHorse1!',
        ])->headers->getCookies()[0]->getValue();

        $resp = $this->withCookie('mf_token', $token)
            ->postJson('/api/auth/me/invalidate-sessions')->assertOk();
        $fresh = $resp->headers->getCookies()[0]->getValue();

        $this->withCookie('mf_token', $otherDevice)->getJson('/api/auth/me')->assertStatus(401);
        $this->withCookie('mf_token', $token)->getJson('/api/auth/me')->assertStatus(401);
        $this->withCookie('mf_token', $fresh)->getJson('/api/auth/me')->assertOk();
    }

    public function test_sla_settings_readable_by_anyone_writable_by_admin_only(): void
    {
        $userToken = $this->loginAs();
        $this->withCookie('mf_token', $userToken)->getJson('/api/settings/sla')
            ->assertOk()->assertJsonStructure(['low', 'normal', 'high', 'urgent']);
        $this->withCookie('mf_token', $userToken)
            ->putJson('/api/settings/sla', ['low' => 7, 'normal' => 3, 'high' => 2, 'urgent' => 1])
            ->assertStatus(403);

        $adminToken = $this->loginAs(['email' => 'selfservice-admin@example.com', 'role' => 'admin']);
        $this->withCookie('mf_token', $adminToken)
            ->putJson('/api/settings/sla', ['low' => 7, 'normal' => 3, 'high' => 2])
            ->assertStatus(400);
        $this->withCookie('mf_token', $adminToken)
            ->putJson('/api/settings/sla', ['low' => 10, 'normal' => 5, 'high' => 2, 'urgent' => 1])
            ->assertOk()->assertJson(['low' => 10, 'normal' => 5]);
    }

    public function test_announcements_crud_and_visibility(): void
    {
        $userToken = $this->loginAs(['department' => 'Finance']);
        $itToken = $this->loginAs(['email' => 'selfservice-it@example.com', 'department' => 'IT']);

        // Plain users can read but not write.
        $this->withCookie('mf_token', $userToken)
            ->postJson('/api/announcements', ['title' => 'Nope'])->assertStatus(403);

        $created = $this->withCookie('mf_token', $itToken)
            ->postJson('/api/announcements', ['title' => 'Downtime tonight', 'type' => 'maintenance', 'body' => 'Server patching'])
            ->assertStatus(201)
            ->assertJsonPath('type', 'maintenance')
            ->assertJsonPath('is_active', true);
        $id = $created->json('id');

        $scheduled = $this->withCookie('mf_token', $itToken)
            ->postJson('/api/announcements', ['title' => 'Future', 'starts_at' => now()->addDay()->format('Y-m-d\TH:i')])
            ->assertStatus(201)->json('id');

        // Active list shows the live one, hides the not-yet-started one.
        $ids = collect($this->withCookie('mf_token', $userToken)->getJson('/api/announcements')->assertOk()->json())->pluck('id');
        $this->assertTrue($ids->contains($id));
        $this->assertFalse($ids->contains($scheduled));

        // ?all=1 is ignored for non-managers, honoured for IT.
        $ids = collect($this->withCookie('mf_token', $userToken)->getJson('/api/announcements?all=1')->json())->pluck('id');
        $this->assertFalse($ids->contains($scheduled));
        $ids = collect($this->withCookie('mf_token', $itToken)->getJson('/api/announcements?all=1')->json())->pluck('id');
        $this->assertTrue($ids->contains($scheduled));

        $this->withCookie('mf_token', $itToken)
            ->patchJson("/api/announcements/{$id}", ['is_active' => false])
            ->assertOk()->assertJsonPath('is_active', false);
        $this->withCookie('mf_token', $itToken)
            ->patchJson("/api/announcements/{$id}", ['type' => 'bogus'])->assertStatus(400);

        $this->withCookie('mf_token', $userToken)->deleteJson("/api/announcements/{$id}")->assertStatus(403);
        $this->withCookie('mf_token', $itToken)->deleteJson("/api/announcements/{$id}")->assertOk();
        $this->withCookie('mf_token', $itToken)->deleteJson("/api/announcements/{$id}")->assertStatus(404);
    }
}
