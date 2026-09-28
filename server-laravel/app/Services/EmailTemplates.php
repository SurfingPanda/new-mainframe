<?php

namespace App\Services;

/**
 * Transactional email templates — ported from server/src/lib/email-templates.js.
 * Each method returns ['subject' => .., 'text' => .., 'html' => ..]. Inline-
 * styled, table-based HTML (max compatibility — Gmail/Outlook strip <style>).
 * User-supplied strings are always escaped before being embedded in HTML.
 */
class EmailTemplates
{
    private const STATUS_LABELS = [
        'open' => 'Open', 'in_progress' => 'In Progress', 'on_hold' => 'On Hold',
        'pending' => 'Pending - Waiting for Customer', 'resolved' => 'Resolved', 'closed' => 'Closed', 'cancelled' => 'Cancelled',
    ];

    private const URGENCY_LABELS = [
        'pending' => 'is pending review', 'approved' => 'was approved',
        'denied' => 'was denied', 'fulfilled' => 'was fulfilled',
    ];

    private const BRAND = 'Hubly Ticketing';

    public static function ticketCode(int|string $id): string
    {
        return 'WO' . str_pad((string) $id, 8, '0', STR_PAD_LEFT);
    }

    private static function esc(mixed $s): string
    {
        return htmlspecialchars((string) ($s ?? ''), ENT_QUOTES, 'UTF-8');
    }

    private static function prettify(mixed $s): string
    {
        $s = str_replace('_', ' ', (string) ($s ?? ''));
        return preg_replace_callback('/\b\w/', fn ($m) => strtoupper($m[0]), $s);
    }

    private static function fmtDate(mixed $d): string
    {
        if (!$d) {
            return '';
        }
        $ts = strtotime((string) $d);
        return $ts ? date('M j, Y, g:i A', $ts) : '';
    }

    private static function firstName(mixed $identity): string
    {
        $v = trim((string) ($identity ?? ''));
        if (!$v || str_contains($v, '@')) {
            return '';
        }
        $parts = preg_split('/\s+/', $v);
        return $parts[0];
    }

    private static function pill(string $text, string $bg, string $fg): string
    {
        return "<span style=\"display:inline-block;padding:3px 10px;border-radius:999px;background:{$bg};color:{$fg};font-size:12px;font-weight:600;line-height:1.5;\">" . self::esc($text) . '</span>';
    }

    private static function priorityPill(?string $p): string
    {
        $map = [
            'urgent' => ['#fee2e2', '#b91c1c'], 'high' => ['#ffedd5', '#c2410c'],
            'normal' => ['#e0f2fe', '#0369a1'], 'low' => ['#f1f5f9', '#475569'],
        ];
        [$bg, $fg] = $map[$p] ?? $map['normal'];
        return self::pill(self::prettify($p ?: 'normal'), $bg, $fg);
    }

    private static function statusPill(?string $s): string
    {
        $map = [
            'open' => ['#fef9c3', '#a16207'], 'in_progress' => ['#dbeafe', '#1d4ed8'],
            'on_hold' => ['#e2e8f0', '#475569'], 'pending' => ['#ede9fe', '#6d28d9'],
            'resolved' => ['#dcfce7', '#15803d'], 'closed' => ['#e2e8f0', '#475569'], 'cancelled' => ['#ffe4e6', '#be123c'],
        ];
        [$bg, $fg] = $map[$s] ?? $map['open'];
        return self::pill(self::STATUS_LABELS[$s] ?? ($s ?: ''), $bg, $fg);
    }

    private static function spaceStatusPill(?string $s): string
    {
        $map = ['todo' => ['#e2e8f0', '#475569'], 'in_progress' => ['#dbeafe', '#1d4ed8'], 'done' => ['#dcfce7', '#15803d']];
        $labels = ['todo' => 'To Do', 'in_progress' => 'In Progress', 'done' => 'Done'];
        [$bg, $fg] = $map[$s] ?? $map['todo'];
        return self::pill($labels[$s] ?? ($s ?: ''), $bg, $fg);
    }

    /** @param array{label: string, html: string}[] $rows */
    private static function detailsTable(array $rows): string
    {
        $valid = array_values(array_filter($rows, fn ($r) => isset($r['html']) && $r['html'] !== ''));
        if (!$valid) {
            return '';
        }
        $trs = '';
        foreach ($valid as $i => $r) {
            $bg = $i % 2 ? '#ffffff' : '#f8fafc';
            $trs .= "<tr style=\"background:{$bg};\">
        <td style=\"padding:10px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;vertical-align:top;width:120px;\">" . self::esc($r['label']) . "</td>
        <td style=\"padding:10px 14px;font-size:14px;color:#0f172a;vertical-align:top;\">{$r['html']}</td>
      </tr>";
        }
        return "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:20px 0;border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;\">{$trs}</table>";
    }

