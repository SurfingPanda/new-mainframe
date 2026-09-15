// Transactional email templates. Each returns { subject, text, html }.
// Inline-styled, table-based HTML (max compatibility across mail clients —
// Gmail/Outlook strip <style>, flexbox and grid). User-supplied strings are
// always escaped before being embedded in HTML.

const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  pending: 'Pending - Waiting for Customer',
  resolved: 'Resolved',
  closed: 'Closed'
};

const URGENCY_LABELS = {
  pending: 'is pending review',
  approved: 'was approved',
  denied: 'was denied',
  fulfilled: 'was fulfilled'
};

const BRAND = 'Hubly Ticketing';

function ticketCode(id) {
  return `WO${String(id).padStart(8, '0')}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function prettify(s) {
  return String(s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Human-readable timestamp (e.g. "Jun 12, 2026, 3:45 PM"). Empty on bad input.
function fmtDate(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

// First name for a friendly greeting — skipped when the identity is an email.
function firstName(identity) {
  const v = String(identity ?? '').trim();
  if (!v || v.includes('@')) return '';
  return v.split(/\s+/)[0];
}

function pill(text, bg, fg) {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${bg};color:${fg};font-size:12px;font-weight:600;line-height:1.5;">${escapeHtml(text)}</span>`;
}

function priorityPill(p) {
  const map = {
    urgent: ['#fee2e2', '#b91c1c'],
    high: ['#ffedd5', '#c2410c'],
    normal: ['#e0f2fe', '#0369a1'],
    low: ['#f1f5f9', '#475569']
  };
  const [bg, fg] = map[p] || map.normal;
  return pill(prettify(p || 'normal'), bg, fg);
}

function statusPill(s) {
  const map = {
    open: ['#fef9c3', '#a16207'],
    in_progress: ['#dbeafe', '#1d4ed8'],
    on_hold: ['#e2e8f0', '#475569'],
    pending: ['#ede9fe', '#6d28d9'],
    resolved: ['#dcfce7', '#15803d'],
    closed: ['#e2e8f0', '#475569']
  };
  const [bg, fg] = map[s] || map.open;
  return pill(STATUS_LABELS[s] || s, bg, fg);
}

// Space work-item status pill (todo / in_progress / done — distinct from tickets).
function spaceStatusPill(s) {
  const map = {
    todo: ['#e2e8f0', '#475569'],
    in_progress: ['#dbeafe', '#1d4ed8'],
    done: ['#dcfce7', '#15803d']
  };
  const labels = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
  const [bg, fg] = map[s] || map.todo;
  return pill(labels[s] || s, bg, fg);
}

