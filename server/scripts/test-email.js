// One-off SMTP smoke test. Loads .env (same as the server), verifies the
// transport can authenticate, and sends a single test message.
//
//   node scripts/test-email.js you@example.com
//
// If no recipient is given, it sends to SMTP_USER (yourself).

import 'dotenv/config';
import { isConfigured, sendMail } from '../src/lib/mailer.js';

const to = process.argv[2] || process.env.SMTP_USER;

if (!isConfigured()) {
  console.error('SMTP is not configured — set SMTP_HOST (and friends) in server/.env first.');
  process.exit(1);
}
if (!to) {
  console.error('No recipient. Pass one (node scripts/test-email.js you@example.com) or set SMTP_USER.');
  process.exit(1);
}

console.log(`Host: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}  user: ${process.env.SMTP_USER || '(none)'}`);
console.log(`Sending test email to ${to} …`);

try {
  const ok = await sendMail({
    to,
    subject: 'Hubly SMTP test ✓',
    text: 'If you can read this, outbound email is working.',
    html: '<p>If you can read this, <strong>outbound email is working.</strong></p>'
  });
  if (ok) {
    console.log('✓ Sent. Check the inbox (and spam) for the test message.');
    process.exit(0);
  }
  console.error('✗ sendMail returned false — mailer is disabled or the recipient was empty.');
  process.exit(1);
} catch (err) {
  console.error('✗ Send failed:', err.message);
  process.exit(1);
}
