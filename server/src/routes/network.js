import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getUnifi } from '../lib/unifi.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/network/dashboard
// Returns everything the Network Monitoring page needs in one round-trip.
// Live data from a UniFi controller when UNIFI_HOST is configured; otherwise
// a UniFi-shaped mock so the UI still renders in dev.
// ---------------------------------------------------------------------------

router.get('/dashboard', requireAuth, requireRole('admin', 'agent'), async (req, res) => {
  const range = String(req.query.range || '1h');
  const unifi = getUnifi();

  if (!unifi) {
    return res.json({ source: 'mock', range, ...buildMockDashboard(range) });
  }

  try {
    const dashboard = await fetchUnifiDashboard(unifi, range);
    res.json({ source: 'unifi', range, ...dashboard });
  } catch (err) {
    console.error('UniFi fetch failed, falling back to mock:', err.message);
    res.json({
      source: 'mock',
      range,
      warning: `UniFi unreachable: ${err.message}`,
      ...buildMockDashboard(range),
    });
  }
});

async function fetchUnifiDashboard(unifi, range) {
  const now = Date.now();
  const windowMs = range === '24h' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  const start = now - windowMs;

  // Fail fast on login/connectivity errors — call one cheap endpoint without
  // a catch so the outer try/catch can fall back to mock mode + show the real
  // error in the warning banner. After this succeeds, individual report
  // endpoints can fail independently (some may not exist on every controller).
  await unifi.health();

  const [sites, health, devices, clients, events, siteReport, userReport] = await Promise.all([
    unifi.sitesOverview().catch(() => []),
    unifi.health().catch(() => []),
    unifi.devices().catch(() => []),
    unifi.activeClients().catch(() => []),
    unifi.events({ limit: 30 }).catch(() => []),
    unifi.reportSite5min({ start, end: now }).catch(() => []),
    unifi.reportUserDaily({ start: now - 7 * 24 * 60 * 60 * 1000, end: now }).catch(() => []),
  ]);

  return {
    overview: shapeOverview(sites, devices, clients, health),
    health: shapeHealth(health),
    timeseries: shapeTimeseries(siteReport),
    devices: shapeDevices(devices),
    topClients: shapeTopClients(userReport, clients),
    bandMix: shapeBandMix(clients),
    wanLatency: shapeWanLatency(siteReport),
    events: shapeEvents(events),
  };
}

// ---------- UniFi response shapers ---------------------------------------

function shapeOverview(sites, devices, clients, health) {
  const wan = (health || []).find((h) => h.subsystem === 'wan') || {};
  const adopted = (devices || []).filter((d) => d.adopted).length;
  const online = (devices || []).filter((d) => d.state === 1).length;
  return {
    siteName: sites?.[0]?.desc || 'Default',
    devices: { total: (devices || []).length, online, adopted },
    clients: {
      total: (clients || []).length,
      wireless: (clients || []).filter((c) => !c.is_wired).length,
      wired: (clients || []).filter((c) => c.is_wired).length,
    },
    wan: { latencyMs: Math.round(wan.latency || 0), uplink: wan.gw_name || null },
  };
}

function shapeHealth(health) {
  const order = ['wan', 'www', 'lan', 'wlan', 'vpn'];
  return order
    .map((key) => (health || []).find((h) => h.subsystem === key))
    .filter(Boolean)
    .map((h) => ({
      subsystem: h.subsystem,
      status: h.status, // 'ok' | 'warning' | 'error'
      numSta: h.num_sta || 0,
      latencyMs: Math.round(h.latency || 0),
      drops: h.drops || 0,
    }));
}

