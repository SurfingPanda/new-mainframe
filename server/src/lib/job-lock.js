// Cross-process coordination for background jobs via MySQL advisory locks.
//
// The app's schedulers (maintenance, SLA monitor, idle automations, auto-close,
// and the daily reminder digests) run in-process on a setInterval. With a single
// process that's fine. But if the API is ever run as 2+ instances against the
// same database, each instance's timer would fire the same job concurrently —
// generating duplicate work orders, double-sending digest emails, and racing the
// idle/breach dedupe checks. See the multi-process note in config/db.js.
//
// GET_LOCK gives us a database-scoped named mutex with NO extra dependency. We
// take it non-blocking (timeout 0): if another instance already holds a job's
// lock, this tick simply skips and tries again next interval. GET_LOCK is
// connection-scoped, so we hold one dedicated pooled connection for the lock's
// lifetime and release both the lock and the connection in finally.
//
// Each job uses its own lock name, so different jobs still run in parallel across
// instances — we only serialize a job against itself.

import { pool } from '../config/db.js';

const LOCK_PREFIX = 'hubly:job:';

// Run `fn` while holding the named advisory lock, then release it. If the lock is
// already held (by another instance, or an overlapping tick on this one), `fn` is
// skipped. Guaranteed not to throw — a lock/connection failure is logged and the
// run is skipped (the job retries next tick), matching the schedulers' own
// never-throw contract.
export async function runWithLock(name, fn) {
  const lockName = `${LOCK_PREFIX}${name}`.slice(0, 64); // MySQL lock names cap at 64 chars
  let conn;
  try {
    conn = await pool.getConnection();
  } catch (err) {
    console.error(`[job-lock] no connection for "${name}":`, err.message);
    return; // skip this tick
  }

  let acquired = false;
  try {
    const [[row]] = await conn.query('SELECT GET_LOCK(?, 0) AS ok', [lockName]);
    if (Number(row?.ok) !== 1) return; // held elsewhere — another instance has this job
    acquired = true;
    return await fn();
  } catch (err) {
    console.error(`[job-lock] run "${name}" failed:`, err.message);
  } finally {
    if (acquired) {
      try {
        await conn.query('SELECT RELEASE_LOCK(?)', [lockName]);
      } catch (err) {
        console.error(`[job-lock] release "${name}" failed:`, err.message);
      }
    }
    conn.release();
  }
}
