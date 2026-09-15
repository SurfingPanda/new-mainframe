// In-app Mailbox notifications for the 'HR Concerns' manager-approval workflow.
// All functions are fire-and-forget and never throw — callers don't await them
// for correctness, mirroring the email/ survey notifiers.

import { pool } from '../config/db.js';
import { sendMailSafe, appUrl } from './mailer.js';
import { hrConcernRouted } from './email-templates.js';
import { sendSystemMessage } from './system-message.js';

const formatTicketId = (id) => `WO${String(id ?? 0).padStart(8, '0')}`;

// tickets.requester is free-text (a display name OR an email). Resolve to a real
// active user so we can deliver to their Mailbox.
async function resolveUser(identity) {
  const value = String(identity || '').trim();
  if (!value) return null;
  const [rows] = await pool.query(
    'SELECT id, name FROM users WHERE is_active = 1 AND (email = ? OR name = ?) LIMIT 1',
    [value.toLowerCase(), value]
  );
  return rows[0] || null;
}

// Tell a department manager a request is waiting for their approval.
export async function notifyApprovalRequested({ ticket, manager }) {
  try {
    if (!manager?.id) return;
    const ref = formatTicketId(ticket.id);
    await sendSystemMessage({
      recipientId: manager.id,
      recipientName: manager.name,
      subject: `Approval needed — ${ref}`,
      body:
        `${ticket.requester} submitted an HR request, ${ref}${ticket.title ? ` "${ticket.title}"` : ''}, ` +
        `that needs your approval before it goes to HR.\n\nReview it and approve or decline.`,
      linkUrl: `/tickets/${ticket.id}`,
      linkLabel: 'Review request'
    });
  } catch (err) {
    console.error('[hr-approval] notifyApprovalRequested failed:', err.message);
  }
}

// An HR concern has been routed to the HR department (on manager approval, or
// auto-approval when there's no approving manager). Notify HR so it doesn't sit
// unseen in the queue:
//   • In-app Mailbox to every active HR member (the shared, need-to-know queue).
//   • A content-light EMAIL to the HR department MANAGER as the single triage
//     owner — who then assigns it (the assignee gets the normal "assigned" mail).
//     Falls back to emailing all HR members when no manager is set.
export async function notifyHrRoutedToTeam({ ticket }) {
  try {
    if (!ticket?.id) return;
    const [[hr]] = await pool.query(
      'SELECT name, manager_id FROM departments WHERE is_hr = 1 AND is_active = 1 LIMIT 1'
    );
    if (!hr?.name) return; // no HR department configured

    const [members] = await pool.query(
      'SELECT id, name, email FROM users WHERE is_active = 1 AND department = ?',
      [hr.name]
    );
    if (!members.length) return;

    const ref = formatTicketId(ticket.id);
    const link = `/tickets/${ticket.id}`;

    // In-app notice to the whole HR team (their shared queue).
    for (const m of members) {
      await sendSystemMessage({
        recipientId: m.id,
        recipientName: m.name,
        subject: `New HR request — ${ref}`,
        body:
          `An HR request (${ref}) was approved and routed to ${hr.name} for review.\n\n` +
          `Open it in Hubly to view the details and pick it up.`,
        linkUrl: link,
        linkLabel: 'Open request'
      });
    }

    // Content-light email to the HR manager (single owner); else all HR members.
    const manager = hr.manager_id ? members.find((m) => m.id === hr.manager_id) : null;
    const emailTargets = manager ? [manager] : members;
    for (const t of emailTargets) {
      if (t.email) sendMailSafe({ to: t.email, ...hrConcernRouted(ref, appUrl(link)) });
    }
  } catch (err) {
    console.error('[hr-approval] notifyHrRoutedToTeam failed:', err.message);
  }
}

// Tell the requester their request was approved (routed to HR) or denied.
export async function notifyApprovalDecision({ ticket, decision, reason, hrName }) {
  try {
    const requester = await resolveUser(ticket.requester);
    if (!requester) return;
    const ref = formatTicketId(ticket.id);
    const approved = decision === 'approved';
    await sendSystemMessage({
      recipientId: requester.id,
      recipientName: requester.name,
      subject: approved ? `Approved — ${ref}` : `Declined — ${ref}`,
      body: approved
        ? `Your HR request ${ref}${ticket.title ? ` "${ticket.title}"` : ''} was approved` +
          `${ticket.approver_name ? ` by ${ticket.approver_name}` : ''} and forwarded to ${hrName || 'HR'}.`
        : `Your HR request ${ref}${ticket.title ? ` "${ticket.title}"` : ''} was declined` +
          `${ticket.approver_name ? ` by ${ticket.approver_name}` : ''}.` +
          `${reason ? `\n\nReason: ${reason}` : ''}`,
      linkUrl: `/tickets/${ticket.id}`,
      linkLabel: 'View request'
    });
  } catch (err) {
    console.error('[hr-approval] notifyApprovalDecision failed:', err.message);
  }
}
