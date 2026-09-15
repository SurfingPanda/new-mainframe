<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Runs against the real `mainframe_app` schema (server/sql/schema.sql) — this
 * app has no Eloquent migrations of its own. DatabaseTransactions wraps each
 * test in a rolled-back transaction so nothing is ever persisted.
 */
class AuthTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        // The auth cookie is a raw JWT, not a Laravel-encrypted cookie (the
        // 'api' route group carries no EncryptCookies middleware) — match that
        // in tests so withCookie() round-trips the token as-is. withCredentials()
        // is required too: Laravel's *Json() test helpers only attach cookies
        // to the request when it's on (see MakesHttpRequests::prepareCookiesForJsonRequest).
        $this->disableCookieEncryption();
        $this->withCredentials();
    }

    private function makeUser(array $overrides = []): int
    {
        DB::table('users')->insert(array_merge([
            'email' => 'auth-feature-test@example.com',
            'password_hash' => Hash::make('CorrectHorse1!'),
            'name' => 'Feature Test User',
            'role' => 'user',
            'is_active' => 1,
            'token_version' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));

        return DB::table('users')->where('email', $overrides['email'] ?? 'auth-feature-test@example.com')->value('id');
    }

    public function test_login_rejects_wrong_password(): void
    {
        $this->makeUser();

        $this->postJson('/api/auth/login', [
            'email' => 'auth-feature-test@example.com',
            'password' => 'wrong',
        ])->assertStatus(401)->assertJson(['error' => 'Invalid email or password']);
    }

    public function test_login_rejects_inactive_user(): void
    {
        $this->makeUser(['email' => 'inactive@example.com', 'is_active' => 0]);

        $this->postJson('/api/auth/login', [
            'email' => 'inactive@example.com',
            'password' => 'CorrectHorse1!',
        ])->assertStatus(401);
    }

    public function test_login_sets_httponly_cookie_and_returns_user(): void
    {
        $this->makeUser();

        $response = $this->postJson('/api/auth/login', [
            'email' => 'auth-feature-test@example.com',
            'password' => 'CorrectHorse1!',
        ]);

        $response->assertOk()->assertJsonPath('user.email', 'auth-feature-test@example.com');
        $cookie = $response->headers->getCookies()[0];
        $this->assertSame('mf_token', $cookie->getName());
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('lax', $cookie->getSameSite());
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_me_returns_current_user_via_cookie(): void
    {
        $this->makeUser();
        $login = $this->postJson('/api/auth/login', [
            'email' => 'auth-feature-test@example.com',
            'password' => 'CorrectHorse1!',
        ]);
        $token = $login->headers->getCookies()[0]->getValue();

        $this->withCookie('mf_token', $token)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('email', 'auth-feature-test@example.com');
    }

    public function test_me_stats_returns_assigned_ticket_counts_sla_breaches_and_rating(): void
    {
        $userId = $this->makeUser();
        $login = $this->postJson('/api/auth/login', [
            'email' => 'auth-feature-test@example.com',
            'password' => 'CorrectHorse1!',
        ]);
        $token = $login->headers->getCookies()[0]->getValue();

        $baseTicket = [
            'title' => 'Scorecard test ticket',
            'requester' => 'Requester',
            'priority' => 'normal',
            'assignee' => 'Feature Test User',
            'created_at' => now(),
            'updated_at' => now(),
        ];
        DB::table('tickets')->insert(array_merge($baseTicket, ['status' => 'on_hold']));
        $resolvedId = DB::table('tickets')->insertGetId(array_merge($baseTicket, [
            'status' => 'resolved',
            'assignee' => 'auth-feature-test@example.com',
        ]));
        DB::table('tickets')->insert(array_merge($baseTicket, [
            'status' => 'open',
            'created_at' => now()->subHours(2),
            'updated_at' => now()->subHours(2),
            'sla_resolution_minutes' => 30,
            'sla_resolution_breached_at' => now(),
        ]));
        // An overdue-looking ticket with no recorded breach must not be
        // inferred as one by the Profile scorecard.
        DB::table('tickets')->insert(array_merge($baseTicket, [
            'status' => 'open',
            'created_at' => now()->subDays(30),
            'sla_resolution_minutes' => 30,
        ]));
        // A breached ticket submitted by this user but assigned to somebody
        // else must not affect this technician's performance.
        DB::table('tickets')->insert(array_merge($baseTicket, [
            'status' => 'open',
            'requester' => 'Feature Test User',
            'assignee' => 'Someone Else',
            'sla_resolution_breached_at' => now(),
        ]));

        DB::table('ticket_surveys')->insert([
            'ticket_id' => $resolvedId,
            'technician' => 'Feature Test User',
            'technician_id' => $userId,
            'respondent_id' => $userId,
            'respondent_name' => 'Requester',
            'satisfaction' => 5,
            'timeliness' => 4,
            'professionalism' => 3,
            'status' => 'completed',
            'created_at' => now(),
            'completed_at' => now(),
        ]);

        $this->withCookie('mf_token', $token)
            ->getJson('/api/auth/me/stats')
            ->assertOk()
            ->assertJson([
                'onHold' => 1,
                'resolved' => 1,
                'breached' => 1,
                'rating' => ['average' => 4, 'count' => 1],
            ]);
    }

    public function test_change_password_invalidates_old_cookie_but_not_the_reissued_one(): void
    {
        $this->makeUser();
        $login = $this->postJson('/api/auth/login', [
            'email' => 'auth-feature-test@example.com',
            'password' => 'CorrectHorse1!',
        ]);
        $oldToken = $login->headers->getCookies()[0]->getValue();

        $changeResp = $this->withCookie('mf_token', $oldToken)->postJson('/api/auth/change-password', [
            'current_password' => 'CorrectHorse1!',
            'new_password' => 'AnotherHorse2!',
        ])->assertOk();
        $newToken = $changeResp->headers->getCookies()[0]->getValue();

        $this->withCookie('mf_token', $oldToken)->getJson('/api/auth/me')->assertStatus(401);
        $this->withCookie('mf_token', $newToken)->getJson('/api/auth/me')->assertOk();
    }

    public function test_change_password_rejects_weak_password(): void
    {
        $this->makeUser();
        $login = $this->postJson('/api/auth/login', [
            'email' => 'auth-feature-test@example.com',
            'password' => 'CorrectHorse1!',
        ]);
        $token = $login->headers->getCookies()[0]->getValue();

        $this->withCookie('mf_token', $token)->postJson('/api/auth/change-password', [
            'current_password' => 'CorrectHorse1!',
            'new_password' => 'weak',
        ])->assertStatus(400);
    }

    public function test_logout_clears_cookie(): void
    {
        $response = $this->postJson('/api/auth/logout')->assertOk();
        $cookie = $response->headers->getCookies()[0];
        $this->assertLessThan(time(), $cookie->getExpiresTime());
    }
}
