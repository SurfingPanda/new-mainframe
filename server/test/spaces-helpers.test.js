import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canManageAll, canAdminister, canContribute, canEditItem,
  parseSlaDays, parseDate, serializeLabels, parseLabels, dateOnly,
  dueDateFrom, intId, SLA_MAX_DAYS
} from '../src/lib/spaces-helpers.js';

// A user without spaces.manage (plain role) vs. an admin (has it via role default).
const member = { sub: 7, role: 'user' };
const admin = { sub: 1, role: 'admin' };

describe('canManageAll', () => {
  it('is true for admins, false for plain users', () => {
    assert.equal(canManageAll(admin), true);
    assert.equal(canManageAll(member), false);
  });
});

describe('canAdminister', () => {
  it('allows the space owner', () => {
    assert.equal(canAdminister({ membership: { role: 'owner' } }, member), true);
  });
  it('allows admins regardless of membership', () => {
    assert.equal(canAdminister({ membership: null }, admin), true);
  });
  it('denies a regular member and a project_owner', () => {
    assert.equal(canAdminister({ membership: { role: 'member' } }, member), false);
    assert.equal(canAdminister({ membership: { role: 'project_owner' } }, member), false);
  });
});

describe('canContribute', () => {
  it('allows owner and member, denies the read-only project_owner', () => {
    assert.equal(canContribute({ membership: { role: 'owner' } }, member), true);
    assert.equal(canContribute({ membership: { role: 'member' } }, member), true);
    assert.equal(canContribute({ membership: { role: 'project_owner' } }, member), false);
  });
  it('allows admin oversight even without membership', () => {
    assert.equal(canContribute({ membership: null }, admin), true);
  });
});

describe('canEditItem', () => {
  const access = { membership: { role: 'member' } };
  it('lets a member edit only items assigned to them', () => {
    assert.equal(canEditItem(access, member, { assignee_id: 7 }), true);
    assert.equal(canEditItem(access, member, { assignee_id: 99 }), false);
    assert.equal(canEditItem(access, member, { assignee_id: null }), false);
  });
  it('lets the owner edit any item', () => {
    assert.equal(canEditItem({ membership: { role: 'owner' } }, member, { assignee_id: 99 }), true);
  });
  it('denies a project_owner even for their own would-be items', () => {
    assert.equal(canEditItem({ membership: { role: 'project_owner' } }, member, { assignee_id: 7 }), false);
  });
});

describe('parseSlaDays', () => {
  it('treats empty/null as "clear"', () => {
    assert.deepEqual(parseSlaDays(''), { ok: true, value: null });
    assert.deepEqual(parseSlaDays(null), { ok: true, value: null });
    assert.deepEqual(parseSlaDays(undefined), { ok: true, value: null });
  });
  it('accepts whole days within range', () => {
    assert.deepEqual(parseSlaDays('5'), { ok: true, value: 5 });
    assert.deepEqual(parseSlaDays(SLA_MAX_DAYS), { ok: true, value: SLA_MAX_DAYS });
  });
  it('rejects zero, negatives, fractions, and out-of-range', () => {
    assert.equal(parseSlaDays(0).ok, false);
    assert.equal(parseSlaDays(-1).ok, false);
    assert.equal(parseSlaDays(1.5).ok, false);
    assert.equal(parseSlaDays(SLA_MAX_DAYS + 1).ok, false);
  });
});

describe('parseDate', () => {
  it('accepts a YYYY-MM-DD value', () => {
    assert.deepEqual(parseDate('2026-06-16'), { ok: true, value: '2026-06-16' });
  });
  it('treats empty as clear, rejects malformed', () => {
    assert.deepEqual(parseDate(''), { ok: true, value: null });
    assert.equal(parseDate('16/06/2026').ok, false);
    assert.equal(parseDate('2026-13-40').ok, false);
  });
});

describe('serializeLabels / parseLabels', () => {
  it('round-trips an array to a comma string and back, deduped and trimmed', () => {
    assert.equal(serializeLabels([' bug ', 'ui', 'bug']), 'bug,ui');
    assert.deepEqual(parseLabels('bug,ui'), ['bug', 'ui']);
  });
  it('returns null for an empty result and [] for empty input', () => {
    assert.equal(serializeLabels([]), null);
    assert.deepEqual(parseLabels(''), []);
    assert.deepEqual(parseLabels(null), []);
  });
});

describe('dateOnly', () => {
  it('formats a Date as local YYYY-MM-DD and passes through null', () => {
    assert.equal(dateOnly(new Date(2026, 5, 16)), '2026-06-16'); // month is 0-based
    assert.equal(dateOnly(null), null);
    assert.equal(dateOnly('not a date'), null);
  });
});

describe('dueDateFrom', () => {
  it('adds the SLA days to the base date', () => {
    assert.equal(dueDateFrom('2026-06-16', 5), '2026-06-21');
    assert.equal(dueDateFrom('2026-06-16', null), null);
  });
});

describe('intId', () => {
  it('accepts positive integers, rejects everything else', () => {
    assert.equal(intId('42'), 42);
    assert.equal(intId(0), null);
    assert.equal(intId(-3), null);
    assert.equal(intId('abc'), null);
    assert.equal(intId(2.5), null);
  });
});
