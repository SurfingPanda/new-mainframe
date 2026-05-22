// Local-only storage for daily network reports until a backend route exists.
// Data lives in the user's browser under STORAGE_KEY as a JSON array, keyed by `date` (YYYY-MM-DD).
//
// Report shape:
// {
//   date, savedAt, author, authorEmail,
//   status: 'stable' | 'degraded' | 'incident',
//   template: {
//     networkCondition, downtimeStatus, internetActivity, peakUsagePeriod,
//     highestTrafficDevice, clientStatus, highestRecordedTraffic,
//     trafficObservation, wirelessStatus, currentMonitoring
//   }
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

// The 10-field daily template. `type` drives the editor input and the view rendering.
export const TEMPLATE_FIELDS = [
  { key: 'networkCondition',       label: 'Network Condition',        type: 'select',   options: ['Stable', 'Optimal', 'Degraded', 'Unstable', 'Critical'] },
  { key: 'downtimeStatus',         label: 'Downtime Status',          type: 'select',   options: ['No downtime', 'Brief downtime', 'Partial outage', 'Major outage'] },
  { key: 'internetActivity',       label: 'Internet Activity',        type: 'text',     placeholder: 'e.g. Normal browsing and cloud sync throughout the day' },
  { key: 'peakUsagePeriod',        label: 'Peak Usage Period',        type: 'text',     placeholder: 'e.g. 1:00 PM - 3:00 PM' },
  { key: 'highestTrafficDevice',   label: 'Highest Traffic Device',   type: 'text',     placeholder: 'e.g. Front-desk workstation' },
  { key: 'clientStatus',           label: 'Client Status',            type: 'select',   options: ['All connected', 'Mostly connected', 'Intermittent drops', 'Widespread disconnections'] },
  { key: 'highestRecordedTraffic', label: 'Highest Recorded Traffic', type: 'text',     placeholder: 'e.g. 84.2 Mbps down / 12.0 Mbps up' },
  { key: 'trafficObservation',     label: 'Traffic Observation',      type: 'textarea', placeholder: 'What stood out in the traffic pattern today.' },
  { key: 'wirelessStatus',         label: 'Wireless Status',          type: 'select',   options: ['Stable', 'Optimal', 'Degraded', 'Intermittent', 'Down'] },
  { key: 'currentMonitoring',      label: 'Current Monitoring',       type: 'select',   options: ['Active', 'Ongoing', 'Scheduled', 'Paused'] },
];

// Maps a select value to a status tone for the pills shown on the view page.
export function templateTone(value) {
  const v = String(value || '').toLowerCase();
  if (['stable', 'optimal', 'active', 'all connected', 'no downtime'].includes(v)) return 'good';
  if (['degraded', 'unstable', 'intermittent', 'ongoing', 'scheduled', 'paused',
       'mostly connected', 'intermittent drops', 'brief downtime', 'partial outage'].includes(v)) return 'warn';
  if (['critical', 'down', 'major outage', 'widespread disconnections'].includes(v)) return 'bad';
  return 'muted';
}

export function emptyTemplate() {
  return {
    networkCondition: 'Stable',
    downtimeStatus: 'No downtime',
    internetActivity: '',
    peakUsagePeriod: '',
    highestTrafficDevice: '',
    clientStatus: 'All connected',
    highestRecordedTraffic: '',
    trafficObservation: '',
    wirelessStatus: 'Stable',
    currentMonitoring: 'Active',
  };
}

export function emptyReport(user) {
  return {
    date: todayKey(),
    status: 'stable',
    author: user?.name || '',
    authorEmail: user?.email || '',
    template: emptyTemplate(),
  };
}

// Merge an existing record onto the empty template so older records still load
// even when the schema gains fields.
export function mergeIntoTemplate(template, existing) {
  if (!existing) return template;
  return {
    ...template,
    ...existing,
    template: { ...template.template, ...(existing.template || {}) },
  };
}
