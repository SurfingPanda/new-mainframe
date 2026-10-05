import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../server-laravel');

// Remove the test accounts + everything they filed, and give the Document
// Controller designation back to whoever held it before the run.
export default async function globalTeardown() {
  execFileSync('php', ['artisan', 'e2e:data', 'cleanup'], { cwd: API_DIR, stdio: 'inherit' });
}
