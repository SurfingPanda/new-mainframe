// Higher-level notifiers that keep route handlers thin: resolve recipients,
// build a template, and fire-and-forget the send. Every function is guaranteed
// not to throw, so handlers can call them without awaiting.

import { pool } from '../config/db.js';
import { sendMailSafe, appUrl } from './mailer.js';
import * as tpl from './email-templates.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// tickets.requester / assignee are free-text (a display name OR an email).
// Resolve to a real address via the users table; fall back to the raw value
// only if it already looks like an email.
async function resolveEmail(identity) {
  const value = String(identity || '').trim();
  if (!value) return null;
  const [rows] = await pool.query(
    'SELECT email FROM users WHERE is_active = 1 AND (email = ? OR name = ?) LIMIT 1',
    [value.toLowerCase(), value]
  );
  if (rows.length) return rows[0].email;
  return EMAIL_RE.test(value) ? value : null;
}

function sameIdentity(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export async function notifyTicketCreated(ticket, actor) {
  try {
    const t = { ...ticket, url: appUrl(`/tickets/${ticket.id}`) };
    // Requester always gets a receipt, even when they filed it themselves.
    const reqEmail = await resolveEmail(ticket.requester);
    if (reqEmail) sendMailSafe({ to: reqEmail, ...tpl.ticketCreated(t) });
    // Assignee (if pre-assigned and not the person who filed it).
    if (ticket.assignee && !sameIdentity(ticket.assignee, actor)) {
      const asgEmail = await resolveEmail(ticket.assignee);
      if (asgEmail && asgEmail !== reqEmail) sendMailSafe({ to: asgEmail, ...tpl.ticketAssigned(t) });
    }
  } catch (err) {
    console.error('[ticket-emails] created notify failed:', err.message);
  }
}

export async function notifyTicketChanges(ticket, changes, actor) {
  try {
    const t = { ...ticket, url: appUrl(`/tickets/${ticket.id}`) };
    for (const c of changes) {
      if (c.field === 'status' && !sameIdentity(ticket.requester, actor)) {
        const reqEmail = await resolveEmail(ticket.requester);
        if (reqEmail) sendMailSafe({ to: reqEmail, ...tpl.ticketStatusChanged(t, c.oldValue, c.newValue) });
      } else if (c.field === 'assignee' && c.newValue && !sameIdentity(c.newValue, actor)) {
        const asgEmail = await resolveEmail(c.newValue);
        if (asgEmail) sendMailSafe({ to: asgEmail, ...tpl.ticketAssigned(t) });
      }
    }
  } catch (err) {
    console.error('[ticket-emails] change notify failed:', err.message);
  }
}

export async function notifyTicketNote(ticket, body, actor) {
  try {
    const t = { ...ticket, url: appUrl(`/tickets/${ticket.id}`) };
    const recipients = new Set();
    for (const identity of [ticket.requester, ticket.assignee]) {
      if (identity && !sameIdentity(identity, actor)) {
        const email = await resolveEmail(identity);
        if (email) recipients.add(email);
      }
    }
    for (const to of recipients) {
      sendMailSafe({ to, ...tpl.ticketNote(t, body, actor) });
    }
  } catch (err) {
    console.error('[ticket-emails] note notify failed:', err.message);
  }
}

export async function notifyAssetRequestDecision(request, actor) {
  try {
    let email = null;
    if (request.requester_id) {
      const [rows] = await pool.query(
        'SELECT email FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
        [request.requester_id]
      );
      if (rows.length) email = rows[0].email;
    }
    if (!email) email = await resolveEmail(request.requester_name);
    if (email && !sameIdentity(email, actor)) {
      sendMailSafe({ to: email, ...tpl.assetRequestDecision(request) });
    }
  } catch (err) {
    console.error('[ticket-emails] asset-request notify failed:', err.message);
  }
}
