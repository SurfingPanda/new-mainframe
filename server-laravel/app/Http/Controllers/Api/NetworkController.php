<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Unifi;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/** Ported from server/src/routes/network.js — UniFi monitoring dashboard (live or mock). */
class NetworkController extends Controller
{
    private const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    private const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

    private const SYSTEM_PROMPT = 'You are a precise data-extraction tool. You read charts from images and emit ONLY valid JSON. '
        . 'Never include prose, markdown fences, or explanations.';

    private const USER_PROMPT = <<<'PROMPT'
The attached image is a network traffic chart showing internet or network throughput over time.

Extract the visible data points and reply with ONLY a JSON object using this exact shape:

{ "samples": [ { "time": "HH:MM", "downloadMbps": number, "uploadMbps": number } ] }

Rules:
- "time" is the x-axis label as it appears on the chart (e.g. "08:00", "12:00", "8 AM"). Preserve the chart's format.
- "downloadMbps" is the download line's value at that time, in Mbps.
- "uploadMbps" is the upload line's value at that time, in Mbps.
- If the y-axis is in kbps, convert to Mbps (divide by 1000).
- If only one line is present, set the missing value to 0.
- If the chart has clear marker dots, return those exact points. Otherwise sample 6-12 evenly spaced points across the visible time range.
- Round numeric values to 1 decimal place.
- If the image is not a network/throughput chart, return { "samples": [] }.

Output ONLY the JSON object.
PROMPT;

    public function dashboard(Request $request)
    {
        $range = (string) $request->query('range', '1h');

        if (!Unifi::isConfigured()) {
            return response()->json(array_merge(['source' => 'mock', 'range' => $range], $this->buildMockDashboard($range)));
        }

        try {
            $dashboard = $this->fetchUnifiDashboard($range);
            return response()->json(array_merge(['source' => 'unifi', 'range' => $range], $dashboard));
        } catch (\Throwable $e) {
            Log::error("UniFi fetch failed, falling back to mock: {$e->getMessage()}");
            return response()->json(array_merge(
                ['source' => 'mock', 'range' => $range, 'warning' => "UniFi unreachable: {$e->getMessage()}"],
                $this->buildMockDashboard($range)
            ));
        }
    }

    private function fetchUnifiDashboard(string $range): array
    {
        $now = (int) (microtime(true) * 1000);
        $windowMs = $range === '24h' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
        $start = $now - $windowMs;

        // Fail fast on login/connectivity errors — no catch here so the outer
        // try/catch can fall back to mock mode with the real error surfaced.
        Unifi::health();

        $try = fn (callable $fn) => (function () use ($fn) {
            try {
                return $fn();
            } catch (\Throwable) {
                return [];
            }
        })();

        $sites = $try(fn () => Unifi::sitesOverview());
        $health = $try(fn () => Unifi::health());
        $devices = $try(fn () => Unifi::devices());
        $clients = $try(fn () => Unifi::activeClients());
        $events = $try(fn () => Unifi::events(30));
        $siteReport = $try(fn () => Unifi::reportSite5min((int) ($start / 1000), (int) ($now / 1000)));
        $userReport = $try(fn () => Unifi::reportUserDaily((int) (($now - 7 * 86400000) / 1000), (int) ($now / 1000)));

        return [
            'overview' => $this->shapeOverview($sites, $devices, $clients, $health),
            'health' => $this->shapeHealth($health),
            'timeseries' => $this->shapeTimeseries($siteReport),
            'devices' => $this->shapeDevices($devices),
            'topClients' => $this->shapeTopClients($userReport, $clients),
            'bandMix' => $this->shapeBandMix($clients),
            'wanLatency' => $this->shapeWanLatency($siteReport),
            'events' => $this->shapeEvents($events),
        ];
    }

    // ---------- UniFi response shapers ---------------------------------------