    /** @return array{label: string, html: string}[] */
    private static function ticketDetails(array $ticket): array
    {
        return [
            ['label' => 'Work Order', 'html' => '<strong>' . self::ticketCode($ticket['id']) . '</strong>'],
            ['label' => 'Title', 'html' => self::esc($ticket['title'] ?? null)],
            ['label' => 'Priority', 'html' => self::priorityPill($ticket['priority'] ?? null)],
            ['label' => 'Status', 'html' => self::statusPill($ticket['status'] ?? null)],
            ['label' => 'Type', 'html' => !empty($ticket['request_type']) ? self::esc(self::prettify($ticket['request_type'])) : ''],
            ['label' => 'Category', 'html' => !empty($ticket['category']) ? self::esc($ticket['category']) : ''],
            ['label' => 'Department', 'html' => !empty($ticket['department']) ? self::esc($ticket['department']) : ''],
            ['label' => 'Requester', 'html' => !empty($ticket['requester']) ? self::esc($ticket['requester']) : ''],
            ['label' => 'Assignee', 'html' => !empty($ticket['assignee']) ? self::esc($ticket['assignee']) : '<span style="color:#94a3b8;">Unassigned</span>'],
            ['label' => 'Opened', 'html' => !empty($ticket['created_at']) ? self::esc(self::fmtDate($ticket['created_at'])) : ''],
        ];
    }

    private static function descriptionBlock(mixed $desc): string
    {
        $d = trim((string) ($desc ?? ''));
        if (!$d) {
            return '';
        }
        $clipped = mb_strlen($d) > 800 ? mb_substr($d, 0, 800) . '…' : $d;
        return '<p style="margin:18px 0 6px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Description</p>
    <div style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;line-height:1.6;color:#334155;white-space:pre-wrap;">' . self::esc($clipped) . '</div>';
    }

    private static function ticketTextDetails(array $ticket): string
    {
        $lines = array_values(array_filter([
            'Work Order: ' . self::ticketCode($ticket['id']),
            'Title: ' . ($ticket['title'] ?? ''),
            'Priority: ' . self::prettify($ticket['priority'] ?? 'normal'),
            'Status: ' . (self::STATUS_LABELS[$ticket['status'] ?? ''] ?? ($ticket['status'] ?? '—')),
            !empty($ticket['request_type']) ? 'Type: ' . self::prettify($ticket['request_type']) : null,
            !empty($ticket['category']) ? 'Category: ' . $ticket['category'] : null,
            !empty($ticket['department']) ? 'Department: ' . $ticket['department'] : null,
            !empty($ticket['requester']) ? 'Requester: ' . $ticket['requester'] : null,
            'Assignee: ' . ($ticket['assignee'] ?? 'Unassigned'),
            !empty($ticket['created_at']) ? 'Opened: ' . self::fmtDate($ticket['created_at']) : null,
        ], fn ($v) => $v !== null));
        $desc = trim((string) ($ticket['description'] ?? ''));
        if ($desc) {
            $lines[] = '';
            $lines[] = 'Description:';
            $lines[] = $desc;
        }
        return implode("\n", $lines);
    }

