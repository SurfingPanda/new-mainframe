import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { businessMsBetween, businessMinutesBetween } from '../src/lib/business-hours.js';

const HOUR = 3600000;
const week = { mon: [['09:00', '17:00']], tue: [['09:00', '17:00']], wed: [['09:00', '17:00']], thu: [['09:00', '17:00']], fri: [['09:00', '17:00']], sat: [], sun: [] };
// Use UTC so the instants are unambiguous in tests. (2026-06-15 is a Monday.)
const cal = (holidays = []) => ({ timezone: 'UTC', hours: week, holidays: new Set(holidays) });
const U = (d, h, mi = 0) => Date.UTC(2026, 5, d, h, mi); // June is month index 5

describe('businessMsBetween', () => {
  it('counts a sub-window within one business day', () => {
    assert.equal(businessMsBetween(U(17, 10), U(17, 12), cal()), 2 * HOUR); // Wed 10–12
  });

  it('clips to the day’s open window', () => {
    assert.equal(businessMsBetween(U(17, 8), U(17, 18), cal()), 8 * HOUR); // 09–17
  });

  it('is zero entirely outside hours', () => {
    assert.equal(businessMsBetween(U(17, 18), U(17, 20), cal()), 0);
  });

  it('skips weekends', () => {
    // Fri 16:00 → Mon 10:00 = 1h Fri + 1h Mon (Sat/Sun closed)
    assert.equal(businessMsBetween(U(19, 16), U(22, 10), cal()), 2 * HOUR);
  });

  it('excludes a holiday', () => {
    assert.equal(businessMsBetween(U(17, 8), U(17, 18), cal(['2026-06-17'])), 0);
  });

  it('sums a full Mon–Fri week', () => {
    assert.equal(businessMsBetween(U(15, 9), U(19, 17), cal()), 40 * HOUR); // 5 × 8h
  });

  it('returns 0 for a non-positive interval', () => {
    assert.equal(businessMsBetween(U(17, 12), U(17, 12), cal()), 0);
    assert.equal(businessMsBetween(U(17, 12), U(17, 10), cal()), 0);
  });

  it('businessMinutesBetween converts ms to minutes', () => {
    assert.equal(businessMinutesBetween(U(17, 10), U(17, 11), cal()), 60);
  });
});