    private function shapeOverview(array $sites, array $devices, array $clients, array $health): array
    {
        $wan = collect($health)->firstWhere('subsystem', 'wan') ?? [];
        $adopted = count(array_filter($devices, fn ($d) => !empty($d['adopted'])));
        $online = count(array_filter($devices, fn ($d) => ($d['state'] ?? null) === 1));
        return [
            'siteName' => $sites[0]['desc'] ?? 'Default',
            'devices' => ['total' => count($devices), 'online' => $online, 'adopted' => $adopted],
            'clients' => [
                'total' => count($clients),
                'wireless' => count(array_filter($clients, fn ($c) => empty($c['is_wired']))),
                'wired' => count(array_filter($clients, fn ($c) => !empty($c['is_wired']))),
            ],
            'wan' => ['latencyMs' => (int) round($wan['latency'] ?? 0), 'uplink' => $wan['gw_name'] ?? null],
        ];
    }

    private function shapeHealth(array $health): array
    {
        $order = ['wan', 'www', 'lan', 'wlan', 'vpn'];
        $out = [];
        foreach ($order as $key) {
            $h = collect($health)->firstWhere('subsystem', $key);
            if (!$h) {
                continue;
            }
            $out[] = [
                'subsystem' => $h['subsystem'], 'status' => $h['status'] ?? null,
                'numSta' => $h['num_sta'] ?? 0, 'latencyMs' => (int) round($h['latency'] ?? 0), 'drops' => $h['drops'] ?? 0,
            ];
        }
        return $out;
    }

    private function shapeTimeseries(array $report): array
    {
        return array_map(function ($r) {
            $periodSec = 300;
            $rx = (($r['wan-rx_bytes'] ?? 0) * 8 / $periodSec) / 1_000_000;
            $tx = (($r['wan-tx_bytes'] ?? 0) * 8 / $periodSec) / 1_000_000;
            return ['t' => $r['time'] ?? null, 'clients' => $r['num_sta'] ?? 0, 'rxMbps' => round($rx, 1), 'txMbps' => round($tx, 1)];
        }, $report);
    }

    private function shapeDevices(array $devices): array
    {
        return array_map(fn ($d) => [
            'id' => $d['_id'] ?? $d['mac'] ?? null,
            'name' => $d['name'] ?? $d['hostname'] ?? $d['mac'] ?? null,
            'type' => $this->deviceType($d),
            'model' => $d['model'] ?? null,
            'ip' => $d['ip'] ?? null,
            'state' => ($d['state'] ?? null) === 1 ? 'online' : (($d['state'] ?? null) === 2 ? 'pending' : 'offline'),
            'clients' => $d['user-num_sta'] ?? $d['num_sta'] ?? 0,
            'chanUtil' => $this->pickChannelUtil($d),
            'uptime' => $d['uptime'] ?? 0,
        ], $devices);
    }

    private function deviceType(array $d): string
    {
        $t = strtolower($d['type'] ?? '');
        return match ($t) {
            'uap' => 'AP',
            'usw' => 'Switch',
            'ugw', 'udm' => 'Gateway',
            default => $d['type'] ?? 'Device',
        };
    }

    private function pickChannelUtil(array $d): int
    {
        $max = 0;
        foreach ($d['radio_table_stats'] ?? [] as $r) {
            $total = $r['cu_total'] ?? $r['cu-total'] ?? 0;
            if ($total > $max) {
                $max = $total;
            }
        }
        return (int) round($max);
    }

    private function shapeTopClients(array $report, array $active): array
    {
        $macToName = [];
        foreach ($active as $c) {
            if (!empty($c['mac'])) {
                $macToName[$c['mac']] = $c['hostname'] ?? $c['name'] ?? $c['mac'];
            }
        }

        $totals = [];
        foreach ($report as $row) {
            $key = $row['mac'] ?? $row['user'] ?? null;
            if (!$key) {
                continue;
            }
            $totals[$key] ??= ['rx' => 0, 'tx' => 0];
            $totals[$key]['rx'] += $row['rx_bytes'] ?? 0;
            $totals[$key]['tx'] += $row['tx_bytes'] ?? 0;
        }

        $out = [];
        foreach ($totals as $mac => $v) {
            $out[] = ['name' => $macToName[$mac] ?? $mac, 'bytes' => $v['rx'] + $v['tx']];
        }
        usort($out, fn ($a, $b) => $b['bytes'] <=> $a['bytes']);
        return array_slice($out, 0, 8);
    }

