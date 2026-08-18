# Hubly — Laravel backend (in progress)

A parallel Laravel port of `server/` (the Node/Express API), built to run on
Hostinger **shared hosting** (PHP/MySQL only — no persistent Node process, no
websockets). This is being built in phases; it does not yet replace `server/`.

**Dropped vs. the Node backend** (per product decision, not a technical
limitation): team chat (Socket.IO), recurring-maintenance auto-generation,
idle-triggered automation, and the daily SLA breach digest email. SLA breach
*detection* is being kept — see Phase 3 below.

## Conventions

- **No Eloquent models bound to migrations.** This app shares the `mainframe_app`
  database with `server/` — `server/sql/schema.sql` is still the single source
  of truth for schema. Queries go through `DB::table(...)` (the query builder),
  mirroring the Node backend's raw parameterized `mysql2` queries as closely as
  possible, to minimize behavior drift on the trickier logic (SLA math,
  HR-concern visibility, permissions).
- **Never run `php artisan migrate` against `mainframe_app`.** There are no
  migration files in this project for that reason — running migrate would try
  to create tables that already exist in a different shape (e.g. `users`).
- Business logic modules are ported close to 1:1 from `server/src/lib/*.js` —
  each ported file's docblock names its Node source so the two can be diffed
  when the original changes.
- File cache / sync queue / file sessions (see `.env`) — deliberately avoids
  needing Redis or extra Eloquent-managed tables, since the target host is
  shared hosting.

## Setup

```bash
cd server-laravel
composer install
cp .env.example .env        # then fill in JWT_SECRET (32+ random chars) and DB_* if different from XAMPP defaults
php artisan key:generate    # only affects APP_KEY (session/cookie encryption for the 'web' group) — unrelated to JWT_SECRET
php artisan serve           # http://localhost:8000
```

The app **refuses to boot** without a real `JWT_SECRET` (same fail-fast as the
Node backend — see `app/Providers/AppServiceProvider::guardJwtSecret()`).

## Testing

```bash
php artisan test
```

`tests/Unit/PermissionsTest.php`, `TicketVisibilityTest.php`, `SlaPoliciesTest.php`,
and `BusinessHoursTest.php` mirror `server/test`'s coverage of the equivalent
pure JS modules. `tests/Feature/AuthTest.php` exercises the auth flow against
the real `mainframe_app` schema, wrapped in `DatabaseTransactions` so nothing
persists.

Ticket routes were additionally verified live against the real dev DB (login
as several throwaway users, exercise every endpoint including the HR-concern
approve/deny paths and attachment upload/serving, then delete every row
created) — see the phase 2 commit for the manual script; no automated feature
tests were added for TicketController yet (worth doing before cutover).

## Phase 1 — done

Project scaffold, DB connection, security headers, CORS, permissions
(`app/Services/Permissions.php`, ported from `server/src/lib/permissions.js`),
JWT auth middleware (`app/Http/Middleware/JwtAuthenticate.php`, ported from
`server/src/middleware/auth.js`), role/permission gate middleware, rate
limiting (login by IP + by email, change-password by user id — ported from
`routes/auth.js`), and a first vertical slice of `/api/auth`: `login`, `me`
(read + PATCH name/job_title), `change-password`, `logout`.

**Deferred from `routes/auth.js`** to later phases: `forgot-password` /
`reset-password` (needs the mailer + email templates), `/me/stats` (needs the
SLA engine), avatar + signature upload (needs a `sharp`-equivalent — GD or
Imagick via Intervention Image), `/me/preferences`, `/me/invalidate-sessions`.

## Phase 2 — done

Core ticketing (`app/Http/Controllers/Api/TicketController.php`, ported from
`server/src/routes/tickets.js`): list (with scope + need-to-know filtering),
detail, create (incl. HR-Concern intake routing + overtime-report payload),
patch/edit, self-assign (claim/release), the HR-concern approve/deny decision
routes, activity log + notes with attachments, attachment delete, KB article
linking. Visibility/authorization ported 1:1 as `app/Services/TicketVisibility.php`
and `app/Services/DepartmentManagers.php`.