    /** @param array{cta?: array{label:string,url:string}, details?: array, preheader?: string, kicker?: string} $opts */
    private static function layout(string $heading, string $bodyHtml, array $opts = []): string
    {
        $cta = $opts['cta'] ?? null;
        $details = $opts['details'] ?? null;
        $preheader = $opts['preheader'] ?? null;
        $kicker = $opts['kicker'] ?? 'Notification';

        $button = $cta
            ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr>
          <td style="border-radius:8px;background:#0f172a;">
            <a href="' . $cta['url'] . '" style="display:inline-block;padding:12px 24px;font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">' . self::esc($cta['label']) . ' &rarr;</a>
          </td>
        </tr></table>'
            : '';
        $detailsHtml = $details ? self::detailsTable($details) : '';
        $pre = $preheader
            ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1f5f9;">' . self::esc($preheader) . '</div>'
            : '';

        return "{$pre}
<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f1f5f9;margin:0;padding:24px 12px;font-family:system-ui,Segoe UI,Arial,sans-serif;\">
  <tr><td align=\"center\">
    <table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;\">
      <tr><td style=\"background:#0f172a;padding:18px 28px;\">
        <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr>
          <td style=\"font-size:17px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;\">
            <span style=\"color:#38bdf8;\">&#9679;</span>&nbsp; " . self::esc(self::BRAND) . "
          </td>
          <td align=\"right\" style=\"font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;\">" . self::esc($kicker) . "</td>
        </tr></table>
      </td></tr>
      <tr><td style=\"padding:28px 28px 8px;\">
        <h1 style=\"margin:0 0 14px;font-size:20px;line-height:1.3;color:#0f172a;font-weight:700;\">" . self::esc($heading) . "</h1>
        <div style=\"font-size:14px;line-height:1.65;color:#334155;\">{$bodyHtml}</div>
        {$detailsHtml}
        {$button}
      </td></tr>
      <tr><td style=\"padding:18px 28px 24px;\">
        <hr style=\"border:none;border-top:1px solid #e2e8f0;margin:0 0 14px;\" />
        <p style=\"margin:0;font-size:12px;line-height:1.6;color:#94a3b8;\">
          <strong style=\"color:#64748b;\">" . self::esc(self::BRAND) . "</strong> &middot; Internal IT Operations<br/>
          This is an automated message — please don't reply to this email.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>";
    }

    public static function ticketCreated(array $ticket): array
    {
        $code = self::ticketCode($ticket['id']);
        $greet = self::firstName($ticket['requester'] ?? null);
        return [
            'subject' => "[{$code}] We received your work order: " . ($ticket['title'] ?? ''),
            'text' => "Hi" . ($greet ? " {$greet}" : '') . ",\n\nYour work order {$code} has been received. The IT team will triage and respond based on priority.\n\n"
                . self::ticketTextDetails($ticket) . "\n\nView it: " . ($ticket['url'] ?? ''),
            'html' => self::layout(
                'We received your work order',
                '<p style="margin:0 0 6px;">Hi' . ($greet ? ' ' . self::esc($greet) : '') . ',</p>
       <p style="margin:0;">Your work order <strong>' . $code . '</strong> has been logged. The IT team will triage and respond based on its priority. Here are the details:</p>'
                . self::descriptionBlock($ticket['description'] ?? null),
                ['kicker' => 'Work Order', 'preheader' => "{$code} — " . ($ticket['title'] ?? ''), 'cta' => ['label' => 'View work order', 'url' => $ticket['url'] ?? ''], 'details' => self::ticketDetails($ticket)]
            ),
        ];
    }

    public static function ticketAssigned(array $ticket): array
    {
        $code = self::ticketCode($ticket['id']);
        $greet = self::firstName($ticket['assignee'] ?? null);
        return [
            'subject' => "[{$code}] Assigned to you: " . ($ticket['title'] ?? ''),
            'text' => "Hi" . ($greet ? " {$greet}" : '') . ",\n\nYou've been assigned work order {$code}. Please review and action it based on its priority.\n\n"
                . self::ticketTextDetails($ticket) . "\n\nOpen it: " . ($ticket['url'] ?? ''),
            'html' => self::layout(
                'A work order was assigned to you',
                '<p style="margin:0 0 6px;">Hi' . ($greet ? ' ' . self::esc($greet) : '') . ',</p>
       <p style="margin:0;">You\'ve been assigned work order <strong>' . $code . '</strong>. Please review and action it based on its priority.</p>'
                . self::descriptionBlock($ticket['description'] ?? null),
                ['kicker' => 'Work Order', 'preheader' => "{$code} — " . ($ticket['title'] ?? ''), 'cta' => ['label' => 'Open work order', 'url' => $ticket['url'] ?? ''], 'details' => self::ticketDetails($ticket)]
            ),
        ];
    }

    public static function ticketStatusChanged(array $ticket, ?string $oldStatus, ?string $newStatus): array
    {
        $code = self::ticketCode($ticket['id']);
        $label = self::STATUS_LABELS[$newStatus] ?? $newStatus;
        $oldLabel = self::STATUS_LABELS[$oldStatus] ?? ($oldStatus ?: '—');
        $greet = self::firstName($ticket['requester'] ?? null);
        return [
            'subject' => "[{$code}] Status: {$label} — " . ($ticket['title'] ?? ''),
            'text' => "Hi" . ($greet ? " {$greet}" : '') . ",\n\nYour work order {$code} changed status from {$oldLabel} to {$label}.\n\n"
                . self::ticketTextDetails($ticket) . "\n\nView it: " . ($ticket['url'] ?? ''),
            'html' => self::layout(
                "Status updated to {$label}",
                '<p style="margin:0 0 6px;">Hi' . ($greet ? ' ' . self::esc($greet) : '') . ',</p>
       <p style="margin:0;">Your work order <strong>' . $code . '</strong> changed status from <strong>' . self::esc($oldLabel) . '</strong> to ' . self::statusPill($newStatus) . '.</p>'
                . self::descriptionBlock($ticket['description'] ?? null),
                ['kicker' => 'Work Order', 'preheader' => "{$code} is now {$label}", 'cta' => ['label' => 'View work order', 'url' => $ticket['url'] ?? ''], 'details' => self::ticketDetails($ticket)]
            ),
        ];
    }