// Two-column key/value table. Rows whose `html` is empty are dropped.
function detailsTable(rows) {
  const valid = (rows || []).filter((r) => r && r.html != null && r.html !== '');
  if (!valid.length) return '';
  const trs = valid.map((r, i) => `<tr style="background:${i % 2 ? '#ffffff' : '#f8fafc'};">
        <td style="padding:10px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;vertical-align:top;width:120px;">${escapeHtml(r.label)}</td>
        <td style="padding:10px 14px;font-size:14px;color:#0f172a;vertical-align:top;">${r.html}</td>
      </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;">${trs}</table>`;
}

// The standard set of work-order facts, shared by every ticket email.
function ticketDetails(ticket) {
  return [
    { label: 'Work Order', html: `<strong>${ticketCode(ticket.id)}</strong>` },
    { label: 'Title', html: escapeHtml(ticket.title) },
    { label: 'Priority', html: priorityPill(ticket.priority) },
    { label: 'Status', html: statusPill(ticket.status) },
    { label: 'Type', html: ticket.request_type ? escapeHtml(prettify(ticket.request_type)) : '' },
    { label: 'Category', html: ticket.category ? escapeHtml(ticket.category) : '' },
    { label: 'Department', html: ticket.department ? escapeHtml(ticket.department) : '' },
    { label: 'Requester', html: ticket.requester ? escapeHtml(ticket.requester) : '' },
    {
      label: 'Assignee',
      html: ticket.assignee ? escapeHtml(ticket.assignee) : '<span style="color:#94a3b8;">Unassigned</span>'
    },
    { label: 'Opened', html: ticket.created_at ? escapeHtml(fmtDate(ticket.created_at)) : '' }
  ];
}

// Optional description panel (clamped so a long body can't bloat the email).
function descriptionBlock(desc) {
  const d = String(desc ?? '').trim();
  if (!d) return '';
  const clipped = d.length > 800 ? `${d.slice(0, 800)}…` : d;
  return `<p style="margin:18px 0 6px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Description</p>
    <div style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;line-height:1.6;color:#334155;white-space:pre-wrap;">${escapeHtml(clipped)}</div>`;
}

// Plain-text key/value lines for the text part of a ticket email.
function ticketTextDetails(ticket) {
  const lines = [
    `Work Order: ${ticketCode(ticket.id)}`,
    `Title: ${ticket.title}`,
    `Priority: ${prettify(ticket.priority || 'normal')}`,
    `Status: ${STATUS_LABELS[ticket.status] || ticket.status || '—'}`,
    ticket.request_type ? `Type: ${prettify(ticket.request_type)}` : null,
    ticket.category ? `Category: ${ticket.category}` : null,
    ticket.department ? `Department: ${ticket.department}` : null,
    ticket.requester ? `Requester: ${ticket.requester}` : null,
    `Assignee: ${ticket.assignee || 'Unassigned'}`,
    ticket.created_at ? `Opened: ${fmtDate(ticket.created_at)}` : null
  ].filter(Boolean);
  const desc = String(ticket.description ?? '').trim();
  if (desc) lines.push('', 'Description:', desc);
  return lines.join('\n');
}

// Master shell: branded header, content card, optional details table + CTA,
// footer. `opts`: { cta:{label,url}, details:[...], preheader, kicker }.
function layout(heading, bodyHtml, opts = {}) {
  const { cta, details, preheader, kicker = 'Notification' } = opts;
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr>
          <td style="border-radius:8px;background:#0f172a;">
            <a href="${cta.url}" style="display:inline-block;padding:12px 24px;font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(cta.label)} &rarr;</a>
          </td>
        </tr></table>`
    : '';
  const detailsHtml = details ? detailsTable(details) : '';
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1f5f9;">${escapeHtml(preheader)}</div>`
    : '';
  return `${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;margin:0;padding:24px 12px;font-family:system-ui,Segoe UI,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
      <tr><td style="background:#0f172a;padding:18px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:17px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">
            <span style="color:#38bdf8;">&#9679;</span>&nbsp; ${escapeHtml(BRAND)}
          </td>
          <td align="right" style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;">${escapeHtml(kicker)}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:28px 28px 8px;">
        <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#0f172a;font-weight:700;">${escapeHtml(heading)}</h1>
        <div style="font-size:14px;line-height:1.65;color:#334155;">${bodyHtml}</div>
        ${detailsHtml}
        ${button}
      </td></tr>
      <tr><td style="padding:18px 28px 24px;">
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 14px;" />
        <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
          <strong style="color:#64748b;">${escapeHtml(BRAND)}</strong> &middot; Internal IT Operations<br/>
          This is an automated message — please don't reply to this email.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

export function ticketCreated(ticket) {
  const code = ticketCode(ticket.id);
  const greet = firstName(ticket.requester);
  return {
    subject: `[${code}] We received your work order: ${ticket.title}`,
    text: `Hi${greet ? ` ${greet}` : ''},\n\nYour work order ${code} has been received. The IT team will triage and respond based on priority.\n\n${ticketTextDetails(ticket)}\n\nView it: ${ticket.url}`,
    html: layout(
      'We received your work order',
      `<p style="margin:0 0 6px;">Hi${greet ? ` ${escapeHtml(greet)}` : ''},</p>
       <p style="margin:0;">Your work order <strong>${code}</strong> has been logged. The IT team will triage and respond based on its priority. Here are the details:</p>
       ${descriptionBlock(ticket.description)}`,
      { kicker: 'Work Order', preheader: `${code} — ${ticket.title}`, cta: { label: 'View work order', url: ticket.url }, details: ticketDetails(ticket) }
    )
  };
}

export function ticketAssigned(ticket) {
  const code = ticketCode(ticket.id);
  const greet = firstName(ticket.assignee);
  return {
    subject: `[${code}] Assigned to you: ${ticket.title}`,
    text: `Hi${greet ? ` ${greet}` : ''},\n\nYou've been assigned work order ${code}. Please review and action it based on its priority.\n\n${ticketTextDetails(ticket)}\n\nOpen it: ${ticket.url}`,
    html: layout(
      'A work order was assigned to you',
      `<p style="margin:0 0 6px;">Hi${greet ? ` ${escapeHtml(greet)}` : ''},</p>
       <p style="margin:0;">You've been assigned work order <strong>${code}</strong>. Please review and action it based on its priority.</p>
       ${descriptionBlock(ticket.description)}`,
      { kicker: 'Work Order', preheader: `${code} — ${ticket.title}`, cta: { label: 'Open work order', url: ticket.url }, details: ticketDetails(ticket) }
    )
  };
}