Ticket create/list/detail need the SLA *computation* layer (targets are
snapshotted at creation, standing is computed for every list row), so that
much of the SLA engine came with this phase rather than waiting for Phase 3:
`app/Services/SlaConfig.php`, `BusinessHours.php`, `SlaPolicies.php`, `Sla.php`
— ported from `server/src/lib/sla-config.js`, `business-hours.js`,
`sla-policies.js`, `sla.js`. Node keeps these as module-level caches loaded
once at process boot; since PHP-FPM has no equivalent boot, they're cached via
Laravel's `Cache` facade instead (file driver), refreshed on save so every
worker sees the same value. **Deferred to Phase 3**: the SLA admin routes
(policy/calendar CRUD, `routes/sla.js`) and the breach-detection cron job.

Ticket attachments are stored under `uploads/tickets/` (a dedicated `tickets`
filesystem disk, `config/filesystems.php`) and served via a scoped, auth-gated
route (`GET /uploads/tickets/{filename}` → `TicketController::serveAttachment`)
— a narrow, tickets-only port of `lib/upload-access.js`'s ticket branch. The
general uploads gate (avatars/chat/spaces/messages) is deferred to the phase
that ports each of those resource types.

**Side effects deferred** (email, in-app Mailbox, realtime push, the
automation engine, resolution surveys) are routed through
`app/Services/TicketNotifications.php` — every method there is currently a
documented no-op with the Node call site's exact signature, so filling them in
later doesn't require touching `TicketController`. See that file's docblock
for which phase owns which method.

## Phase 3 — done

**Automation engine** (`app/Services/Automation.php`, ported from
`server/src/lib/automation.js`): the pure WHEN/IF/THEN evaluator
(`matchesConditions`/`sanitizeConditions`/`normalizeActions`) plus the
DB-facing `run()`. `app/Http/Controllers/Api/AutomationController.php`
(ported from `routes/automation.js`) adds rule CRUD + the run-audit endpoint,
gated by `automation.manage`. `TicketNotifications::runAutomations()` (the
Phase 2 no-op stub) now delegates to `Automation::run()` — **no changes were
needed in `TicketController`** to wire this up, confirming the stub-layer
approach from Phase 2 paid off. Idle-triggered automation and its scheduler
are out of scope per the earlier product decision (dropped along with
recurring maintenance).

**SLA administration** (`app/Http/Controllers/Api/SlaController.php`, ported
from `routes/sla.js`): policy CRUD + business-hours calendar CRUD + holidays,
gated by `users.manage`. Writes call the Phase 2 `SlaPolicies::loadPolicies()`
/ `BusinessHours::loadCalendars()` to refresh the Cache-backed layer
immediately, same as the Node original's in-process cache refresh.

**SLA breach detection** (`app/Services/SlaMonitor.php`, ported from
`lib/sla-monitor.js`): scans open, non-HR-Concern tickets, computes pause-aware
standing via the Phase 2 `Sla::standing()`, and atomically claims + logs +
escalates (fires `sla.response_breached`/`sla.resolution_breached` through the
automation engine) each breach exactly once. Node runs this on an in-process
`setInterval`; this port drops the timer entirely and exposes two trigger
paths instead, both guarded by a MySQL advisory lock
(`app/Services/JobLock.php`, ported from `lib/job-lock.js`) so overlapping
triggers can't double-fire:
- `php artisan sla:monitor` (`app/Console/Commands/RunSlaMonitor.php`) — for
  Hostinger cron plans that can run a CLI command directly (preferred)
- `GET|POST /cron/sla-monitor?token=...` (`routes/cron.php`) — a secret-gated
  HTTP fallback (`CRON_SECRET` in `.env`) for cron plans that can only fetch a
  URL; 404s if the secret is unset or wrong, so it's inert until configured

Both were verified live: correct/incorrect cron tokens, an automation rule
actually firing end-to-end on a ticket update (field change + note, both
logged to `ticket_activity` as `Automation: <rule name>`, recorded in
`automation_runs`), and SLA policy/calendar CRUD — then all test data deleted.

`tests/Unit/AutomationTest.php` mirrors `server/test/automation.test.js` (14
tests, all pure — no DB).

## Phase 4 — done

Phase 4 bundles ~10 Node route modules; it's being worked through in batches
rather than one pass. Batch 1 (done):

