import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import { api } from '../lib/auth.js';

const PRIORITIES = [
  { key: 'low', label: 'Low' },
  { key: 'normal', label: 'Normal' },
  { key: 'high', label: 'High' },
  { key: 'urgent', label: 'Urgent' }
];

const REQUEST_TYPES = [
  { key: 'service_request', label: 'Service Request' },
  { key: 'change', label: 'Change Request' },
  { key: 'question', label: 'Question / How-to' }
];

const CATEGORIES = [
  'Hardware',
  'Software',
  'Network & Connectivity',
  'Account & Access',
  'Email & Communication',
  'Security',
  'Printing & Peripherals',
  'ERP Access',
  'HR Concerns',
  'Other'
];

const CADENCES = [
  { key: 'daily', unit: 'day' },
  { key: 'weekly', unit: 'week' },
  { key: 'monthly', unit: 'month' },
  { key: 'quarterly', unit: 'quarter' },
  { key: 'yearly', unit: 'year' }
];

const todayYmd = () => new Date().toISOString().slice(0, 10);

export default function MaintenanceScheduleEditor() {
  const { id: editId } = useParams();
  const isNew = !editId;
  const navigate = useNavigate();

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [requestType, setRequestType] = useState('service_request');
  const [category, setCategory] = useState('');
  const [department, setDepartment] = useState('');
  const [assignee, setAssignee] = useState('');
  const [cadence, setCadence] = useState('monthly');
  const [intervalCount, setIntervalCount] = useState(1);
  const [startDate, setStartDate] = useState(todayYmd());
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    api('/api/departments').then((d) => setDepartments(Array.isArray(d) ? d : [])).catch(() => {});
    if (!isNew) {
      setLoading(true);
      api(`/api/maintenance/${editId}`)
        .then((d) => {
          setTitle(d.title || '');
          setDescription(d.description || '');
          setPriority(d.priority || 'normal');
          setRequestType(d.request_type || 'service_request');
          setCategory(d.category || '');
          setDepartment(d.department || '');
          setAssignee(d.assignee || '');
          setCadence(d.cadence || 'monthly');
          setIntervalCount(d.interval_count || 1);
          setStartDate(d.start_date ? String(d.start_date).slice(0, 10) : todayYmd());
          setIsActive(!!d.is_active);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [editId, isNew]);

  const unit = CADENCES.find((c) => c.key === cadence)?.unit || 'period';

  const handleSave = async () => {
    setError('');
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!startDate) { setError('Start date is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        request_type: requestType,
        category: category || null,
        department: department || null,
        assignee: assignee.trim() || null,
        cadence,
        interval_count: Math.max(1, Number(intervalCount) || 1),
        start_date: startDate,
        is_active: isActive
      };
      if (isNew) {
        await api('/api/maintenance', { method: 'POST', body: JSON.stringify(payload) });
        navigate('/tickets/maintenance', { state: { banner: `Schedule "${payload.title}" created.` } });
      } else {
        await api(`/api/maintenance/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        navigate('/tickets/maintenance', { state: { banner: `Schedule "${payload.title}" updated.` } });
      }
    } catch (e) {
      setError(e.message || 'Could not save schedule.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <DashboardHeader />
        <div className="container-app py-20 text-center text-sm text-slate-500">Loading schedule…</div>
      </div>
    );
  }

  const inp = 'block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 bg-white';
  const lbl = 'block text-xs font-semibold text-slate-700 mb-1.5';

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <div className="sticky top-16 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="container-app flex items-center justify-between h-14 gap-4">
          <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 min-w-0">
            <Link to="/dashboard" className="hover:text-slate-800 shrink-0">Dashboard</Link>
            <span className="text-slate-300">/</span>
            <Link to="/tickets/maintenance" className="hover:text-slate-800 shrink-0">Recurring Work Orders</Link>
            <span className="text-slate-300">/</span>
            <span className="text-accent-700 truncate">{isNew ? 'New Schedule' : 'Edit Schedule'}</span>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/tickets/maintenance" className="btn-ghost !px-3 !py-1.5 text-xs">Discard</Link>
            <button onClick={handleSave} disabled={saving} className="btn-primary !px-4 !py-1.5 text-xs disabled:opacity-60">
              {saving ? 'Saving…' : isNew ? 'Create schedule' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      <main className="container-app py-10">
        <div className="mb-8">
          <span className="eyebrow">Recurring Work Orders</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">
            {isNew ? 'New Maintenance Schedule' : 'Edit Maintenance Schedule'}
          </h1>
          <p className="mt-1 text-slate-600">
            Define a work-order template and a cadence. The system will open a new work order each time it's due.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-md bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
          {/* Left: work order template */}
          <div className="space-y-5">
            <fieldset className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
              <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-1 -ml-1">Work order template</legend>
              <div className="mt-4 space-y-4">
                <div>
                  <label className={lbl}>Title <span className="text-rose-500">*</span></label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Quarterly server room inspection"
                    autoFocus={isNew}
                    className={inp}
                  />
                </div>
                <div>
                  <label className={lbl}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="What should be done each time this work order is generated?"
                    className={inp}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={lbl}>Priority</label>
                    <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inp}>
                      {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Request type</label>
                    <select value={requestType} onChange={(e) => setRequestType(e.target.value)} className={inp}>
                      {REQUEST_TYPES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Category</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className={inp}>
                      <option value="">— None —</option>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Department</label>
                    <select value={department} onChange={(e) => setDepartment(e.target.value)} className={inp}>
                      <option value="">— None —</option>
                      {departments.map((d) => <option key={d.id || d.name} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Default assignee</label>
                    <input
                      value={assignee}
                      onChange={(e) => setAssignee(e.target.value)}
                      placeholder="e.g. jdoe or Jane Doe"
                      className={inp}
                    />
                    <p className="mt-1 text-[11px] text-slate-400">Generated work orders are assigned here. Leave blank to triage later.</p>
                  </div>
                </div>
              </div>
            </fieldset>
          </div>

          {/* Right: recurrence */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Recurrence</h3>
              <div className="space-y-4">
                <div>
                  <label className={lbl}>Repeats</label>
                  <select value={cadence} onChange={(e) => setCadence(e.target.value)} className={inp}>
                    {CADENCES.map((c) => (
                      <option key={c.key} value={c.key}>{c.key[0].toUpperCase() + c.key.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Every</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={intervalCount}
                      onChange={(e) => setIntervalCount(e.target.value)}
                      className={inp + ' w-24'}
                    />
                    <span className="text-sm text-slate-600">{unit}{Number(intervalCount) === 1 ? '' : 's'}</span>
                  </div>
                </div>
                <div>
                  <label className={lbl}>Start date <span className="text-rose-500">*</span></label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inp} />
                  <p className="mt-1 text-[11px] text-slate-400">The first work order is generated on this date.</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Status</h3>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500" />
                <span className="text-sm font-medium text-slate-700">Active</span>
              </label>
              <p className="mt-2 text-[11px] text-slate-400">Inactive schedules are paused — no work orders are generated.</p>
            </div>
          </aside>
        </div>

        <div className="mt-8 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-card">
          <p className="text-xs text-slate-500">Set a title, cadence, and start date, then save.</p>
          <div className="flex items-center gap-3">
            <Link to="/tickets/maintenance" className="btn-ghost !px-4 !py-2 text-sm">Cancel</Link>
            <button onClick={handleSave} disabled={saving} className="btn-primary !px-5 !py-2 text-sm disabled:opacity-60">
              {saving ? 'Saving…' : isNew ? 'Create schedule' : 'Save changes'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
