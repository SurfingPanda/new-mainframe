import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Modal from '../components/Modal.jsx';
import { api, getUser } from '../lib/auth.js';

const ASSET_TYPES = [
  'Laptop', 'Desktop', 'Monitor', 'Keyboard', 'Mouse',
  'Printer', 'Scanner', 'Phone', 'Tablet', 'Server',
  'Networking', 'UPS', 'Docking Station', 'Headset', 'Other'
];

const URGENCIES = ['low', 'normal', 'high', 'urgent'];
const URGENCY_META = {
  low:    { label: 'Low',    color: 'bg-slate-100 text-slate-600 ring-slate-200',  dot: 'bg-slate-400' },
  normal: { label: 'Normal', color: 'bg-brand-50 text-brand-800 ring-brand-200',   dot: 'bg-brand-400' },
  high:   { label: 'High',   color: 'bg-amber-50 text-amber-700 ring-amber-200',   dot: 'bg-amber-400' },
  urgent: { label: 'Urgent', color: 'bg-rose-50 text-rose-700 ring-rose-200',      dot: 'bg-rose-400' },
};

const STATUS_META = {
  pending:   { label: 'Pending',   color: 'bg-amber-50 text-amber-700 ring-amber-200',   dot: 'bg-amber-400' },
  approved:  { label: 'Approved',  color: 'bg-accent-50 text-accent-700 ring-accent-200', dot: 'bg-accent-500' },
  denied:    { label: 'Denied',    color: 'bg-rose-50 text-rose-700 ring-rose-200',       dot: 'bg-rose-400' },
  fulfilled: { label: 'Fulfilled', color: 'bg-brand-50 text-brand-800 ring-brand-200',    dot: 'bg-brand-400' },
};

