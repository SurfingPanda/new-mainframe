import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../server-laravel');

// Seed the throw-away @e2e.test accounts. Cleanup first so a previous crashed run
// can't leave stale rows (the command keeps the original Document Controller on
// record across that, so it is still handed back at the end).
export default async function globalSetup() {
  execFileSync('php', ['artisan', 'e2e:data', 'cleanup'], { cwd: API_DIR, stdio: 'inherit' });
  execFileSync('php', ['artisan', 'e2e:data', 'seed'], { cwd: API_DIR, stdio: 'inherit' });
}
