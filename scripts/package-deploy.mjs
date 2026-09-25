#!/usr/bin/env node
// Packages a Hostinger deploy: one zip for the frontend (public_html/hubly)
// and one for the Laravel backend (the laravel app dir), both stamped with the
// same git version. Guards the things that have broken production before:
//   - client/.env.production VITE_API_URL drifting to a wrong/empty value
//   - client/public/.htaccess losing its `!^/backend/` exclusion
//   - a build that silently baked in the wrong API origin
//
// Usage (from the repo root):
//   node scripts/package-deploy.mjs [--allow-dirty] [--vendor] [--skip-tests]
//
//   --allow-dirty  package uncommitted changes (version gets a "-dirty" suffix)
//   --vendor       run `composer install --no-dev` into the backend package,
//                  for hosts without SSH/Composer (makes the zip much larger)
//   --skip-tests   skip `php artisan test` before packaging
//
// Output: deploy-out/hubly-frontend-<sha>.zip, deploy-out/hubly-backend-<sha>.zip
// No dependencies — Node built-ins plus git, npm, php (and composer w/ --vendor).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_API_URL = 'https://hubly.eljincorp.com/backend';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = path.join(ROOT, 'client');
const BACKEND = path.join(ROOT, 'server-laravel');
const OUT = path.join(ROOT, 'deploy-out');
const args = new Set(process.argv.slice(2));
const isWin = process.platform === 'win32';

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}
function step(msg) {
  console.log(`\n▸ ${msg}`);
}
function run(cmd, cmdArgs, opts = {}) {
  // npm/composer are .cmd shims on Windows, which need a shell to launch.
  const shell = isWin && ['npm', 'composer'].includes(cmd);
  return execFileSync(cmd, cmdArgs, { stdio: 'inherit', shell, ...opts });
}
function capture(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString().trim();
}

