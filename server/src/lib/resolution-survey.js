// When a work order is marked resolved, drop a system message into the
// requester's in-app Mailbox inviting them to rate the technician. The message
// links to /survey/:ticketId (a multi-aspect star survey). Guaranteed not to
// throw — callers fire-and-forget, like the email notifiers.

import { pool } from '../config/db.js';
import { sendSystemMessage } from './system-message.js';

// Work-order display id, matching the rest of the app (e.g. 22 -> "WO00000022").
const formatTicketId = (id) => `WO${String(id ?? 0).padStart(8, '0')}`;

// tickets.requester / assignee are free-text (a display name OR an email).
// Resolve to a real, active user row so we can deliver to their Mailbox.
async function resolveUser(identity) {
  const value = String(identity || '').trim();
  if (!value) return null;
  const [rows] = await pool.query(
    'SELECT id, name FROM users WHERE is_active = 1 AND (email = ? OR name = ?) LIMIT 1',
    [value.toLowerCase(), value]
  );
  return rows[0] || null;
}

// Send the survey invite for a ticket that just transitioned to 'resolved'.
// No-op (and never throws) when the transition doesn't qualify or a survey for
// this ticket already exists.
export async function maybeSendResolutionSurvey(ticket, previousStatus) {
  try {
    if (!ticket || ticket.status !== 'resolved') return;
    if (previousStatus === 'resolved') return; // not a fresh transition
    if (!ticket.assignee) return;              // nothing/nobody to rate

    // One survey per ticket — don't re-send if it was resolved before.
    const [existing] = await pool.query(
      'SELECT id FROM ticket_surveys WHERE ticket_id = ? LIMIT 1',
      [ticket.id]
    );
    if (existing.length) return;

    const respondent = await resolveUser(ticket.requester);
    if (!respondent) return; // requester isn't a registered user — no mailbox

    const technician = await resolveUser(ticket.assignee);
    // Don't ask someone to rate themselves (tech resolved their own request).
    if (technician && technician.id === respondent.id) return;

    await pool.query(
      `INSERT INTO ticket_surveys
         (ticket_id, technician, technician_id, respondent_id, respondent_name)
       VALUES (?, ?, ?, ?, ?)`,
      [ticket.id, ticket.assignee, technician?.id ?? null, respondent.id, respondent.name]
    );

    const ref = formatTicketId(ticket.id);
    const subject = `How did we do? — ${ref} resolved`;
    const body =
      `Your work order ${ref}${ticket.title ? ` "${ticket.title}"` : ''} has been resolved by ` +
      `${ticket.assignee}.\n\nWe'd love your feedback. Please take a moment to rate your ` +
      `technician — it only takes a few seconds.`;

    await sendSystemMessage({
      recipientId: respondent.id,
      recipientName: respondent.name,
      subject,
      body,
      linkUrl: `/survey/${ticket.id}`,
      linkLabel: 'Rate your technician'
    });

    // Record it on the work order's timeline so staff can see the survey went out.
    await pool.query(
      `INSERT INTO ticket_activity (ticket_id, type, actor, field, new_value)
       VALUES (?, 'change', ?, 'survey_sent', ?)`,
      [ticket.id, SYSTEM_SENDER_NAME, respondent.name.slice(0, 500)]
    );
  } catch (err) {
    console.error('[resolution-survey] failed:', err.message);
  }
}
