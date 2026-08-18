<?php

namespace Tests\Unit;

use App\Services\Permissions;
use PHPUnit\Framework\TestCase;

/**
 * Mirrors server/test's coverage of src/lib/permissions.js — keep the two
 * suites in sync when a module/action or role default changes.
 */
class PermissionsTest extends TestCase
{
    public function test_role_defaults_apply_when_no_overrides(): void
    {
        $user = ['role' => 'user', 'permissions' => null];
        $effective = Permissions::effective($user);

        $this->assertTrue($effective['tickets']['view']);
        $this->assertTrue($effective['tickets']['create']);
        $this->assertFalse($effective['assets']['manage']);
        $this->assertFalse($effective['users']['manage']);
        $this->assertFalse($effective['network']['view']);
    }

    public function test_admin_defaults_grant_everything(): void
    {
        $effective = Permissions::effective(['role' => 'admin', 'permissions' => null]);
        foreach (Permissions::MODULES as $mod => $actions) {
            foreach ($actions as $action) {
                $this->assertTrue($effective[$mod][$action], "$mod.$action should default true for admin");
            }
        }
    }

    public function test_unknown_role_falls_back_to_user_defaults(): void
    {
        $effective = Permissions::effective(['role' => 'bogus', 'permissions' => null]);
        $this->assertEquals(Permissions::effective(['role' => 'user', 'permissions' => null]), $effective);
    }

    public function test_boolean_override_wins_over_role_default(): void
    {
        $user = ['role' => 'user', 'permissions' => ['assets' => ['manage' => true]]];
        $this->assertTrue(Permissions::effective($user)['assets']['manage']);

        $user2 = ['role' => 'admin', 'permissions' => ['tickets' => ['view' => false]]];
        $this->assertFalse(Permissions::effective($user2)['tickets']['view']);
    }

    public function test_permissions_json_string_is_parsed(): void
    {
        $user = ['role' => 'user', 'permissions' => json_encode(['kb' => ['manage' => true]])];
        $this->assertTrue(Permissions::effective($user)['kb']['manage']);
    }

    public function test_has_permission_reflects_effective(): void
    {
        $user = ['role' => 'agent', 'permissions' => null];
        $this->assertTrue(Permissions::has($user, 'tickets', 'view'));
        $this->assertFalse(Permissions::has($user, 'users', 'manage'));
        $this->assertFalse(Permissions::has(null, 'tickets', 'view'));
    }

    public function test_sanitize_strips_unknown_modules_and_non_boolean_values(): void
    {
        $raw = [
            'tickets' => ['view' => true, 'bogus_action' => true],
            'not_a_module' => ['manage' => true],
            'assets' => ['manage' => 'yes'], // not boolean -> dropped
        ];
        $clean = Permissions::sanitize($raw);
        $this->assertEquals(['tickets' => ['view' => true]], $clean);
    }

    public function test_sanitize_returns_null_when_nothing_survives(): void
    {
        $this->assertNull(Permissions::sanitize(null));
        $this->assertNull(Permissions::sanitize(['not_a_module' => ['x' => true]]));
        $this->assertNull(Permissions::sanitize('not json'));
    }
}
