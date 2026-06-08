import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { emptyReport, getReport, mergeIntoTemplate, TEMPLATE_FIELDS, templateTone } from '../lib/networkReports.js';
import { getUser } from '../lib/auth.js';

const TONE_PILL = {
  good:  'bg-accent-50 text-accent-700 ring-accent-200',
  warn:  'bg-amber-50 text-amber-700 ring-amber-200',
  bad:   'bg-rose-50 text-rose-700 ring-rose-200',
  muted: 'bg-slate-100 text-slate-600 ring-slate-200',
};

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
  const t = report.template || {};
  return (
    <article className="nr-doc mx-auto max-w-[1100px] rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden print:shadow-none print:border-0 print:rounded-none dark:border-slate-800 dark:bg-slate-900 print:bg-white print:dark:bg-white">
      <header className="bg-brand-900 px-6 py-5 text-white print:bg-white print:text-brand-900 print:border-b-4 print:border-brand-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-wide uppercase">
              Daily Network Report
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

      <Section title="Network Status Template">
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {TEMPLATE_FIELDS.map((f) => (
            <TemplateRow key={f.key} field={f} value={t[f.key]} />
          ))}
        </dl>
      </Section>

      <footer className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400 print:bg-white print:text-slate-600">
        Generated from Hubly · {report.savedAt ? new Date(report.savedAt).toLocaleString() : 'Draft'} · Eljin Corp Internal
      </footer>
    </article>
  );
}

function Section({ title, children }) {
  return (
    <section className="px-6 py-5 border-t border-slate-100 dark:border-slate-800 print:border-slate-200">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent-700 dark:text-accent-400 print:text-accent-700">
        {title}
      </h2>
      <div className="mt-4 text-sm text-slate-700 dark:text-slate-200 print:text-slate-800">
        {children}
      </div>
    </section>
  );
}

function TemplateRow({ field, value }) {
  const span = field.type === 'textarea' ? 'sm:col-span-2' : '';
  return (
    <div className={span}>
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 print:text-slate-600">
        {field.label}
      </dt>
      <dd className="mt-1.5">
        {field.type === 'select' ? (
          <StatusPill value={value} />
        ) : field.type === 'textarea' ? (
          <Paragraph text={value} />
        ) : (
          <ValueText text={value} />
        )}
      </dd>
    </div>
  );
}

function StatusPill({ value }) {
  const cls = TONE_PILL[templateTone(value)] || TONE_PILL.muted;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {value || 'N/A'}
    </span>
  );
}

function ValueText({ text }) {
  if (!text || !text.trim()) {
    return <span className="text-slate-400 italic dark:text-slate-500 print:text-slate-500">Not provided.</span>;
  }
  return <span className="font-medium text-slate-800 dark:text-slate-100 print:text-slate-900">{text}</span>;
}

function Paragraph({ text }) {
  if (!text || !text.trim()) {
    return <span className="text-slate-400 italic dark:text-slate-500 print:text-slate-500">Not provided.</span>;
  }
  return <div className="whitespace-pre-wrap leading-relaxed">{text}</div>;
}
