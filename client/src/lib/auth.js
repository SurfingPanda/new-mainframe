// The auth token now lives in an httpOnly cookie set by the server — it is
// deliberately NOT readable from JS (XSS can't exfiltrate it). Only the
// non-sensitive user profile is cached here to drive UI gating.
const USER_KEY = 'mf_user';

// Mirrors server/src/lib/permissions.js. Used as a fallback when the stored
// user record predates per-module permissions or has missing keys.
const ROLE_DEFAULTS = {
  admin: {
    tickets:  { view: true,  create: true  },
    assets:   { view: true,  manage: true  },
    kb:       { view: true,  manage: true  },
    users:    { manage: true },
    network:  { view: true,  manage: true  },
    spaces:   { view: true,  manage: true  }
  },
  agent: {
    tickets:  { view: true,  create: true  },
    assets:   { view: true,  manage: true  },
    kb:       { view: true,  manage: true  },
    users:    { manage: false },
    network:  { view: true,  manage: true  },
    spaces:   { view: true,  manage: false }
  },
  user: {
    tickets:  { view: true,  create: true  },
    assets:   { view: true,  manage: false },
    kb:       { view: true,  manage: false },
    users:    { manage: false },
    network:  { view: false, manage: false },
    spaces:   { view: true,  manage: false }
  }
};

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(USER_KEY);
}

// Sign out: ask the server to clear the auth cookie, then drop the cached user.
export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* clearing the cookie is best-effort; always clear locally */
  }
  clearSession();
}

// Merge a partial update into the stored user (e.g. after a self-service
// profile edit) so cached reads via getUser() reflect the change on next render.
export function updateStoredUser(partial) {
  const current = getUser();
  if (!current) return null;
  const next = { ...current, ...partial };
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  return next;
}

// We can't read the httpOnly cookie, so presence of a cached user stands in for
// "logged in". This is UX gating only — the server re-checks the cookie on every
// request and returns 401 (which clears the session) if it's missing/invalid.
export function isAuthenticated() {
  return Boolean(getUser());
}

export function hasPermission(module, action, user = getUser()) {
  if (!user) return false;
  const fromUser = user.permissions?.[module]?.[action];
  if (typeof fromUser === 'boolean') return fromUser;
  const role = ROLE_DEFAULTS[user.role] ? user.role : 'user';
  return !!ROLE_DEFAULTS[role][module]?.[action];
}

export async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(path, {
    ...options,
    // Send the httpOnly auth cookie with every request (and accept Set-Cookie).
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    clearSession();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with ${res.status}`);
  }
  return data;
}
