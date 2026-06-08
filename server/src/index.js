import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import { pingDb, ensureSchema } from './config/db.js';
import { startMaintenanceScheduler } from './lib/maintenance-scheduler.js';
import { securityHeaders } from './middleware/securityHeaders.js';
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

// Fail fast on a missing JWT secret — without it tokens can't be verified safely.
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start. Set a long random value in .env.');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn('WARNING: JWT_SECRET is shorter than 32 characters. Use a longer random value for production.');
}

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// CORS: lock to an allowlist in production via CORS_ORIGINS (comma-separated).
// When unset (e.g. local dev) we fall back to permissive CORS and warn once.
const corsAllowlist = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
if (corsAllowlist.length) {
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow same-origin/non-browser requests (no Origin header) and allowlisted origins.
        if (!origin || corsAllowlist.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      }
    })
  );
} else {
  console.warn('WARNING: CORS_ORIGINS is not set — allowing all origins. Set it to lock down the API in production.');
  app.use(cors());
}

app.use(securityHeaders);
app.use(express.json());
app.use(morgan('dev'));
// Uploaded files are user-controlled content. Force the browser to download
// them rather than render in-origin, and never MIME-sniff — otherwise a file
// with a spoofed type/extension (e.g. .svg or .html that slipped past the
// upload mime allowlist) could execute script on our own origin and read the
// JWT from localStorage. Content-Disposition is ignored for <img> subresource
// loads, so inline image previews still render.
app.use(
  '/uploads',
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

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

ensureSchema()
  .then(() => startMaintenanceScheduler())
  .catch((err) => console.error('schema bootstrap failed:', err));

app.listen(PORT, () => {
  console.log(`Mainframe API listening on http://localhost:${PORT}`);
});
