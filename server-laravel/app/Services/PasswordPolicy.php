<?php

namespace App\Services;

/**
 * Ported 1:1 from server/src/lib/password-policy.js. The client mirrors these
 * rules for a live checklist, but this is the security boundary.
 */
class PasswordPolicy
{
    public const MIN_LENGTH = 8;

    public const RULES = [
        'length' => 'At least 8 characters',
        'upper' => 'An uppercase letter (A–Z)',
        'lower' => 'A lowercase letter (a–z)',
        'number' => 'A number (0–9)',
        'special' => 'A special character (!@#$…)',
    ];

    /** @return string[] Rule ids that failed. */
    public static function failedRules(string $password): array
    {
        $failed = [];
        if (strlen($password) < self::MIN_LENGTH) {
            $failed[] = 'length';
        }
        if (!preg_match('/[A-Z]/', $password)) {
            $failed[] = 'upper';
        }
        if (!preg_match('/[a-z]/', $password)) {
            $failed[] = 'lower';
        }
        if (!preg_match('/[0-9]/', $password)) {
            $failed[] = 'number';
        }
        if (!preg_match('/[^A-Za-z0-9]/', $password)) {
            $failed[] = 'special';
        }
        return $failed;
    }

    /** A single human-readable error listing unmet requirements, or null if valid. */
    public static function error(?string $password): ?string
    {
        $failed = self::failedRules((string) $password);
        if (empty($failed)) {
            return null;
        }
        $unmet = array_map(fn ($id) => strtolower(self::RULES[$id]), $failed);
        return 'Password must have: ' . implode(', ', $unmet) . '.';
    }
}
