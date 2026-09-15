import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/db.js';

const [, , email, password, name = 'Admin', role = 'admin', department = 'IT'] = process.argv;

if (!email || !password) {
  console.error('Usage: node scripts/seed-user.js <email> <password> [name] [role] [department]');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);

await pool.query(
  `INSERT INTO users (email, password_hash, name, role, department)
   VALUES (?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE
     password_hash = VALUES(password_hash),
     name          = VALUES(name),
     role          = VALUES(role),
     department    = VALUES(department),
     is_active     = 1`,
  [email.toLowerCase(), hash, name, role, department]
);

console.log(`Seeded user: ${email} (role: ${role})`);
await pool.end();