- **Departments** (`DepartmentController`, ported from `routes/departments.js`)
  — list open to any signed-in user, writes require `users.manage`. Manager
  assignment validates the candidate is an active user already labelled with
  that department (verified live: rejected before the label was set, accepted
  after).
- **Users** (`UserController`, ported from `routes/users.js`) — directory/
  assignable lists, admin CRUD, bulk import (per-row outcome reporting,
  verified live with a valid/invalid/duplicate row mix), admin-triggered
  password reset (verified live — correctly invalidated the target's existing
  session, matching `token_version` semantics from Phase 1).
- **Avatar uploads** (`app/Services/AvatarUpload.php`, ported from
  `lib/avatar-upload.js`) — decode/validate/resize/re-encode to a 256×256
  WebP. Node uses `sharp`; this port uses `intervention/image` on the `gd`
  PHP driver (the only image extension available — no `imagick`, which shared
  hosting rarely offers either). **Behavior difference:** GD can't decode
  HEIC/AVIF, so those two are dropped from the allowed-upload list (PNG/JPEG/
  GIF/WebP — the overwhelming majority of real uploads — are unaffected).
  Verified live end-to-end with a real generated PNG (confirmed the stored
  file really is a 256×256 WebP). **Environment note:** the local XAMPP
  install had the `gd` extension present but disabled; `C:\xampp\php\php.ini`
  was edited to enable it (uncommented `extension=gd`) — a machine-level
  config change outside this repo, purely additive, needed wherever this app
  is actually deployed too.
- **Assets** + **asset requests** (`AssetController`/`AssetRequestController`,
  ported from `routes/assets.js` and `routes/asset-requests.js`) — including
  the non-staff visibility narrowing (own-assigned-only, 404 not 403 to avoid
  id probing) and the request→review workflow, both verified live.
- `app/Services/Audit.php` (ported from `lib/audit.js`) — the fire-and-forget
  admin audit-log writer + `diffChanges()`, now used by the Departments and
  Users writes above. The read-only `/api/audit` viewer route itself is still
  a later batch.

`TicketNotifications::notifyAssetRequestDecision()` added as a further
deferred stub (mailer, same bucket as the ticket email notifiers).

Batch 2 (done) — mailbox + wiring every remaining `TicketNotifications` stub to a real implementation:

- **Mailer** (`app/Services/Mailer.php`, ported from `lib/mailer.js`) — Resend
  (HTTPS, via Laravel's `Http` facade) or SMTP (via Symfony Mailer, already an
  `illuminate/mail` dependency — no new package needed), tried in that order;
  unconfigured = sends are logged no-ops, same "app still works" contract as
  Node. Node's Ethereal dev-preview mode (`MAIL_DEV=ethereal`) wasn't ported —
  a local-dev convenience, not a functional requirement.
- **Email templates** (`app/Services/EmailTemplates.php`, ported from
  `lib/email-templates.js`) — all 9 templates, including the shared inline-CSS
  `layout()` shell, ported in full (not simplified) since the shared helper
  made it mechanical rather than a big time sink.
- **Mailbox** (`MessageController`, ported from `routes/messages.js`) —
  internal user-to-user mail: inbox/sent, unread count, send (with an optional
  attachment), read/read-all, per-side soft delete. `app/Services/SystemMessage.php`
  (ported from `lib/system-message.js`) is the shared "Hubly" system-sender
  writer used by the notifiers below (its Socket.IO push is dropped, like the
  rest of realtime — recipients pick up new mail on the next poll).
- **HR-approval notifications** (`app/Services/HrApproval.php`, ported from
  `lib/hr-approval.js`) and **ticket email notifiers**
  (`app/Services/TicketEmails.php`, ported from `lib/ticket-emails.js`) — now
  wired into `TicketNotifications` for real. Verified live end-to-end: filing
  an HR concern puts "Approval needed" in the manager's Mailbox; approving it
  puts "Approved" in the requester's and "New HR request" in every real HR
  department member's Mailbox (a reminder that test scenarios touching real
  seeded departments have real side effects — see the memory note from this
  session).
