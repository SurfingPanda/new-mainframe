// Local-only storage for daily network reports until a backend route exists.
// Data lives in the user's browser under STORAGE_KEY as a JSON array, keyed by `date` (YYYY-MM-DD).
//
// Report shape:
// {
//   date, savedAt, author, authorEmail,
//   status: 'stable' | 'degraded' | 'incident',
//   executiveSummary,
//   performance: {
//     peak:         { time, clients, avgDownloadMbps, avgUploadKbps, observation },
//     interruption: { timeRange, clients, avgDownloadMbps, avgUploadKbps, observation },
//     lowest:       { time, clients, avgDownloadMbps, avgUploadKbps, observation }
//   },
//   health: { internet, bandwidth, wireless, gateway, vlan, criticalDowntime },
//   trafficAnalysis, observations, recommendations, incidentSummary,
//   trafficSamples: [{ time, downloadMbps, uploadMbps }, ...]
// }

const STORAGE_KEY = 'mf_network_reports';

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(rows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function listReports() {
  return read().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getReport(date) {
  return read().find((r) => r.date === date) || null;
}

export function saveReport(report) {
  if (!report?.date) throw new Error('Report date is required.');
  const rows = read();
  const idx = rows.findIndex((r) => r.date === report.date);
  if (idx >= 0) {
    rows[idx] = { ...rows[idx], ...report };
  } else {
    rows.push(report);
  }
  write(rows);
  return report;
}

export function deleteReport(date) {
  write(read().filter((r) => r.date !== date));
}

export const HEALTH_OPTIONS = [
  'Stable', 'Optimal', 'Healthy', 'Operational',
  'Slow', 'Intermittent', 'Degraded',
  'Down', 'Critical', 'Disconnected',
  'N/A',
];

export function healthTone(value) {
  const v = String(value || '').toLowerCase();
  if (['stable', 'optimal', 'healthy', 'operational'].includes(v)) return 'good';
  if (['slow', 'intermittent', 'degraded'].includes(v)) return 'warn';
  if (['down', 'critical', 'disconnected'].includes(v)) return 'bad';
  return 'muted';
}

export function emptyReport(user) {
  return {
    date: todayKey(),
    status: 'stable',
    author: user?.name || '',
    authorEmail: user?.email || '',
    executiveSummary: '',
    performance: {
      peak:         { time: '', clients: 0, avgDownloadMbps: 0, avgUploadKbps: 0, observation: '' },
      interruption: { timeRange: '', clients: 0, avgDownloadMbps: 0, avgUploadKbps: 0, observation: '' },
      lowest:       { time: '', clients: 0, avgDownloadMbps: 0, avgUploadKbps: 0, observation: '' },
    },
    health: {
      internet: 'Stable',
      bandwidth: 'Optimal',
      wireless: 'Healthy',
      gateway: 'Operational',
      vlan: 'Healthy',
      criticalDowntime: 'None',
    },
    trafficAnalysis: '',
    observations: '',
    recommendations: '',
    incidentSummary: '',
    trafficSamples: [
      { time: '08:00', downloadMbps: 0, uploadMbps: 0 },
      { time: '12:00', downloadMbps: 0, uploadMbps: 0 },
      { time: '16:00', downloadMbps: 0, uploadMbps: 0 },
      { time: '20:00', downloadMbps: 0, uploadMbps: 0 },
    ],
  };
}

// Deep-merge an existing record onto the empty template so older records still load
// even when the schema gains fields.
export function mergeIntoTemplate(template, existing) {
  if (!existing) return template;
  return {
    ...template,
    ...existing,
    performance: {
      peak:         { ...template.performance.peak,         ...(existing.performance?.peak         || {}) },
      interruption: { ...template.performance.interruption, ...(existing.performance?.interruption || {}) },
      lowest:       { ...template.performance.lowest,       ...(existing.performance?.lowest       || {}) },
    },
    health: { ...template.health, ...(existing.health || {}) },
    trafficSamples: Array.isArray(existing.trafficSamples) && existing.trafficSamples.length
      ? existing.trafficSamples
      : template.trafficSamples,
  };
}
