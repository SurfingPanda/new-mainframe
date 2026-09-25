# Deploying to Hostinger shared hosting

This is the Phase 5 runbook — the steps needed to take this Laravel backend
from "works locally against XAMPP" to "live on Hostinger shared hosting,"
replacing the Node/Railway backend.

**Topology: path-mounted under the existing frontend site, not a separate
subdomain.** The API is reachable at `hubly.eljincorp.com/backend/*` —
inside the same Hostinger site/doc root that already serves the frontend
(`public_html/hubly/`) — rather than on its own `api.*` subdomain. This was
a deliberate choice (see the folder-structure diagram below) over the
originally-drafted subdomain approach: it means true same-origin between
frontend and API (simpler than same-site cookies), and it means the cutover
in Step 9 never touches DNS at all — just a frontend env var + rebuild.
The trade-off: the API's uptime is now tied to the `hubly` site's doc root
existing and its `.htaccess` staying correct (see Step 2).

I don't have access to your Hostinger hPanel/SSH, so I can't execute this
myself — this is the checklist to work through by hand. Where a step has a
verification you can run locally first, I've noted it.

## 1. Confirm your Hostinger plan supports what this needs

- **PHP 8.2+** — check hPanel → Advanced → PHP Configuration, and set the
  domain's PHP version there. Business/Premium/Cloud plans typically offer
  8.2/8.3; if only 8.1 or lower is available, this app won't run as-is.
- **Required PHP extensions** (enable in the same PHP Configuration screen —
  most are on by default, but check each): `pdo_mysql`, `mbstring`,
  `openssl`, `tokenizer`, `xml`, `ctype`, `json`, `bcmath`, `fileinfo`, and
  **`gd`** — the last one is new versus the Node backend (needed for avatar/
  icon image processing, see `README.md`'s Phase 4 notes on `gd` vs
  `imagick`). Missing `gd` doesn't crash the app, it just breaks avatar/space
  -icon uploads with a 400, so it's easy to miss in testing — check it early.