- **Resolution survey** (`app/Services/ResolutionSurvey.php`, ported from
  `lib/resolution-survey.js`) — verified live (resolve → Mailbox invite +
  `ticket_surveys` row → submit ratings). **Bug fix vs. Node**: the original
  references an undefined `SYSTEM_SENDER_NAME` when logging the `survey_sent`
  ticket_activity row, a `ReferenceError` silently swallowed by the
  surrounding try/catch — the Mailbox message still sends but the timeline
  entry never records. Fixed here (verified live: the entry now appears).
- **Surveys admin/respondent routes** (`SurveyController`, ported from
  `routes/surveys.js`).
- **Notifications** (`NotificationController`, ported from
  `routes/notifications.js`) — the bell feed from ticket activity, plus
  pending password-reset requests for admins. The chat-activity section of
  the Node original is dropped along with the rest of realtime/chat;
  `workOrders`/`workOrdersByView` are ticket-activity-only (same numbers Node
  would produce with zero chat activity). Verified live, including the
  assigned-to-me vs. update distinction.
- **Audit read endpoint** (`AuditController`, ported from `routes/audit.js`)
  — admin-role-gated, filterable/paginated. Verified live including the
  role gate (403 for a non-admin).
- **Password-reset queue** (`PasswordResetRequestController`, ported from
  `routes/password-resets.js`) — this module wasn't in the original Phase 4
  batch list but belongs in "everything else"; added here since Notifications
  reads the same table. Verified live including password rotation as part of
  resolving a request.

Batch 3 (done) — KB and network/UniFi:

- **Knowledge Base** (`KbController`, ported from `routes/kb.js`) — full CRUD,
  category/search filtering, the deflection `/suggest` endpoint, feedback
  voting (upsert), and version history (list/show/restore, with the
  baseline-backfill-on-first-edit behavior). Verified live including the
  version-snapshot-only-on-content-change rule. **Bug fix vs. Node**:
  `lib/upload-access.js` has no case for the `kb` category, so every
  `/uploads/kb/*` request 403s for everyone in the Node app — including an
  article's own author — making the image-upload feature (and any embedded
  image) unusable in practice. Fixed here as "any signed-in user with
  `kb.view`" (the same simple rule already used for avatars/signatures, and
  the app-wide read gate the KB feature already has); verified live that an
  uploaded image is actually fetchable.
- **Network monitoring** (`NetworkController` + `app/Services/Unifi.php`,
  ported from `routes/network.js` + `lib/unifi.js`) — the UniFi client (session
  cached via the file `Cache`, like `SlaConfig`, rather than Node's
  module-level variable) and all dashboard response shapers, verified live in
  mock mode (no `UNIFI_HOST` configured, matching how this will run until a
  controller is actually wired up). The Claude Vision chart-extraction
  endpoint was ported as-is; verified live that it correctly 503s with a clear
  message when `ANTHROPIC_API_KEY` is unset.

Batch 4 (done) — **Spaces**, the largest single module (the Node route file
alone is ~1350 lines), completing Phase 4:

- Split into four controllers (Node keeps it in one file, but the resources
  are genuinely distinct): `SpaceController` (space CRUD, icon, membership,
  join-request workflow, the cross-space "my items" list),
  `SpaceItemController` (work items, comments, linked items, the detail
  bundle), `SpaceDocController` (Documents tab), `SpaceGoalController` (Goals
  tab). Shared logic ported as `app/Services/SpacesHelpers.php` (the pure
  helpers + permission predicates — `canAdminister`/`canContribute`/
  `canEditItem` — from `lib/spaces-helpers.js`, unit-tested) and
  `app/Services/SpaceAccess.php` (the DB-coupled route-local helpers:
  `loadAccess`, `recordHistory`, `generateSpaceKey`, item-key/group-letter
  generation, etc.).
- **Spaces → Mailbox notifications** (`app/Services/SpaceNotify.php`, ported
  from `lib/space-notify.js`) — item-assigned, item-comment, join-requested,
  join-decision, all wired for real (not stubs) since the Mailbox/Mailer
  infrastructure already existed from batch 2. The daily due/overdue digest
  (`runDueReminders`) drops Node's in-process `setInterval` for the same
  cron-trigger pattern as `SlaMonitor`
  (`app/Console/Commands/RunSpaceDueReminders.php` + a `routes/cron.php`
  entry), guarded by the same `JobLock`.
