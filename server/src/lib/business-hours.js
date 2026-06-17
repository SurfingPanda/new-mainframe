// Business-hours engine for SLA clocks. Given a calendar (weekly open windows +
// holidays + timezone), `businessMsBetween(start, end)` returns how much *working*
// time falls in [start, end). When a ticket's policy has no calendar the SLA clock
// stays 24/7 (callers pass cal = null and fall back to raw elapsed).
//
// All timezone math uses Intl.DateTimeFormat (no dependency). The pure functions
// (businessMsBetween / businessMinutesBetween) are unit-tested.

import { pool } from '../config/db.js';

const HOUR = 3600000;
const WD = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };
const pad = (n) => String(n).padStart(2, '0');

const FMT_CACHE = new Map();
function fmtFor(tz) {
  if (!FMT_CACHE.has(tz)) {
    FMT_CACHE.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }));
  }
  return FMT_CACHE.get(tz);
}

// Local wall-clock parts for an instant in `tz`.
function getParts(ms, tz) {
  const m = {};
  for (const p of fmtFor(tz).formatToParts(new Date(ms))) m[p.type] = p.value;
  return {
    year: +m.year, month: +m.month, day: +m.day,
    hour: +(m.hour === '24' ? '00' : m.hour), minute: +m.minute, second: +m.second,
    weekday: m.weekday
  };
}

// Offset (local − UTC) in ms at instant `ms`.
function tzOffsetMs(ms, tz) {
  const p = getParts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
}

// The UTC instant for a local wall time in `tz` (two-pass for DST correctness).
function instantFromLocal(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const off1 = tzOffsetMs(guess, tz);
  let inst = guess - off1;
  const off2 = tzOffsetMs(inst, tz);
  if (off2 !== off1) inst = guess - off2;
  return inst;
}

function localMidnight(ms, tz) {
  const p = getParts(ms, tz);
  return instantFromLocal(p.year, p.month, p.day, 0, 0, tz);
}
function nextLocalMidnight(ms, tz) {
  const p = getParts(ms + 26 * HOUR, tz); // +26h safely crosses any DST into next day
  return instantFromLocal(p.year, p.month, p.day, 0, 0, tz);
}

// Working milliseconds in [startMs, endMs) under a calendar.
// calendar: { timezone, hours: { mon:[["09:00","18:00"]], … }, holidays: Set('YYYY-MM-DD') }
export function businessMsBetween(startMs, endMs, calendar) {
  if (!(endMs > startMs)) return 0;
  const tz = calendar?.timezone || 'UTC';
  const hours = calendar?.hours || {};
  const holidays = calendar?.holidays;

  let cursor = localMidnight(startMs, tz);
  let total = 0;
  let guard = 0;
  while (cursor < endMs && guard++ < 4000) {
    const p = getParts(cursor, tz);
    const dateStr = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
    const windows = holidays?.has(dateStr) ? [] : (hours[WD[p.weekday]] || []);
    for (const [ws, we] of windows) {
      const [wsh, wsm] = ws.split(':').map(Number);
      const [weh, wem] = we.split(':').map(Number);
      const winStart = instantFromLocal(p.year, p.month, p.day, wsh, wsm, tz);
      const winEnd = instantFromLocal(p.year, p.month, p.day, weh, wem, tz);
      const lo = Math.max(winStart, startMs);
      const hi = Math.min(winEnd, endMs);
      if (hi > lo) total += hi - lo;
    }
    cursor = nextLocalMidnight(cursor, tz);
  }
  return total;
}

export const businessMinutesBetween = (a, b, cal) => businessMsBetween(a, b, cal) / 60000;

// ── Calendar cache (loaded at boot, refreshed on save) ──

let cache = new Map(); // id -> { id, name, timezone, hours, holidays:Set, is_default }

function dateOnly(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function loadSlaCalendars() {
  try {
    const [cals] = await pool.query('SELECT id, name, timezone, hours, is_default FROM sla_calendars');
    const [hols] = await pool.query('SELECT calendar_id, holiday_date FROM sla_holidays');
    const holsByCal = new Map();
    for (const h of hols) {
      if (!holsByCal.has(h.calendar_id)) holsByCal.set(h.calendar_id, new Set());
      const d = dateOnly(h.holiday_date);
      if (d) holsByCal.get(h.calendar_id).add(d);
    }
    const next = new Map();
    for (const c of cals) {
      const hours = typeof c.hours === 'string' ? JSON.parse(c.hours) : c.hours;
      next.set(c.id, {
        id: c.id, name: c.name, timezone: c.timezone,
        hours: hours || {}, holidays: holsByCal.get(c.id) || new Set(),
        is_default: !!c.is_default
      });
    }
    cache = next;
  } catch (err) {
    console.error('loadSlaCalendars failed:', err.message);
  }
  return cache;
}

export function getCalendarById(id) {
  return id == null ? null : cache.get(Number(id)) || null;
}

// One-time seed: a Mon–Fri 09:00–18:00 calendar so admins have a ready option.
export async function seedDefaultCalendarIfEmpty(timezone = 'Asia/Manila') {
  try {
    const [[{ c }]] = await pool.query('SELECT COUNT(*) AS c FROM sla_calendars');
    if (c > 0) return;
    const hours = JSON.stringify({
      mon: [['09:00', '18:00']], tue: [['09:00', '18:00']], wed: [['09:00', '18:00']],
      thu: [['09:00', '18:00']], fri: [['09:00', '18:00']], sat: [], sun: []
    });
    await pool.query(
      `INSERT INTO sla_calendars (name, timezone, hours, is_default) VALUES (?, ?, ?, 1)`,
      ['Standard business hours (Mon–Fri 9–6)', timezone, hours]
    );
    console.log('[sla] seeded default business-hours calendar');
  } catch (err) {
    console.error('seedDefaultCalendar failed:', err.message);
  }
}
