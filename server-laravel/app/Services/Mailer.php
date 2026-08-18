<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Mailer\Transport;
use Symfony\Component\Mime\Email;

/**
 * Optional mailer — ported from server/src/lib/mailer.js. When nothing is
 * configured, sends become logged no-ops, so the app runs fine without a mail
 * server. Two transports, tried in this order:
 *  1. Resend (RESEND_API_KEY) — HTTPS, preferred in production (many hosts,
 *     including some shared-hosting setups, block outbound SMTP ports).
 *  2. SMTP (SMTP_HOST) — fine for local dev.
 *
 * Node's Ethereal dev-preview mode (MAIL_DEV=ethereal) is not ported — a
 * nice-to-have local dev convenience, not a functional requirement; unset
 * mail config here just means sends no-op, same as the Node original's
 * baseline "not configured" behavior.
 */
class Mailer
{
    public static function resendConfigured(): bool
    {
        return (bool) config('hubly.resend_api_key');
    }

    public static function smtpConfigured(): bool
    {
        return (bool) config('hubly.smtp_host');
    }

    public static function isConfigured(): bool
    {
        return self::resendConfigured() || self::smtpConfigured();
    }

    private static function fromAddress(): string
    {
        return config('hubly.mail_from');
    }

    /** Build an absolute link into the client app (e.g. a password-reset URL). */
    public static function appUrl(string $pathname = ''): string
    {
        $base = rtrim(config('hubly.app_base_url'), '/');
        return $base . (str_starts_with($pathname, '/') ? $pathname : "/{$pathname}");
    }

    /**
     * @param array{to: string, subject: string, text?: string, html?: string} $message
     */
    public static function send(array $message): bool
    {
        $to = $message['to'] ?? null;
        if (!$to) {
            return false;
        }
        if (!self::isConfigured()) {
            Log::warning('[mailer] Mail not configured (no RESEND_API_KEY or SMTP_HOST) — email disabled; sends are no-ops.');
            return false;
        }
        if (self::resendConfigured()) {
            return self::sendViaResend($message);
        }
        return self::sendViaSmtp($message);
    }

    /** Fire-and-forget. Swallows errors so a mail failure can never break or delay the response. */
    public static function sendSafe(array $message): void
    {
        try {
            self::send($message);
        } catch (\Throwable $e) {
            Log::error("[mailer] send failed: {$e->getMessage()}");
        }
    }

    private static function sendViaResend(array $message): bool
    {
        $response = Http::withToken(config('hubly.resend_api_key'))
            ->post('https://api.resend.com/emails', [
                'from' => self::fromAddress(),
                'to' => $message['to'],
                'subject' => $message['subject'] ?? '',
                'text' => $message['text'] ?? null,
                'html' => $message['html'] ?? null,
            ]);
        if (!$response->successful()) {
            throw new \RuntimeException('Resend ' . $response->status() . ': ' . mb_substr($response->body(), 0, 300));
        }
        return true;
    }

    private static function sendViaSmtp(array $message): bool
    {
        $host = config('hubly.smtp_host');
        $port = (int) config('hubly.smtp_port', 587);
        $secure = filter_var(config('hubly.smtp_secure'), FILTER_VALIDATE_BOOL);
        $user = config('hubly.smtp_user');
        $pass = config('hubly.smtp_pass');

        $auth = $user ? rawurlencode($user) . ':' . rawurlencode((string) $pass) . '@' : '';
        $scheme = $secure ? 'smtps' : 'smtp';
        $dsn = "{$scheme}://{$auth}{$host}:{$port}";

        $transport = Transport::fromDsn($dsn);
        $mailer = new \Symfony\Component\Mailer\Mailer($transport);

        $email = (new Email())->from(self::fromAddress())->to($message['to'])->subject($message['subject'] ?? '');
        if (!empty($message['text'])) {
            $email->text($message['text']);
        }
        if (!empty($message['html'])) {
            $email->html($message['html']);
        }
        $mailer->send($email);
        return true;
    }
}