- `tests/Unit/SpacesHelpersTest.php` mirrors `server/test/spaces-helpers.test.js`
  (19 tests, all pure).
- Verified live end-to-end, including the parts most likely to hide a bug:
  space-key generation from multi-word/single-word names ("Marketing Kanban
  Space" → `MKS`), the bijective group-letter + per-group item numbering
  scheme (`MA-1`, `MB-1`, a subtask correctly inheriting its parent's group
  as `MA-2`), member-only content gating vs. open space discoverability,
  item-edit permission (assignee vs. PM override), reassignment notifications
  (correctly suppressed on self-assign, fired on a real reassignment,
  delivered to the right Mailbox), linking with duplicate-pair rejection, the
  full join-request lifecycle (request → PM notified → approve → requester
  notified → membership granted), space icon upload (reusing the avatar
  pipeline), and the due-reminders console command.

**Phase 4 is complete.** Every Node route module has a Laravel counterpart
except realtime/chat (dropped by product decision) and the idle-automation
trigger + its scheduler (also dropped).

## Phase 5 — done

**Parity verification against the live Node backend.** Ran both backends
side by side against the same dev DB (Node on :4000, Laravel on :8000) and
scripted a structural diff (key sets + leaf types, not exact values —
timestamps/ids legitimately differ) across 25 read endpoints spanning every
ported module (auth, tickets, departments, assets, KB, SLA, automation,
notifications, spaces, users, messages, surveys, audit, password-resets,
network, asset-requests), plus a write-path check (ticket create → patch →
activity log). Every endpoint matched shape exactly except one: `/api/network
/dashboard`'s `warning` field, which turned out to be a **runtime `.env`
difference** (the already-running Node instance had a real, currently-broken
`UNIFI_HOST`/`UNIFI_COOKIE` configured; this app's `.env` didn't) — not a
port bug. Confirmed by temporarily giving the Laravel app the same broken
UniFi config and reproducing the identical fallback-with-warning response,
then reverting.

**A real production bug found and fixed by this exercise**, unrelated to the
parity check's original target: `TRUST_PROXY` had been defined in
`config/hubly.php` since Phase 1 but never actually wired into a Laravel
proxy-trust mechanism — behind Hostinger's front-end web server, every
visitor's rate-limit bucket would have collapsed onto the server's own IP.
Fixing it surfaced a second, subtler bug: Laravel's `env()` helper
auto-casts the literal strings `"true"`/`"false"` into real PHP booleans, so
`(string) env('TRUST_PROXY')` silently became `"1"` instead of `"true"` and
matched the wrong branch. The same pattern was already live in
`app/Services/Unifi.php` (`UNIFI_OS`/`UNIFI_INSECURE_TLS` — both would have
silently no-op'd if ever set to `true`) and is now fixed there too, using
`filter_var(..., FILTER_VALIDATE_BOOL)`, which handles both a real bool and a
`"true"`/`"false"` string correctly (verified directly). Both fixes are
covered by `AppServiceProvider::configureTrustedProxies()`'s and
`Unifi.php`'s docblocks — worth a skim if you add another boolean-flavored
`.env` var later.

**Deployment runbook**: see `DEPLOYMENT.md` — the full checklist for moving
this app onto Hostinger shared hosting (PHP/extension requirements, the
`public/` document-root subtlety, `.env` production values, storage
permissions, cron setup, a pre-cutover smoke test, and the actual cutover +
rollback sequence). I don't have Hostinger hPanel/SSH access, so that part is
a handoff, not something I executed — everything else in this phase (the
parity run, the two bug fixes) is verified and done.

## All phases complete

1. Scaffold + auth
2. Core ticketing
3. SLA administration + automation engine
4. Everything else (assets, KB, departments, users, mailbox, surveys,
   notifications, Spaces, audit, network/UniFi)
5. Cutover prep — parity-verified; deployment is a manual runbook (`DEPLOYMENT.md`)

The Laravel backend is feature-complete relative to the Node backend, minus
the deliberate scope cuts (realtime/chat, idle automation, recurring
maintenance) agreed at the start of this project. What's left is entirely in
the user's hands: working through `DEPLOYMENT.md` against a real Hostinger
account.