    /** "2d 3h" / "3h 20m" / "45m" from milliseconds (SLA working time). */
    private static function fmtDuration(int $ms): string
    {
        $mins = max(0, (int) round($ms / 60000));
        $d = intdiv($mins, 1440);
        $h = intdiv($mins % 1440, 60);
        $m = $mins % 60;
        if ($d) {
            return $d . 'd' . ($h ? " {$h}h" : '');
        }
        if ($h) {
            return $h . 'h' . ($m ? " {$m}m" : '');
        }
        return "{$m}m";
    }

    /**
     * SLA "at risk" warning or breach notice for one clock.
     * $kind = 'warning' | 'breach'; $clock = 'response' | 'resolution';
     * $standing = that clock's Sla::standing() entry (target/elapsed/remaining, ms);
     * $asManager = the recipient is the department manager, not the assignee.
     */
    public static function slaAlert(array $ticket, string $clock, string $kind, array $standing, ?string $recipientName, bool $asManager): array
    {
        $code = self::ticketCode($ticket['id']);
        $clockLabel = $clock === 'response' ? 'Response' : 'Resolution';
        $goal = $clock === 'response' ? 'send a first response' : 'resolve it';
        $target = self::fmtDuration((int) $standing['target']);
        $greet = self::firstName($recipientName);
        $who = $asManager
            ? 'A work order routed to your department' . (!empty($ticket['assignee']) ? ' (assigned to ' . $ticket['assignee'] . ')' : ' (currently unassigned)')
            : 'A work order assigned to you';

        if ($kind === 'breach') {
            $over = self::fmtDuration((int) $standing['elapsed'] - (int) $standing['target']);
            $heading = "{$clockLabel} SLA breached";
            $subject = "[{$code}] {$clockLabel} SLA breached: " . ($ticket['title'] ?? '');
            $line = "{$who} has breached its {$clockLabel} SLA target of {$target} — it is {$over} over. Please action it as soon as possible.";
            $pill = self::pill('Breached', '#fee2e2', '#b91c1c');
        } else {
            $left = self::fmtDuration((int) $standing['remaining']);
            $heading = "{$clockLabel} SLA at risk";
            $subject = "[{$code}] {$clockLabel} SLA due in {$left}: " . ($ticket['title'] ?? '');
            $line = "{$who} has used 75% of its {$clockLabel} SLA target of {$target}. About {$left} of working time is left to {$goal}.";
            $pill = self::pill('At risk', '#fef3c7', '#b45309');
        }

        $details = array_merge(
            [['label' => "{$clockLabel} SLA", 'html' => $pill . ' &nbsp;' . self::esc($target) . ' target']],
            self::ticketDetails($ticket)
        );

        return [
            'subject' => $subject,
            'text' => "Hi" . ($greet ? " {$greet}" : '') . ",\n\n{$line}\n\n"
                . self::ticketTextDetails($ticket) . "\n\nOpen it: " . ($ticket['url'] ?? ''),
            'html' => self::layout(
                $heading,
                '<p style="margin:0 0 6px;">Hi' . ($greet ? ' ' . self::esc($greet) : '') . ',</p>
       <p style="margin:0;">' . self::esc($line) . '</p>',
                ['kicker' => 'SLA', 'preheader' => "{$code} — {$heading}", 'cta' => ['label' => 'Open work order', 'url' => $ticket['url'] ?? ''], 'details' => $details]
            ),
        ];
    }

