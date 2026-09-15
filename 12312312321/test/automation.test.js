import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesConditions, normalizeActions, sanitizeConditions } from '../src/lib/automation.js';

const ticket = {
  id: 1,
  title: 'VPN not connecting',
  status: 'open',
  priority: 'high',
  request_type: 'incident',
  category: 'Network',
  department: null,
  assignee: null,
  requester: 'Jane Doe'
};

describe('matchesConditions', () => {
  it('matches a single eq rule (case-insensitive)', () => {
    assert.equal(
      matchesConditions(ticket, { match: 'all', rules: [{ field: 'category', op: 'eq', value: 'network' }] }),
      true
    );
  });

  it('all-match requires every rule to pass', () => {
    const conds = { match: 'all', rules: [
      { field: 'category', op: 'eq', value: 'Network' },
      { field: 'priority', op: 'eq', value: 'low' }
    ] };
    assert.equal(matchesConditions(ticket, conds), false);
  });

  it('any-match passes when one rule passes', () => {
    const conds = { match: 'any', rules: [
      { field: 'category', op: 'eq', value: 'Hardware' },
      { field: 'priority', op: 'eq', value: 'high' }
    ] };
    assert.equal(matchesConditions(ticket, conds), true);
  });

  it('contains / in / is_empty operators', () => {
    assert.equal(matchesConditions(ticket, { rules: [{ field: 'title', op: 'contains', value: 'vpn' }] }), true);
    assert.equal(matchesConditions(ticket, { rules: [{ field: 'priority', op: 'in', value: ['high', 'urgent'] }] }), true);
    assert.equal(matchesConditions(ticket, { rules: [{ field: 'department', op: 'is_empty' }] }), true);
    assert.equal(matchesConditions(ticket, { rules: [{ field: 'assignee', op: 'is_not_empty' }] }), false);
  });

  it('never matches an empty or invalid rule set', () => {
    assert.equal(matchesConditions(ticket, { match: 'all', rules: [] }), false);
    assert.equal(matchesConditions(ticket, null), false);
    assert.equal(matchesConditions(ticket, { rules: [{ field: 'bogus', op: 'eq', value: 'x' }] }), false);
  });
});

describe('normalizeActions', () => {
  it('keeps valid set_field actions and validates enums', () => {
    const out = normalizeActions([
      { type: 'set_field', field: 'priority', value: 'urgent' },
      { type: 'set_field', field: 'department', value: 'IT' }
    ]);
    assert.deepEqual(out, [
      { type: 'set_field', field: 'priority', value: 'urgent' },
      { type: 'set_field', field: 'department', value: 'IT' }
    ]);
  });

  it('drops set_field with an unknown field or invalid enum value', () => {
    const out = normalizeActions([
      { type: 'set_field', field: 'title', value: 'nope' },        // not settable
      { type: 'set_field', field: 'priority', value: 'critical' }, // not a valid enum
      { type: 'set_field', field: 'status', value: 'closed' }
    ]);
    assert.deepEqual(out, [{ type: 'set_field', field: 'status', value: 'closed' }]);
  });

  it('keeps non-empty notes and drops empty ones', () => {
    const out = normalizeActions([
      { type: 'add_note', value: '  Auto-triaged  ' },
      { type: 'add_note', value: '   ' },
      { type: 'bogus', value: 'x' }
    ]);
    assert.deepEqual(out, [{ type: 'add_note', value: 'Auto-triaged' }]);
  });

  it('returns [] for non-array input', () => {
    assert.deepEqual(normalizeActions(null), []);
    assert.deepEqual(normalizeActions('{}'), []);
  });
});

describe('sanitizeConditions', () => {
  it('keeps valid rules and defaults match to all', () => {
    const out = sanitizeConditions({ rules: [{ field: 'category', op: 'eq', value: 'Network' }] });
    assert.deepEqual(out, { match: 'all', rules: [{ field: 'category', op: 'eq', value: 'Network' }] });
  });

  it('preserves an explicit any match', () => {
    const out = sanitizeConditions({ match: 'any', rules: [{ field: 'priority', op: 'eq', value: 'high' }] });
    assert.equal(out.match, 'any');
  });

  it('drops unknown fields/ops and value-required rules with no value', () => {
    const out = sanitizeConditions({ rules: [
      { field: 'bogus', op: 'eq', value: 'x' },
      { field: 'status', op: 'bogus', value: 'open' },
      { field: 'priority', op: 'eq', value: '' },
      { field: 'department', op: 'is_empty' }
    ] });
    assert.deepEqual(out, { match: 'all', rules: [{ field: 'department', op: 'is_empty' }] });
  });

  it('coerces the in operator to a non-empty array', () => {
    assert.deepEqual(
      sanitizeConditions({ rules: [{ field: 'priority', op: 'in', value: ['high', 'urgent'] }] }),
      { match: 'all', rules: [{ field: 'priority', op: 'in', value: ['high', 'urgent'] }] }
    );
    assert.equal(sanitizeConditions({ rules: [{ field: 'priority', op: 'in', value: [] }] }), null);
  });

  it('returns null when nothing valid remains', () => {
    assert.equal(sanitizeConditions({ rules: [] }), null);
    assert.equal(sanitizeConditions(null), null);
  });
});
