// Transactional email templates. Each returns { subject, text, html }.
// Inline-styled HTML, no template engine. User-supplied strings are escaped
// before being embedded in HTML.

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

function layout(heading, bodyHtml, cta) {
  const button = cta
    ? `<p style="margin:24px 0;"><a href="${cta.url}" style="background:#1e293b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;display:inline-block;">${escapeHtml(cta.label)}</a></p>`
    : '';
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
  <h2 style="font-size:18px;margin:0 0 12px;">${escapeHtml(heading)}</h2>
  <div style="font-size:14px;line-height:1.6;color:#334155;">${bodyHtml}</div>
  ${button}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
  <p style="font-size:12px;color:#94a3b8;">Hubly — internal IT operations. This is an automated message.</p>
</div>`;
}

export function ticketCreated(ticket) {
  const code = ticketCode(ticket.id);
  return {
    subject: `[${code}] We received your work order: ${ticket.title}`,
    text: `Your work order ${code} "${ticket.title}" has been received. The IT team will triage and respond based on priority (${ticket.priority}).\n\nView it: ${ticket.url}`,
    html: layout(
      `Work order ${code} received`,
      `<p>Hi,</p><p>Your work order <strong>${code}</strong> — "${escapeHtml(ticket.title)}" — has been received. The IT team will triage and respond based on priority (<strong>${escapeHtml(ticket.priority)}</strong>).</p>`,
      { label: 'View work order', url: ticket.url }
    )
  };
}

export function ticketAssigned(ticket) {
  const code = ticketCode(ticket.id);
  return {
    subject: `[${code}] Assigned to you: ${ticket.title}`,
    text: `Work order ${code} "${ticket.title}" has been assigned to you (priority ${ticket.priority}).\n\nView it: ${ticket.url}`,
    html: layout(
      `Work order ${code} assigned to you`,
      `<p>Work order <strong>${code}</strong> — "${escapeHtml(ticket.title)}" — has been assigned to you. Priority: <strong>${escapeHtml(ticket.priority)}</strong>.</p>`,
      { label: 'Open work order', url: ticket.url }
    )
  };
}

export function ticketStatusChanged(ticket, oldStatus, newStatus) {
  const code = ticketCode(ticket.id);
  const label = STATUS_LABELS[newStatus] || newStatus;
  const oldLabel = STATUS_LABELS[oldStatus] || oldStatus || '—';
  return {
    subject: `[${code}] Status: ${label} — ${ticket.title}`,
    text: `Your work order ${code} "${ticket.title}" changed status from ${oldLabel} to ${label}.\n\nView it: ${ticket.url}`,
    html: layout(
      `Work order ${code} is now ${escapeHtml(label)}`,
      `<p>Your work order <strong>${code}</strong> — "${escapeHtml(ticket.title)}" — changed status from <strong>${escapeHtml(oldLabel)}</strong> to <strong>${escapeHtml(label)}</strong>.</p>`,
      { label: 'View work order', url: ticket.url }
    )
  };
}

export function ticketNote(ticket, body, author) {
  const code = ticketCode(ticket.id);
  return {
    subject: `[${code}] New note — ${ticket.title}`,
    text: `${author || 'Someone'} added a note to work order ${code} "${ticket.title}":\n\n${body}\n\nView it: ${ticket.url}`,
    html: layout(
      `New note on work order ${code}`,
      `<p><strong>${escapeHtml(author || 'Someone')}</strong> added a note to "${escapeHtml(ticket.title)}":</p>
       <blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #cbd5e1;color:#475569;white-space:pre-wrap;">${escapeHtml(body)}</blockquote>`,
      { label: 'View work order', url: ticket.url }
    )
  };
}

export function assetRequestDecision(request) {
  const phrase = URGENCY_LABELS[request.status] || `was updated to ${request.status}`;
  const notes = request.admin_notes
    ? `<p><strong>Notes:</strong> ${escapeHtml(request.admin_notes)}</p>`
    : '';
  return {
    subject: `Asset request ${phrase}: ${request.asset_type}`,
    text: `Your asset request for "${request.asset_type}" (x${request.quantity}) ${phrase}.${request.admin_notes ? `\n\nNotes: ${request.admin_notes}` : ''}`,
    html: layout(
      `Asset request ${escapeHtml(phrase)}`,
      `<p>Your request for <strong>${escapeHtml(request.asset_type)}</strong> (qty ${escapeHtml(request.quantity)}) ${escapeHtml(phrase)}.</p>${notes}`
    )
  };
}

export function passwordResetLink(name, url) {
  return {
    subject: 'Reset your Hubly password',
    text: `Hi ${name || ''},\n\nA password reset was requested for your Hubly account. Use this link within 1 hour to set a new password:\n\n${url}\n\nIf you didn't request this, you can ignore this email — your password won't change.`,
    html: layout(
      'Reset your password',
      `<p>Hi ${escapeHtml(name || '')},</p><p>A password reset was requested for your Hubly account. This link expires in <strong>1 hour</strong>.</p><p style="font-size:12px;color:#94a3b8;">If you didn't request this, ignore this email — your password won't change.</p>`,
      { label: 'Set a new password', url }
    )
  };
}