    private function shapeBandMix(array $clients): array
    {
        $buckets = ['2.4 GHz' => 0, '5 GHz' => 0, '6 GHz' => 0, 'Wired' => 0];
        foreach ($clients as $c) {
            if (!empty($c['is_wired'])) {
                $buckets['Wired']++;
            } elseif (($c['radio'] ?? null) === 'ng') {
                $buckets['2.4 GHz']++;
            } elseif (($c['radio'] ?? null) === 'na') {
                $buckets['5 GHz']++;
            } elseif (in_array($c['radio'] ?? null, ['6e', 'ax6'], true)) {
                $buckets['6 GHz']++;
            }
        }
        $out = [];
        foreach ($buckets as $label => $value) {
            $out[] = ['label' => $label, 'value' => $value];
        }
        return $out;
    }

    private function shapeWanLatency(array $report): array
    {
        return array_map(fn ($r) => [
            't' => $r['time'] ?? null,
            'latencyMs' => (int) round($r['wan-latency'] ?? $r['latency'] ?? 0),
            'lossPct' => round(($r['wan-loss'] ?? $r['loss'] ?? 0), 1),
        ], $report);
    }

    private function shapeEvents(array $events): array
    {
        return array_map(fn ($e) => [
            'id' => $e['_id'] ?? (($e['time'] ?? '') . '-' . ($e['key'] ?? '')),
            'when' => $e['time'] ?? null,
            'level' => $this->levelFromKey($e['key'] ?? ''),
            'text' => $e['msg'] ?? $e['key'] ?? null,
        ], array_slice($events, 0, 12));
    }

    private function levelFromKey(string $key): string
    {
        $k = strtolower($key);
        if (str_contains($k, 'lost') || str_contains($k, 'disconnect') || str_contains($k, 'lost_contact')) {
            return 'error';
        }
        if (str_contains($k, 'roam') || str_contains($k, 'high') || str_contains($k, 'warn')) {
            return 'warn';
        }
        return 'info';
    }

    // ---------- Mock data ---------------------------------------------------

