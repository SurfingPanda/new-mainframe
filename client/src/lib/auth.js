const TOKEN_KEY = 'mf_token';
const USER_KEY = 'mf_user';

// Mirrors server/src/lib/permissions.js. Used as a fallback when the stored
// user record predates per-module permissions or has missing keys.
const ROLE_DEFAULTS = {
  admin: {
    tickets: { view: true,  create: true  },
    assets:  { view: true,  manage: true  },
    kb:      { view: true,  manage: true  },
    users:   { manage: true }
  },
  agent: {
    tickets: { view: true,  create: true  },
    assets:  { view: true,  manage: true  },
    kb:      { view: true,  manage: true  },
    users:   { manage: false }
  },
  user: {
    tickets: { view: true,  create: true  },
    assets:  { view: true,  manage: false },
    kb:      { view: true,  manage: false },
    users:   { manage: false }
  }
};

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken());
}

export function hasPermission(module, action, user = getUser()) {
  if (!user) return false;
  const fromUser = user.permissions?.[module]?.[action];
  if (typeof fromUser === 'boolean') return fromUser;
  const role = ROLE_DEFAULTS[user.role] ? user.role : 'user';
  return !!ROLE_DEFAULTS[role][module]?.[action];
}

export async function api(path, options = {}) {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
