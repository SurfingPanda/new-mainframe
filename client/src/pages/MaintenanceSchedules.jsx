import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import { api } from '../lib/auth.js';
import { formatTicketId } from '../lib/ticket.js';

const UNITS = { daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', yearly: 'year' };

function cadenceLabel(cadence, n) {
  const unit = UNITS[cadence] || 'period';
  return Number(n) === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
}

function formatDate(value) {
  if (!value) return '—';
  // Dates arrive as 'YYYY-MM-DD'; parse the parts as a local date so the
  // displayed day doesn't shift across timezones.
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(value).slice(0, 10);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function MaintenanceSchedules() {
  const location = useLocation();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(location.state?.banner ? { text: location.state.banner } : null);
  const [busyId, setBusyId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api('/api/maintenance');
      setSchedules(Array.isArray(list) ? list : []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  const runNow = async (s) => {
    setBusyId(s.id);
    try {
      const res = await api(`/api/maintenance/${s.id}/run`, { method: 'POST' });
      setBanner({ text: `Generated work order ${formatTicketId(res.work_order_id)} from "${s.title}".` });
      await load();
    } catch (e) {
      setError(e.message || 'Could not generate work order.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (s) => {
    setBusyId(s.id);
    try {
      await api(`/api/maintenance/${s.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !s.is_active }) });
      await load();
    } catch (e) {
      setError(e.message || 'Could not update schedule.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/api/maintenance/${deleteTarget.id}`, { method: 'DELETE' });
      setBanner({ text: `Schedule "${deleteTarget.title}" deleted.` });
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setError(e.message || 'Could not delete schedule.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />
      <main className="container-app py-10">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-6">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700">Work Orders</span>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Recurring</span>
        </nav>

        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Work Orders</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">Recurring Work Orders</h1>
            <p className="mt-1 text-slate-600">
              {loading
                ? 'Loading schedules…'
                : `${schedules.length} preventive-maintenance schedule${schedules.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <Link to="/tickets/maintenance/new" className="btn-primary !px-3.5 !py-2 text-xs self-start">
            <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Schedule
          </Link>
        </section>

        {banner && (
          <div className="mt-5 rounded-md bg-accent-50 ring-1 ring-accent-200 px-4 py-3 text-sm text-accent-800">{banner.text}</div>
        )}
        {error && (
          <div className="mt-5 rounded-md bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Schedule</th>
                  <th className="px-5 py-3">Asset</th>
                  <th className="px-5 py-3">Cadence</th>
                  <th className="px-5 py-3">Next run</th>
                  <th className="px-5 py-3">Generated</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">Loading schedules…</td></tr>
                ) : schedules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center">
                      <p className="text-sm font-semibold text-slate-700">No recurring work orders yet</p>
                      <p className="mt-1 text-xs text-slate-500">Create a schedule to auto-generate preventive-maintenance work orders.</p>
                      <div className="mt-4">
                        <Link to="/tickets/maintenance/new" className="btn-primary !px-3.5 !py-2 text-xs">New Schedule</Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  schedules.map((s) => (
                    <tr key={s.id} className={`hover:bg-slate-50/60 ${s.is_active ? '' : 'opacity-60'}`}>
                      <td className="px-5 py-3">
                        <Link to={`/tickets/maintenance/${s.id}`} className="font-semibold text-brand-900 hover:text-accent-700">
                          {s.title}
                        </Link>
                        {s.department && <div className="text-xs text-slate-400">{s.department}</div>}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {s.asset_tag ? (
                          <span className="font-mono text-xs">{s.asset_tag}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{cadenceLabel(s.cadence, s.interval_count)}</td>
                      <td className="px-5 py-3 text-slate-600">{formatDate(s.next_run_at)}</td>
                      <td className="px-5 py-3 text-slate-600">{s.generated_count ?? 0}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${s.is_active ? 'bg-accent-50 text-accent-700 ring-accent-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${s.is_active ? 'bg-accent-500' : 'bg-slate-400'}`} />
                          {s.is_active ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2 text-xs">
                          <button onClick={() => runNow(s)} disabled={busyId === s.id} className="btn-secondary !px-2.5 !py-1.5 disabled:opacity-50">
                            {busyId === s.id ? '…' : 'Run now'}
                          </button>
                          <button onClick={() => toggleActive(s)} disabled={busyId === s.id} className="btn-ghost !px-2.5 !py-1.5 disabled:opacity-50">
                            {s.is_active ? 'Pause' : 'Resume'}
                          </button>
                          <Link to={`/tickets/maintenance/${s.id}`} className="btn-ghost !px-2.5 !py-1.5">Edit</Link>
                          <button onClick={() => setDeleteTarget(s)} className="btn-ghost !px-2.5 !py-1.5 text-rose-600 hover:text-rose-700">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete schedule" size="sm">
        <p className="text-sm text-slate-600">
          Delete <strong>{deleteTarget?.title}</strong>? Work orders it already generated are kept; no new ones will be created.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className="btn-ghost !px-4 !py-2 text-sm">Cancel</button>
          <button onClick={confirmDelete} disabled={deleting} className="btn-primary !bg-rose-600 hover:!bg-rose-700 !px-4 !py-2 text-sm disabled:opacity-60">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
