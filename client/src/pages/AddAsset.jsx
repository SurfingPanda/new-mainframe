import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api, getUser } from '../lib/auth.js';

const STATUSES = ['in_use', 'in_storage', 'repair', 'retired'];
const STATUS_LABELS = {
  in_use: 'In Use', in_storage: 'In Storage', repair: 'Under Repair', retired: 'Retired'
};

export default function AddAsset() {
  const { id: editId } = useParams();       // present when editing
  const isNew = !editId;
  const navigate = useNavigate();
  const me = getUser();

  const [types, setTypes]     = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  // Form fields
  const [assetTag, setAssetTag]       = useState('');
  const [type, setType]               = useState('');
  const [model, setModel]             = useState('');
  const [serialNo, setSerialNo]       = useState('');
  const [assignee, setAssignee]       = useState('');
  const [location, setLocation]       = useState('');
  const [status, setStatus]           = useState('in_use');
  const [purchasedAt, setPurchasedAt] = useState('');
  const [notes, setNotes]             = useState('');

  useEffect(() => {
    api('/api/assets/meta/types').then(setTypes).catch(() => {});
    if (!isNew) {
      setLoading(true);
      api(`/api/assets/${editId}`)
        .then((d) => {
          setAssetTag(d.asset_tag || '');
          setType(d.type || '');
          setModel(d.model || '');
          setSerialNo(d.serial_no || '');
          setAssignee(d.assignee || '');
          setLocation(d.location || '');
          setStatus(d.status || 'in_use');
          setPurchasedAt(d.purchased_at ? d.purchased_at.slice(0, 10) : '');
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [editId, isNew]);

  const handleSave = async () => {
    setError('');
    if (!assetTag.trim()) { setError('Asset tag is required.'); return; }
    if (!type)            { setError('Type is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        asset_tag: assetTag.trim(),
        type,
        model: model.trim() || null,
        serial_no: serialNo.trim() || null,
        assignee: assignee.trim() || null,
        location: location.trim() || null,
        status,
        purchased_at: purchasedAt || null
      };
      if (isNew) {
        const created = await api('/api/assets', { method: 'POST', body: JSON.stringify(payload) });
        navigate('/assets/all', { state: { banner: `Asset ${created.asset_tag} added.` } });
      } else {
        const updated = await api(`/api/assets/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        navigate('/assets/all', { state: { banner: `Asset ${updated.asset_tag} updated.` } });
      }
    } catch (e) {
      setError(e.message || 'Could not save asset.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <DashboardHeader />
        <div className="container-app py-20 text-center text-sm text-slate-500">Loading asset…</div>
      </div>
    );
  }

  const inp = 'block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 bg-white';

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      {/* Sticky top action bar */}
      <div className="sticky top-16 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="container-app flex items-center justify-between h-14 gap-4">
          <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 min-w-0">
            <Link to="/dashboard" className="hover:text-slate-800 shrink-0">Dashboard</Link>
            <span className="text-slate-300">/</span>
            <Link to="/assets/all" className="hover:text-slate-800 shrink-0">Asset Inventory</Link>
            <span className="text-slate-300">/</span>
            <span className="text-accent-700 truncate">{isNew ? 'Add Asset' : `Edit ${assetTag || editId}`}</span>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/assets/all" className="btn-ghost !px-3 !py-1.5 text-xs">Discard</Link>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary !px-4 !py-1.5 text-xs disabled:opacity-60"
            >
              {saving ? 'Saving…' : isNew ? 'Add asset' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      <main className="container-app py-10">
        {/* Page header */}
        <div className="mb-8">
          <span className="eyebrow">Asset Inventory</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">
            {isNew ? 'Add New Asset' : `Edit Asset`}
          </h1>
          <p className="mt-1 text-slate-600">
            {isNew ? 'Register a hardware device in the Eljin Corp inventory.' : 'Update the details for this asset record.'}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_300px]">

          {/* ── Left: main fields ── */}
          <div className="space-y-5">

            {/* Identification */}
            <fieldset className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
              <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-1 -ml-1">Identification</legend>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Asset tag <span className="text-rose-500">*</span>
                    <span className="ml-1 font-normal text-slate-400">— unique identifier</span>
                  </label>
                  <input
                    value={assetTag}
                    onChange={(e) => setAssetTag(e.target.value.toUpperCase())}
                    placeholder="e.g. LT-0042"
                    autoFocus={isNew}
                    className={inp + ' font-mono'}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Auto-capitalised. Must be unique across all assets.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Type <span className="text-rose-500">*</span>
                  </label>
                  <select value={type} onChange={(e) => setType(e.target.value)} className={inp}>
                    <option value="">— Select device type —</option>
                    {types.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Model</label>
                  <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. ThinkPad T14 Gen 3" className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Serial number</label>
                  <input value={serialNo} onChange={(e) => setSerialNo(e.target.value)} placeholder="e.g. PF2XY1234" className={inp + ' font-mono'} />
                </div>
              </div>
            </fieldset>

            {/* Assignment */}
            <fieldset className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
              <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-1 -ml-1">Assignment & Location</legend>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Assigned to</label>
                  <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="e.g. jdoe or Jane Doe" className={inp} />
                  <p className="mt-1 text-[11px] text-slate-400">Leave blank if unassigned / in storage.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Location</label>
                  <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. HQ — Floor 3, Desk 12" className={inp} />
                </div>
              </div>
            </fieldset>

          </div>

          {/* ── Right: sidebar ── */}
          <aside className="space-y-4">

            {/* Status */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Status</h3>
              <div className="space-y-2">
                {STATUSES.map((s) => {
                  const selected = status === s;
                  const styles = {
                    in_use:     selected ? 'border-accent-400 bg-accent-50 text-accent-800' : 'border-slate-200 text-slate-600 hover:border-accent-300',
                    in_storage: selected ? 'border-brand-400 bg-brand-50 text-brand-800'   : 'border-slate-200 text-slate-600 hover:border-brand-300',
                    repair:     selected ? 'border-amber-400 bg-amber-50 text-amber-800'   : 'border-slate-200 text-slate-600 hover:border-amber-300',
                    retired:    selected ? 'border-slate-400 bg-slate-100 text-slate-700'  : 'border-slate-200 text-slate-500 hover:border-slate-400',
                  };
                  const dots = { in_use: 'bg-accent-500', in_storage: 'bg-brand-400', repair: 'bg-amber-400', retired: 'bg-slate-400' };
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${styles[s]}`}
                    >
                      <span className={`h-2 w-2 rounded-full flex-none ${selected ? dots[s] : 'bg-slate-300'}`} />
                      {STATUS_LABELS[s]}
                      {selected && (
                        <svg className="ml-auto h-4 w-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Purchase info */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Purchase Info</h3>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Purchase date</label>
              <input type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} className={inp} />
            </div>

            {/* Quick tips */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Tips</h3>
              <ul className="space-y-2 text-[11px] text-slate-500">
                <li>· Use a consistent tag format, e.g. <span className="font-mono bg-white border border-slate-200 rounded px-1">LT-0001</span> for laptops.</li>
                <li>· Set status to <strong>In Storage</strong> if the device hasn't been issued yet.</li>
                <li>· Serial numbers help identify assets during audits.</li>
                <li>· Location should be specific enough to physically find the device.</li>
              </ul>
            </div>
          </aside>
        </div>

        {/* Bottom save bar */}
        <div className="mt-8 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-card">
          <p className="text-xs text-slate-500">
            {isNew
              ? 'Fill in the asset tag and type at minimum, then save.'
              : 'Changes are saved immediately when you click Save changes.'}
          </p>
          <div className="flex items-center gap-3">
            <Link to="/assets/all" className="btn-ghost !px-4 !py-2 text-sm">Cancel</Link>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary !px-5 !py-2 text-sm disabled:opacity-60"
            >
              {saving ? 'Saving…' : isNew ? 'Add asset' : 'Save changes'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
