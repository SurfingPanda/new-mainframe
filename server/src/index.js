import 'dotenv/config';
import { createServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import { pingDb, ensureSchema } from './config/db.js';
import { loadSlaDays } from './lib/sla-config.js';
import { startMaintenanceScheduler } from './lib/maintenance-scheduler.js';
import { startSpaceDueReminders } from './lib/space-notify.js';
import { startSlaBreachReminders } from './lib/sla-reminders.js';
import { startAutoClose } from './lib/auto-close.js';
import { logMailerStatus } from './lib/mailer.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { requireAuth } from './middleware/auth.js';
import { authorizeUpload } from './lib/upload-access.js';
import { initSocket } from './lib/socket.js';
import auth from './routes/auth.js';
import users from './routes/users.js';
import tickets from './routes/tickets.js';
import maintenance from './routes/maintenance.js';
import assets from './routes/assets.js';
import kb from './routes/kb.js';
import assetRequests from './routes/asset-requests.js';
import departments from './routes/departments.js';
import passwordResets from './routes/password-resets.js';
import chat from './routes/chat.js';
import messages from './routes/messages.js';
import surveys from './routes/surveys.js';
import network from './routes/network.js';
import notifications from './routes/notifications.js';
import spaces from './routes/spaces.js';
import announcements from './routes/announcements.js';
import search from './routes/search.js';
import settings from './routes/settings.js';

// Fail fast on a missing JWT secret — without it tokens can't be verified safely.
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start. Set a long random value in .env.');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn('WARNING: JWT_SECRET is shorter than 32 characters. Use a longer random value for production.');
}
// Reject obvious placeholder secrets (including the value shipped in
// .env.example). These are public — a token signed with one can be forged by
// anyone — so a real secret is non-negotiable even though the length check passes.
const PLACEHOLDER_SECRETS = new Set([
  'change-me-to-a-long-random-string',
  'change-me',
  'changeme',
  'your-secret-key',
  'your-jwt-secret',
  'secret'
]);
if (PLACEHOLDER_SECRETS.has(process.env.JWT_SECRET.trim().toLowerCase())) {
  console.error('FATAL: JWT_SECRET is set to a known placeholder value. Generate a unique random secret (e.g. `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"`). Refusing to start.');
  process.exit(1);
}

const app = express();
const server = createServer(app);
const PORT = Number(process.env.PORT) || 4000;

// Behind a reverse proxy (nginx, Cloudflare, most PaaS), req.ip is the proxy's
// address unless we trust the X-Forwarded-For chain — which would collapse the
// per-IP rate limiters into one shared bucket (a global self-DoS). Configure via
// TRUST_PROXY: 'true'/'false', a hop count ('1'), or an Express trust string
// (e.g. 'loopback', a subnet). Unset = don't trust (correct for direct/dev).
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  if (trustProxy === 'true') app.set('trust proxy', true);
  else if (trustProxy === 'false') app.set('trust proxy', false);
  else if (/^\d+$/.test(trustProxy)) app.set('trust proxy', Number(trustProxy));
  else app.set('trust proxy', trustProxy);
}

// CORS: lock to an allowlist in production via CORS_ORIGINS (comma-separated).
// When unset (e.g. local dev) we fall back to permissive CORS and warn once.
const corsAllowlist = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
if (corsAllowlist.length) {
  app.use(
    cors({
      // credentials: true so the browser sends/accepts the httpOnly auth cookie.
      credentials: true,
      // Custom headers JS needs to read off responses (e.g. the list-cap signal).
      exposedHeaders: ['X-Result-Capped'],
      origin: (origin, cb) => {
        // Allow same-origin/non-browser requests (no Origin header) and allowlisted origins.
        if (!origin || corsAllowlist.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      }
    })
  );
} else {
  console.warn('WARNING: CORS_ORIGINS is not set — allowing all origins. Set it to lock down the API in production.');
  // `origin: true` reflects the request origin (not `*`), which is required for
  // credentialed requests — the auth cookie won't be sent with a wildcard origin.
  app.use(cors({ origin: true, credentials: true, exposedHeaders: ['X-Result-Capped'] }));
}

// Attach Socket.IO to the same HTTP server with matching CORS settings.
initSocket(server, corsAllowlist.length
  ? { origin: corsAllowlist, credentials: true }
  : { origin: true, credentials: true }
);

app.use(securityHeaders);
app.use(express.json());
app.use(morgan('dev'));
// Uploaded files are user-controlled content. Force the browser to download
// them rather than render in-origin, and never MIME-sniff — otherwise a file
// with a spoofed type/extension (e.g. .svg or .html that slipped past the
// upload mime allowlist) could execute script on our own origin. Content-
// Disposition is ignored for <img> subresource loads, so inline image previews
// still render.
//
// Gate the whole tree: requireAuth proves a valid, non-revoked session (the
// browser auto-sends the httpOnly cookie with <img>/<video>/download requests,
// so inline previews still render), then authorizeUpload enforces per-resource
// access — a file is only served to someone who can see its parent ticket /
// chat room / mailbox thread / space (avatars are visible to any signed-in user).
app.use(
  '/uploads',
  requireAuth,
  authorizeUpload,
  express.static(path.resolve(process.cwd(), 'uploads'), {
    setHeaders: (res) => {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
  })
);

app.get('/api/health', async (req, res) => {
  try {
    await pingDb();
    res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'unreachable', error: err.message });
  }
});

app.use('/api/auth', auth);
app.use('/api/users', users);
app.use('/api/tickets', tickets);
app.use('/api/maintenance', maintenance);
app.use('/api/assets', assets);
app.use('/api/kb', kb);
app.use('/api/asset-requests', assetRequests);
app.use('/api/departments', departments);
app.use('/api/password-resets', passwordResets);
app.use('/api/chat', chat);
app.use('/api/messages', messages);
app.use('/api/surveys', surveys);
app.use('/api/network', network);
app.use('/api/notifications', notifications);
app.use('/api/spaces', spaces);
app.use('/api/announcements', announcements);
app.use('/api/search', search);
app.use('/api/settings', settings);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

ensureSchema()
  .then(() => loadSlaDays())
  .then(() => { startMaintenanceScheduler(); startSpaceDueReminders(); startSlaBreachReminders(); startAutoClose(); })
  .catch((err) => console.error('schema bootstrap failed:', err));

server.listen(PORT, () => {
  console.log(`Hubly API listening on http://localhost:${PORT}`);
  logMailerStatus();
});
