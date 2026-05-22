// UniFi local controller client.
//
// Handles login + cookie session against either:
//   - Classic UniFi Network controller  (https://host:8443, paths under /api/...)
//   - UniFi OS / UDM / Cloud Key Gen2+  (https://host, paths under /proxy/network/api/...)
//
// Set UNIFI_OS=true to use the UniFi OS path layout. Self-signed certs are
// allowed when UNIFI_INSECURE_TLS=true (typical for on-prem controllers).
//
// When UNIFI_HOST is unset, getUnifi() returns null and callers should fall
// back to mock data — keeps dev usable without a controller.

import { Agent } from 'undici';

let cached = null;     // { cookie, csrf, expiresAt }
let cachedAgent = null; // undici Agent for self-signed controllers

function isConfigured() {
  if (!process.env.UNIFI_HOST) return false;
  // Either a pasted browser cookie or username/password is enough.
  if (process.env.UNIFI_COOKIE) return true;
  return Boolean(process.env.UNIFI_USERNAME && process.env.UNIFI_PASSWORD);
}

// When UNIFI_COOKIE is provided, we skip login entirely and reuse the
// browser-session cookie. Useful when the admin account requires 2FA / SSO
// and a local admin or API key isn't available.
function staticCookie() {
  return process.env.UNIFI_COOKIE || '';
}

function baseUrl() {
  const host = process.env.UNIFI_HOST.replace(/\/+$/, '');
  return host.startsWith('http') ? host : `https://${host}`;
}

function isUnifiOs() {
  return String(process.env.UNIFI_OS || '').toLowerCase() === 'true';
}

function apiPrefix() {
  return isUnifiOs() ? '/proxy/network/api' : '/api';
}

// Login endpoints to try, in order. The modern path (/api/auth/login) is used
// by UniFi OS *and* the modern self-hosted UniFi Network Server (v8+). The
// legacy path (/api/login) covers older self-hosted controllers.
function loginPaths() {
  return ['/api/auth/login', '/api/login'];
}

function dispatcher() {
  const insecure = String(process.env.UNIFI_INSECURE_TLS || '').toLowerCase() === 'true';
  if (!insecure) return undefined;
  if (!cachedAgent) cachedAgent = new Agent({ connect: { rejectUnauthorized: false } });
  return cachedAgent;
}

function collectCookies(headers) {
  // Node 20+ exposes getSetCookie() per WHATWG; older Node may not.
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

async function login() {
  const body = JSON.stringify({
    username: process.env.UNIFI_USERNAME,
    password: process.env.UNIFI_PASSWORD,
    remember: true,
  });

  const attempts = [];
  for (const path of loginPaths()) {
    const url = `${baseUrl()}${path}`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        dispatcher: dispatcher(),
      });
    } catch (e) {
      attempts.push(`${path} → network error: ${e.message}`);
      continue;
    }

    if (res.ok) {
      const cookie = collectCookies(res.headers)
        .map((c) => c.split(';')[0])
        .join('; ');
      const csrf = res.headers.get('x-csrf-token') || '';
      cached = { cookie, csrf, expiresAt: Date.now() + 30 * 60 * 1000 };
      return cached;
    }

    attempts.push(`${path} → ${res.status} ${res.statusText}`);
    // 404 or 405 means this path isn't on this controller; try the next.
    // Anything else (401/403) is a real auth failure — stop trying.
    if (res.status !== 404 && res.status !== 405) break;
  }

  throw new Error(`UniFi login failed: ${attempts.join('; ')}`);
}

async function ensureSession() {
  // Pasted cookie short-circuits login — don't re-auth, don't expire on a
  // timer. The controller will reject the cookie on its own when it expires;
  // unifiFetch handles that with a 401 retry path that surfaces the error.
  const stat = staticCookie();
  if (stat) {
    // Extract csrf_token from the cookie blob so POST requests can echo it
    // back via the X-CSRF-Token header (the controller compares the two).
    const match = stat.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return {
      cookie: stat,
      csrf: match ? match[1] : '',
      expiresAt: Number.MAX_SAFE_INTEGER,
    };
  }
  if (cached && cached.expiresAt > Date.now() && cached.cookie) return cached;
  return login();
}

async function unifiFetch(path, { method = 'GET', body } = {}) {
  const session = await ensureSession();
  const url = `${baseUrl()}${apiPrefix()}${path}`;
  const headers = { Cookie: session.cookie };
  if (body) headers['Content-Type'] = 'application/json';
  if (session.csrf) headers['X-CSRF-Token'] = session.csrf;

  let res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    dispatcher: dispatcher(),
  });

  // Session may have expired on the controller — retry once with fresh login.
  // Skip the retry when using a pasted cookie (login isn't an option there);
  // the user has to re-paste a fresh cookie from the browser.
  if (res.status === 401 && !staticCookie()) {
    cached = null;
    const retry = await ensureSession();
    headers.Cookie = retry.cookie;
    if (retry.csrf) headers['X-CSRF-Token'] = retry.csrf;
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      dispatcher: dispatcher(),
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 && staticCookie()) {
      throw new Error('UniFi cookie rejected — re-grab UNIFI_COOKIE from your browser DevTools (Application → Cookies → 127.0.0.1:8080)');
    }
    throw new Error(`UniFi ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return Array.isArray(data?.data) ? data.data : data;
}

function site() {
  return process.env.UNIFI_SITE || 'default';
}

// Wrappers for the endpoints the dashboard needs.
const api = {
  // Site overview (one row per site).
  sitesOverview: () => unifiFetch(`/self/sites`),
  // Per-subsystem health: wan, www, lan, wlan, vpn.
  health: () => unifiFetch(`/s/${site()}/stat/health`),
  // All UniFi devices on this site (APs, switches, gateways).
  devices: () => unifiFetch(`/s/${site()}/stat/device`),
  // Currently connected clients.
  activeClients: () => unifiFetch(`/s/${site()}/stat/sta`),
  // Recent events (errors, joins, etc.).
  events: ({ limit = 30 } = {}) => unifiFetch(`/s/${site()}/stat/event?_limit=${limit}`),
  // 5-minute site stats over a range.
  reportSite5min: ({ start, end, attrs = ['num_sta', 'wan-tx_bytes', 'wan-rx_bytes', 'lan-tx_bytes', 'lan-rx_bytes'] }) =>
    unifiFetch(`/s/${site()}/stat/report/5minutes.site`, {
      method: 'POST',
      body: { attrs, start, end },
    }),
  // Per-client usage over a range — used for "top clients".
  reportUserDaily: ({ start, end, attrs = ['rx_bytes', 'tx_bytes'] }) =>
    unifiFetch(`/s/${site()}/stat/report/daily.user`, {
      method: 'POST',
      body: { attrs, start, end },
    }),
};

export function getUnifi() {
  if (!isConfigured()) return null;
  return api;
}

export const unifiConfigured = isConfigured;