- **Composer + SSH access** — Business plan and above usually include SSH.
  If you only have shared hosting without SSH/Composer, you'll need to run
  `composer install --no-dev --optimize-autoloader` **locally** and upload
  the resulting `vendor/` directory instead (it's large — several hundred MB
  — budget extra upload time and check the plan's disk quota).
- **Cron jobs** — hPanel → Advanced → Cron Jobs. Needed for the SLA breach
  monitor and the Spaces due-reminders digest (see step 7). Confirm your plan
  allows at least a 10-minute-granularity cron entry (most do).
- ~~A subdomain you can point at this app~~ — not needed. This app is
  path-mounted under the existing `hubly.eljincorp.com` site instead (see
  Step 2), so no new subdomain/DNS record is required.

## 2. Lay out the app under the existing `hubly` site

Laravel serves from a `public/` subdirectory (`public/index.php` is the
front controller), not the project root — normally the one genuinely
non-obvious part of deploying Laravel to shared hosting. Here it's one step
more involved, because we're mounting it at a *path* under the frontend's
existing doc root rather than giving it a dedicated subdomain doc root.

Target layout (matches `deploy-hostinger-backend/README.md` in this repo):

```
domains/eljincorp.com/
├── public_html/
│   └── hubly/                      ← frontend site's doc root (dist/ upload)
│       ├── index.html, assets/     ← built frontend (unchanged)
│       ├── .htaccess               ← client/public/.htaccess (has the
│       │                             /backend exclusion — see below)
│       └── backend/                ← Laravel's front controller lives here
│           ├── index.php           ← edited require paths, see below
│           ├── .htaccess           ← stock Laravel public/.htaccess
│           ├── robots.txt
│           └── favicon.ico
└── laravel/
    └── backend-f/                  ← the whole server-laravel/ app
        ├── app/, vendor/, bootstrap/, .env, ...
```

Steps:
1. Upload the whole `server-laravel/` app (this repo's `server-laravel/`
   directory) to `domains/eljincorp.com/laravel/backend-f/` — a sibling of
   `public_html`, **not web-servable**. This is where `composer install`
   (Step 5) and the cron jobs (Step 7) run from.
2. Create `public_html/hubly/backend/` and upload the 4 files from this
   repo's `server-laravel/deploy-hostinger-backend/` into it verbatim — its
   `index.php` is already a pre-edited copy of `server-laravel/public/`'s,
   with `require`/`file_exists` paths pointing up to
   `../../../laravel/backend-f/...` (three levels: `backend/` → `hubly/` →
   `public_html/` → `eljincorp.com/`, then down into `laravel/backend-f/`).
   Adjust that depth if you upload to different folder names/depths than
   shown above.
3. Confirm `public_html/hubly/.htaccess` (the frontend's `.htaccess`,
   normally overwritten each time you rebuild+reupload the frontend from
   `client/public/.htaccess`) has the `RewriteCond %{REQUEST_URI}
   !^/backend/` exclusion above its SPA-fallback rule — without it, every
   `/backend/*` request 404s into `index.html` before Laravel ever sees it.
   Already in `client/public/.htaccess` as of this write-up; just don't lose
   it on a future frontend `.htaccess` edit.
4. `public_html/hubly/backend/.htaccess` is the **stock, unmodified**
   Laravel front-controller ruleset — because `index.php` physically lives
   inside `backend/`, Symfony auto-detects `/backend` as the app's base path
   and strips it, so Laravel's own routes stay exactly `/api/...` /
   `/uploads/...` internally, no prefix changes needed anywhere in the app.

**Never** put `laravel/backend-f/` itself under `public_html` — that would
serve `.env`, `app/`, `vendor/`, etc. directly over HTTP.

## 3. Database

The Laravel app reads the **same schema** the Node backend already created
(`server/sql/schema.sql`) — it has no migrations of its own (see
`README.md`'s Conventions section) and must never run `artisan migrate`
against it.

- If you're standing up a fresh Hostinger MySQL database (not reusing the
  Railway one): create it in hPanel → Databases → MySQL Databases, then
  import `server/sql/schema.sql` via phpMyAdmin or `mysql -u ... < schema.sql`
  over SSH.
- If you're pointing at the **same** database the Node backend already
  writes to (e.g. mid-migration, both backends temporarily live): nothing to
  do here — just confirm the Laravel app's DB credentials can reach it
  (Hostinger-hosted MySQL usually only accepts connections from the same
  hosting account by default; if the DB is on Railway instead, you'd need
  Railway's public connection string and to confirm it allows external
  connections).

## 4. Configure `.env`

Copy `.env.example` to `.env` on the server and fill in for production. Key
differences from the local-dev values:

```
APP_ENV=production
APP_DEBUG=false          # critical — true leaks stack traces in error responses
APP_URL=https://hubly.eljincorp.com/backend

DB_HOST=<Hostinger MySQL host, usually localhost>
DB_DATABASE=<your db name>
DB_USERNAME=<your db user>
DB_PASSWORD=<your db password>

JWT_SECRET=<generate fresh — see below, NEVER reuse the placeholder>
CORS_ORIGINS=https://hubly.eljincorp.com

HASH_VERIFY=false          # required — see .env.example; without this,
                            # every pre-existing user (hashed by Node's
                            # bcryptjs, prefix $2a$/$2b$) 500s on login

# Frontend and API are the SAME origin now (both hubly.eljincorp.com — see
# Step 2's path-mounted topology), so cookies are same-origin, which is even
# stronger than the SameSite=Lax same-site setup the Node/Railway backend
# uses today. CORS_ORIGINS above is mostly moot for browser traffic but
# left set for any non-browser/cross-origin callers.

TRUST_PROXY=true         # Hostinger's web server sits in front of PHP-FPM —
                          # without this, rate limiting collapses onto one
                          # shared bucket for every visitor (see
                          # AppServiceProvider::configureTrustedProxies()).

APP_BASE_URL=https://hubly.eljincorp.com   # used to build links in emails

# Mailer / UniFi / Anthropic: copy whatever the Node backend's server/.env
# already has configured for these, if you want feature parity immediately.
```

Generate `APP_KEY` (Laravel's own encryption key — unrelated to `JWT_SECRET`,
but still required):
```bash
php artisan key:generate
```

Generate `JWT_SECRET` (32+ random bytes; the app refuses to boot without a
real one — see `AppServiceProvider::guardJwtSecret()`):
```bash
php -r "echo bin2hex(random_bytes(48));"
```

**Do not reuse the Node backend's `JWT_SECRET`** unless you specifically want
a token issued by one backend to authenticate against the other during a
side-by-side transition — decide this deliberately, not by accident.

## 5. Install dependencies + optimize

> **Current production path:** recent production stack traces show the live app
> at `/home/u818562152/domains/hubly.eljincorp.com/laravel_app`, rather than the
> older `laravel/backend-f` example used elsewhere in this runbook. Run Artisan
> commands and upload application files against the directory used by the live
> `backend/index.php`; otherwise the frontend and backend will be on different
> releases.

```bash
composer install --no-dev --optimize-autoloader
php artisan config:cache
php artisan route:cache
```

`config:cache` flattens the `.env`-driven config into one file for speed —
**if you change `.env` after this**, run `php artisan config:clear` (or
re-run `config:cache`) or the app will keep serving the old values. This
tripped up the trust-proxy fix during Phase 5 local testing (see
`AppServiceProvider::configureTrustedProxies()`'s docblock for the
underlying `env()`-timing issue that motivated moving that logic out of
`bootstrap/app.php`) — worth remembering if a `.env` change doesn't seem to
take effect after this point.

## 6. Storage directories + permissions

This app stores uploads under `uploads/<category>/` at the project root (not
Laravel's default `storage/app/public`) — see each disk in
`config/filesystems.php`. Create them if they don't already exist from your
upload, and make sure the web server user can write to them:

```bash
mkdir -p uploads/tickets uploads/avatars uploads/messages uploads/kb uploads/spaces
chmod -R 755 uploads
chmod -R 775 storage bootstrap/cache   # Laravel's own runtime dirs (logs, framework cache)
```

(Exact ownership/group depends on Hostinger's PHP-FPM user for your account —
check hPanel if a plain `chmod 775` isn't enough.)

## 7. Cron jobs

Two scheduled jobs need to run periodically — see `README.md`'s Phase 3 and
Phase 4 notes for what each does and why the in-process Node timers were
replaced with this pattern.

**Preferred — CLI cron** (needs SSH/cron access to run a PHP command):
```cron
*/10 * * * * php /home/<user>/domains/eljincorp.com/laravel/backend-f/artisan sla:monitor >> /dev/null 2>&1
0 * * * *    php /home/<user>/domains/eljincorp.com/laravel/backend-f/artisan spaces:due-reminders >> /dev/null 2>&1
```
(adjust the path to wherever you uploaded `laravel/backend-f/` — see Step 2;
use the full path to your account's PHP 8.2+ binary if `php` on the cron
`$PATH` resolves to an older default — Hostinger's cron UI usually lets you
pick the PHP version per job.)

**Fallback — HTTP cron** (for plans that can only fetch a URL, not run a
command): set `CRON_SECRET` in `.env` to a random value, then:
```cron
*/10 * * * * wget -q -O /dev/null "https://hubly.eljincorp.com/backend/cron/sla-monitor?token=<CRON_SECRET>"
0 * * * *    wget -q -O /dev/null "https://hubly.eljincorp.com/backend/cron/space-due-reminders?token=<CRON_SECRET>"
```
Both endpoints 404 unless the token matches — safe to leave `CRON_SECRET`
empty until you're ready to wire this up (the endpoints are simply inert
until then, see `routes/cron.php`).

## 8. Smoke test before cutting over traffic

`/backend/*` is live as soon as Step 2's files are uploaded — it doesn't
depend on the frontend's `VITE_API_URL` at all, since that only controls
what URL the *built JS* calls. That means you can test the live backend here
with **zero risk to production**, as long as the currently-live
`public_html/hubly/.htaccess` has the `!^/backend/` exclusion from Step 2.3.
If you haven't rebuilt+reuploaded the frontend since making that edit, either
do a normal frontend rebuild+upload now (safe — `VITE_API_URL` is still
unchanged, so the live site still calls Railway) or just patch that one line
into the live `.htaccess` by hand via File Manager/SSH first.

```bash
curl https://hubly.eljincorp.com/backend/api/health
# {"status":"ok","db":"connected",...}

curl -X POST https://hubly.eljincorp.com/backend/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<a real user>","password":"<their password>"}'
# 200 + Set-Cookie: mf_token=...; the same shape verified during Phase 5
# parity testing against the Node backend
```

Also check `php artisan test` passes on the server itself (same DB
credentials, but tests wrap writes in `DatabaseTransactions` so nothing
persists — see `README.md`'s Testing section) — this catches any
environment drift (missing PHP extension, wrong PHP version) that wouldn't
show up in `/api/health` alone.

## 9. Cut over

Once the smoke test is clean — **no DNS change needed**, since `/backend`
already lives under the domain that's already live:

1. Update `client/.env.production` — `VITE_API_URL` from the Railway URL
   (`https://api.eljincorp.com`) to `https://hubly.eljincorp.com/backend`.
2. Rebuild + re-upload the frontend (`cd client && npm run build`, upload
   `dist/` to Hostinger — see the root `CLAUDE.md`'s Deployment section for
   the existing process). This is the actual cutover moment — the instant
   this new build is live, all browser traffic calls the Laravel backend
   instead of Railway.
3. Keep the Railway/Node backend running, untouched, for a rollback window —
   don't decommission it until you've confirmed the new backend handles real
   traffic cleanly for a few days. Rollback is just re-deploying the
   previous frontend build (restores the old `VITE_API_URL`).
4. Decommission Railway once you're confident (stop the service; there's no
   data to migrate back since both backends share the one MySQL database
   throughout).

## What's intentionally different from the Node backend

Carried over from the README's phase notes, for one place to check before
cutover:

- **No realtime/chat.** Socket.IO and the Team Chat feature were dropped by
  product decision at the start of this project — not a gap to fix, a scope
  cut. Notifications/mail still work via polling.
- **No idle-triggered automation** or **recurring maintenance work orders** —
  also a deliberate scope cut (see `README.md`'s intro).
- **Avatar/icon uploads** — `gd`-based, not `sharp`; HEIC/AVIF uploads are
  rejected (PNG/JPEG/GIF/WebP work fine). See step 1's extension note.
- **Two Node bugs were fixed, not reproduced**: the `survey_sent` history
  entry that silently never wrote (`ResolutionSurvey`'s docblock), and KB
  article images being completely unviewable due to a missing
  `upload-access.js` category (`KbController::serveAttachment`'s docblock).
  If anyone notices "new" behavior in either area post-cutover, it's these —
  intentional, but worth having on hand as an answer.