function shapeTimeseries(report) {
  // 5-minute samples → { t, clients, rxMbps, txMbps }
  return (report || []).map((r) => {
    const periodSec = 300; // 5 min buckets
    const rx = (r['wan-rx_bytes'] || 0) * 8 / periodSec / 1_000_000;
    const tx = (r['wan-tx_bytes'] || 0) * 8 / periodSec / 1_000_000;
    return {
      t: r.time,
      clients: r.num_sta || 0,
      rxMbps: Math.round(rx * 10) / 10,
      txMbps: Math.round(tx * 10) / 10,
    };
  });
}

function shapeDevices(devices) {
  return (devices || []).map((d) => ({
    id: d._id || d.mac,
    name: d.name || d.hostname || d.mac,
    type: deviceType(d),
    model: d.model || null,
    ip: d.ip || null,
    state: d.state === 1 ? 'online' : d.state === 2 ? 'pending' : 'offline',
    clients: d['user-num_sta'] || d.num_sta || 0,
    chanUtil: pickChannelUtil(d),
    uptime: d.uptime || 0,
  }));
}

function deviceType(d) {
  const t = (d.type || '').toLowerCase();
  if (t === 'uap') return 'AP';
  if (t === 'usw') return 'Switch';
  if (t === 'ugw' || t === 'udm') return 'Gateway';
  return d.type || 'Device';
}

function pickChannelUtil(d) {
  // UniFi exposes channel utilization on radios; pick the busiest band.
  const radios = d.radio_table_stats || [];
  let max = 0;
  for (const r of radios) {
    const total = r.cu_total ?? r['cu-total'] ?? 0;
    if (total > max) max = total;
  }
  return Math.round(max);
}