// ---- 1. Version -----------------------------------------------------------
step('Checking git state');
const dirty = capture('git', ['status', '--porcelain'], { cwd: ROOT });
if (dirty && !args.has('--allow-dirty')) {
  fail('Working tree has uncommitted changes. Commit first (so the deployed version\n' +
    '  maps to a real commit), or re-run with --allow-dirty.');
}
const sha = capture('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }) + (dirty ? '-dirty' : '');
const build = { sha, time: new Date().toISOString() };
console.log(`  version ${build.sha} @ ${build.time}`);

// ---- 2. Pre-flight config checks -----------------------------------------
step('Checking frontend config');
const envProd = path.join(CLIENT, '.env.production');
if (!fs.existsSync(envProd)) fail(`${path.relative(ROOT, envProd)} is missing.`);
const apiLine = fs.readFileSync(envProd, 'utf8').split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l.startsWith('VITE_API_URL='));
if (apiLine.length !== 1) fail(`client/.env.production must set VITE_API_URL exactly once (found ${apiLine.length}).`);
const apiUrl = apiLine[0].slice('VITE_API_URL='.length).trim().replace(/^["']|["']$/g, '');
if (apiUrl !== EXPECTED_API_URL) {
  fail(`client/.env.production has VITE_API_URL=${apiUrl || '(empty)'}\n  expected ${EXPECTED_API_URL}`);
}
if (process.env.VITE_API_URL && process.env.VITE_API_URL !== EXPECTED_API_URL) {
  fail(`VITE_API_URL is set in your shell (${process.env.VITE_API_URL}) and would override .env.production. Unset it.`);
}
const htaccess = fs.readFileSync(path.join(CLIENT, 'public', '.htaccess'), 'utf8');
if (!/^\s*RewriteCond\s+%\{REQUEST_URI\}\s+!\^\/backend\//m.test(htaccess)) {
  fail('client/public/.htaccess lost its `RewriteCond %{REQUEST_URI} !^/backend/` line —\n' +
    '  every /backend/* API request would be served index.html.');
}
console.log(`  VITE_API_URL ok, .htaccess /backend exclusion ok`);

// ---- 3. Backend tests -----------------------------------------------------
if (!args.has('--skip-tests')) {
  step('Running backend tests (php artisan test)');
  try {
    run('php', ['artisan', 'test'], { cwd: BACKEND });
  } catch {
    fail('Backend tests failed — not packaging. (--skip-tests to override.)');
  }
}

// ---- 4. Frontend build ----------------------------------------------------
step('Building frontend');
const env = { ...process.env, HUBLY_BUILD_SHA: build.sha, HUBLY_BUILD_TIME: build.time };
delete env.VITE_API_URL;
try {
  run('npm', ['run', 'build'], { cwd: CLIENT, env });
} catch {
  fail('Frontend build failed.');
}
const dist = path.join(CLIENT, 'dist');
const js = fs.readdirSync(path.join(dist, 'assets'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => fs.readFileSync(path.join(dist, 'assets', f), 'utf8'))
  .join('\n');
if (!js.includes(EXPECTED_API_URL)) fail(`Built bundle does not contain ${EXPECTED_API_URL} — the API origin was not baked in.`);
const leak = ['localhost:8000', '127.0.0.1:8000', 'api.eljincorp.com'].find((s) => js.includes(s));
if (leak) fail(`Built bundle references ${leak} — a dev/old API origin leaked into the production build.`);
if (!fs.existsSync(path.join(dist, '.htaccess'))) fail('dist/.htaccess is missing from the build output.');
console.log('  bundle points at the production API');

// ---- 5. Backend staging ---------------------------------------------------
step('Staging backend');
const stage = path.join(OUT, `.stage-backend-${build.sha}`);
fs.rmSync(stage, { recursive: true, force: true });
// Tracked + untracked-but-not-ignored files: honours .gitignore, so .env,
// vendor/, storage contents and real uploads never ship.
const files = capture('git', ['ls-files', '-co', '--exclude-standard', '-z', '--', '.'], { cwd: BACKEND })
  .split('\0')
  .filter(Boolean)
  .filter((f) => fs.existsSync(path.join(BACKEND, f))) // drop deleted-but-tracked
  // Belt and braces in case a .gitignore rule ever regresses.
  .filter((f) => !/^\.env(?!\.example$)/.test(path.basename(f)))
  .filter((f) => !f.startsWith('uploads/') || path.basename(f) === '.gitkeep')
  .filter((f) => !f.startsWith('vendor/') && !f.startsWith('node_modules/'));
for (const f of files) {
  const dest = path.join(stage, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(BACKEND, f), dest);
}
fs.writeFileSync(path.join(stage, 'build.json'), JSON.stringify(build) + '\n');
console.log(`  ${files.length} files`);

if (args.has('--vendor')) {
  step('composer install --no-dev (into the package)');
  try {
    run('composer', ['install', '--no-dev', '--optimize-autoloader', '--no-interaction'], { cwd: stage });
  } catch {
    fail('composer install failed.');
  }
}

// ---- 6. Zip -----------------------------------------------------------------
// Zip entries must use forward slashes or Linux hosts extract them as literal
// "a\b" filenames. Windows' bundled bsdtar writes proper zips; Git Bash's
// GNU tar can't write zip at all, hence the explicit path.
function zip(srcDir, outFile) {
  fs.rmSync(outFile, { force: true });
  const entries = fs.readdirSync(srcDir); // includes dotfiles (.htaccess)
  if (isWin) {
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    execFileSync(tar, ['-a', '-cf', outFile, '-C', srcDir, ...entries], { stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-qr', outFile, ...entries], { cwd: srcDir, stdio: 'inherit' });
  }
}

step('Zipping');
fs.mkdirSync(OUT, { recursive: true });
const frontZip = path.join(OUT, `hubly-frontend-${build.sha}.zip`);
const backZip = path.join(OUT, `hubly-backend-${build.sha}.zip`);
zip(dist, frontZip);
zip(stage, backZip);
fs.rmSync(stage, { recursive: true, force: true });

const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(1) + ' MB';
console.log(`
✔ Packaged ${build.sha}
  ${path.relative(ROOT, frontZip)}  (${mb(frontZip)})  → extract into public_html/hubly/
  ${path.relative(ROOT, backZip)}  (${mb(backZip)})  → extract into the Laravel app dir
                                   (the one public_html/hubly/backend/index.php requires)

After upload (see server-laravel/DEPLOYMENT.md "Routine deploys"):
  php artisan config:cache && php artisan route:cache     ${args.has('--vendor') ? '' : '(+ composer install --no-dev first)'}
  curl https://hubly.eljincorp.com/backend/api/health   → "build":{"sha":"${build.sha}",...}
  curl https://hubly.eljincorp.com/version.json         → {"sha":"${build.sha}",...}
`);
