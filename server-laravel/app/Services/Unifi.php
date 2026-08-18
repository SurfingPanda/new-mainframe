<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * UniFi local controller client — ported from server/src/lib/unifi.js.
 * Handles login + cookie session against either a classic UniFi Network
 * controller or UniFi OS/UDM/Cloud Key. When UNIFI_HOST is unset,
 * isConfigured() is false and callers fall back to mock data.
 *
 * Node caches the session in a module-level variable (one process, one
 * session). This port uses the (file) Cache instead, so the session survives
 * across PHP-FPM requests/workers the same way SlaConfig's cache does.
 */
class Unifi
{
    private const SESSION_CACHE_KEY = 'unifi_session';
    private const SESSION_TTL_SECONDS = 30 * 60;

    public static function isConfigured(): bool
    {
        if (!config('hubly.unifi_host')) {
            return false;
        }
        if (config('hubly.unifi_cookie')) {
            return true;
        }
        return (bool) config('hubly.unifi_username') && (bool) config('hubly.unifi_password');
    }

    private static function staticCookie(): string
    {
        return (string) config('hubly.unifi_cookie', '');
    }

    private static function baseUrl(): string
    {
        $host = rtrim((string) config('hubly.unifi_host'), '/');
        return str_starts_with($host, 'http') ? $host : "https://{$host}";
    }

    private static function isUnifiOs(): bool
    {
        // filter_var handles both a real PHP bool (env() auto-casts the
        // literal strings "true"/"false") and a plain "true"/"false" string
        // correctly — a naive (string) cast doesn't: (string) true is "1",
        // not "true" (bit us in AppServiceProvider::configureTrustedProxies()
        // during Phase 5 parity testing — see that method's docblock).
        return filter_var(config('hubly.unifi_os', false), FILTER_VALIDATE_BOOL);
    }

    private static function apiPrefix(): string
    {
        return self::isUnifiOs() ? '/proxy/network/api' : '/api';
    }

    private static function insecure(): bool
    {
        return filter_var(config('hubly.unifi_insecure_tls', false), FILTER_VALIDATE_BOOL);
    }

    private static function httpClient()
    {
        $client = Http::timeout(20);
        if (self::insecure()) {
            $client = $client->withOptions(['verify' => false]);
        }
        return $client;
    }

    /** @return array{cookie: string, csrf: string, expiresAt: int} */
    private static function login(): array
    {
        $attempts = [];
        foreach (['/api/auth/login', '/api/login'] as $path) {
            $url = self::baseUrl() . $path;
            try {
                $res = self::httpClient()->post($url, [
                    'username' => config('hubly.unifi_username'),
                    'password' => config('hubly.unifi_password'),
                    'remember' => true,
                ]);
            } catch (\Throwable $e) {
                $attempts[] = "{$path} → network error: {$e->getMessage()}";
                continue;
            }

            if ($res->successful()) {
                $cookies = [];
                foreach ($res->cookies() as $cookie) {
                    $cookies[] = $cookie->getName() . '=' . $cookie->getValue();
                }
                $session = [
                    'cookie' => implode('; ', $cookies),
                    'csrf' => $res->header('x-csrf-token') ?: '',
                    'expiresAt' => time() + self::SESSION_TTL_SECONDS,
                ];
                Cache::put(self::SESSION_CACHE_KEY, $session, self::SESSION_TTL_SECONDS);
                return $session;
            }

            $attempts[] = "{$path} → {$res->status()}";
            if (!in_array($res->status(), [404, 405], true)) {
                break;
            }
        }

        throw new \RuntimeException('UniFi login failed: ' . implode('; ', $attempts));
    }

    /** @return array{cookie: string, csrf: string, expiresAt: int} */
    private static function ensureSession(): array
    {
        $stat = self::staticCookie();
        if ($stat) {
            $csrf = '';
            if (preg_match('/(?:^|;\s*)csrf_token=([^;]+)/', $stat, $m)) {
                $csrf = $m[1];
            }
            return ['cookie' => $stat, 'csrf' => $csrf, 'expiresAt' => PHP_INT_MAX];
        }
        $cached = Cache::get(self::SESSION_CACHE_KEY);
        if ($cached && $cached['expiresAt'] > time() && $cached['cookie']) {
            return $cached;
        }
        return self::login();
    }

    private static function fetch(string $path, string $method = 'GET', mixed $body = null): mixed
    {
        $session = self::ensureSession();
        $url = self::baseUrl() . self::apiPrefix() . $path;
        $headers = ['Cookie' => $session['cookie']];
        if ($session['csrf']) {
            $headers['X-CSRF-Token'] = $session['csrf'];
        }

        $client = self::httpClient()->withHeaders($headers);
        $res = $body !== null ? $client->post($url, $body) : $client->get($url);

        if ($res->status() === 401 && !self::staticCookie()) {
            Cache::forget(self::SESSION_CACHE_KEY);
            $retry = self::ensureSession();
            $headers['Cookie'] = $retry['cookie'];
            if ($retry['csrf']) {
                $headers['X-CSRF-Token'] = $retry['csrf'];
            }
            $client = self::httpClient()->withHeaders($headers);
            $res = $body !== null ? $client->post($url, $body) : $client->get($url);
        }

        if (!$res->successful()) {
            if ($res->status() === 401 && self::staticCookie()) {
                throw new \RuntimeException('UniFi cookie rejected — re-grab UNIFI_COOKIE from your browser DevTools.');
            }
            throw new \RuntimeException("UniFi {$method} {$path} → {$res->status()}: " . mb_substr($res->body(), 0, 200));
        }

        $data = $res->json();
        return is_array($data['data'] ?? null) ? $data['data'] : $data;
    }

    private static function site(): string
    {
        return config('hubly.unifi_site', 'default');
    }

    public static function sitesOverview(): mixed
    {
        return self::fetch('/self/sites');
    }

    public static function health(): mixed
    {
        return self::fetch('/s/' . self::site() . '/stat/health');
    }

    public static function devices(): mixed
    {
        return self::fetch('/s/' . self::site() . '/stat/device');
    }

    public static function activeClients(): mixed
    {
        return self::fetch('/s/' . self::site() . '/stat/sta');
    }

    public static function events(int $limit = 30): mixed
    {
        return self::fetch('/s/' . self::site() . "/stat/event?_limit={$limit}");
    }

    public static function reportSite5min(int $start, int $end, array $attrs = ['num_sta', 'wan-tx_bytes', 'wan-rx_bytes', 'lan-tx_bytes', 'lan-rx_bytes']): mixed
    {
        return self::fetch('/s/' . self::site() . '/stat/report/5minutes.site', 'POST', ['attrs' => $attrs, 'start' => $start, 'end' => $end]);
    }

    public static function reportUserDaily(int $start, int $end, array $attrs = ['rx_bytes', 'tx_bytes']): mixed
    {
        return self::fetch('/s/' . self::site() . '/stat/report/daily.user', 'POST', ['attrs' => $attrs, 'start' => $start, 'end' => $end]);
    }
}
