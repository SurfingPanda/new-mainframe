import { pool } from '../config/db.js';

// Department managers: a user heads at most one department (departments.manager_id).
// These helpers answer "does this user manage department X" for department-scoped
// oversight (work orders, requests, etc.) without baking the rule into each route.

// The department NAMES this user heads (normally 0 or 1).
export async function managedDepartments(userId) {
  if (!userId) return [];
  const [rows] = await pool.query('SELECT name FROM departments WHERE manager_id = ?', [userId]);
  return rows.map((r) => r.name);
}

// True when `userId` is the manager of the named department.
export async function managesDepartment(userId, departmentName) {
  if (!userId || !departmentName) return false;
  const [[row]] = await pool.query(
    'SELECT 1 AS yes FROM departments WHERE manager_id = ? AND name = ? LIMIT 1',
    [userId, departmentName]
  );
  return !!row;
}

// The name of the designated HR department (is_hr = 1), or null if none is set.
export async function hrDepartmentName() {
  const [[row]] = await pool.query('SELECT name FROM departments WHERE is_hr = 1 LIMIT 1');
  return row?.name || null;
}

// The active manager of the named department as { id, name }, or null.
export async function managerOfDepartment(departmentName) {
  if (!departmentName) return null;
  const [[row]] = await pool.query(
    `SELECT u.id, u.name
       FROM departments d JOIN users u ON u.id = d.manager_id
      WHERE d.name = ? AND u.is_active = 1 LIMIT 1`,
    [departmentName]
  );
  return row ? { id: row.id, name: row.name } : null;
}