    public static function ticketNote(array $ticket, string $body, ?string $author): array
    {
        $code = self::ticketCode($ticket['id']);
        return [
            'subject' => "[{$code}] New note — " . ($ticket['title'] ?? ''),
            'text' => ($author ?: 'Someone') . " added a note to work order {$code}:\n\n{$body}\n\n"
                . self::ticketTextDetails($ticket) . "\n\nView it: " . ($ticket['url'] ?? ''),
            'html' => self::layout(
                "New note on {$code}",
                '<p style="margin:0 0 4px;"><strong>' . self::esc($author ?: 'Someone') . '</strong> added a note to "' . self::esc($ticket['title'] ?? '') . '":</p>
       <blockquote style="margin:12px 0 0;padding:12px 16px;background:#f8fafc;border-left:3px solid #38bdf8;border-radius:0 8px 8px 0;color:#475569;font-size:14px;line-height:1.6;white-space:pre-wrap;">' . self::esc($body) . '</blockquote>',
                ['kicker' => 'Work Order', 'preheader' => "{$code} — new note", 'cta' => ['label' => 'View work order', 'url' => $ticket['url'] ?? ''], 'details' => self::ticketDetails($ticket)]
            ),
        ];
    }

    public static function assetRequestDecision(array $request): array
    {
        $phrase = self::URGENCY_LABELS[$request['status'] ?? ''] ?? ('was updated to ' . ($request['status'] ?? ''));
        $details = [
            ['label' => 'Asset', 'html' => self::esc($request['asset_type'] ?? null)],
            ['label' => 'Quantity', 'html' => self::esc($request['quantity'] ?? null)],
            ['label' => 'Status', 'html' => self::esc(self::prettify($request['status'] ?? null))],
            ['label' => 'Department', 'html' => !empty($request['department']) ? self::esc($request['department']) : ''],
            ['label' => 'Notes', 'html' => !empty($request['admin_notes']) ? self::esc($request['admin_notes']) : ''],
        ];
        return [
            'subject' => "Asset request {$phrase}: " . ($request['asset_type'] ?? ''),
            'text' => 'Your asset request for "' . ($request['asset_type'] ?? '') . '" (x' . ($request['quantity'] ?? '') . ") {$phrase}."
                . (!empty($request['admin_notes']) ? "\n\nNotes: {$request['admin_notes']}" : ''),
            'html' => self::layout(
                "Your asset request {$phrase}",
                '<p style="margin:0;">Your request for <strong>' . self::esc($request['asset_type'] ?? null) . '</strong> (qty ' . self::esc($request['quantity'] ?? null) . ') ' . self::esc($phrase) . '.</p>',
                ['kicker' => 'Asset Request', 'preheader' => ($request['asset_type'] ?? '') . ' — ' . self::prettify($request['status'] ?? null), 'details' => $details]
            ),
        ];
    }

    /** Content-light by design: an HR concern is need-to-know, so no title/details are included. */
    public static function hrConcernRouted(string $ref, string $url): array
    {
        return [
            'subject' => "HR request needs review — {$ref}",
            'text' => "An HR request ({$ref}) has been approved and routed to HR for review.\n\nFor confidentiality the details aren't included here — open it in Hubly to view and assign it:\n{$url}",
            'html' => self::layout(
                'An HR request needs review',
                '<p style="margin:0;">An HR request (<strong>' . self::esc($ref) . '</strong>) has been approved and routed to <strong>HR</strong> for review. Open it in Hubly to view the details and assign it.</p>
       <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;">For confidentiality, the details aren\'t included in this email — they\'re only available inside Hubly.</p>',
                ['kicker' => 'HR Concern', 'preheader' => "{$ref} routed to HR for review", 'cta' => ['label' => 'Open work order', 'url' => $url]]
            ),
        ];
    }

    public static function passwordResetLink(?string $name, string $url): array
    {
        $name = $name ?: '';
        return [
            'subject' => 'Reset your ' . self::BRAND . ' password',
            'text' => "Hi {$name},\n\nA password reset was requested for your " . self::BRAND . " account. Use this link within 1 hour to set a new password:\n\n{$url}\n\nIf you didn't request this, you can ignore this email — your password won't change.",
            'html' => self::layout(
                'Reset your password',
                '<p style="margin:0 0 10px;">Hi ' . self::esc($name) . '.</p>
       <p style="margin:0 0 10px;">A password reset was requested for your <strong>' . self::esc(self::BRAND) . '</strong> account. This link expires in <strong>1 hour</strong>.</p>
       <p style="margin:0;font-size:12px;color:#94a3b8;">If you didn\'t request this, ignore this email — your password won\'t change.</p>',
                ['kicker' => 'Account Security', 'preheader' => 'Reset your password (link expires in 1 hour)', 'cta' => ['label' => 'Set a new password', 'url' => $url]]
            ),
        ];
    }
}
