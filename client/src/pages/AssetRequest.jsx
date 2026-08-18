import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import Avatar from '../components/Avatar.jsx';
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

// Display format for a requester's employee ID, derived from their account id
// (there's no separate employee_id field on users). Example: id 6 -> "EMP-00006".
function formatEmployeeId(id) {
  return `EMP-${String(id ?? 0).padStart(5, '0')}`;
}

export default function AssetRequest() {
  const me = getUser();

  const [error, setError]           = useState('');
  const [banner, setBanner]         = useState(null);
  const [showForm, setShowForm]     = useState(false);

  // Form state
  const [assetType, setAssetType]       = useState('');
  const [quantity, setQuantity]         = useState(1);
  const [urgency, setUrgency]           = useState('normal');
  const [justification, setJustification] = useState('');
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  const resetForm = () => {
    setAssetType('');
    setQuantity(1);
    setUrgency('normal');
    setJustification('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!assetType) { setError('Please select an asset type.'); return; }
    if (!justification.trim()) { setError('Please provide a justification.'); return; }

    setSaving(true);
    try {
      await api('/api/asset-requests', {
        method: 'POST',
        body: JSON.stringify({
          asset_type: assetType,
          quantity,
          urgency,
          justification: justification.trim()
        })
      });
      setBanner({ text: 'Asset request submitted successfully.' });
      resetForm();
      setShowForm(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
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
          <section className="rounded-xl border border-slate-200 bg-white shadow-card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
              <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-200">
                <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-semibold text-brand-900">Submit New Request</h2>
                <p className="text-xs text-slate-500">Requests are routed straight to IT for review.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200">
                <Avatar name={me?.name} src={me?.avatar_url} size="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{me?.name}</p>
                  <p className="font-mono text-xs text-slate-500">{formatEmployeeId(me?.id)}</p>
                </div>
                <span className="inline-flex flex-none items-center rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-inset ring-slate-200">
                  Requesting as
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Justification <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Explain why this equipment is needed, who it's for, and any relevant context..."
                  rows={2}
                  className={inp + ' resize-none'}
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className="hidden items-center gap-1.5 text-xs text-slate-400 sm:flex">
                  <svg className="h-3.5 w-3.5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m-1 4h1m4-4h1m-1 4h1M9 21v-4h6v4" />
                  </svg>
                  Routed to <span className="font-semibold text-slate-600">IT Department</span> automatically
                </p>
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="btn-ghost !px-3.5 !py-2 text-xs">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="btn-primary !px-4 !py-2 text-xs disabled:opacity-60">
                    {saving ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