    private function buildMockDashboard(string $range): array
    {
        $points = $range === '24h' ? 96 : 60;
        $stepMs = $range === '24h' ? 15 * 60 * 1000 : 60 * 1000;
        $now = (int) (microtime(true) * 1000);
        $start = $now - $points * $stepMs;

        $timeseries = [];
        $wanLatency = [];
        for ($i = 0; $i < $points; $i++) {
            $t = $start + $i * $stepMs;
            $wave = sin($i / 6) * 0.5 + 0.5;
            $noise = mt_rand() / mt_getrandmax() * 0.3;
            $clients = (int) round(40 + $wave * 60 + $noise * 10);
            $rxMbps = round((120 + $wave * 380 + $noise * 80), 1);
            $txMbps = round((25 + $wave * 60 + $noise * 20), 1);
            $timeseries[] = ['t' => $t, 'clients' => $clients, 'rxMbps' => $rxMbps, 'txMbps' => $txMbps];
            $wanLatency[] = ['t' => $t, 'latencyMs' => (int) round(8 + $wave * 14 + $noise * 12), 'lossPct' => round($noise * 10, 1)];
        }

        $devices = [
            ['id' => 'd1', 'name' => 'usg-pro-01', 'type' => 'Gateway', 'model' => 'USG-Pro-4', 'ip' => '10.0.0.1', 'state' => 'online', 'clients' => 0, 'chanUtil' => 0, 'uptime' => 12_345_678],
            ['id' => 'd2', 'name' => 'usw-24-poe-01', 'type' => 'Switch', 'model' => 'USW-24-PoE', 'ip' => '10.0.0.2', 'state' => 'online', 'clients' => 0, 'chanUtil' => 0, 'uptime' => 12_300_000],
            ['id' => 'd3', 'name' => 'usw-8-poe-flr2', 'type' => 'Switch', 'model' => 'USW-8-POE', 'ip' => '10.0.0.6', 'state' => 'online', 'clients' => 0, 'chanUtil' => 0, 'uptime' => 6_500_000],
            ['id' => 'd4', 'name' => 'ap-flr2-east', 'type' => 'AP', 'model' => 'U6-Pro', 'ip' => '10.0.12.21', 'state' => 'online', 'clients' => 18, 'chanUtil' => 64, 'uptime' => 1_900_000],
            ['id' => 'd5', 'name' => 'ap-flr2-west', 'type' => 'AP', 'model' => 'U6-Pro', 'ip' => '10.0.12.22', 'state' => 'online', 'clients' => 22, 'chanUtil' => 41, 'uptime' => 1_900_000],
            ['id' => 'd6', 'name' => 'ap-flr3-north', 'type' => 'AP', 'model' => 'U6-LR', 'ip' => '10.0.13.31', 'state' => 'online', 'clients' => 14, 'chanUtil' => 28, 'uptime' => 5_500_000],
            ['id' => 'd7', 'name' => 'ap-lobby', 'type' => 'AP', 'model' => 'U6-Lite', 'ip' => '10.0.40.5', 'state' => 'online', 'clients' => 9, 'chanUtil' => 35, 'uptime' => 400_000],
            ['id' => 'd8', 'name' => 'ap-warehouse', 'type' => 'AP', 'model' => 'U6-Mesh', 'ip' => '10.0.50.5', 'state' => 'offline', 'clients' => 0, 'chanUtil' => 0, 'uptime' => 0],
        ];

        $topClients = [
            ['name' => 'macbook-anna', 'bytes' => 18_400_000_000],
            ['name' => 'pc-engineering', 'bytes' => 14_900_000_000],
            ['name' => 'iphone-marco', 'bytes' => 9_700_000_000],
            ['name' => 'srv-bkp-01', 'bytes' => 7_200_000_000],
            ['name' => 'ipad-reception', 'bytes' => 4_300_000_000],
            ['name' => 'pc-finance-02', 'bytes' => 3_800_000_000],
            ['name' => 'cam-lobby-01', 'bytes' => 2_100_000_000],
            ['name' => 'printer-flr1', 'bytes' => 420_000_000],
        ];

        $bandMix = [
            ['label' => '2.4 GHz', 'value' => 24],
            ['label' => '5 GHz', 'value' => 41],
            ['label' => '6 GHz', 'value' => 12],
            ['label' => 'Wired', 'value' => 18],
        ];

        $onlineCount = count(array_filter($devices, fn ($d) => $d['state'] === 'online'));
        $overview = [
            'siteName' => 'HQ',
            'devices' => ['total' => count($devices), 'online' => $onlineCount, 'adopted' => count($devices)],
            'clients' => ['total' => 95, 'wireless' => 77, 'wired' => 18],
            'wan' => ['latencyMs' => 12, 'uplink' => 'usg-pro-01'],
        ];

        $health = [
            ['subsystem' => 'wan', 'status' => 'ok', 'numSta' => 95, 'latencyMs' => 12, 'drops' => 0],
            ['subsystem' => 'www', 'status' => 'ok', 'numSta' => 95, 'latencyMs' => 14, 'drops' => 0],
            ['subsystem' => 'lan', 'status' => 'ok', 'numSta' => 18, 'latencyMs' => 0, 'drops' => 0],
            ['subsystem' => 'wlan', 'status' => 'warning', 'numSta' => 77, 'latencyMs' => 0, 'drops' => 4],
            ['subsystem' => 'vpn', 'status' => 'ok', 'numSta' => 3, 'latencyMs' => 0, 'drops' => 0],
        ];

        $events = [
            ['id' => 'e1', 'when' => $now - 90_000, 'level' => 'warn', 'text' => 'AP ap-flr2-east channel utilization 64% on 5 GHz'],
            ['id' => 'e2', 'when' => $now - 400_000, 'level' => 'error', 'text' => 'AP ap-warehouse lost contact with controller'],
            ['id' => 'e3', 'when' => $now - 720_000, 'level' => 'info', 'text' => 'Client iphone-marco roamed ap-flr2-west → ap-flr3-north'],
            ['id' => 'e4', 'when' => $now - 1_900_000, 'level' => 'info', 'text' => 'WAN uplink pulled 482 Mbps peak (5 min ago)'],
            ['id' => 'e5', 'when' => $now - 3_400_000, 'level' => 'info', 'text' => 'Firmware check: all UniFi devices up to date'],
        ];

        return compact('overview', 'health', 'timeseries', 'devices', 'topClients', 'bandMix', 'wanLatency', 'events');
    }

