// Per-module access control. A user's `permissions` JSON column overrides the
// role defaults below. Set a module/action to true/false to grant or deny;
// omit it to fall back to the role default.

export const MODULES = {
  tickets: ['view', 'create'],
  assets:  ['view', 'manage'],
  kb:      ['view', 'manage'],
  users:   ['manage']
};

export const ROLE_DEFAULTS = {
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

function parsePermissions(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Merge role defaults with the user's overrides. Returns a fully populated
// { module: { action: bool } } object.
export function effectivePermissions(user) {
  const role = user?.role && ROLE_DEFAULTS[user.role] ? user.role : 'user';
  const overrides = parsePermissions(user?.permissions) || {};
  const out = {};
  for (const [mod, actions] of Object.entries(MODULES)) {
    out[mod] = {};
    for (const action of actions) {
      const override = overrides[mod]?.[action];
      out[mod][action] = typeof override === 'boolean'
        ? override
        : !!ROLE_DEFAULTS[role][mod][action];
    }
  }
  return out;
}

export function hasPermission(user, module, action) {
  if (!user) return false;
  return !!effectivePermissions(user)[module]?.[action];
}

// Strip a permissions payload to only known module/action keys with boolean
// values. Returns null when nothing remains so we store NULL (= role default).
export function sanitizePermissions(raw) {
  const parsed = parsePermissions(raw);
  if (!parsed) return null;
  const cleaned = {};
  for (const [mod, actions] of Object.entries(MODULES)) {
    const modOverrides = parsed[mod];
    if (!modOverrides || typeof modOverrides !== 'object') continue;
    const modOut = {};
    for (const action of actions) {
      if (typeof modOverrides[action] === 'boolean') {
        modOut[action] = modOverrides[action];
      }
    }
    if (Object.keys(modOut).length) cleaned[mod] = modOut;
  }
  return Object.keys(cleaned).length ? cleaned : null;
}
