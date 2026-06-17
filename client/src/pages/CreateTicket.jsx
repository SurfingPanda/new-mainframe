import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardHeader from '../components/DashboardHeader.jsx';
import UserPicker from '../components/UserPicker.jsx';
import { api, getUser } from '../lib/auth.js';
import { formatTicketId } from '../lib/ticket.js';
import { CATEGORY_TREE } from '../lib/categories.js';

const TITLE_MAX = 200;
const DESC_MAX = 4000;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = '.png,.jpg,.jpeg,.gif,.webp,.heic,.pdf,.txt,.doc,.docx,.xls,.xlsx,.zip,image/*';

const REQUEST_TYPES = [
  { key: 'service_request', label: 'Service Request', desc: 'Need access, equipment, or a setup.' },
  { key: 'question', label: 'Question / How-to', desc: 'You need information or guidance.' },
  { key: 'change', label: 'Change Request', desc: 'Request a configuration or system change.' }
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

// Picking "HR Concerns" swaps the free-text Description for this structured
// leave-request form; its fields are serialized into the ticket description.
const HR_CONCERNS = 'HR Concerns';
// Selecting this sub-subcategory swaps the Description for an overtime table.
const OVERTIME_FORM = 'Overtime and Accomplishment Report Form';
// Selecting this sub-subcategory swaps the Description for a manpower-request form.
const MANPOWER_FORM = 'Request for Manpower Personnel';
// Selecting this sub-subcategory swaps the Description for a schedule/rest-day change form.
const CHANGE_SCHED_FORM = 'Change Time Schedule / Cancel Restday / Change Restday';
// Picking this category swaps the Description for the EAM-ERP user access form.
// The request type comes from the cascade's sub-subcategory (Access Request Type).
const ERP_ACCESS = 'ERP Access';
const emptyOtRow = () => ({ name: '', otIn: '', otOut: '', hours: '', signature: '' });
const LEAVE_TYPES = [
  'Vacation Leave',
  'Sick Leave',
  'Personal Leave',
  'Bereavement Leave',
  'Emergency Leave',
  'Unpaid Leave',
  'Other'
];

const PRIORITY_OPTIONS = [
  { key: 'low', label: 'Low', desc: 'Minor inconvenience, no business impact.', tone: 'slate' },
  { key: 'normal', label: 'Normal', desc: 'Standard request, response within a day.', tone: 'brand' },
  { key: 'high', label: 'High', desc: 'Affects productivity, needs same-day attention.', tone: 'amber' },
  { key: 'urgent', label: 'Urgent', desc: 'Outage or security issue, page on-call.', tone: 'rose' }
];

export default function CreateTicket() {
  const navigate = useNavigate();
  const user = getUser();
  const isStaff = user?.role === 'admin' || user?.role === 'agent';

  // The signed-in user's saved e-signature, for the overtime report's signature
  // cell. Refreshed from /me so it's current even on an older cached session.
  const [mySignature, setMySignature] = useState(user?.signature_url || null);
  useEffect(() => {
    api('/api/auth/me')
      .then((d) => { if (d && 'signature_url' in d) setMySignature(d.signature_url || null); })
      .catch(() => {});
  }, []);

  const titleId = useId();
  const requestTypeId = useId();
  const categoryId = useId();
  const descId = useId();
  const subcategoryId = useId();
  const subcategory2Id = useId();
  const leaveTypeId = useId();
  const leaveStartId = useId();
  const leaveEndId = useId();
  const mpDateId = useId();
  const mpDurationFromId = useId();
  const mpDurationToId = useId();
  const mpQualificationId = useId();
  const csDateFiledId = useId();
  const csNameId = useId();
  const csSectionId = useId();
  const csCurrentScheduleId = useId();
  const csNewScheduleId = useId();
  const csScheduledRestDayId = useId();
  const csNewRestDayId = useId();
  const csEffectiveDateId = useId();
  const csParticularDateId = useId();
  const erpDateId = useId();
  const erpNameId = useId();
  const erpEmployeeIdId = useId();
  const erpDeptId = useId();
  const erpPositionId = useId();
  const requesterId = useId();
  const departmentId = useId();
  const assigneeId = useId();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requestType, setRequestType] = useState('service_request');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [subcategory2, setSubcategory2] = useState('');
  const [priority, setPriority] = useState('normal');
  const [requester, setRequester] = useState(user?.email || '');
  const [assignee, setAssignee] = useState('');
  const [department, setDepartment] = useState('');
  const [files, setFiles] = useState([]);

  // Leave-request fields (used when category === 'HR Concerns').
  const [leaveType, setLeaveType] = useState('');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');

  // Manpower-request fields (used when the 'Request for Manpower Personnel' sub-subcategory is picked).
  const [mpDateRequested, setMpDateRequested] = useState('');
  const [mpType, setMpType] = useState(''); // 'replacement' | 'additional'
  const [mpReplacementFor, setMpReplacementFor] = useState('');
  const [mpSection, setMpSection] = useState('');
  const [mpDurationFrom, setMpDurationFrom] = useState('');
  const [mpDurationTo, setMpDurationTo] = useState('');
  const [mpQualification, setMpQualification] = useState('');
  const [mpReason, setMpReason] = useState('');

  // Schedule / rest-day change fields (used when that sub-subcategory is picked).
  // Name + section are prefilled from the signed-in user but stay editable.
  const [csDateFiled, setCsDateFiled] = useState('');
  const [csName, setCsName] = useState(user?.name || '');
  const [csSection, setCsSection] = useState(user?.department || '');
  const [csKind, setCsKind] = useState(''); // 'time_schedule' | 'change_rest_day' | 'cancel_rest_day'
  const [csCurrentSchedule, setCsCurrentSchedule] = useState('');
  const [csNewSchedule, setCsNewSchedule] = useState('');
  const [csDuration, setCsDuration] = useState(''); // 'temporary' | 'permanent'
  const [csScheduledRestDay, setCsScheduledRestDay] = useState('');
  const [csNewRestDay, setCsNewRestDay] = useState('');
  const [csReason, setCsReason] = useState('');
  const [csEffectiveDate, setCsEffectiveDate] = useState('');
  const [csParticularDate, setCsParticularDate] = useState('');

  // EAM-ERP user access form fields (used when category === 'ERP Access').
  // Name / department / position are prefilled from the signed-in user but editable.
  const [erpDate, setErpDate] = useState('');
  const [erpName, setErpName] = useState(user?.name || '');
  const [erpEmployeeId, setErpEmployeeId] = useState('');
  const [erpDept, setErpDept] = useState(user?.department || '');
  const [erpPosition, setErpPosition] = useState(user?.job_title || '');
  const [erpAccessDetails, setErpAccessDetails] = useState('');

  // Overtime & Accomplishment Report rows (used when that form sub-subcategory is picked).
  const [otRows, setOtRows] = useState([emptyOtRow()]);

  const [assignableUsers, setAssignableUsers] = useState([]);
  const [directoryUsers, setDirectoryUsers] = useState([]);
  const [deptList, setDeptList] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api('/api/departments')
      .then((rows) => setDeptList((rows || []).filter((d) => d.is_active).map((d) => d.name)))
      .catch(() => setDeptList([]));
    // Only staff use these — non-staff have a read-only requester and can't
    // pick an assignee, so skip the fetches for them.
    if (isStaff) {
      api('/api/users/assignable').then(setAssignableUsers).catch(() => setAssignableUsers([]));
      api('/api/users/directory').then(setDirectoryUsers).catch(() => setDirectoryUsers([]));
    }
  }, [isStaff]);

  const titleCount = title.length;
  const descCount = description.length;
  const titleTooLong = titleCount > TITLE_MAX;
  const descTooLong = descCount > DESC_MAX;
  const titleTooShort = title.trim().length > 0 && title.trim().length < 4;

  const isLeaveRequest = category === HR_CONCERNS;

  // Cascading category options + handlers that reset deeper levels on change.
  const subOptions = category ? Object.keys(CATEGORY_TREE[category] || {}) : [];
  const sub2Options = category && subcategory ? (CATEGORY_TREE[category]?.[subcategory] || []) : [];
  const onCategoryChange = (val) => { setCategory(val); setSubcategory(''); setSubcategory2(''); };
  const onSubcategoryChange = (val) => { setSubcategory(val); setSubcategory2(''); };
  const leaveDatesInvalid = !!(leaveStart && leaveEnd && leaveEnd < leaveStart);
  const leaveIncomplete = !leaveType || !leaveStart || !leaveEnd || leaveDatesInvalid;
  // Auto-derived from the dates (inclusive calendar days) — shown read-only and
  // recorded on the work order so HR sees the span at a glance.
  const leaveDayCount = leaveStart && leaveEnd && !leaveDatesInvalid
    ? Math.round((new Date(`${leaveEnd}T00:00:00Z`) - new Date(`${leaveStart}T00:00:00Z`)) / 86400000) + 1
    : null;
  const leaveInclusiveText = leaveStart && leaveEnd && !leaveDatesInvalid
    ? formatInclusiveDates(leaveStart, leaveEnd)
    : '';

  // The overtime and manpower forms take precedence over the leave form when
  // their specific sub-subcategory is selected.
  const isOvertimeForm = subcategory2 === OVERTIME_FORM;
  const isManpowerForm = isLeaveRequest && subcategory2 === MANPOWER_FORM;
  const isChangeSchedForm = isLeaveRequest && subcategory2 === CHANGE_SCHED_FORM;
  const showLeaveForm = isLeaveRequest && !isOvertimeForm && !isManpowerForm && !isChangeSchedForm;
  const overtimeIncomplete = isOvertimeForm && !otRows.some((r) => r.name.trim());
  const mpDurationInvalid = !!(mpDurationFrom && mpDurationTo && mpDurationTo < mpDurationFrom);
  const manpowerIncomplete = isManpowerForm && (
    !mpDateRequested ||
    !mpType ||
    (mpType === 'replacement' && !mpReplacementFor.trim()) ||
    (mpType === 'additional' && !mpSection.trim()) ||
    !mpQualification.trim() ||
    !mpReason.trim() ||
    mpDurationInvalid
  );
  const changeSchedIncomplete = isChangeSchedForm && (
    !csDateFiled ||
    !csName.trim() ||
    !csKind ||
    (csKind === 'time_schedule' && (!csNewSchedule.trim() || !csDuration)) ||
    (csKind === 'change_rest_day' && !csNewRestDay.trim()) ||
    (csKind === 'cancel_rest_day' && !csScheduledRestDay.trim()) ||
    !csReason.trim()
  );

  // The ERP access form replaces the free-text Description for the whole 'ERP Access'
  // category. The request type is the sub-subcategory (Access Request Type) chosen in
  // the cascade; access requirements are required for new/movement requests only.
  const isErpForm = category === ERP_ACCESS;
  const erpNeedsDetails = subcategory2 === 'New access request' || subcategory2 === 'Modify access / role';
  const erpIncomplete = isErpForm && (
    !erpDate ||
    !erpName.trim() ||
    !subcategory2 ||
    (erpNeedsDetails && !erpAccessDetails.trim())
  );

  // Departments that have at least one assignable user — picking one filters
  // the assignee list to that department's people.
  // Active departments from the admin list, unioned with any department an
  // assignable user already belongs to (covers legacy/mismatched data).
  const departments = useMemo(
    () => [...new Set([...deptList, ...assignableUsers.map((u) => u.department).filter(Boolean)])].sort(),
    [deptList, assignableUsers]
  );

  const assigneeChoices = useMemo(
    () => (department ? assignableUsers.filter((u) => u.department === department) : assignableUsers),
    [assignableUsers, department]
  );

  // Changing the department drops an assignee who isn't part of it.
  const onDepartmentChange = (d) => {
    setDepartment(d);
    if (d && assignee && !assignableUsers.some((u) => u.name === assignee && u.department === d)) {
      setAssignee('');
    }
  };

  const canSubmit = useMemo(
    () =>
      title.trim().length >= 4 &&
      requester.trim() &&
      (isLeaveRequest || department) &&
      !titleTooLong &&
      !descTooLong &&
      !(showLeaveForm && leaveIncomplete) &&
      !overtimeIncomplete &&
      !manpowerIncomplete &&
      !changeSchedIncomplete &&
      !erpIncomplete &&
      !submitting,
    [title, requester, department, isLeaveRequest, titleTooLong, descTooLong, showLeaveForm, leaveIncomplete, overtimeIncomplete, manpowerIncomplete, changeSchedIncomplete, erpIncomplete, submitting]
  );

  const isDirty = useMemo(
    () =>
      title.trim() !== '' ||
      description.trim() !== '' ||
      category !== '' ||
      subcategory !== '' ||
      subcategory2 !== '' ||
      department !== '' ||
      assignee.trim() !== '' ||
      requestType !== 'service_request' ||
      priority !== 'normal' ||
      files.length > 0 ||
      leaveType !== '' ||
      leaveStart !== '' ||
      leaveEnd !== '' ||
      leaveReason.trim() !== '' ||
      otRows.some((r) => r.name || r.otIn || r.otOut || r.hours || r.signature) ||
      mpDateRequested !== '' ||
      mpType !== '' ||
      mpReplacementFor.trim() !== '' ||
      mpSection.trim() !== '' ||
      mpDurationFrom !== '' ||
      mpDurationTo !== '' ||
      mpQualification.trim() !== '' ||
      mpReason.trim() !== '' ||
      csDateFiled !== '' ||
      csName.trim() !== (user?.name || '').trim() ||
      csSection.trim() !== (user?.department || '').trim() ||
      csKind !== '' ||
      csCurrentSchedule.trim() !== '' ||
      csNewSchedule.trim() !== '' ||
      csDuration !== '' ||
      csScheduledRestDay.trim() !== '' ||
      csNewRestDay.trim() !== '' ||
      csReason.trim() !== '' ||
      csEffectiveDate !== '' ||
      csParticularDate !== '' ||
      erpDate !== '' ||
      erpName.trim() !== (user?.name || '').trim() ||
      erpEmployeeId.trim() !== '' ||
      erpDept.trim() !== (user?.department || '').trim() ||
      erpPosition.trim() !== (user?.job_title || '').trim() ||
      erpAccessDetails.trim() !== '' ||
      requester.trim() !== (user?.email || '').trim(),
    [title, description, category, subcategory, subcategory2, department, assignee, requestType, priority, files, leaveType, leaveStart, leaveEnd, leaveReason, otRows, mpDateRequested, mpType, mpReplacementFor, mpSection, mpDurationFrom, mpDurationTo, mpQualification, mpReason, csDateFiled, csName, csSection, csKind, csCurrentSchedule, csNewSchedule, csDuration, csScheduledRestDay, csNewRestDay, csReason, csEffectiveDate, csParticularDate, erpDate, erpName, erpEmployeeId, erpDept, erpPosition, erpAccessDetails, requester, user?.email, user?.name, user?.department, user?.job_title]
  );

  // Warn before a full-page unload (refresh / close / external link) when the
  // form has unsaved input. In-app Cancel goes through handleCancel below.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleCancel = () => {
    if (isDirty && !window.confirm('Discard this work order? Your changes will be lost.')) return;
    navigate('/tickets/all');
  };

  // Flatten the leave-request form into the ticket description text.
  const buildLeaveDescription = () => {
    const lines = [
      'Leave Request',
      `Leave Type: ${leaveType}`,
      `Start Date: ${leaveStart}`,
      `End Date: ${leaveEnd}`
    ];
    if (leaveDayCount != null) lines.push(`Number of Day(s): ${leaveDayCount}`);
    if (leaveInclusiveText) lines.push(`Inclusive Date(s): ${leaveInclusiveText}`);
    if (leaveReason.trim()) lines.push('', `Reason / Details: ${leaveReason.trim()}`);
    return lines.join('\n');
  };

  // Flatten the manpower-request form into the ticket description text.
  const buildManpowerDescription = () => {
    const lines = ['Request for Manpower Personnel'];
    if (mpDateRequested) lines.push(`Date Requested: ${mpDateRequested}`);
    if (mpType === 'replacement') {
      lines.push(`As a Replacement to: ${mpReplacementFor.trim()}`);
    } else if (mpType === 'additional') {
      lines.push(`As Additional Manpower in (section/department): ${mpSection.trim()}`);
      if (mpDurationFrom || mpDurationTo) {
        lines.push(`Duration: ${mpDurationFrom || '—'} to ${mpDurationTo || '—'}`);
      }
    }
    if (mpQualification.trim()) lines.push('', `Qualification: ${mpQualification.trim()}`);
    if (mpReason.trim()) lines.push('', `Reason for request: ${mpReason.trim()}`);
    return lines.join('\n');
  };

  // Flatten the schedule / rest-day change form into the ticket description text.
  const buildChangeScheduleDescription = () => {
    const lines = ['Change Time Schedule / Rest Day Request'];
    if (csDateFiled) lines.push(`Date Filed: ${csDateFiled}`);
    if (csName.trim()) lines.push(`Name: ${csName.trim()}`);
    if (csSection.trim()) lines.push(`Section/Department: ${csSection.trim()}`);
    lines.push('');
    if (csKind === 'time_schedule') {
      lines.push('Change of Working Time Schedule');
      if (csCurrentSchedule.trim()) lines.push(`Working Time Schedule: ${csCurrentSchedule.trim()}`);
      lines.push(`New Working Time Schedule: ${csNewSchedule.trim()}`);
      if (csDuration) lines.push(`Type: ${csDuration === 'permanent' ? 'Permanently' : 'Temporary'}`);
    } else if (csKind === 'change_rest_day') {
      lines.push('Change of Rest Day');
      if (csScheduledRestDay.trim()) lines.push(`Scheduled Rest Day: ${csScheduledRestDay.trim()}`);
      lines.push(`New Rest Day: ${csNewRestDay.trim()}`);
    } else if (csKind === 'cancel_rest_day') {
      lines.push('Cancellation of Rest Day');
      if (csScheduledRestDay.trim()) lines.push(`Rest Day to Cancel: ${csScheduledRestDay.trim()}`);
    }
    if (csReason.trim()) lines.push('', `Reason: ${csReason.trim()}`);
    if (csEffectiveDate) lines.push('', `Effectivity Date (if permanently): ${csEffectiveDate}`);
    if (csParticularDate) lines.push(`Particular Date (if temporarily): ${csParticularDate}`);
    return lines.join('\n');
  };

  // Flatten the EAM-ERP user access form into the ticket description text.
  const buildErpDescription = () => {
    const lines = ['EAM-ERP User Access / Deactivation Request'];
    if (erpDate) lines.push(`Date: ${erpDate}`);
    if (subcategory2) lines.push(`Request Type: ${subcategory2}`);
    if (subcategory) lines.push(`ERP Module: ${subcategory}`);
    lines.push('', 'Employee Information');
    if (erpName.trim()) lines.push(`Name: ${erpName.trim()}`);
    if (erpEmployeeId.trim()) lines.push(`Employee ID: ${erpEmployeeId.trim()}`);
    if (erpDept.trim()) lines.push(`Department: ${erpDept.trim()}`);
    if (erpPosition.trim()) lines.push(`Position: ${erpPosition.trim()}`);
    if (erpAccessDetails.trim()) lines.push('', `Access Requirements / Changes: ${erpAccessDetails.trim()}`);
    return lines.join('\n');
  };

  // Flatten the overtime table into the ticket description text.
  const overtimeFilledRows = () =>
    otRows.filter((r) => r.name.trim() || r.otIn || r.otOut || r.hours.trim() || r.signatureUrl);

  const buildOvertimeDescription = () => {
    const lines = [
      'Overtime and Accomplishment Report',
      '',
      'Name | OT-In | OT-Out | Hours Rendered | Employee Signature'
    ];
    for (const r of overtimeFilledRows()) {
      const sig = r.signatureUrl ? `${r.signature.trim() || 'E-signature'} (e-signed)` : r.signature.trim();
      lines.push(`${r.name.trim() || '—'} | ${r.otIn || '—'} | ${r.otOut || '—'} | ${r.hours.trim() || '—'} | ${sig}`);
    }
    return lines.join('\n');
  };

  // Overtime row helpers.
  const setOtField = (i, field, val) => setOtRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));
  const addOtRow = () => setOtRows((rows) => [...rows, emptyOtRow()]);
  const removeOtRow = (i) => setOtRows((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows));
  // Apply the signed-in user's saved e-signature to a row (renders as an image
  // on the printed report); clearing it restores the text field.
  const applyMySignature = (i) =>
    setOtRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, signatureUrl: mySignature, signature: r.signature || user?.name || '' } : r)));
  const clearSignature = (i) =>
    setOtRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, signatureUrl: '' } : r)));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!canSubmit) {
      if (!title.trim()) setError('Please add a title before submitting.');
      else if (title.trim().length < 4) setError('Title needs at least 4 characters.');
      else if (!requester.trim()) setError('Please confirm the requester before submitting.');
      else if (!isLeaveRequest && !department) setError('Please select a department before submitting.');
      else if (overtimeIncomplete) setError('Add at least one employee name to the overtime report.');
      else if (isManpowerForm && mpDurationInvalid) setError('Duration end date must be on or after the start date.');
      else if (manpowerIncomplete) setError('Please complete the manpower request details before submitting.');
      else if (changeSchedIncomplete) setError('Please complete the schedule change details before submitting.');
      else if (erpIncomplete) setError('Please complete the ERP access request details before submitting.');
      else if (showLeaveForm && leaveDatesInvalid) setError('End date must be on or after the start date.');
      else if (showLeaveForm && leaveIncomplete) setError('Please fill in the leave type and dates before submitting.');
      else setError('Please fix the highlighted fields before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      const finalDescription = isOvertimeForm
        ? buildOvertimeDescription()
        : isManpowerForm
          ? buildManpowerDescription()
          : isChangeSchedForm
            ? buildChangeScheduleDescription()
            : isErpForm
              ? buildErpDescription()
              : showLeaveForm
                ? buildLeaveDescription()
                : description.trim();
      if (finalDescription) fd.append('description', finalDescription);
      fd.append('priority', priority);
      fd.append('request_type', requestType);
      if (category) fd.append('category', category);
      if (subcategory) fd.append('subcategory', subcategory);
      if (subcategory2) fd.append('subcategory2', subcategory2);
      if (isOvertimeForm) {
        const rows = overtimeFilledRows().map((r) => ({
          name: r.name.trim(), otIn: r.otIn, otOut: r.otOut, hours: r.hours.trim(),
          signature: r.signature.trim(), signatureUrl: r.signatureUrl || ''
        }));
        if (rows.length) fd.append('overtime_report', JSON.stringify(rows));
      }
      if (department) fd.append('department', department);
      fd.append('requester', requester.trim());
      if (assignee.trim()) fd.append('assignee', assignee.trim());
      for (const f of files) fd.append('attachments', f);

      const created = await api('/api/tickets', { method: 'POST', body: fd });
      navigate('/tickets/all', {
        state: {
          banner: {
            type: 'success',
            text: `Work order ${formatTicketId(created.id)} created${
              files.length ? ` with ${files.length} attachment${files.length === 1 ? '' : 's'}` : ''
            }.`
          }
        }
      });
    } catch (err) {
      setError(err.message || 'Could not create the work order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader />

      <main className="container-app py-10 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-800">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to="/tickets/all" className="hover:text-slate-800">Work Orders</Link>
          <span className="text-slate-300">/</span>
          <span className="text-accent-700">Create New Work Order</span>
        </nav>

        <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Work Orders</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900">Create New Work Order</h1>
            <p className="mt-1 text-slate-600">
              Describe the issue or request. The IT team will triage and respond based on priority.
            </p>
          </div>
          <button type="button" onClick={handleCancel} className="btn-ghost !px-3 !py-2 text-xs self-start md:self-auto">
            Cancel
          </button>
        </section>

        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card title="Issue details">
              <Field
                label="Title"
                htmlFor={titleId}
                hint="A short summary of the issue. Be specific."
                error={titleTooShort ? 'Title needs at least 4 characters.' : ''}
                required
                trailing={<CharCount value={titleCount} max={TITLE_MAX} />}
              >
                <input
                  id={titleId}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Outlook keeps asking for credentials"
                  maxLength={TITLE_MAX}
                  className={inputCls(titleTooLong || titleTooShort)}
                  aria-required="true"
                  aria-invalid={titleTooShort || titleTooLong}
                  autoFocus
                />
              </Field>

              <KbSuggestions query={title} category={category} />

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Request Type" htmlFor={requestTypeId} hint="What kind of work order is this?" required>
                  <select
                    id={requestTypeId}
                    value={requestType}
                    onChange={(e) => setRequestType(e.target.value)}
                    className={inputCls(false)}
                  >
                    {REQUEST_TYPES.map((r) => (
                      <option key={r.key} value={r.key}>{r.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {REQUEST_TYPES.find((r) => r.key === requestType)?.desc}
                  </p>
                </Field>

                <Field label="Category" htmlFor={categoryId} hint="Helps route the work order to the right team.">
                  <select
                    id={categoryId}
                    value={category}
                    onChange={(e) => onCategoryChange(e.target.value)}
                    className={inputCls(false)}
                  >
                    <option value="">Select a category…</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {subOptions.length > 0 && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Subcategory" htmlFor={subcategoryId} hint={`Narrow down within ${category}.`}>
                    <select
                      id={subcategoryId}
                      value={subcategory}
                      onChange={(e) => onSubcategoryChange(e.target.value)}
                      className={inputCls(false)}
                    >
                      <option value="">Select a subcategory…</option>
                      {subOptions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </Field>

                  {sub2Options.length > 0 && (
                    <Field
                      label={isErpForm ? 'Access Request Type' : 'Sub-subcategory'}
                      htmlFor={subcategory2Id}
                      required={isErpForm}
                      hint={isErpForm ? 'The kind of ERP access request.' : `Narrow down within ${subcategory}.`}
                    >
                      <select
                        id={subcategory2Id}
                        value={subcategory2}
                        onChange={(e) => setSubcategory2(e.target.value)}
                        className={inputCls(false)}
                        aria-required={isErpForm}
                      >
                        <option value="">{isErpForm ? 'Select a request type…' : 'Select a sub-subcategory…'}</option>
                        {sub2Options.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
              )}

              {isOvertimeForm ? (
                <div className="space-y-3">
                  <div className="rounded-md bg-brand-50 ring-1 ring-brand-100 px-3 py-2 text-[11px] text-brand-800">
                    Overtime &amp; Accomplishment Report — add a row per employee. It'll be recorded on the work order.
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <th className="px-2 py-2 text-left">Name</th>
                          <th className="px-2 py-2 text-left">OT-In</th>
                          <th className="px-2 py-2 text-left">OT-Out</th>
                          <th className="px-2 py-2 text-left">Hours Rendered</th>
                          <th className="px-2 py-2 text-left">Employee Signature</th>
                          <th className="w-8 px-1 py-2" aria-label="Remove" />
                        </tr>
                      </thead>
                      <tbody>
                        {otRows.map((r, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-1.5 py-1">
                              <input value={r.name} onChange={(e) => setOtField(i, 'name', e.target.value)} placeholder="Employee name" className={otCell} />
                            </td>
                            <td className="px-1.5 py-1">
                              <input type="time" value={r.otIn} onChange={(e) => setOtField(i, 'otIn', e.target.value)} className={otCell} />
                            </td>
                            <td className="px-1.5 py-1">
                              <input type="time" value={r.otOut} onChange={(e) => setOtField(i, 'otOut', e.target.value)} className={otCell} />
                            </td>
                            <td className="px-1.5 py-1">
                              <input value={r.hours} onChange={(e) => setOtField(i, 'hours', e.target.value)} placeholder="e.g. 3" inputMode="decimal" className={otCell} />
                            </td>
                            <td className="px-1.5 py-1">
                              {r.signatureUrl ? (
                                <div className="flex items-center gap-2">
                                  <img src={r.signatureUrl} alt="E-signature" className="h-8 max-w-[120px] object-contain" />
                                  <button type="button" onClick={() => clearSignature(i)} aria-label="Remove signature" className="shrink-0 rounded p-1 text-slate-400 hover:text-rose-600">
                                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <input value={r.signature} onChange={(e) => setOtField(i, 'signature', e.target.value)} placeholder="Signed on print" className={otCell} />
                                  {mySignature && (
                                    <button type="button" onClick={() => applyMySignature(i)} title="Use my e-signature" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-accent-200 bg-accent-50 px-1.5 py-1 text-[10px] font-semibold text-accent-700 hover:bg-accent-100">
                                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                                      Use mine
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-1 py-1 text-center">
                              <button type="button" onClick={() => removeOtRow(i)} disabled={otRows.length === 1} aria-label="Remove row" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30">
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={addOtRow} className="inline-flex items-center gap-1 text-xs font-semibold text-accent-700 hover:text-accent-900">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                    Add row
                  </button>
                </div>
              ) : isManpowerForm ? (
                <div className="space-y-5">
                  <div className="rounded-md bg-brand-50 ring-1 ring-brand-100 px-3 py-2 text-[11px] text-brand-800">
                    Requesting manpower personnel. Complete the details below — they'll be recorded on the work order.
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Date Requested" htmlFor={mpDateId} required>
                      <input
                        id={mpDateId}
                        type="date"
                        value={mpDateRequested}
                        onChange={(e) => setMpDateRequested(e.target.value)}
                        className={inputCls(false)}
                        aria-required="true"
                      />
                    </Field>
                  </div>
                  <Field label="Request Type" required>
                    <div className="space-y-3">
                      <label className="flex items-start gap-2.5">
                        <input
                          type="radio"
                          name="mpType"
                          checked={mpType === 'replacement'}
                          onChange={() => setMpType('replacement')}
                          className="mt-2.5 h-4 w-4 shrink-0 accent-brand-600"
                        />
                        <div className="flex-1">
                          <span className="text-sm text-slate-700">As a Replacement to</span>
                          <input
                            value={mpReplacementFor}
                            onFocus={() => setMpType('replacement')}
                            onChange={(e) => setMpReplacementFor(e.target.value)}
                            placeholder="Name of person being replaced"
                            className={`mt-1 ${inputCls(false)}`}
                          />
                        </div>
                      </label>
                      <label className="flex items-start gap-2.5">
                        <input
                          type="radio"
                          name="mpType"
                          checked={mpType === 'additional'}
                          onChange={() => setMpType('additional')}
                          className="mt-2.5 h-4 w-4 shrink-0 accent-brand-600"
                        />
                        <div className="flex-1">
                          <span className="text-sm text-slate-700">As Additional Manpower in (section / department)</span>
                          <input
                            value={mpSection}
                            onFocus={() => setMpType('additional')}
                            onChange={(e) => setMpSection(e.target.value)}
                            placeholder="Section / department"
                            className={`mt-1 ${inputCls(false)}`}
                          />
                        </div>
                      </label>
                    </div>
                  </Field>
                  {mpType === 'additional' && (
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Duration From" htmlFor={mpDurationFromId} hint="For additional manpower only.">
                        <input
                          id={mpDurationFromId}
                          type="date"
                          value={mpDurationFrom}
                          onChange={(e) => setMpDurationFrom(e.target.value)}
                          className={inputCls(false)}
                        />
                      </Field>
                      <Field
                        label="Duration To"
                        htmlFor={mpDurationToId}
                        error={mpDurationInvalid ? 'End date must be on or after the start date.' : ''}
                      >
                        <input
                          id={mpDurationToId}
                          type="date"
                          min={mpDurationFrom || undefined}
                          value={mpDurationTo}
                          onChange={(e) => setMpDurationTo(e.target.value)}
                          className={inputCls(mpDurationInvalid)}
                          aria-invalid={mpDurationInvalid}
                        />
                      </Field>
                    </div>
                  )}
                  <Field
                    label="Qualification"
                    htmlFor={mpQualificationId}
                    required
                    hint="Skills, experience, or requirements for the role."
                  >
                    <textarea
                      id={mpQualificationId}
                      rows={3}
                      value={mpQualification}
                      onChange={(e) => setMpQualification(e.target.value)}
                      placeholder="Required qualifications for the position."
                      className={`${inputCls(false)} resize-y leading-relaxed`}
                      aria-required="true"
                    />
                  </Field>
                  <Field label="Reason for Request" htmlFor={descId} required>
                    <textarea
                      id={descId}
                      rows={4}
                      value={mpReason}
                      onChange={(e) => setMpReason(e.target.value)}
                      placeholder="State the reason for your manpower request."
                      className={`${inputCls(false)} resize-y leading-relaxed`}
                      aria-required="true"
                    />
                  </Field>
                </div>
              ) : isChangeSchedForm ? (
                <div className="space-y-5">
                  <div className="rounded-md bg-brand-50 ring-1 ring-brand-100 px-3 py-2 text-[11px] text-brand-800">
                    Requesting a change of time schedule or rest day. Complete the details below — they'll be recorded on the work order.
                  </div>
                  <div className="grid gap-5 sm:grid-cols-3">
                    <Field label="Date Filed" htmlFor={csDateFiledId} required>
                      <input
                        id={csDateFiledId}
                        type="date"
                        value={csDateFiled}
                        onChange={(e) => setCsDateFiled(e.target.value)}
                        className={inputCls(false)}
                        aria-required="true"
                      />
                    </Field>
                    <Field label="Name" htmlFor={csNameId} required>
                      <input
                        id={csNameId}
                        value={csName}
                        onChange={(e) => setCsName(e.target.value)}
                        placeholder="Employee name"
                        className={inputCls(false)}
                        aria-required="true"
                      />
                    </Field>
                    <Field label="Section / Department" htmlFor={csSectionId}>
                      <input
                        id={csSectionId}
                        value={csSection}
                        onChange={(e) => setCsSection(e.target.value)}
                        placeholder="Section / department"
                        className={inputCls(false)}
                      />
                    </Field>
                  </div>
                  <Field label="Request Type" required>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {[
                        { key: 'time_schedule', label: 'Change Time Schedule' },
                        { key: 'change_rest_day', label: 'Change Rest Day' },
                        { key: 'cancel_rest_day', label: 'Cancel Rest Day' }
                      ].map((opt) => (
                        <label
                          key={opt.key}
                          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${
                            csKind === opt.key ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-700'
                          }`}
                        >
                          <input
                            type="radio"
                            name="csKind"
                            checked={csKind === opt.key}
                            onChange={() => setCsKind(opt.key)}
                            className="h-4 w-4 accent-brand-600"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </Field>
                  {csKind === 'time_schedule' && (
                    <div className="space-y-5 rounded-md border border-slate-200 px-4 py-4">
                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field label="Working Time Schedule" htmlFor={csCurrentScheduleId} hint="Current schedule.">
                          <input
                            id={csCurrentScheduleId}
                            value={csCurrentSchedule}
                            onChange={(e) => setCsCurrentSchedule(e.target.value)}
                            placeholder="e.g. 8:00 AM – 5:00 PM"
                            className={inputCls(false)}
                          />
                        </Field>
                        <Field label="New Working Time Schedule" htmlFor={csNewScheduleId} required>
                          <input
                            id={csNewScheduleId}
                            value={csNewSchedule}
                            onChange={(e) => setCsNewSchedule(e.target.value)}
                            placeholder="e.g. 10:00 AM – 7:00 PM"
                            className={inputCls(false)}
                            aria-required="true"
                          />
                        </Field>
                      </div>
                      <Field label="Duration" required>
                        <div className="flex gap-4">
                          {[
                            { key: 'temporary', label: 'Temporary' },
                            { key: 'permanent', label: 'Permanently' }
                          ].map((opt) => (
                            <label key={opt.key} className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="radio"
                                name="csDuration"
                                checked={csDuration === opt.key}
                                onChange={() => setCsDuration(opt.key)}
                                className="h-4 w-4 accent-brand-600"
                              />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                      </Field>
                    </div>
                  )}
                  {csKind === 'change_rest_day' && (
                    <div className="grid gap-5 sm:grid-cols-2 rounded-md border border-slate-200 px-4 py-4">
                      <Field label="Scheduled Rest Day" htmlFor={csScheduledRestDayId} hint="Current rest day.">
                        <input
                          id={csScheduledRestDayId}
                          value={csScheduledRestDay}
                          onChange={(e) => setCsScheduledRestDay(e.target.value)}
                          placeholder="e.g. Sunday"
                          className={inputCls(false)}
                        />
                      </Field>
                      <Field label="New Rest Day" htmlFor={csNewRestDayId} required>
                        <input
                          id={csNewRestDayId}
                          value={csNewRestDay}
                          onChange={(e) => setCsNewRestDay(e.target.value)}
                          placeholder="e.g. Wednesday"
                          className={inputCls(false)}
                          aria-required="true"
                        />
                      </Field>
                    </div>
                  )}
                  {csKind === 'cancel_rest_day' && (
                    <div className="rounded-md border border-slate-200 px-4 py-4">
                      <Field label="Rest Day to Cancel" htmlFor={csScheduledRestDayId} required>
                        <input
                          id={csScheduledRestDayId}
                          value={csScheduledRestDay}
                          onChange={(e) => setCsScheduledRestDay(e.target.value)}
                          placeholder="e.g. Sunday"
                          className={inputCls(false)}
                          aria-required="true"
                        />
                      </Field>
                    </div>
                  )}
                  <Field label="Reason" htmlFor={descId} required>
                    <textarea
                      id={descId}
                      rows={4}
                      value={csReason}
                      onChange={(e) => setCsReason(e.target.value)}
                      placeholder="Please indicate the reason for your request."
                      className={`${inputCls(false)} resize-y leading-relaxed`}
                      aria-required="true"
                    />
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Effectivity Date" htmlFor={csEffectiveDateId} hint="If permanently.">
                      <input
                        id={csEffectiveDateId}
                        type="date"
                        value={csEffectiveDate}
                        onChange={(e) => setCsEffectiveDate(e.target.value)}
                        className={inputCls(false)}
                      />
                    </Field>
                    <Field label="Particular Date" htmlFor={csParticularDateId} hint="If temporarily.">
                      <input
                        id={csParticularDateId}
                        type="date"
                        value={csParticularDate}
                        onChange={(e) => setCsParticularDate(e.target.value)}
                        className={inputCls(false)}
                      />
                    </Field>
                  </div>
                </div>
              ) : isErpForm ? (
                <div className="space-y-5">
                  <div className="rounded-md bg-brand-50 ring-1 ring-brand-100 px-3 py-2 text-[11px] text-brand-800">
                    EAM-ERP User Access / Deactivation Form. Complete the details below — they'll be recorded on the work order.
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Date" htmlFor={erpDateId} required>
                      <input
                        id={erpDateId}
                        type="date"
                        value={erpDate}
                        onChange={(e) => setErpDate(e.target.value)}
                        className={inputCls(false)}
                        aria-required="true"
                      />
                    </Field>
                  </div>
                  <div className="rounded-md border border-slate-200 px-4 py-4 space-y-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employee Information</p>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Name" htmlFor={erpNameId} required>
                        <input
                          id={erpNameId}
                          value={erpName}
                          onChange={(e) => setErpName(e.target.value)}
                          placeholder="Employee name"
                          className={inputCls(false)}
                          aria-required="true"
                        />
                      </Field>
                      <Field label="Employee ID" htmlFor={erpEmployeeIdId}>
                        <input
                          id={erpEmployeeIdId}
                          value={erpEmployeeId}
                          onChange={(e) => setErpEmployeeId(e.target.value)}
                          placeholder="e.g. EMP-00123"
                          className={inputCls(false)}
                        />
                      </Field>
                      <Field label="Department" htmlFor={erpDeptId}>
                        <input
                          id={erpDeptId}
                          value={erpDept}
                          onChange={(e) => setErpDept(e.target.value)}
                          placeholder="Department"
                          className={inputCls(false)}
                        />
                      </Field>
                      <Field label="Position" htmlFor={erpPositionId}>
                        <input
                          id={erpPositionId}
                          value={erpPosition}
                          onChange={(e) => setErpPosition(e.target.value)}
                          placeholder="Job title / position"
                          className={inputCls(false)}
                        />
                      </Field>
                    </div>
                  </div>
                  <Field
                    label="Access Requirements / Changes"
                    htmlFor={descId}
                    required={erpNeedsDetails}
                    hint="For new or movement requests, specify the access needed or change."
                  >
                    <textarea
                      id={descId}
                      rows={4}
                      value={erpAccessDetails}
                      onChange={(e) => setErpAccessDetails(e.target.value)}
                      placeholder="Specify the ERP access needed, role, or change required."
                      className={`${inputCls(false)} resize-y leading-relaxed`}
                      aria-required={erpNeedsDetails}
                    />
                  </Field>
                </div>
              ) : showLeaveForm ? (
                <div className="space-y-5">
                  <div className="rounded-md bg-brand-50 ring-1 ring-brand-100 px-3 py-2 text-[11px] text-brand-800">
                    Filing an HR leave request. Complete the details below — they'll be recorded on the work order.
                  </div>
                  <div className="grid gap-5 sm:grid-cols-3">
                    <Field label="Leave Type" htmlFor={leaveTypeId} required>
                      <select
                        id={leaveTypeId}
                        value={leaveType}
                        onChange={(e) => setLeaveType(e.target.value)}
                        className={inputCls(false)}
                        aria-required="true"
                      >
                        <option value="">Select…</option>
                        {LEAVE_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Start Date" htmlFor={leaveStartId} required>
                      <input
                        id={leaveStartId}
                        type="date"
                        value={leaveStart}
                        onChange={(e) => setLeaveStart(e.target.value)}
                        className={inputCls(false)}
                        aria-required="true"
                      />
                    </Field>
                    <Field
                      label="End Date"
                      htmlFor={leaveEndId}
                      required
                      error={leaveDatesInvalid ? 'End date must be on or after the start date.' : ''}
                    >
                      <input
                        id={leaveEndId}
                        type="date"
                        min={leaveStart || undefined}
                        value={leaveEnd}
                        onChange={(e) => setLeaveEnd(e.target.value)}
                        className={inputCls(leaveDatesInvalid)}
                        aria-required="true"
                        aria-invalid={leaveDatesInvalid}
                      />
                    </Field>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Number of Day(s)" hint="Auto-calculated from the dates (inclusive).">
                      <div className="block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {leaveDayCount != null ? `${leaveDayCount} ${leaveDayCount === 1 ? 'day' : 'days'}` : <span className="text-slate-400">Set the dates above</span>}
                      </div>
                    </Field>
                    <Field label="Inclusive Date(s)" hint="The leave period covered.">
                      <div className="block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {leaveInclusiveText || <span className="text-slate-400">Set the dates above</span>}
                      </div>
                    </Field>
                  </div>
                  <Field
                    label="Reason / Details"
                    htmlFor={descId}
                    hint="Optional — add any context for HR (coverage, contact info, etc.)."
                  >
                    <textarea
                      id={descId}
                      rows={5}
                      value={leaveReason}
                      onChange={(e) => setLeaveReason(e.target.value)}
                      placeholder="Reason for the leave, coverage arrangements, anything HR should know."
                      className={`${inputCls(false)} resize-y leading-relaxed`}
                    />
                  </Field>
                  <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800">
                    <p>Please note that scheduled leave must be filed one (1) week prior to the intended date of leave.</p>
                    <p className="mt-1">*Sick leave must be supported with medical certificate.</p>
                  </div>
                </div>
              ) : (
                <Field
                  label="Description"
                  htmlFor={descId}
                  hint="Steps to reproduce, error messages, screenshot links — anything that helps."
                  error={descTooLong ? `Description is over the ${DESC_MAX}-character limit.` : ''}
                  trailing={<CharCount value={descCount} max={DESC_MAX} />}
                >
                  <textarea
                    id={descId}
                    rows={8}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={descPlaceholder}
                    className={`${inputCls(descTooLong)} resize-y leading-relaxed`}
                    aria-invalid={descTooLong}
                  />
                </Field>
              )}
            </Card>

            <Card title="Attachments" subtitle={`Up to ${MAX_FILES} files · 10 MB each · images, PDFs, Office docs, ZIP`}>
              <FileDropzone files={files} setFiles={setFiles} setError={setError} />
            </Card>
          </div>

          <aside className="space-y-6">
            <Card title="Priority" subtitle="How quickly does this need attention?">
              <div className="grid gap-2">
                {PRIORITY_OPTIONS.map((p) => (
                  <PriorityRadio
                    key={p.key}
                    option={p}
                    checked={priority === p.key}
                    onChange={() => setPriority(p.key)}
                  />
                ))}
              </div>
            </Card>

            <Card title="People">
              <Field label="Requester" htmlFor={requesterId} hint="Person reporting the issue." required>
                {isStaff ? (
                  <UserPicker
                    id={requesterId}
                    value={requester}
                    users={directoryUsers}
                    onChange={setRequester}
                    placeholder="Type to search users or enter a name"
                  />
                ) : (
                  <>
                    <input
                      id={requesterId}
                      value={requester}
                      onChange={(e) => setRequester(e.target.value)}
                      placeholder="username or email"
                      className={inputCls(false)}
                      aria-required="true"
                      readOnly
                    />
                    <p className="mt-1 text-[11px] text-slate-500">Requester is locked to your account.</p>
                  </>
                )}
              </Field>

              {isLeaveRequest ? (
                <div className="rounded-md bg-sky-50 ring-1 ring-sky-200 px-3 py-2.5 text-xs text-sky-800">
                  <span className="font-semibold">Needs approval.</span> This request is sent to your
                  department manager first; once approved it’s routed to HR. No need to pick a
                  department or assignee.
                </div>
              ) : (
                <>
                  <Field
                    label="Department"
                    htmlFor={departmentId}
                    required
                    hint={
                      department
                        ? `Assignee list is filtered to ${department}.`
                        : 'Route this work order to a department.'
                    }
                  >
                    <select
                      id={departmentId}
                      value={department}
                      onChange={(e) => onDepartmentChange(e.target.value)}
                      className={inputCls(false)}
                      required
                      aria-required="true"
                    >
                      <option value="" disabled>Select a department</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="Assignee"
                    htmlFor={assigneeId}
                    hint={isStaff ? 'Leave blank to triage later.' : 'IT will assign someone.'}
                  >
                    <UserPicker
                      id={assigneeId}
                      value={assignee}
                      users={assigneeChoices}
                      onChange={setAssignee}
                      disabled={!isStaff}
                      placeholder={isStaff ? 'Type to search users (optional)' : 'unassigned'}
                    />
                  </Field>
                </>
              )}
            </Card>

            {error && (
              <div role="alert" className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 lg:sticky lg:top-20">
              <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed">
                {submitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Creating work order…
                  </>
                ) : (
                  'Create work order'
                )}
              </button>
              <button type="button" onClick={handleCancel} className="btn-secondary w-full text-center">
                Cancel
              </button>
              <p className="text-[11px] text-slate-500 text-center mt-1">
                You'll be redirected to the work order list after submission.
              </p>
            </div>
          </aside>
        </form>
      </main>
    </div>
  );
}

const descPlaceholder = `What happened?
What did you expect to happen instead?
Steps to reproduce:
1. ...
2. ...

Any error messages?`;

// Human-readable inclusive date range from two YYYY-MM-DD strings (UTC-parsed to
// avoid an off-by-one). e.g. "June 12, 2026", "June 12–15, 2026",
// "June 28 – July 2, 2026", or "Dec 30, 2025 – Jan 2, 2026".
function formatInclusiveDates(startStr, endStr) {
  const s = new Date(`${startStr}T00:00:00Z`);
  const e = new Date(`${endStr}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  const part = (d, opts) => d.toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
  const full = (d) => part(d, { month: 'long', day: 'numeric', year: 'numeric' });
  if (s.getTime() === e.getTime()) return full(s);
  const sameYear = part(s, { year: 'numeric' }) === part(e, { year: 'numeric' });
  const sameMonth = sameYear && part(s, { month: 'long' }) === part(e, { month: 'long' });
  if (sameMonth) {
    return `${part(s, { month: 'long', day: 'numeric' })}–${part(e, { day: 'numeric' })}, ${part(s, { year: 'numeric' })}`;
  }
  if (sameYear) {
    return `${part(s, { month: 'long', day: 'numeric' })} – ${part(e, { month: 'long', day: 'numeric' })}, ${part(s, { year: 'numeric' })}`;
  }
  return `${full(s)} – ${full(e)}`;
}

function inputCls(invalid) {
  return `block w-full rounded-md border px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-1 ${
    invalid
      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
      : 'border-slate-300 focus:border-accent-500 focus:ring-accent-500'
  } disabled:bg-slate-50 disabled:text-slate-400`;
}

// Deflection: as the requester types a title, surface relevant KB articles so
// they can self-serve before filing. Debounced; dismissible; opens in a new tab
// so the half-filled form is preserved.
function KbSuggestions({ query, category }) {
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const q = (query || '').trim();
    if (q.length < 4) { setItems([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (category) params.set('category', category);
        const list = await api(`/api/kb/suggest?${params.toString()}`);
        if (!cancelled) setItems(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setItems([]);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, category]);

  if (dismissed || items.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-accent-200 bg-accent-50/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-accent-800">
          Before you submit — these articles might already help:
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-accent-700 hover:text-accent-900 text-[11px] font-semibold"
          aria-label="Dismiss suggestions"
        >
          Dismiss
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((a) => (
          <li key={a.id}>
            <Link
              to={`/kb/${a.slug}`}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white"
            >
              <svg className="h-4 w-4 flex-none text-accent-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span className="flex-1 font-medium text-slate-800 group-hover:text-accent-900">{a.title}</span>
              {a.category && <span className="text-[10px] text-slate-400">{a.category}</span>}
              <span className="text-[11px] text-accent-700 opacity-0 group-hover:opacity-100">Open ↗</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Compact cell input for the overtime report table.
const otCell = 'w-full rounded border border-slate-300 px-2 py-1 text-sm placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500';

function Card({ title, subtitle, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card">
      <header className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-brand-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </header>
      <div className="p-5 space-y-5">{children}</div>
    </section>
  );
}

function Field({ label, hint, required, trailing, htmlFor, error, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={htmlFor} className="text-xs font-semibold text-slate-700">
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
        {trailing}
      </div>
      {children}
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-rose-600">{error}</p>
      ) : (
        hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
      )}
    </div>
  );
}

function CharCount({ value, max }) {
  const over = value > max;
  return (
    <span className={`text-[11px] tabular-nums ${over ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
      {value}/{max}
    </span>
  );
}

function PriorityRadio({ option, checked, onChange }) {
  const tones = {
    slate: 'border-slate-300 bg-slate-50 text-slate-700',
    brand: 'border-brand-200 bg-brand-50 text-brand-800',
    amber: 'border-amber-300 bg-amber-50 text-amber-800',
    rose: 'border-rose-300 bg-rose-50 text-rose-800'
  };
  const dotTones = {
    slate: 'bg-slate-400',
    brand: 'bg-brand-700',
    amber: 'bg-amber-500',
    rose: 'bg-rose-600'
  };
  return (
    <label
      className={`relative flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-all ${
        checked
          ? 'border-brand-900 ring-2 ring-brand-900/10 bg-white shadow-sm'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <input
        type="radio"
        name="priority"
        value={option.key}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className={`mt-0.5 inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[10px] font-bold uppercase tracking-wider ${tones[option.tone]}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotTones[option.tone]}`} />
        {option.label}
      </span>
      <span className="flex-1 text-xs text-slate-600 leading-snug">{option.desc}</span>
      {checked && (
        <svg className="h-4 w-4 text-accent-600 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
    </label>
  );
}

function FileDropzone({ files, setFiles, setError }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const addFiles = (incoming) => {
    setError('');
    const next = [...files];
    for (const f of incoming) {
      if (next.length >= MAX_FILES) {
        setError(`Maximum ${MAX_FILES} files.`);
        break;
      }
      if (f.size > MAX_FILE_BYTES) {
        setError(`"${f.name}" is larger than 10 MB.`);
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    setFiles(next);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
  };

  const remove = (idx) => setFiles(files.filter((_, i) => i !== idx));

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
          drag
            ? 'border-accent-500 bg-accent-50/60'
            : 'border-slate-300 bg-slate-50/60 hover:border-accent-300 hover:bg-accent-50/30'
        }`}
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 text-accent-700">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 8l5-5 5 5" />
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          </svg>
        </span>
        <p className="mt-3 text-sm text-slate-700">
          <span className="font-semibold text-brand-900">Click to upload</span> or drag &amp; drop
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          PNG, JPG, PDF, DOC, XLS, ZIP — up to 10 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(Array.from(e.target.files));
            e.target.value = '';
          }}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((f, idx) => (
            <li
              key={`${f.name}-${idx}`}
              className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2 pr-3"
            >
              <FilePreview file={f} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800 truncate">{f.name}</div>
                <div className="text-[11px] text-slate-500">{formatSize(f.size)} · {f.type || 'unknown type'}</div>
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Remove ${f.name}`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilePreview({ file }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (src) {
    return <img src={src} alt={file.name} className="h-10 w-10 rounded object-cover ring-1 ring-slate-200" />;
  }
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded bg-slate-100 ring-1 ring-slate-200 text-slate-500">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
    </span>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