export default function AssetRequest() {
  const me = getUser();
  const isStaff = me?.role === 'admin' || me?.role === 'agent';

  const [requests, setRequests]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [banner, setBanner]         = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  // Form state
  const [assetType, setAssetType]       = useState('');
  const [quantity, setQuantity]         = useState(1);
  const [urgency, setUrgency]           = useState('normal');
  const [department, setDepartment]     = useState(me?.department || '');
  const [justification, setJustification] = useState('');
  const [saving, setSaving]             = useState(false);

  // Review modal
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewStatus, setReviewStatus] = useState('');
  const [adminNotes, setAdminNotes]     = useState('');
  const [reviewing, setReviewing]       = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api('/api/asset-requests');
      setRequests(data);
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

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const counts = useMemo(() => ({
    total:     requests.length,
    pending:   requests.filter((r) => r.status === 'pending').length,
    approved:  requests.filter((r) => r.status === 'approved').length,
    fulfilled: requests.filter((r) => r.status === 'fulfilled').length,
  }), [requests]);

  const resetForm = () => {
    setAssetType('');
    setQuantity(1);
    setUrgency('normal');
    setDepartment(me?.department || '');
    setJustification('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!assetType) { setError('Please select an asset type.'); return; }
    if (!justification.trim()) { setError('Please provide a justification.'); return; }

    setSaving(true);
    try {
      const created = await api('/api/asset-requests', {
        method: 'POST',
        body: JSON.stringify({
          asset_type: assetType,
          quantity,
          urgency,
          justification: justification.trim(),
          department: department.trim() || null
        })
      });
      setRequests((prev) => [created, ...prev]);
      setBanner({ text: 'Asset request submitted successfully.' });
      resetForm();
      setShowForm(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openReview = (req) => {
    setReviewTarget(req);
    setReviewStatus(req.status);
    setAdminNotes(req.admin_notes || '');
  };

  const handleReview = async () => {
    setReviewing(true);
    try {
      const updated = await api(`/api/asset-requests/${reviewTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: reviewStatus, admin_notes: adminNotes.trim() || null })
      });
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setBanner({ text: `Request #${updated.id} updated to ${STATUS_META[updated.status].label}.` });
      setReviewTarget(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setReviewing(false);
    }
  };

  const inp = 'block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 bg-white';

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to="/assets/all" className="hover:text-slate-800">Asset Inventory</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Asset Request</span>
        </nav>

        {/* Header */}
        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Asset Inventory</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">Asset Request</h1>
            <p className="mt-1 text-slate-600">Request equipment for yourself or an employee.</p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setError(''); }}
            className="btn-primary !px-3.5 !py-2 text-xs self-start md:self-auto inline-flex items-center"
          >
            <svg className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Request
          </button>
        </section>

        {/* Banner */}
        {banner && (
          <div className="flex items-start gap-2 rounded-md bg-accent-50 ring-1 ring-accent-200 px-3 py-2 text-sm text-accent-800">
            <svg className="h-4 w-4 mt-0.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" />
            </svg>
            <span className="flex-1">{banner.text}</span>
            <button onClick={() => setBanner(null)} className="text-accent-700 hover:text-accent-900 font-semibold text-xs">Dismiss</button>
          </div>
        )}
        {error && <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

        {/* New request form */}
        {showForm && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
            <h2 className="text-lg font-semibold text-brand-900 mb-5">Submit New Request</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Asset Type <span className="text-rose-500">*</span>
                  </label>
                  <select value={assetType} onChange={(e) => setAssetType(e.target.value)} className={inp}>
                    <option value="">-- Select type --</option>
                    {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                    className={inp}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Urgency</label>
                  <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className={inp}>
                    {URGENCIES.map((u) => <option key={u} value={u}>{URGENCY_META[u].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Department</label>
                  <input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Engineering"
                    className={inp}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Justification <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Explain why this equipment is needed, who it's for, and any relevant context..."
                  rows={3}
                  className={inp + ' resize-none'}
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="btn-ghost !px-3.5 !py-2 text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary !px-4 !py-2 text-xs disabled:opacity-60">
                  {saving ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Stats */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total requests" value={counts.total}     tone="brand"  icon="inbox" />
          <StatCard label="Pending"        value={counts.pending}   tone="amber"  icon="clock" />
          <StatCard label="Approved"       value={counts.approved}  tone="accent" icon="check" />
          <StatCard label="Fulfilled"      value={counts.fulfilled} tone="slate"  icon="package" />
        </section>

        {/* Table */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <div className="flex flex-wrap gap-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500">
                <option value="all">All statuses</option>
                {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="text-xs text-slate-400 shrink-0">
              {filtered.length} request{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>

          {loading ? (
            <div className="px-5 py-16 text-center text-sm text-slate-500">Loading requests...</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700">No requests found</p>
              <p className="mt-1 text-xs text-slate-500">
                {requests.length === 0 ? 'Submit your first asset request to get started.' : 'Try adjusting the filter.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                    <Th>ID</Th>
                    {isStaff && <Th>Requester</Th>}
                    <Th>Asset Type</Th>
                    <Th>Qty</Th>
                    <Th>Urgency</Th>
                    <Th>Department</Th>
                    <Th>Justification</Th>
                    <Th>Status</Th>
                    <Th>Submitted</Th>
                    {isStaff && <Th className="text-right pr-5">Actions</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs font-bold text-brand-900 bg-brand-50 ring-1 ring-inset ring-brand-200 rounded px-1.5 py-0.5">
                          #{req.id}
                        </span>
                      </td>
                      {isStaff && (
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-900 text-white text-[9px] font-bold flex-none">
                              {(req.requester_name || '?').slice(0, 2).toUpperCase()}
                            </span>
                            <span className="text-slate-700 truncate max-w-[100px]">{req.requester_name}</span>
                          </div>
                        </td>
                      )}
                      <td className="px-5 py-3 font-medium text-slate-800">{req.asset_type}</td>
                      <td className="px-5 py-3 text-center text-slate-600">{req.quantity}</td>
                      <td className="px-5 py-3"><Pill meta={URGENCY_META} value={req.urgency} /></td>
                      <td className="px-5 py-3 text-xs text-slate-600">{req.department || <span className="italic text-slate-400">--</span>}</td>
                      <td className="px-5 py-3 text-xs text-slate-600 max-w-[200px] truncate" title={req.justification}>
                        {req.justification}
                      </td>
                      <td className="px-5 py-3"><Pill meta={STATUS_META} value={req.status} /></td>
                      <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(req.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      {isStaff && (
                        <td className="px-5 py-3">
                          <div className="flex justify-end">
                            <button
                              onClick={() => openReview(req)}
                              title="Review"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:text-brand-900 hover:bg-slate-100 transition-colors"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Review modal */}
      {reviewTarget && (
        <Modal open onClose={() => setReviewTarget(null)} title={`Review Request #${reviewTarget.id}`} size="md">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <span className="block text-xs font-semibold text-slate-500 mb-0.5">Requester</span>
                <span className="text-slate-800">{reviewTarget.requester_name}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-500 mb-0.5">Asset Type</span>
                <span className="text-slate-800">{reviewTarget.asset_type}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-500 mb-0.5">Quantity</span>
                <span className="text-slate-800">{reviewTarget.quantity}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-500 mb-0.5">Urgency</span>
                <Pill meta={URGENCY_META} value={reviewTarget.urgency} />
              </div>
              <div className="col-span-2">
                <span className="block text-xs font-semibold text-slate-500 mb-0.5">Justification</span>
                <p className="text-slate-800 text-sm">{reviewTarget.justification}</p>
              </div>
            </div>

            <hr className="border-slate-200" />

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Set Status</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(STATUS_META).map(([key, meta]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setReviewStatus(key)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-all ${
                      reviewStatus === key ? meta.color + ' ring-2' : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${reviewStatus === key ? meta.dot : 'bg-slate-300'}`} />
                    {meta.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Notes (optional)</label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Provide feedback or instructions..."
                rows={2}
                className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 bg-white resize-none"
              />
            </div>

            <footer className="flex justify-end gap-2 pt-2">
              <button onClick={() => setReviewTarget(null)} className="btn-ghost !px-3.5 !py-2 text-xs">Cancel</button>
              <button
                onClick={handleReview}
                disabled={reviewing}
                className="btn-primary !px-4 !py-2 text-xs disabled:opacity-60"
              >
                {reviewing ? 'Saving...' : 'Update Request'}
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* -- Small components -- */
function StatCard({ label, value, tone, icon }) {
  const tones = {
    brand:  'text-brand-800 ring-brand-200 bg-brand-50',
    accent: 'text-accent-700 ring-accent-200 bg-accent-50',
    amber:  'text-amber-700 ring-amber-200 bg-amber-50',
    slate:  'text-slate-700 ring-slate-200 bg-slate-100'
  };
  const icons = {
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    check: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    package: <><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-inset ${tones[tone]}`}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {icons[icon]}
          </svg>
        </span>
      </div>
      <div className="mt-3 text-2xl font-bold text-brand-900 tabular-nums">{value}</div>
    </div>
  );
}

function Pill({ meta, value }) {
  const m = meta[value] || meta[Object.keys(meta)[0]];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${m.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function Th({ children, className = '' }) {
  return <th className={`px-5 py-3 text-left ${className}`}>{children}</th>;
}
