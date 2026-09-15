// Configurable SLA targets (days to resolve, per priority). Admin-managed via the
// SLA Settings page and stored in app_settings under the 'sla_days' key. A
// module-level cache is loaded once at boot and refreshed on every save, so the
// hot path (slaStanding) reads it synchronously without a DB round-trip.

import { pool } from '../config/db.js';

export const SLA_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
export const DEFAULT_SLA_DAYS = { low: 7, normal: 3, high: 2, urgent: 1 };
const SETTING_KEY = 'sla_days';

let cache = { ...DEFAULT_SLA_DAYS };

// Keep only known priorities mapped to a sane integer day count; unknown keys are
// dropped and out-of-range values are ignored (fall back to whatever's merged in).
export function sanitizeSlaDays(input) {
  const out = {};
  if (input && typeof input === 'object') {
    for (const p of SLA_PRIORITIES) {
      const n = Number(input[p]);
      if (Number.isInteger(n) && n >= 1 && n <= 365) out[p] = n;
    }
  }
  return out;
}

// Current SLA targets (always a full {low,normal,high,urgent} object).
export function getSlaDays() {
  return cache;
}

// Load the persisted targets into the cache. Safe to call before/without a row.
export async function loadSlaDays() {
  try {
    const [rows] = await pool.query(
      'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
      [SETTING_KEY]
    );
    if (rows[0]) {
      const raw = rows[0].setting_value;
      const val = typeof raw === 'string' ? JSON.parse(raw) : raw;
      cache = { ...DEFAULT_SLA_DAYS, ...sanitizeSlaDays(val) };
    }
  } catch (err) {
    console.error('loadSlaDays failed:', err.message);
  }
  return cache;
}

// Persist new targets (merged over defaults) and refresh the cache.
export async function saveSlaDays(input, userId = null) {
  const merged = { ...DEFAULT_SLA_DAYS, ...sanitizeSlaDays(input) };
  // Pass the JSON as a plain string — valid for a MySQL JSON column and for
  // MariaDB (where JSON is a LONGTEXT alias). `CAST(... AS JSON)` is rejected by
  // MariaDB, so avoid it.
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by)
       VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    [SETTING_KEY, JSON.stringify(merged), userId]
  );
  cache = merged;
  return cache;
}
