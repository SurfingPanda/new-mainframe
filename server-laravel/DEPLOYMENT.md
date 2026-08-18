# Deploying to Hostinger shared hosting

This is the Phase 5 runbook — the steps needed to take this Laravel backend
from "works locally against XAMPP" to "live on Hostinger shared hosting,"
replacing the Node/Railway backend. It assumes the frontend stays where it
is (Hostinger, `hubly.eljincorp.com`) per the existing split-origin setup
documented in the root `CLAUDE.md` — only the **backend** leg is moving, from
Railway to a second Hostinger (sub)domain.

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
- **A subdomain you can point at this app**, e.g. `api.eljincorp.com` (matching
  the domain already used for the Node backend on Railway, so the frontend's
  cookie stays same-site with zero client-side changes — see the root
  `CLAUDE.md`'s Security section on `SameSite=Lax`).

## 2. Set the subdomain's document root to `server-laravel/public`

Laravel serves from a `public/` subdirectory (`public/index.php` is the
front controller), not the project root — this is the one genuinely
non-obvious part of deploying Laravel to shared hosting.

**Preferred: custom document root.** When adding the `api` subdomain in
hPanel, most Hostinger plans let you choose its document root instead of
defaulting to `public_html/api`. Upload the whole `server-laravel/` app to
somewhere *outside* any web-servable folder (e.g. `~/hubly-api/`, a sibling
of `public_html`), then point the subdomain's document root at
`~/hubly-api/public`. This is the cleanest option — nothing needs editing,
and the app's source (`.env`, `app/`, `vendor/`) isn't reachable via HTTP.

**Fallback: no custom document root available.** Upload the app to
`~/hubly-api/` as above, then:
1. Copy the *contents* of `~/hubly-api/public/` (not the folder itself) into
   the subdomain's actual web root (e.g. `public_html/api/`).
2. Edit the copied `index.php`'s two `require` paths to point up to the real
   app location:
   ```php
   require __DIR__.'/../../hubly-api/vendor/autoload.php';
   (require_once __DIR__.'/../../hubly-api/bootstrap/app.php')
   ```
   (adjust the `../../hubly-api` relative path to match where you actually
   uploaded it relative to the web root).
3. This is more fragile (a future `public/` change in this repo needs
   re-copying) — use option A whenever the plan allows it.

Either way, **never** set the document root to the project root itself — that
would serve `.env`, `app/`, and everything else directly over HTTP.

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
APP_URL=https://api.eljincorp.com

DB_HOST=<Hostinger MySQL host, usually localhost>
DB_DATABASE=<your db name>
DB_USERNAME=<your db user>
DB_PASSWORD=<your db password>

JWT_SECRET=<generate fresh — see below, NEVER reuse the placeholder>
CORS_ORIGINS=https://hubly.eljincorp.com

# Same-site with the frontend origin (both on *.eljincorp.com) — cookies stay
# SameSite=Lax with no code changes, matching how the Node/Railway backend
# already works (see root CLAUDE.md's Security section).

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
*/10 * * * * php /home/<user>/hubly-api/artisan sla:monitor >> /dev/null 2>&1
0 * * * *    php /home/<user>/hubly-api/artisan spaces:due-reminders >> /dev/null 2>&1
```
(adjust the path to wherever you uploaded the app; use the full path to your
account's PHP 8.2+ binary if `php` on the cron `$PATH` resolves to an older
default — Hostinger's cron UI usually lets you pick the PHP version per job.)

**Fallback — HTTP cron** (for plans that can only fetch a URL, not run a
command): set `CRON_SECRET` in `.env` to a random value, then:
```cron
*/10 * * * * wget -q -O /dev/null "https://api.eljincorp.com/cron/sla-monitor?token=<CRON_SECRET>"
0 * * * *    wget -q -O /dev/null "https://api.eljincorp.com/cron/space-due-reminders?token=<CRON_SECRET>"
```
Both endpoints 404 unless the token matches — safe to leave `CRON_SECRET`
empty until you're ready to wire this up (the endpoints are simply inert
until then, see `routes/cron.php`).

## 8. Smoke test before cutting over traffic

With the subdomain live but *before* changing the frontend's `VITE_API_URL`:

```bash
curl https://api.eljincorp.com/api/health
# {"status":"ok","db":"connected",...}

curl -X POST https://api.eljincorp.com/api/auth/login \
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

Once the smoke test is clean:

1. Update the frontend's `client/.env.production` — `VITE_API_URL` from the
   Railway URL to `https://api.eljincorp.com` (already pointing at the
   `api.eljincorp.com` name if you reused it; only the DNS target changes).
2. Rebuild + re-upload the frontend (`cd client && npm run build`, upload
   `dist/` to Hostinger — see the root `CLAUDE.md`'s Deployment section for
   the existing process, unchanged by this migration).
3. Point `api.eljincorp.com`'s DNS at the new Hostinger-hosted backend
   (update the A/CNAME record that currently points at Railway).
4. Keep the Railway/Node backend running, untouched, for a rollback window —
   don't decommission it until you've confirmed the new backend handles real
   traffic cleanly for a few days.
5. Decommission Railway once you're confident (stop the service; there's no
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
