import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { emptyReport, getReport, healthTone, mergeIntoTemplate } from '../lib/networkReports.js';
import { getUser } from '../lib/auth.js';

const STATUS_META = {
  stable:   { label: 'Stable',   ring: 'bg-accent-50 text-accent-700 ring-accent-200',   dot: 'bg-accent-500' },
  degraded: { label: 'Degraded', ring: 'bg-amber-50 text-amber-700 ring-amber-200',      dot: 'bg-amber-500'  },
  incident: { label: 'Incident', ring: 'bg-rose-50 text-rose-700 ring-rose-200',         dot: 'bg-rose-500'   },
};

const HEALTH_TONE = {
  good:  'bg-accent-50 text-accent-700 ring-accent-200',
  warn:  'bg-amber-50 text-amber-700 ring-amber-200',
  bad:   'bg-rose-50 text-rose-700 ring-rose-200',
  muted: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const HEALTH_FIELDS = [
  { key: 'internet',  label: 'Internet Connectivity' },
  { key: 'bandwidth', label: 'Bandwidth Usage' },
  { key: 'wireless',  label: 'Wireless Connectivity' },
  { key: 'gateway',   label: 'Gateway Status' },
  { key: 'vlan',      label: 'VLAN Communication' },
];

function formatLongDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase();
}

export default function NetworkReportView() {
  const { date } = useParams();
  const [report, setReport] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const existing = getReport(date);
    if (existing) {
      setReport(mergeIntoTemplate(emptyReport(getUser()), existing));
    }
    setLoaded(true);
  }, [date]);

  const [busyPdf, setBusyPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');

  const handlePrint = () => {
    const styleId = 'print-network-report-page';
    const cleanup = () => {
      document.body.classList.remove('print-network-report');
      document.getElementById(styleId)?.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = '@page { size: portrait; margin: 0.35in; }';
    document.head.appendChild(style);
    document.body.classList.add('print-network-report');
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 1000);
  };

  const handleSavePdf = async () => {
    if (busyPdf) return;
    setPdfError('');
    setBusyPdf(true);
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    if (wasDark) root.classList.remove('dark');
    try {
      const element = document.querySelector('.nr-doc');
      if (!element) throw new Error('Report element not found.');
      const { default: html2pdf } = await import('html2pdf.js');
      await html2pdf()
        .from(element)
        .set({
          filename: `network-report-${report.date}.pdf`,
          margin: [0.35, 0.35, 0.35, 0.35],
          image: { type: 'jpeg', quality: 0.96 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            windowWidth: 1100,
          },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        })
        .save();
    } catch (err) {
      console.error('PDF export failed:', err);
      setPdfError(err?.message || 'Could not save PDF. Try again.');
    } finally {
      if (wasDark) root.classList.add('dark');
      setBusyPdf(false);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <DashboardHeader />
        <main className="container-app py-10 text-sm text-slate-500 dark:text-slate-400">Loading…</main>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <DashboardHeader />
        <main className="container-app py-10 space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            No report found for <span className="font-mono">{date}</span>.
          </p>
          <Link to="/network/reports" className="btn-secondary !px-3.5 !py-2 text-xs">← Back to reports</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="screen-only">
        <DashboardHeader />
      </div>

      <main className="container-app py-6 sm:py-10 space-y-6">
        <div className="screen-only flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <nav className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Link to="/dashboard" className="hover:text-slate-800 dark:hover:text-slate-200">Dashboard</Link>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <Link to="/network" className="hover:text-slate-800 dark:hover:text-slate-200">Network</Link>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <Link to="/network/reports" className="hover:text-slate-800 dark:hover:text-slate-200">Daily Reports</Link>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <span className="text-accent-700 dark:text-accent-400">{report.date}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              title="Open the browser's print dialog"
              className="btn-secondary !px-3.5 !py-2 text-xs"
            >
              <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9V2h12v7" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M6 14h12v8H6z" />
              </svg>
              Print
            </button>
            <button
              type="button"
              onClick={handleSavePdf}
              disabled={busyPdf}
              title="Download the report as a PDF file"
              className="btn-secondary !px-3.5 !py-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busyPdf ? (
                <>
                  <svg className="h-4 w-4 mr-1.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-6.2-8.55" />
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M12 18v-6" />
                    <path d="M9 15l3 3 3-3" />
                  </svg>
                  Save as PDF
                </>
              )}
            </button>
            <Link to={`/network/reports/edit/${report.date}`} className="btn-primary !px-3.5 !py-2 text-xs">Edit</Link>
          </div>
        </div>

        {pdfError && (
          <div className="screen-only rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:ring-rose-900 dark:text-rose-300">
            {pdfError}
          </div>
        )}

        <ReportDocument report={report} />
      </main>
    </div>
  );
}

