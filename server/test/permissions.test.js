import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODULES,
  effectivePermissions,
  hasPermission,
  sanitizePermissions
} from '../src/lib/permissions.js';

describe('effectivePermissions', () => {
  it('grants admins every module/action', () => {
    const perms = effectivePermissions({ role: 'admin' });
    for (const [mod, actions] of Object.entries(MODULES)) {
      for (const action of actions) {
        assert.equal(perms[mod][action], true, `admin should have ${mod}.${action}`);
      }
    }
  });

  it('applies agent role defaults (no users.manage, but full network)', () => {
    const perms = effectivePermissions({ role: 'agent' });
    assert.equal(perms.users.manage, false);
    assert.equal(perms.network.manage, true);
    assert.equal(perms.tickets.create, true);
  });

  it('applies user role defaults (no manage, no network)', () => {
    const perms = effectivePermissions({ role: 'user' });
    assert.equal(perms.assets.manage, false);
    assert.equal(perms.kb.manage, false);
    assert.equal(perms.network.view, false);
    assert.equal(perms.tickets.view, true);
    assert.equal(perms.tickets.create, true);
  });

  it('lets a per-user override grant one action without touching the rest', () => {
    const perms = effectivePermissions({
      role: 'user',
      permissions: { network: { view: true } }
    });
    assert.equal(perms.network.view, true);    // overridden
    assert.equal(perms.network.manage, false); // still the role default
    assert.equal(perms.assets.manage, false);  // unrelated module untouched
  });

  it('lets a per-user override revoke an action the role grants', () => {
    const perms = effectivePermissions({
      role: 'agent',
      permissions: { tickets: { create: false } }
    });
    assert.equal(perms.tickets.create, false);
    assert.equal(perms.tickets.view, true);
  });

  it('parses a permissions value stored as a JSON string', () => {
    const perms = effectivePermissions({
      role: 'user',
      permissions: '{"network":{"view":true}}'
    });
    assert.equal(perms.network.view, true);
  });

  it('falls back to defaults when the permissions string is malformed', () => {
    const perms = effectivePermissions({ role: 'user', permissions: '{not json' });
    assert.equal(perms.network.view, false);
  });

  it('ignores non-boolean override values', () => {
    const perms = effectivePermissions({
      role: 'user',
      permissions: { network: { view: 'yes', manage: 1 } }
    });
    assert.equal(perms.network.view, false);
    assert.equal(perms.network.manage, false);
  });

  it('treats an unknown role as the user baseline', () => {
    assert.deepEqual(
      effectivePermissions({ role: 'wizard' }),
      effectivePermissions({ role: 'user' })
    );
  });

  it('returns a fully populated matrix of booleans', () => {
    const perms = effectivePermissions({ role: 'agent' });
    for (const [mod, actions] of Object.entries(MODULES)) {
      for (const action of actions) {
        assert.equal(typeof perms[mod][action], 'boolean', `${mod}.${action} should be boolean`);
      }
    }
  });
});

describe('hasPermission', () => {
  it('returns false for a missing user', () => {
    assert.equal(hasPermission(null, 'tickets', 'view'), false);
    assert.equal(hasPermission(undefined, 'tickets', 'view'), false);
  });

  it('reflects the effective permission', () => {
    assert.equal(hasPermission({ role: 'user' }, 'tickets', 'view'), true);
    assert.equal(hasPermission({ role: 'user' }, 'network', 'manage'), false);
  });

  it('returns false for an unknown module or action', () => {
    assert.equal(hasPermission({ role: 'admin' }, 'billing', 'view'), false);
    assert.equal(hasPermission({ role: 'admin' }, 'tickets', 'destroy'), false);
  });
});

describe('sanitizePermissions', () => {
  it('drops unknown modules', () => {
    assert.deepEqual(
      sanitizePermissions({ foo: { bar: true }, network: { view: true } }),
      { network: { view: true } }
    );
  });

  it('drops unknown actions within a known module', () => {
    assert.deepEqual(
      sanitizePermissions({ tickets: { view: true, destroy: true } }),
      { tickets: { view: true } }
    );
  });

  it('drops non-boolean action values', () => {
    assert.equal(sanitizePermissions({ network: { view: 'true', manage: 1 } }), null);
  });

  it('returns null when nothing valid remains', () => {
    assert.equal(sanitizePermissions({}), null);
    assert.equal(sanitizePermissions({ foo: {} }), null);
    assert.equal(sanitizePermissions(null), null);
    assert.equal(sanitizePermissions(undefined), null);
  });

  it('accepts a JSON string and strips unknown keys', () => {
    assert.deepEqual(
      sanitizePermissions('{"kb":{"manage":true},"bogus":{"x":true}}'),
      { kb: { manage: true } }
    );
  });
});