function shapeTopClients(report, active) {
  const macToName = new Map();
  for (const c of active || []) macToName.set(c.mac, c.hostname || c.name || c.mac);

  const totals = new Map();
  for (const row of report || []) {
    const key = row.mac || row.user;
    if (!key) continue;
    const prev = totals.get(key) || { rx: 0, tx: 0 };
    totals.set(key, {
      rx: prev.rx + (row.rx_bytes || 0),
      tx: prev.tx + (row.tx_bytes || 0),
    });
  }

  return Array.from(totals, ([mac, v]) => ({
    name: macToName.get(mac) || mac,
    bytes: v.rx + v.tx,
  }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8);
}

function shapeBandMix(clients) {
  const buckets = { '2.4 GHz': 0, '5 GHz': 0, '6 GHz': 0, Wired: 0 };
  for (const c of clients || []) {
    if (c.is_wired) buckets.Wired += 1;
    else if (c.radio === 'ng') buckets['2.4 GHz'] += 1;
    else if (c.radio === 'na') buckets['5 GHz'] += 1;
    else if (c.radio === '6e' || c.radio === 'ax6') buckets['6 GHz'] += 1;
  }
  return Object.entries(buckets).map(([label, value]) => ({ label, value }));
}

function shapeWanLatency(report) {
  return (report || []).map((r) => ({
    t: r.time,
    latencyMs: Math.round(r['wan-latency'] || r.latency || 0),
    lossPct: Math.round((r['wan-loss'] || r.loss || 0) * 10) / 10,
  }));
}

function shapeEvents(events) {
  return (events || []).slice(0, 12).map((e) => ({
    id: e._id || `${e.time}-${e.key}`,
    when: e.time,
    level: levelFromKey(e.key),
    text: e.msg || e.key,
  }));
}

function levelFromKey(key = '') {
  const k = key.toLowerCase();
  if (k.includes('lost') || k.includes('disconnect') || k.includes('lost_contact')) return 'error';
  if (k.includes('roam') || k.includes('high') || k.includes('warn')) return 'warn';
  return 'info';
}

// ---------- Mock data ---------------------------------------------------

function buildMockDashboard(range) {
  const points = range === '24h' ? 96 : 60; // 5-min buckets for 24h, 1-min for 1h
  const stepMs = range === '24h' ? 15 * 60 * 1000 : 60 * 1000;
  const now = Date.now();
  const start = now - points * stepMs;

  const timeseries = [];
  const wanLatency = [];
  for (let i = 0; i < points; i += 1) {
    const t = start + i * stepMs;
    const wave = Math.sin(i / 6) * 0.5 + 0.5;
    const noise = Math.random() * 0.3;
    const clients = Math.round(40 + wave * 60 + noise * 10);
    const rxMbps = Math.round((120 + wave * 380 + noise * 80) * 10) / 10;
    const txMbps = Math.round((25 + wave * 60 + noise * 20) * 10) / 10;
    timeseries.push({ t, clients, rxMbps, txMbps });
    wanLatency.push({
      t,
      latencyMs: Math.round(8 + wave * 14 + noise * 12),
      lossPct: Math.round(noise * 10) / 10,
    });
  }

  const devices = [
    { id: 'd1', name: 'usg-pro-01',     type: 'Gateway', model: 'USG-Pro-4',   ip: '10.0.0.1',  state: 'online', clients: 0,  chanUtil: 0,  uptime: 12_345_678 },
    { id: 'd2', name: 'usw-24-poe-01',  type: 'Switch',  model: 'USW-24-PoE',  ip: '10.0.0.2',  state: 'online', clients: 0,  chanUtil: 0,  uptime: 12_300_000 },
    { id: 'd3', name: 'usw-8-poe-flr2', type: 'Switch',  model: 'USW-8-POE',   ip: '10.0.0.6',  state: 'online', clients: 0,  chanUtil: 0,  uptime:  6_500_000 },
    { id: 'd4', name: 'ap-flr2-east',   type: 'AP',      model: 'U6-Pro',      ip: '10.0.12.21', state: 'online',   clients: 18, chanUtil: 64, uptime:  1_900_000 },
    { id: 'd5', name: 'ap-flr2-west',   type: 'AP',      model: 'U6-Pro',      ip: '10.0.12.22', state: 'online',   clients: 22, chanUtil: 41, uptime:  1_900_000 },
    { id: 'd6', name: 'ap-flr3-north',  type: 'AP',      model: 'U6-LR',       ip: '10.0.13.31', state: 'online',   clients: 14, chanUtil: 28, uptime:  5_500_000 },
    { id: 'd7', name: 'ap-lobby',       type: 'AP',      model: 'U6-Lite',     ip: '10.0.40.5',  state: 'online',   clients:  9, chanUtil: 35, uptime:    400_000 },
    { id: 'd8', name: 'ap-warehouse',   type: 'AP',      model: 'U6-Mesh',     ip: '10.0.50.5',  state: 'offline',  clients:  0, chanUtil:  0, uptime:          0 },
  ];

  const topClients = [
    { name: 'macbook-anna',   bytes: 18_400_000_000 },
    { name: 'pc-engineering', bytes: 14_900_000_000 },
    { name: 'iphone-marco',   bytes:  9_700_000_000 },
    { name: 'srv-bkp-01',     bytes:  7_200_000_000 },
    { name: 'ipad-reception', bytes:  4_300_000_000 },
    { name: 'pc-finance-02',  bytes:  3_800_000_000 },
    { name: 'cam-lobby-01',   bytes:  2_100_000_000 },
    { name: 'printer-flr1',   bytes:    420_000_000 },
  ];

  const bandMix = [
    { label: '2.4 GHz', value: 24 },
    { label: '5 GHz',   value: 41 },
    { label: '6 GHz',   value: 12 },
    { label: 'Wired',   value: 18 },
  ];

  const overview = {
    siteName: 'HQ',
    devices: { total: devices.length, online: devices.filter((d) => d.state === 'online').length, adopted: devices.length },
    clients: { total: 95, wireless: 77, wired: 18 },
    wan: { latencyMs: 12, uplink: 'usg-pro-01' },
  };

  const health = [
    { subsystem: 'wan',  status: 'ok',      numSta: 95, latencyMs: 12, drops: 0 },
    { subsystem: 'www',  status: 'ok',      numSta: 95, latencyMs: 14, drops: 0 },
    { subsystem: 'lan',  status: 'ok',      numSta: 18, latencyMs:  0, drops: 0 },
    { subsystem: 'wlan', status: 'warning', numSta: 77, latencyMs:  0, drops: 4 },
    { subsystem: 'vpn',  status: 'ok',      numSta:  3, latencyMs:  0, drops: 0 },
  ];

  const events = [
    { id: 'e1', when: now -    90_000, level: 'warn',  text: 'AP ap-flr2-east channel utilization 64% on 5 GHz' },
    { id: 'e2', when: now -   400_000, level: 'error', text: 'AP ap-warehouse lost contact with controller' },
    { id: 'e3', when: now -   720_000, level: 'info',  text: 'Client iphone-marco roamed ap-flr2-west → ap-flr3-north' },
    { id: 'e4', when: now - 1_900_000, level: 'info',  text: 'WAN uplink pulled 482 Mbps peak (5 min ago)' },
    { id: 'e5', when: now - 3_400_000, level: 'info',  text: 'Firmware check: all UniFi devices up to date' },
  ];

  return { overview, health, timeseries, devices, topClients, bandMix, wanLatency, events };
}

// ---------------------------------------------------------------------------
// Existing chart-image extractor — preserved as-is below.
// ---------------------------------------------------------------------------

const ALLOWED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      return cb(new Error(`Unsupported image type: ${file.mimetype}. Use PNG, JPEG, WebP, or GIF.`));
    }
    cb(null, true);
  },
});

