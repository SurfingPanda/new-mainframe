import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickPolicy, effectiveTargets, sanitizePolicy } from '../src/lib/sla-policies.js';

const policies = [
  { id: 1, priority: null, request_type: null, category: null, department: null, response_minutes: null, resolution_minutes: 4320, rank: 0 }, // wildcard
  { id: 2, priority: 'high', request_type: null, category: null, department: null, response_minutes: 60, resolution_minutes: 2880, rank: 0 }, // high
  { id: 3, priority: 'high', request_type: null, category: 'Security', department: null, response_minutes: 30, resolution_minutes: 1440, rank: 0 } // high+Security
];

describe('pickPolicy', () => {
  it('picks the most specific matching policy', () => {
    const p = pickPolicy({ priority: 'high', category: 'Security' }, policies);
    assert.equal(p.id, 3);
  });

  it('falls back to a less specific match when the specific one does not apply', () => {
    const p = pickPolicy({ priority: 'high', category: 'Hardware' }, policies);
    assert.equal(p.id, 2);
  });

  it('matches the wildcard when nothing more specific applies', () => {
    const p = pickPolicy({ priority: 'low' }, policies);
    assert.equal(p.id, 1);
  });

  it('is case-insensitive on matcher values', () => {
    const p = pickPolicy({ priority: 'high', category: 'security' }, policies);
    assert.equal(p.id, 3);
  });

  it('returns null when no policy matches', () => {
    assert.equal(pickPolicy({ priority: 'urgent' }, [{ id: 9, priority: 'low', resolution_minutes: 10 }]), null);
  });
});

describe('effectiveTargets', () => {
  it('uses the matched policy targets', () => {
    const t = effectiveTargets({ priority: 'high', category: 'Security' }, policies, { low: 7, normal: 3, high: 2, urgent: 1 });
    assert.deepEqual(t, { policyId: 3, responseMinutes: 30, resolutionMinutes: 1440, calendarId: null });
  });

  it('falls back to per-priority sla_days (in minutes) with no response target', () => {
    const t = effectiveTargets({ priority: 'urgent' }, [], { low: 7, normal: 3, high: 2, urgent: 1 });
    assert.deepEqual(t, { policyId: null, responseMinutes: null, resolutionMinutes: 1440, calendarId: null });
  });
});

describe('sanitizePolicy', () => {
  it('requires a name and a positive resolution on create', () => {
    assert.ok(sanitizePolicy({ resolution_minutes: 60 }).error); // no name
    assert.ok(sanitizePolicy({ name: 'X' }).error);              // no resolution
    assert.ok(sanitizePolicy({ name: 'X', resolution_minutes: 0 }).error);
  });

  it('normalizes a valid create payload and drops invalid matchers', () => {
    const { value } = sanitizePolicy({
      name: 'High SLA', priority: 'high', request_type: 'bogus',
      category: 'Security', response_minutes: 60, resolution_minutes: 2880
    });
    assert.equal(value.name, 'High SLA');
    assert.equal(value.priority, 'high');
    assert.equal(value.request_type, null); // invalid enum dropped to wildcard
    assert.equal(value.category, 'Security');
    assert.equal(value.response_minutes, 60);
    assert.equal(value.resolution_minutes, 2880);
    assert.equal(value.is_active, 1);
  });

  it('partial update only touches provided fields', () => {
    const { value } = sanitizePolicy({ response_minutes: 15 }, { partial: true });
    assert.deepEqual(value, { response_minutes: 15 });
  });
});
