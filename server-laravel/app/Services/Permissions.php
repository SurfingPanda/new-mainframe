<?php

namespace App\Services;

/**
 * Per-module access control. Ported 1:1 from server/src/lib/permissions.js —
 * keep the two in sync when a module/action is added or a role default changes.
 * A user's `permissions` JSON column overrides the role defaults below. Set a
 * module/action to true/false to grant or deny; omit it to fall back to the
 * role default.
 */
class Permissions
{
    public const MODULES = [
        'tickets' => ['view', 'create'],
        'assets' => ['view', 'manage'],
        'kb' => ['view', 'manage'],
        'users' => ['manage'],
        'network' => ['view', 'manage'],
        'spaces' => ['view', 'manage'],
        'automation' => ['manage'],
    ];

    public const ROLE_DEFAULTS = [
        'admin' => [
            'tickets' => ['view' => true, 'create' => true],
            'assets' => ['view' => true, 'manage' => true],
            'kb' => ['view' => true, 'manage' => true],
            'users' => ['manage' => true],
            'network' => ['view' => true, 'manage' => true],
            'spaces' => ['view' => true, 'manage' => true],
            'automation' => ['manage' => true],
        ],
        'agent' => [
            'tickets' => ['view' => true, 'create' => true],
            'assets' => ['view' => true, 'manage' => true],
            'kb' => ['view' => true, 'manage' => true],
            'users' => ['manage' => false],
            'network' => ['view' => true, 'manage' => true],
            'spaces' => ['view' => true, 'manage' => false],
            'automation' => ['manage' => false],
        ],
        'user' => [
            'tickets' => ['view' => true, 'create' => true],
            'assets' => ['view' => true, 'manage' => false],
            'kb' => ['view' => true, 'manage' => false],
            'users' => ['manage' => false],
            'network' => ['view' => false, 'manage' => false],
            'spaces' => ['view' => true, 'manage' => false],
            'automation' => ['manage' => false],
        ],
    ];

    private static function parsePermissions(mixed $raw): ?array
    {
        if ($raw === null) {
            return null;
        }
        if (is_array($raw)) {
            return $raw;
        }
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            return is_array($decoded) ? $decoded : null;
        }
        return null;
    }

    /**
     * Merge role defaults with the user's overrides. Returns a fully populated
     * [module => [action => bool]] array. $user is the raw row (array) with at
     * least `role` and `permissions`.
     */
    public static function effective(array $user): array
    {
        $role = (isset($user['role']) && isset(self::ROLE_DEFAULTS[$user['role']])) ? $user['role'] : 'user';
        $overrides = self::parsePermissions($user['permissions'] ?? null) ?? [];

        $out = [];
        foreach (self::MODULES as $mod => $actions) {
            $out[$mod] = [];
            foreach ($actions as $action) {
                $override = $overrides[$mod][$action] ?? null;
                $out[$mod][$action] = is_bool($override)
                    ? $override
                    : (bool) (self::ROLE_DEFAULTS[$role][$mod][$action] ?? false);
            }
        }
        return $out;
    }

    public static function has(?array $user, string $module, string $action): bool
    {
        if (!$user) {
            return false;
        }
        return (bool) (self::effective($user)[$module][$action] ?? false);
    }

    /**
     * Strip a permissions payload to only known module/action keys with boolean
     * values. Returns null when nothing remains so we store NULL (= role default).
     */
    public static function sanitize(mixed $raw): ?array
    {
        $parsed = self::parsePermissions($raw);
        if (!$parsed) {
            return null;
        }
        $cleaned = [];
        foreach (self::MODULES as $mod => $actions) {
            $modOverrides = $parsed[$mod] ?? null;
            if (!is_array($modOverrides)) {
                continue;
            }
            $modOut = [];
            foreach ($actions as $action) {
                if (is_bool($modOverrides[$action] ?? null)) {
                    $modOut[$action] = $modOverrides[$action];
                }
            }
            if (!empty($modOut)) {
                $cleaned[$mod] = $modOut;
            }
        }
        return !empty($cleaned) ? $cleaned : null;
    }
}
