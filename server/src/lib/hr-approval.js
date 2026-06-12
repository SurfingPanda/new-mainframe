// In-app Mailbox notifications for the 'HR Concerns' manager-approval workflow.
// All functions are fire-and-forget and never throw — callers don't await them
// for correctness, mirroring the email/ survey notifiers.

import { pool } from '../config/db.js';

const SYSTEM_SENDER_ID = 0;
const SYSTEM_SENDER_NAME = 'Hubly';

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

async function sendSystemMessage({ recipientId, recipientName, subject, body, linkUrl, linkLabel }) {
  await pool.query(
    `INSERT INTO messages
       (sender_id, sender_name, recipient_id, recipient_name, subject, body, link_url, link_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [SYSTEM_SENDER_ID, SYSTEM_SENDER_NAME, recipientId, recipientName, subject, body, linkUrl, linkLabel]
  );
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