export function ticketStatusChanged(ticket, oldStatus, newStatus) {
  const code = ticketCode(ticket.id);
  const label = STATUS_LABELS[newStatus] || newStatus;
  const oldLabel = STATUS_LABELS[oldStatus] || oldStatus || '—';
  const greet = firstName(ticket.requester);
  return {
    subject: `[${code}] Status: ${label} — ${ticket.title}`,
    text: `Hi${greet ? ` ${greet}` : ''},\n\nYour work order ${code} changed status from ${oldLabel} to ${label}.\n\n${ticketTextDetails(ticket)}\n\nView it: ${ticket.url}`,
    html: layout(
      `Status updated to ${label}`,
      `<p style="margin:0 0 6px;">Hi${greet ? ` ${escapeHtml(greet)}` : ''},</p>
       <p style="margin:0;">Your work order <strong>${code}</strong> changed status from <strong>${escapeHtml(oldLabel)}</strong> to ${statusPill(newStatus)}.</p>
       ${descriptionBlock(ticket.description)}`,
      { kicker: 'Work Order', preheader: `${code} is now ${label}`, cta: { label: 'View work order', url: ticket.url }, details: ticketDetails(ticket) }
    )
  };
}

export function ticketNote(ticket, body, author) {
  const code = ticketCode(ticket.id);
  return {
    subject: `[${code}] New note — ${ticket.title}`,
    text: `${author || 'Someone'} added a note to work order ${code}:\n\n${body}\n\n${ticketTextDetails(ticket)}\n\nView it: ${ticket.url}`,
    html: layout(
      `New note on ${code}`,
      `<p style="margin:0 0 4px;"><strong>${escapeHtml(author || 'Someone')}</strong> added a note to "${escapeHtml(ticket.title)}":</p>
       <blockquote style="margin:12px 0 0;padding:12px 16px;background:#f8fafc;border-left:3px solid #38bdf8;border-radius:0 8px 8px 0;color:#475569;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(body)}</blockquote>`,
      { kicker: 'Work Order', preheader: `${code} — new note`, cta: { label: 'View work order', url: ticket.url }, details: ticketDetails(ticket) }
    )
  };
}

export function assetRequestDecision(request) {
  const phrase = URGENCY_LABELS[request.status] || `was updated to ${request.status}`;
  const details = [
    { label: 'Asset', html: escapeHtml(request.asset_type) },
    { label: 'Quantity', html: escapeHtml(request.quantity) },
    { label: 'Status', html: escapeHtml(prettify(request.status)) },
    { label: 'Department', html: request.department ? escapeHtml(request.department) : '' },
    { label: 'Notes', html: request.admin_notes ? escapeHtml(request.admin_notes) : '' }
  ];
  return {
    subject: `Asset request ${phrase}: ${request.asset_type}`,
    text: `Your asset request for "${request.asset_type}" (x${request.quantity}) ${phrase}.${request.admin_notes ? `\n\nNotes: ${request.admin_notes}` : ''}`,
    html: layout(
      `Your asset request ${phrase}`,
      `<p style="margin:0;">Your request for <strong>${escapeHtml(request.asset_type)}</strong> (qty ${escapeHtml(request.quantity)}) ${escapeHtml(phrase)}.</p>`,
      { kicker: 'Asset Request', preheader: `${request.asset_type} — ${prettify(request.status)}`, details }
    )
  };
}

