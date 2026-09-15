// Shared helper for system ("Hubly") Mailbox messages — the in-app notices sent
// by the HR-approval, resolution-survey, SLA-reminder, and Spaces notifiers.
// Centralizes the INSERT (one place owns the column set + length clamping) and
// pushes a real-time 'mail' socket signal so the recipient's header mailbox
// badge updates without waiting for the next poll.
//
// Fire-and-forget friendly: the notifier libs already wrap their calls in
// try/catch and don't depend on the return value.

import { pool } from '../config/db.js';
import { emitMailUpdate } from './socket.js';

// System sender marker for Mailbox messages (no real user account).
// messages.shape never treats sender_id 0 as "mine" since real ids are positive.
const SYSTEM_SENDER_ID = 0;
const SYSTEM_SENDER_NAME = 'Hubly';
const SUBJECT_MAX = 200;
const BODY_MAX = 5000;

export async function sendSystemMessage({ recipientId, recipientName, subject, body, linkUrl = null, linkLabel = null }) {
  await pool.query(
    `INSERT INTO messages
       (sender_id, sender_name, recipient_id, recipient_name, subject, body, link_url, link_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      SYSTEM_SENDER_ID,
      SYSTEM_SENDER_NAME,
      recipientId,
      recipientName,
      String(subject ?? '').slice(0, SUBJECT_MAX),
      String(body ?? '').slice(0, BODY_MAX),
      linkUrl || null,
      linkLabel || null
    ]
  );
  emitMailUpdate(recipientId);
}
