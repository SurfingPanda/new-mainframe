<?php

namespace App\Services;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use RuntimeException;
use UnexpectedValueException;

/**
 * Thin wrapper around firebase/php-jwt, playing the same role the Node
 * backend gets from the `jsonwebtoken` package (see routes/auth.js,
 * middleware/auth.js). HS256, same claim shape: sub/email/role/name/
 * permissions/tv (+ standard iat/exp).
 */
class JwtService
{
    private const ALG = 'HS256';

    /** @param array<string, mixed> $claims */
    public static function issue(array $claims, ?string $expiresIn = null): string
    {
        $secret = self::secret();
        $now = time();
        $payload = array_merge($claims, [
            'iat' => $now,
            'exp' => $now + self::durationSeconds($expiresIn ?? config('hubly.jwt_expires_in', '7d')),
        ]);
        return JWT::encode($payload, $secret, self::ALG);
    }

    /** @return array<string, mixed>|null Decoded claims, or null if invalid/expired. */
    public static function verify(string $token): ?array
    {
        try {
            $decoded = JWT::decode($token, new Key(self::secret(), self::ALG));
            return (array) $decoded;
        } catch (\Throwable) {
            return null;
        }
    }

    private static function secret(): string
    {
        $secret = config('hubly.jwt_secret');
        if (!$secret) {
            throw new RuntimeException('JWT_SECRET is not configured.');
        }
        return $secret;
    }

    /**
     * Minimal duration parser supporting the same shorthand used in
     * JWT_EXPIRES_IN (e.g. "7d", "12h", "30m", "45s"), or a bare number of
     * seconds. Falls back to 7 days on anything unrecognized.
     */
    public static function durationSeconds(string|int $value): int
    {
        if (is_int($value)) {
            return $value;
        }
        $value = trim($value);
        if (ctype_digit($value)) {
            return (int) $value;
        }
        if (preg_match('/^(\d+)\s*([smhd])$/i', $value, $m)) {
            $n = (int) $m[1];
            return match (strtolower($m[2])) {
                's' => $n,
                'm' => $n * 60,
                'h' => $n * 3600,
                'd' => $n * 86400,
                default => $n,
            };
        }
        return 7 * 86400;
    }
}