    // --- Chart-image extractor (preserved as-is) --------------------------

    public function extractChart(Request $request)
    {
        $file = $request->file('image');
        if (!$file || !$file->isValid()) {
            return response()->json(['error' => 'No image provided. Upload as multipart field "image".'], 400);
        }
        $err = $this->validateImage($file);
        if ($err) {
            return response()->json(['error' => $err], 400);
        }

        $apiKey = config('hubly.anthropic_api_key');
        if (!$apiKey) {
            return response()->json(['error' => 'Image extraction is not configured. Set ANTHROPIC_API_KEY in .env to enable.'], 503);
        }
        $model = config('hubly.anthropic_model');

        try {
            $base64 = base64_encode(file_get_contents($file->getRealPath()));

            $apiRes = Http::withHeaders([
                'x-api-key' => $apiKey,
                'anthropic-version' => '2023-06-01',
            ])->post('https://api.anthropic.com/v1/messages', [
                'model' => $model,
                'max_tokens' => 2048,
                'system' => self::SYSTEM_PROMPT,
                'messages' => [[
                    'role' => 'user',
                    'content' => [
                        ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $file->getClientMimeType(), 'data' => $base64]],
                        ['type' => 'text', 'text' => self::USER_PROMPT],
                    ],
                ]],
            ]);

            if (!$apiRes->successful()) {
                Log::error('Anthropic API error: ' . $apiRes->status() . ' ' . mb_substr($apiRes->body(), 0, 500));
                return response()->json(['error' => "Vision API error ({$apiRes->status()})", 'detail' => mb_substr($apiRes->body(), 0, 200)], 502);
            }

            $text = $apiRes->json('content.0.text', '');
            $samples = $this->parseSamples($text);
            if ($samples === null) {
                return response()->json(['error' => 'Could not parse chart data from the model response.', 'raw' => mb_substr($text, 0, 500)], 422);
            }
            if (empty($samples)) {
                return response()->json(['error' => 'No data points were detected in this image. Try a clearer chart screenshot.'], 422);
            }

            return response()->json(['samples' => $samples, 'model' => $model]);
        } catch (\Throwable $e) {
            Log::error("extract-chart failed: {$e->getMessage()}");
            return response()->json(['error' => $e->getMessage() ?: 'Extraction failed'], 500);
        }
    }

    private function validateImage(UploadedFile $file): ?string
    {
        if (!in_array($file->getClientMimeType(), self::ALLOWED_IMAGE_MIME, true)) {
            return "Unsupported image type: {$file->getClientMimeType()}. Use PNG, JPEG, WebP, or GIF.";
        }
        if ($file->getSize() > self::MAX_IMAGE_BYTES) {
            return 'Image is too large (max 8MB).';
        }
        return null;
    }

    private function tryParseJson(string $s): ?array
    {
        $decoded = json_decode($s, true);
        return is_array($decoded) ? $decoded : null;
    }

    private function parseSamples(?string $text): ?array
    {
        if (!$text) {
            return null;
        }
        $trimmed = trim($text);
        $json = $this->tryParseJson($trimmed);
        if (!$json && preg_match('/\{[\s\S]*\}/', $trimmed, $m)) {
            $json = $this->tryParseJson($m[0]);
        }
        if (!$json || !is_array($json['samples'] ?? null)) {
            return null;
        }

        $out = [];
        foreach ($json['samples'] as $s) {
            if (!is_array($s) || (empty($s['time']) && empty($s['label']))) {
                continue;
            }
            $out[] = [
                'time' => mb_substr((string) ($s['time'] ?? $s['label'] ?? ''), 0, 16),
                'downloadMbps' => max(0, round((float) ($s['downloadMbps'] ?? 0), 1)),
                'uploadMbps' => max(0, round((float) ($s['uploadMbps'] ?? 0), 1)),
            ];
            if (count($out) >= 50) {
                break;
            }
        }
        return $out;
    }
}