// --- Spaces ----------------------------------------------------------------

export function spaceItemAssigned(item, space, url) {
  const key = item.item_key || 'work item';
  const details = [
    { label: 'Item', html: `<strong>${escapeHtml(key)}</strong>` },
    { label: 'Title', html: escapeHtml(item.title) },
    { label: 'Space', html: escapeHtml(space.name) },
    { label: 'Type', html: item.type ? escapeHtml(prettify(item.type)) : '' },
    { label: 'Priority', html: item.priority ? priorityPill(item.priority) : '' },
    { label: 'Status', html: item.status ? spaceStatusPill(item.status) : '' }
  ];
  return {
    subject: `[${key}] Assigned to you in ${space.name}`,
    text: `You've been assigned ${key} "${item.title}" in the ${space.name} space. Please review and action it.\n\nOpen it: ${url}`,
    html: layout(
      'A work item was assigned to you',
      `<p style="margin:0;">You've been assigned <strong>${escapeHtml(key)}</strong> in the <strong>${escapeHtml(space.name)}</strong> space. Please review and action it.</p>${descriptionBlock(item.description)}`,
      { kicker: 'Spaces', preheader: `${key} — ${item.title}`, cta: { label: 'Open work item', url }, details }
    )
  };
}

export function spaceJoinRequest(space, requester, url) {
  const who = requester?.name || 'Someone';
  return {
    subject: `Join request — ${space.name}`,
    text: `${who} has requested to join the ${space.name} space. As the Project Manager you can approve or decline it from the Members tab.\n\nReview it: ${url}`,
    html: layout(
      'New request to join your space',
      `<p style="margin:0;"><strong>${escapeHtml(who)}</strong> has requested to join the <strong>${escapeHtml(space.name)}</strong> space. As the Project Manager you can approve or decline it from the Members tab.</p>`,
      { kicker: 'Spaces', preheader: `${who} wants to join ${space.name}`, cta: { label: 'Review request', url } }
    )
  };
}

// Content-light by design: an HR concern is need-to-know, so the email carries
// no title/details — just the reference and a link into Hubly where the real
// access checks live. `ref` is the formatted WO id (e.g. WO00000123).
export function hrConcernRouted(ref, url) {
  return {
    subject: `HR request needs review — ${ref}`,
    text: `An HR request (${ref}) has been approved and routed to HR for review.\n\nFor confidentiality the details aren't included here — open it in Hubly to view and assign it:\n${url}`,
    html: layout(
      'An HR request needs review',
      `<p style="margin:0;">An HR request (<strong>${escapeHtml(ref)}</strong>) has been approved and routed to <strong>HR</strong> for review. Open it in Hubly to view the details and assign it.</p>
       <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;">For confidentiality, the details aren't included in this email — they're only available inside Hubly.</p>`,
      { kicker: 'HR Concern', preheader: `${ref} routed to HR for review`, cta: { label: 'Open work order', url } }
    )
  };
}

export function passwordResetLink(name, url) {
  return {
    subject: `Reset your ${BRAND} password`,
    text: `Hi ${name || ''},\n\nA password reset was requested for your ${BRAND} account. Use this link within 1 hour to set a new password:\n\n${url}\n\nIf you didn't request this, you can ignore this email — your password won't change.`,
    html: layout(
      'Reset your password',
      `<p style="margin:0 0 10px;">Hi ${escapeHtml(name || '')},</p>
       <p style="margin:0 0 10px;">A password reset was requested for your <strong>${escapeHtml(BRAND)}</strong> account. This link expires in <strong>1 hour</strong>.</p>
       <p style="margin:0;font-size:12px;color:#94a3b8;">If you didn't request this, ignore this email — your password won't change.</p>`,
      { kicker: 'Account Security', preheader: 'Reset your password (link expires in 1 hour)', cta: { label: 'Set a new password', url } }
    )
  };
}
