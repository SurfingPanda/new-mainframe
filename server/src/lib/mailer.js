// Optional mailer. Mirrors lib/unifi.js: when nothing is configured the
// mailer is disabled and sends become logged no-ops, so the app runs fine
// without a mail server. Sends must never block or fail a request — call
// sendMailSafe() from request handlers (fire-and-forget, never throws).
//
// Two transports, tried in this order:
//  1. Resend (RESEND_API_KEY) — sends over HTTPS. Preferred in production:
//     many hosts (incl. Railway) block outbound SMTP ports entirely, which
//     surfaces as a silent "Connection timeout" from nodemailer.
//  2. SMTP (SMTP_HOST) — works fine for local dev (e.g. Gmail + app password)
//     where outbound SMTP isn't blocked.

import nodemailer from 'nodemailer';

let cachedTransport = null;
let warnedDisabled = false;

// Dev mode: when MAIL_DEV=ethereal (and no real SMTP_HOST/RESEND_API_KEY is
// set), send through a throwaway Ethereal test inbox — no credentials, no
// real delivery. Each message gets a preview URL logged to the console.
function devMode() {
  const v = String(process.env.MAIL_DEV || '').toLowerCase();
  return v === 'ethereal' || v === 'true';
}

function resendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function isConfigured() {
  return resendConfigured() || Boolean(process.env.SMTP_HOST) || devMode();
}

// One-line status logged at boot so it's obvious whether outbound email is live.
// (Without this the mailer only warns on the FIRST send attempt — easy to miss.)
export function logMailerStatus() {
  if (resendConfigured()) {
    console.log(`[mailer] Resend enabled (from: ${fromAddress()})`);
  } else if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT) || 587;
    console.log(`[mailer] SMTP enabled — ${process.env.SMTP_HOST}:${port} (from: ${fromAddress()})`);
  } else if (devMode()) {
    console.log('[mailer] MAIL_DEV mode — Ethereal test inbox, no real delivery.');
  } else {
    console.warn('[mailer] Mail disabled (no RESEND_API_KEY or SMTP_HOST) — emails are no-ops. Set one in .env and restart to enable.');
  }
}

async function sendViaResend({ to, subject, text, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: fromAddress(), to, subject, text, html })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
  return true;
}

async function getTransport() {
  if (cachedTransport) return cachedTransport;
  if (process.env.SMTP_HOST) {
    cachedTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined
    });
  } else {
    // Ethereal: lazily provision a throwaway test account on first send.
    const account = await nodemailer.createTestAccount();
    cachedTransport = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: account.user, pass: account.pass }
    });
    console.warn(`[mailer] MAIL_DEV=ethereal — throwaway test inbox, no real delivery. Login: ${account.user}`);
  }
  return cachedTransport;
}

function fromAddress() {
  return process.env.MAIL_FROM || 'Hubly Ticketing <no-reply@mainframe.local>';
}

// Build an absolute link into the client app (e.g. a password-reset URL).
export function appUrl(pathname = '') {
  const base = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

export async function sendMail({ to, subject, text, html }) {
  if (!to) return false;
  if (!isConfigured()) {
    if (!warnedDisabled) {
      console.warn('[mailer] Mail not configured (no RESEND_API_KEY or SMTP_HOST) — email disabled; sends are no-ops.');
      warnedDisabled = true;
    }
    return false;
  }
  if (resendConfigured()) {
    return sendViaResend({ to, subject, text, html });
  }
  const info = await (await getTransport()).sendMail({ from: fromAddress(), to, subject, text, html });
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) console.log(`[mailer] dev email to ${to} — open it: ${preview}`);
  return true;
}

// Fire-and-forget. Detaches from the request and swallows errors so a mail
// failure can never break or delay the HTTP response.
export function sendMailSafe(message) {
  Promise.resolve()
    .then(() => sendMail(message))
    .catch((err) => console.error('[mailer] send failed:', err.message));
}