const SYSTEM_PROMPT =
  'You are a precise data-extraction tool. You read charts from images and emit ONLY valid JSON. ' +
  'Never include prose, markdown fences, or explanations.';

const USER_PROMPT = `The attached image is a network traffic chart showing internet or network throughput over time.

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

Output ONLY the JSON object.`;

router.post('/extract-chart', requireAuth, requireRole('admin', 'agent'), (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No image provided. Upload as multipart field "image".' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'Image extraction is not configured. Set ANTHROPIC_API_KEY in server/.env to enable.',
      });
    }

    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

    try {
      const base64 = req.file.buffer.toString('base64');

      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: req.file.mimetype, data: base64 },
                },
                { type: 'text', text: USER_PROMPT },
              ],
            },
          ],
        }),
      });

      if (!apiRes.ok) {
        const text = await apiRes.text();
        console.error('Anthropic API error:', apiRes.status, text.slice(0, 500));
        return res.status(502).json({
          error: `Vision API error (${apiRes.status})`,
          detail: text.slice(0, 200),
        });
      }

      const data = await apiRes.json();
      const text = data?.content?.[0]?.text || '';

      const samples = parseSamples(text);
      if (!samples) {
        return res.status(422).json({
          error: 'Could not parse chart data from the model response.',
          raw: text.slice(0, 500),
        });
      }

      if (samples.length === 0) {
        return res.status(422).json({
          error: 'No data points were detected in this image. Try a clearer chart screenshot.',
        });
      }

      res.json({ samples, model });
    } catch (e) {
      console.error('extract-chart failed:', e);
      res.status(500).json({ error: e.message || 'Extraction failed' });
    }
  });
});

function tryParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function parseSamples(text) {
  if (!text) return null;
  const trimmed = text.trim();

  let json = tryParse(trimmed);
  if (!json) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) json = tryParse(match[0]);
  }
  if (!json || !Array.isArray(json.samples)) return null;

  return json.samples
    .filter((s) => s && (s.time || s.label))
    .map((s) => ({
      time: String(s.time || s.label || '').slice(0, 16),
      downloadMbps: Math.max(0, Math.round((Number(s.downloadMbps) || 0) * 10) / 10),
      uploadMbps: Math.max(0, Math.round((Number(s.uploadMbps) || 0) * 10) / 10),
    }))
    .slice(0, 50);
}

export default router;