function ReportDocument({ report }) {
  return (
    <article className="nr-doc mx-auto max-w-[1100px] rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden print:shadow-none print:border-0 print:rounded-none dark:border-slate-800 dark:bg-slate-900 print:bg-white print:dark:bg-white">
      <header className="bg-brand-900 px-6 py-5 text-white print:bg-white print:text-brand-900 print:border-b-4 print:border-brand-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-wide uppercase">
              Network Data Download/Upload Report
            </h1>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-accent-300 print:text-accent-700">
              {formatLongDate(report.date)}
            </p>
          </div>
          <div className="text-xs text-slate-200 sm:text-right print:text-slate-700">
            <div className="font-semibold text-white print:text-brand-900">{report.author || '—'}</div>
            <div className="font-mono text-[11px] text-slate-300 print:text-slate-600">{report.authorEmail || ''}</div>
          </div>
        </div>
      </header>

      <Section title="Executive Summary">
        <Paragraph text={report.executiveSummary} />
      </Section>

      <Section title="Network Performance Overview">
        <div className="grid gap-4 lg:grid-cols-3">
          <PerfBlock
            heading="Peak Network Activity"
            tone="accent"
            time={report.performance.peak.time}
            data={report.performance.peak}
          />
          <PerfBlock
            heading="Network Interruption"
            tone="rose"
            time={report.performance.interruption.timeRange}
            data={report.performance.interruption}
          />
          <PerfBlock
            heading="Lowest Network Activity"
            tone="brand"
            time={report.performance.lowest.time}
            data={report.performance.lowest}
          />
        </div>
      </Section>

      <div className="nr-cols grid md:grid-cols-2">
        <div className="nr-col md:border-r md:border-slate-100 md:dark:border-slate-800 print:md:border-slate-200">
          <Section title="Network Health Status" tight>
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 print:border-slate-300">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/60 dark:text-slate-300 print:bg-slate-100">
                  <tr>
                    <th className="px-4 py-2 text-left">Category</th>
                    <th className="px-4 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
                  {HEALTH_FIELDS.map((f) => (
                    <tr key={f.key}>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-200 print:text-slate-800">{f.label}</td>
                      <td className="px-4 py-2 text-right">
                        <HealthPill value={report.health[f.key]} />
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-200 print:text-slate-800">Critical Downtime</td>
                    <td className="px-4 py-2 text-right text-slate-800 dark:text-slate-200 print:text-slate-800">
                      {report.health.criticalDowntime || 'None'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="Network Observations" tight>
            <Paragraph text={report.observations} />
          </Section>
        </div>
        <div className="nr-col">
          <Section title="Client and Traffic Analysis" tight>
            <Paragraph text={report.trafficAnalysis} />
          </Section>
          <Section title="Recommendations" tight>
            <Paragraph text={report.recommendations} />
          </Section>
          <Section title="Incident Summary" tight>
            <Paragraph text={report.incidentSummary} />
          </Section>
        </div>
      </div>

      <Section title="Network Traffic Overview">
        <TrafficChart samples={report.trafficSamples} />
      </Section>

      <footer className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400 print:bg-white print:text-slate-600">
        Generated from Mainframe · {report.savedAt ? new Date(report.savedAt).toLocaleString() : 'Draft'} · Eljin Corp Internal
      </footer>
    </article>
  );
}

function Section({ title, tight, children }) {
  return (
    <section className={`px-6 py-5 border-t border-slate-100 dark:border-slate-800 print:border-slate-200 ${tight ? '' : ''}`}>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent-700 dark:text-accent-400 print:text-accent-700">
        {title}
      </h2>
      <div className="mt-3 text-sm text-slate-700 dark:text-slate-200 print:text-slate-800">
        {children}
      </div>
    </section>
  );
}

function Paragraph({ text }) {
  if (!text || !text.trim()) {
    return <span className="text-slate-400 italic dark:text-slate-500 print:text-slate-500">Not provided.</span>;
  }
  return <div className="whitespace-pre-wrap leading-relaxed">{text}</div>;
}

function PerfBlock({ heading, tone, time, data }) {
  const toneClass =
    tone === 'accent' ? 'border-accent-200 bg-accent-50/50 dark:border-accent-500/30 dark:bg-accent-500/10 print:border-accent-300 print:bg-accent-50'
    : tone === 'rose' ? 'border-rose-200 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/10 print:border-rose-300 print:bg-rose-50'
    : 'border-brand-200 bg-brand-50/50 dark:border-brand-500/30 dark:bg-brand-500/10 print:border-brand-300 print:bg-brand-50';
  const headingTone =
    tone === 'accent' ? 'text-accent-800 dark:text-accent-300 print:text-accent-800'
    : tone === 'rose' ? 'text-rose-800 dark:text-rose-300 print:text-rose-800'
    : 'text-brand-800 dark:text-brand-200 print:text-brand-800';

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <h3 className={`text-[11px] font-bold uppercase tracking-wider ${headingTone}`}>{heading}</h3>
      <p className="mt-1 text-2xl font-bold tabular-nums text-brand-900 dark:text-slate-100 print:text-brand-900">
        {time || '—'}
      </p>
      <ul className="mt-3 space-y-1 text-xs text-slate-700 dark:text-slate-200 print:text-slate-800">
        <li className="flex justify-between gap-2">
          <span className="text-slate-500 dark:text-slate-400 print:text-slate-600">Network Clients</span>
          <span className="font-semibold tabular-nums">{data.clients ?? 0}</span>
        </li>
        <li className="flex justify-between gap-2">
          <span className="text-slate-500 dark:text-slate-400 print:text-slate-600">Avg Download</span>
          <span className="font-semibold tabular-nums">{data.avgDownloadMbps ?? 0} Mbps</span>
        </li>
        <li className="flex justify-between gap-2">
          <span className="text-slate-500 dark:text-slate-400 print:text-slate-600">Avg Upload</span>
          <span className="font-semibold tabular-nums">{data.avgUploadKbps ?? 0} kbps</span>
        </li>
      </ul>
      {data.observation && (
        <div className="mt-3 border-t border-slate-200/70 pt-3 text-[11px] leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-300 print:border-slate-300 print:text-slate-700">
          <span className="block font-semibold uppercase tracking-wider text-[9px] text-slate-500 mb-1 print:text-slate-600">Observation</span>
          {data.observation}
        </div>
      )}
    </div>
  );
}

function HealthPill({ value }) {
  const tone = healthTone(value);
  const cls = HEALTH_TONE[tone] || HEALTH_TONE.muted;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${cls}`}>
      {value || 'N/A'}
    </span>
  );
}

function TrafficChart({ samples }) {
  const points = useMemo(() => (samples || []).filter((s) => s && s.time), [samples]);
  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400 print:bg-white print:text-slate-600">
        No traffic samples recorded.
      </div>
    );
  }

  const W = 1000;
  const H = 240;
  const PAD_L = 44;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const maxVal = Math.max(
    1,
    ...points.map((p) => Number(p.downloadMbps) || 0),
    ...points.map((p) => Number(p.uploadMbps) || 0)
  );

  const xAt = (i) => PAD_L + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const yAt = (v) => PAD_T + innerH - ((Number(v) || 0) / maxVal) * innerH;

  const buildPath = (key) =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p[key]).toFixed(1)}`)
      .join(' ');

  const buildArea = (key) => {
    const top = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p[key]).toFixed(1)}`).join(' ');
    return `${top} L ${xAt(points.length - 1).toFixed(1)} ${(PAD_T + innerH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(PAD_T + innerH).toFixed(1)} Z`;
  };

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((maxVal * i) / yTicks * 10) / 10);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/40 print:border-slate-300 print:bg-white">
      <div className="mb-2 flex items-center gap-4 text-[11px] text-slate-600 dark:text-slate-300 print:text-slate-700">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-accent-500" /> Download</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-brand-500" /> Upload</span>
        <span className="ml-auto font-mono text-[10px] text-slate-400 dark:text-slate-500 print:text-slate-500">Mbps</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {ticks.map((t, i) => {
          const y = yAt(t);
          return (
            <g key={i}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="currentColor" strokeWidth="0.5" className="text-slate-200 dark:text-slate-700" />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize="10" className="fill-slate-400 dark:fill-slate-500">{t}</text>
            </g>
          );
        })}
        <path d={buildArea('downloadMbps')} fill="rgb(34 162 62 / 0.12)" />
        <path d={buildPath('downloadMbps')} fill="none" stroke="#22a23e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={buildPath('uploadMbps')} fill="none" stroke="#3f5b95" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={`pt-${i}`}>
            <circle cx={xAt(i)} cy={yAt(p.downloadMbps)} r="3" fill="#22a23e" />
            <circle cx={xAt(i)} cy={yAt(p.uploadMbps)} r="3" fill="#3f5b95" />
            <text
              x={xAt(i)}
              y={H - 10}
              textAnchor="middle"
              fontSize="10"
              className="fill-slate-500 dark:fill-slate-400"
            >
              {p.time}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
