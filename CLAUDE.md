# CLAUDE.md

This file gives Claude codebase-specific instructions for working in this repository.

## Project overview

- **Project name:** Hubly
- **Purpose:** Internal IT operations platform combining ticketing (work orders), IT asset inventory, a knowledge base, and project Spaces in one app.
- **Primary stack:** React 18 + Vite + Tailwind (`client/`); **Laravel 11 / PHP 8.2** API (`server-laravel/`) — the only backend
- **Database:** MySQL 8 / MariaDB (XAMPP on `localhost:3306` locally), database `mainframe_app` (utf8mb4_unicode_ci)
- **Runtime(s):** PHP 8.2 (backend); Node.js 18+ (client build + the deploy packaging script)
- **Package manager(s):** Composer for `server-laravel/`; npm for `client/` (separate — no monorepo tooling)

## History you need to know

- The backend was originally Node.js + Express (`server/`) on Railway. It was **ported 1:1 to Laravel** so it could run on **Hostinger shared hosting** (cheaper; can't run a persistent Node process). Cutover finished 2026-08-20; Railway and `api.eljincorp.com` are gone.
- **`server/` has been deleted from the repo** (commit `a18c71a`). If you need to see how something used to work, read it from git history, e.g. `git show afe5d05:server/src/routes/tickets.js`. Don't recreate it or keep anything "in parity" with it.
- **Deliberate scope cuts in the port** (product decisions, not gaps): no Team Chat / realtime (Socket.IO), no recurring-maintenance work orders, no idle-triggered automation (`ticket.idle`), and no daily SLA-breach Mailbox digest. The client no longer has chat, socket, or maintenance screens (`/chat` and `/tickets/maintenance*` redirect). The old tables (`chat_*`, `maintenance_schedules`) may still exist in the database but nothing reads or writes them. A few dead client files (`ChatRoom.jsx`, `FloatingChat.jsx`, `useChat*.js`, `useSocket.jsx`, `MaintenanceSchedule*.jsx`) and the `socket.io-client` dependency are still in the tree, unreferenced — safe to delete.
- `server-laravel/README.md` is the phase-by-phase port log (useful for "why is it like this").

## Repository structure

```
new-mainframe/
├── client/                    React + Vite + Tailwind frontend
│   ├── public/                .htaccess (SPA fallback + /backend exclusion), images
│   └── src/
│       ├── App.jsx            Router (react-router-dom v7)
│       ├── main.jsx           Entry
│       ├── components/        Shared UI: DashboardHeader, NavDropdown, Modal, ProtectedRoute,
│       │                      MarkdownEditor, UserPicker, NotificationBell, Avatar, ImageLightbox,
│       │                      AccountCards (Settings/Profile cards), AnnouncementsBanner, GlobalSearch, …
│       ├── lib/               auth.js (api()), config.js (API_BASE), categories.js (useTaxonomy),
│       │                      sla.js, ticket.js, url.js (safeUrl), networkReports.js (localStorage)
│       └── pages/             Route views (Dashboard, CreateTicket, CreateIncident, TicketDetail,
│                              AllTickets, MyQueue, SubmittedTickets, WorkOrderReports, Users,
│                              Departments, SlaSettings, TicketTaxonomy, Automation, AuditLog,
│                              AllAssets, AssetRequest*, AllArticles, KbArticle, ArticleEditor,
│                              Spaces, SpaceDetail, NetworkMonitoring, NetworkReports*, Mailbox,
│                              Profile, Settings, Survey, …)
├── server-laravel/            Laravel 11 API
│   ├── README.md              Port build log
│   ├── DEPLOYMENT.md          Hostinger runbook (one-time setup + "Routine deploys")
│   ├── deploy-hostinger-backend/  Pre-edited front-controller files for public_html/hubly/backend/
│   ├── sql/                   Hand-run SQL migrations (see "Database and migrations")
│   ├── uploads/               avatars/ signatures/ tickets/ messages/ kb/ spaces/ (gitignored contents)
│   ├── app/
│   │   ├── Http/Controllers/Api/   one controller per resource (Auth, Ticket, User, Asset, AssetRequest,
│   │   │                           Kb, Space*, Sla, Settings, Taxonomy, Automation, Audit, Announcement,
│   │   │                           Notification, Message, Survey, Search, Department, PasswordResetRequest, Network)
│   │   ├── Http/Middleware/        JwtAuthenticate (auth.jwt), EnsurePermission (permission:module,action),
│   │   │                           EnsureRole (role:…), SecurityHeaders
│   │   ├── Services/               domain logic — Permissions, TicketVisibility, DepartmentManagers,
│   │   │                           Sla, SlaConfig, SlaPolicies, BusinessHours, SlaMonitor, SlaAlerts,
│   │   │                           TicketTaxonomy, Automation, Audit, HrApproval, ResolutionSurvey,
│   │   │                           TicketNotifications, TicketEmails, EmailTemplates, Mailer, SystemMessage,
│   │   │                           AvatarUpload, SignatureUpload, Spaces*, JwtService, JobLock, Unifi, …
│   │   └── Console/Commands/       RunSlaMonitor (sla:monitor), RunSpaceDueReminders (spaces:due-reminders)
│   ├── config/                hubly.php (app-specific env), filesystems.php (upload disks)
│   ├── routes/                api.php (/api/*), uploads.php (/uploads/*), cron.php (/cron/*), console.php
│   └── tests/                 Unit/ (pure helpers) + Feature/ (HTTP against the real DB, rolled back)
├── scripts/package-deploy.mjs Builds + checks + zips a deploy (see Deployment)
└── README.md
```

## Laravel conventions

- **Raw query builder only** (`DB::table()`), no Eloquent models — keeps the hand-tuned, parameterized SQL style. Never string-concatenate user input into SQL.
- **No Eloquent migrations, and never run `php artisan migrate`** against `mainframe_app`. Schema changes are hand-written SQL files (see below).
- Controllers are thin-ish and validate at the boundary; shared logic lives in `app/Services/` as static methods. Services that are called fire-and-forget (notifications, emails, audit, alerts) **never throw** — they catch and `Log::error`.
- Auth: `$request->authUser()` (a request macro from `AppServiceProvider`) returns the array `JwtAuthenticate` loaded — `sub` (user id), `email`, `name`, `role`, `department`, `permissions`.
- Route gates: `auth.jwt`, then `permission:module,action` (preferred for module access) or `role:admin,agent`. Fine-grained rules (ticket visibility, space membership) are checked inside controllers.
- Rate limits are named limiters in `AppServiceProvider` (`login-ip`, `login-email`, `change-password`, `forgot-password`, `ticket-write`, `avatar-admin`, `avatar-self`, `user-import`, `message-send`), applied as `throttle:<name>`. Per-IP buckets need `TRUST_PROXY` set behind a proxy.
- Caches (SLA config, SLA policies, taxonomy) use Laravel's cache (file store in prod) and are cleared on every admin write — PHP-FPM has no long-lived process to hold them.
- Scheduled work runs from host cron, not in-process timers: `php artisan sla:monitor` (~10 min) and `spaces:due-reminders` (hourly), or the secret-gated `/cron/*` HTTP fallback (`CRON_SECRET`). `JobLock` (MySQL advisory lock) prevents overlapping runs.
- Image uploads (avatars, signatures, space icons) are validated by decoding and re-encoding to WebP with Intervention Image on **GD** — HEIC/AVIF are rejected (GD can't decode them).

## Domain model (database)

Key tables (all in `mainframe_app`):

- **users** — email (unique), password_hash (bcrypt), name, `role` ENUM('admin','agent','user'), department, job_title, avatar_url, signature_url (transparent WebP e-signature, auto-fills printed work orders), is_active, `permissions` (JSON per-module overrides — see [Permissions](#permissions)), `preferences` (JSON — `notifications.*` email toggles), `token_version` (session invalidation), last_login_at, notifications_seen_at
- **tickets** (work orders; the UI says "Work Order" and shows `WO00000000` ids, code/DB say "ticket") — title, description, `status` ENUM('open','in_progress','on_hold','pending','resolved','closed','cancelled'), `priority` ENUM('low','normal','high','urgent'), `request_type` **VARCHAR(50)** (a `ticket_request_types.type_key`), `category` / `subcategory` / `subcategory2` (plain names from the taxonomy), department, requester, assignee (both free text: a user's name or email), asset_id, `overtime_report` (JSON, HR form). `cancelled` is terminal, pauses SLA, and sends no survey. SLA fields: `sla_response_minutes`, `sla_resolution_minutes`, `sla_calendar_id` (pinned at creation), `first_responded_at`, breach markers `sla_{response,resolution}_breached_at`, warning markers `sla_{response,resolution}_warned_at`. **HR approval** fields: `approval_status` ENUM('not_required','pending','approved','denied'), `approval_dept`, `approver_name`, `approver_signature_url`, `approval_note`, `approval_decided_at` — see HR Concerns below.
- **ticket_request_types / ticket_categories** — the **admin-editable work-order taxonomy** (Users → Manage → *Categories & Request Types*, `/users/categories`, `users.manage`). `ticket_request_types`: `type_key` (immutable), `label`, `description`, `sort_order`, `is_active`, `is_system`. `ticket_categories`: 3-level tree (`parent_id` = 0 for top level, `depth` 1–3, unique `(parent_id, name)`). Tickets store **names**, so these tables are the allowlist (`TicketTaxonomy`, cached — used by `TicketController`, `Automation`, `SlaPolicies`) and the form source (`GET /api/taxonomy` → client `useTaxonomy()`). New work orders need an **active** entry; edits may keep a hidden one. Renaming a category rewrites work orders at that exact path (and, for top-level names, SLA policies + automation rules); anything in use can only be hidden, not deleted. `is_system` entries are matched by name in code and can't be renamed/deleted: categories **HR Concerns**, **ERP Access**, the leave/overtime/manpower/schedule sub-subcategories, ERP "New access request"/"Modify access / role"; request types `incident` and `service_request`.
- **ticket_activity** — append-only per-ticket log: `type` ('change'|'note'), field, old_value, new_value, body, attachment_id, actor. Drives the activity feed **and** the notification bell. System fields include `created`, `sla_warning`, `sla_breach`, `survey_sent`, `approval_requested`/`approved`/`denied`, `kb_link`/`kb_unlink`, `watcher_added`/`watcher_removed`, `attachment_removed`.
- **ticket_attachments** — files under `server-laravel/uploads/tickets/`, served by `GET /uploads/tickets/{file}` (auth + ticket visibility).
- **ticket_kb_links** — tickets ↔ KB articles.
- **ticket_watchers** — PK `(ticket_id, user_id)`, `added_by`, `added_at`; people following a work order. Self-subscribe needs read access; adding/removing someone else needs edit rights. **Not allowed on HR Concerns.** Watched tickets appear in the watcher's notifications.
- **ticket_surveys** — one post-resolution technician survey per work order (`ticket_id` unique). Created `pending` when a work order becomes `resolved` (`ResolutionSurvey`), which Mailboxes the requester a `/survey/:id` link. Three 1–5 ratings + comment. Only sent when the requester is an active user, there's an assignee, and they differ.
- **sla_policies / sla_calendars / sla_holidays / app_settings** — the SLA engine. Policies match on `priority` / `request_type` / `category` / `department` (NULL = any) with response + resolution targets **in minutes** and an optional business-hours calendar; the most specific active policy wins (`SlaPolicies::pickPolicy`), else the per-priority day defaults in `app_settings.sla_days` (`SlaConfig`, `GET/PUT /api/settings/sla`). **Targets are pinned onto the ticket at creation.** Calendars = timezone + weekly hours JSON + holidays; NULL calendar = 24/7 (`BusinessHours`). `Sla::standing()` is pause-aware (pending/on_hold/resolved stop the clock) and business-hours-aware, returning `response` and `resolution` clocks. **`SlaMonitor`** (cron) marks each clock's breach once (atomic `UPDATE … WHERE marker IS NULL`), logs `sla_breach`, and fires automation triggers `sla.response_breached` / `sla.resolution_breached`. **`SlaAlerts`**: at **75%** of a target it marks `sla_*_warned_at` once and logs `sla_warning`; for warnings **and** breaches it sends the assignee + the routed department's manager a Mailbox message and an email (email skipped if their `notifications.email_sla_alerts` preference is off). HR Concerns are excluded from monitoring.
- **automation_rules / automation_runs** — WHEN/IF/THEN rules: `trigger_event` (`ticket.created`, `ticket.updated`, `sla.response_breached`, `sla.resolution_breached`), `conditions` JSON (`{ match: 'all'|'any', rules: [{ field, op, value }] }`, ops `eq`/`neq`/`contains`/`in`/`is_empty`/`is_not_empty`), `actions` JSON (`set_field` status/priority/request_type/category/department/assignee, or `add_note`), `priority`, `stop_on_match`. `Automation::run()` applies matched changes in one direct UPDATE (no recursion), logs them to `ticket_activity` as `Automation: <rule>`, and records `automation_runs`. Automation changes do **not** send ticket emails. HR Concerns are excluded.
- **audit_log** — admin audit trail (`Audit::record($request, [...])`, fire-and-forget): actor, `action` (e.g. `user.update`, `dept.delete`, `taxonomy.category.update`), entity type/id/label, `changes` JSON diff (secrets never logged), ip. Denormalized, no FKs. Read-only, admin-role gated. Grows unbounded (no prune job yet).
- **departments** — name (unique), description, is_active, `manager_id` (one head per department; must be an active user in that department), `is_hr` (the single department approved HR Concerns route to).
- **password_reset_requests** — IT-mediated reset queue (`pending`/`resolved`/`denied`); self-service forgot/reset-password by email also exists.
- **messages** — internal Mailbox (Inbox/Sent): denormalized sender/recipient names, subject, body, optional in-app link (`link_url`/`link_label`), read state, per-side soft delete. System messages use `sender_id = 0` / `sender_name = 'Hubly'` (`SystemMessage::send`).
- **announcements** — site-wide banners (`info`/`maintenance`/`warning`) with an optional start/end window. Everyone reads active ones; admins and the IT department manage them.
- **assets / asset_requests** — inventory (`asset_tag` unique, `status` in_use/in_storage/repair/retired) and the request → review workflow with IT follow-up notes.
- **kb_articles / kb_feedback / kb_article_versions** — Markdown articles (unique `slug`, `version`), one revisable 👍/👎 vote per user per article (+ optional comment), and a snapshot per content-changing save. Restore re-applies an old snapshot as a **new** version.
- **spaces / space_members / space_items (+ comments, links, history, docs, goals)** — Jira-style project Spaces, separate from work orders. Private to members (`spaces.manage` sees all). Roles: `owner` ("Project Manager", sole admin), `project_owner` (read-only stakeholder, Summary tab only), `member`. Items are epics/tasks/subtasks with per-space keys (`MKS-1`), board position, optional manual SLA (`sla_days` → `due_at`). Only the assignee or the PM/admins can move/edit an item; (re)assigning and deleting are PM/admin-only. Dates are returned as `YYYY-MM-DD` strings.

> Daily **network reports** are stored only in the browser's `localStorage` (`client/src/lib/networkReports.js`) — there is no server table for them yet.

## API surface

All routes are in `server-laravel/routes/api.php` (under `/api`), plus `routes/uploads.php` (`/uploads/*`) and `routes/cron.php` (`/cron/*`). Controllers are `app/Http/Controllers/Api/<Name>Controller.php`.

| Prefix | Purpose |
| --- | --- |
| `/api/health` | DB ping + `build: { sha, time }` (from `build.json`, written by the deploy script; `null` in a checkout) |
| `/api/auth` | Login/logout (httpOnly cookie), `/me` (+ `PATCH` name/job_title), `/me/stats` (technician scorecard), `/me/preferences` (GET/PATCH), `/me/invalidate-sessions`, `/me/avatar` + `/me/signature` (POST/DELETE), change / forgot / reset password |
| `/api/tickets` | Work orders: list/create/detail/update, bulk update, activity + notes, attachments, KB links, watchers, self-claim/release, HR approve/deny. `GET /:id` returns `can_edit`, `can_post_note`, `can_approve` |
| `/api/taxonomy` | `GET /` (active request types + category tree, any signed-in user); `users.manage`: `GET /manage` (all + usage counts), CRUD `/request-types`, `/categories`, `POST /reorder` |
| `/api/settings` | `GET`/`PUT /sla` — flat per-priority SLA day defaults (read: anyone; write: `users.manage`) |
| `/api/sla` | SLA policies, business-hours calendars + holidays, `/meta` (`users.manage`) |
| `/api/automation` | Rule CRUD, `/meta` (builder dropdowns), `/runs` (`automation.manage`) |
| `/api/users` | User CRUD, permission overrides, bulk import (`POST /import`), admin avatar (`users.manage`); `/directory` + `/assignable` lists |
| `/api/departments` | List (open); writes `users.manage` |
| `/api/password-resets` | IT reset queue (`users.manage`) |
| `/api/announcements` | Active banners (everyone); CRUD for admins + IT department |
| `/api/notifications` | Bell feed from ticket activity (assigned, department-routed, watched, pending approvals) + unread counts split by view (`myQueue`/`submitted`/`all`) |
| `/api/messages` | Mailbox: list by box, unread count, send, mark read, per-side delete |
| `/api/surveys` | Survey reports (`users.manage`), fetch/submit a survey |
| `/api/assets`, `/api/asset-requests` | Inventory; request → review workflow, detail, follow-up notes |
| `/api/kb` | Articles, feedback + report, `/suggest` (deflection on Create Work Order), version history + restore |
| `/api/spaces` | Spaces, members, items (+ detail bundle, comments, links), docs, goals, join requests |
| `/api/search` | Global ⌘K search across work orders, KB, spaces/items, assets, users — each group permission- and visibility-filtered |
| `/api/network` | UniFi dashboard (mock data when `UNIFI_HOST` is unset) |
| `/api/audit` | Audit log list + `/meta` (admin role) |
| `/uploads/{tickets,avatars,signatures,messages,kb,spaces}/…` | Auth-gated file serving; each category re-checks the owning record's visibility (avatars/signatures: any signed-in user) |
| `/cron/{sla-monitor,space-due-reminders}` | HTTP cron fallback, 404 unless `?token=` matches `CRON_SECRET` |

### Access rules worth knowing

**Work-order visibility** (`TicketVisibility`, `TicketController`): staff (admin/agent), the requester, the assignee, or anyone in the department the work order is routed to can see it. Plain users can self-claim/release within their department (`/claim`, `/release`) but can't take one assigned to someone else. **Editing** (`canManageTicket`) = staff, the assignee, members of the routed department, or that department's manager. **Notes** (`canPostNote`) = those plus the requester and the approving manager.

**HR Concerns (need-to-know).** A work order in category **HR Concerns** is held `pending` and sent to the manager of the requester's department for approval, while kept **unrouted** (`department` NULL) so coworkers can't see it. Approve → routed to the `is_hr` department; deny → closed with a required reason; no manager (or requester is the manager) → auto-approved. Only staff, requester/assignee, the approving manager, and (once routed) HR can read it — enforced on detail, activity, list, search, notifications and attachments. No watchers, no self-claim until approved, excluded from automation and SLA monitoring. `HrApproval` sends the Mailbox notices.

**Auth/session.** JWT in an httpOnly `mf_token` cookie (`SameSite=Lax`, `Secure` in production), also accepted as a `Bearer` header. `JwtAuthenticate` reloads the user on every request, so role/permission/active changes apply immediately. `users.token_version` is embedded as `tv`; password change/reset and "sign out all other devices" bump it (the current device gets a fresh cookie).

## Frontend

- Routes in `client/src/App.jsx`, wrapped in `<ProtectedRoute permission={[module, action]}>` (or `role={[...]}` for staff/admin-only pages). This is UX only — the server re-checks everything.
  - `users.manage`: `/users`, `/users/reports`, `/users/surveys`, `/users/departments`, `/users/sla`, `/users/categories`, `/users/password-resets`
  - `automation.manage`: `/users/automation`; admin role: `/users/audit`; admin/agent role: `/tickets/reports`
  - module `view`/`manage`/`create` gates for tickets, assets, kb, network, spaces pages
  - any signed-in user: `/dashboard`, `/profile`, `/settings`, `/mailbox`, `/survey/:id`; public: `/`, `/signin`, `/forgot-password`, `/reset-password`
- `api()` in `lib/auth.js` wraps fetch (`credentials: 'include'`, throws `Error(data.error)`); only the non-sensitive profile is cached in `localStorage` (`mf_user`).
- `lib/config.js` prefixes API/upload URLs with `VITE_API_URL` in production; empty in dev (Vite proxies `/api` and `/uploads` to `:8000`).
- Request types and categories come from `useTaxonomy()` (`lib/categories.js`) — never hard-code them in pages. The names in `CreateTicket.jsx` that switch in special forms (HR Concerns, ERP Access, the leave/overtime/manpower/schedule forms) must match the `is_system` taxonomy entries.
- Notification bell / Work Orders badge / Mailbox badge poll (45s / 45s / 30s); there's no realtime push.
- User-authored URLs (Markdown links/images in KB articles and notes) must go through `lib/url.js` `safeUrl()`.

## Permissions

`app/Services/Permissions.php`. Modules → actions:

- `tickets`: view, create
- `assets`: view, manage
- `kb`: view, manage
- `users`: manage (also gates SLA settings, categories & request types, departments, surveys, password resets)
- `network`: view, manage
- `spaces`: view (use Spaces; see your own), manage (see every space)
- `automation`: manage (admin only by default)

`ROLE_DEFAULTS` gives each role (admin/agent/user) its baseline; a user's `permissions` JSON overrides individual flags. Login and `/api/auth/me` return the merged result so the client gates UI from the same source. When adding a module/action, update `MODULES` and `ROLE_DEFAULTS` together (unknown keys are stripped).

## Goals for Claude

When helping in this repository, prioritize:

1. Correctness over cleverness.
2. Small, reviewable changes.
3. Clear explanations for non-obvious decisions.
4. Preserving existing architecture and conventions unless asked to refactor.
5. Avoiding breaking changes unless explicitly requested.

## Working style

- Read relevant files before changing code.
- Match the existing code style in the touched area.
- Prefer minimal diffs.
- Do not rename files, classes, functions, or variables unless needed.
- Do not introduce new dependencies unless necessary and justified.
- If a requirement is ambiguous, choose the safest implementation and state assumptions.
- When fixing bugs, explain the root cause briefly.

## Code conventions

### Backend (`server-laravel/`)

- Validate inputs at the controller boundary before touching the DB; return `response()->json(['error' => '…'], 4xx)`.
- Parameterized queries only (query builder bindings / `?` placeholders).
- Gate every protected route with `auth.jwt` + `permission:` (preferred) or `role:`; add per-record checks in the controller.
- Put reusable logic in `app/Services/`; keep fire-and-forget services non-throwing.
- Record sensitive admin actions with `Audit::record()`.

### Frontend (`client/`)

- ES modules, functional React components with hooks.
- Tailwind utility classes — match patterns already in `components/` and `pages/`.
- Reuse `Modal`, `MarkdownEditor`, `DashboardHeader`, `ProtectedRoute`, `UserPicker`, `Avatar`, `ImageLightbox` rather than duplicating.
- Handle loading, empty, and error states for any data fetched from `/api/*`.
- Use `react-router-dom` v7 patterns (`useNavigate`, `useParams`, `<Link>`).

## Commands

```bash
# install
cd server-laravel && composer install
cd client && npm install

# run locally
cd server-laravel && php artisan serve     # http://localhost:8000
cd client && npm run dev                   # http://localhost:5173 (proxies /api, /uploads to :8000)

# test (backend)
cd server-laravel && php artisan test

# build (frontend)
cd client && npm run build

# package a deploy (from repo root)
node scripts/package-deploy.mjs            # --allow-dirty, --vendor, --skip-tests
```

**Tests:** `tests/Unit/` covers pure helpers (Permissions, TicketVisibility, SlaPolicies, BusinessHours, SpacesHelpers, Automation). `tests/Feature/` makes real HTTP calls against the local `mainframe_app` database inside rolled-back transactions (`DatabaseTransactions`), so they need the DB up and every `sql/` migration applied. Tests that trigger mail fake the Resend endpoint (`Http::fake`) so nothing is ever sent, even if run on a server with real mail credentials. No frontend test runner and no linter are configured — propose one before installing.

## Database and migrations

- **There is no single up-to-date schema file in the repo.** The original `server/sql/schema.sql` was deleted with `server/`; its last version is in git history (`git show afe5d05:server/sql/schema.sql`). A fresh database = that file, then every file in `server-laravel/sql/` in order.
- **Schema changes are hand-written SQL files in `server-laravel/sql/`**, run once per database (locally and on production) **before** deploying the code that needs them. Current files: `add-cancelled-ticket-status.sql`, `add-sla-warning-markers.sql`, `add-ticket-taxonomy.sql`. There's no runner or applied-migrations table yet, so always tell the user exactly which file(s) must be run on production.
- Make migrations additive and safe to re-run where possible (`CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE` against a unique key). Plain `ADD COLUMN` (no `IF NOT EXISTS`) keeps MySQL 8 compatibility; say in the file header that a second run will just fail with "Duplicate column".
- Avoid destructive changes (DROP COLUMN, type narrowing) unless explicitly requested.
- Never run `php artisan migrate`.

## API changes

- Preserve existing response shapes unless asked — pages in `client/src/pages/` consume them directly.
- If a response shape changes, update the consuming page(s) in the same change.
- Document new endpoints in this file.

## Deployment

**Production: one Hostinger account, same origin.** `hubly.eljincorp.com` serves the SPA (docroot `public_html/hubly`); the Laravel API is **path-mounted** at `hubly.eljincorp.com/backend/*` (front controller in `public_html/hubly/backend/`, app in a sibling non-public folder — confirm which one `backend/index.php` requires; `DEPLOYMENT.md` names both `laravel/backend-f` and `domains/hubly.eljincorp.com/laravel_app`). Full runbook: `server-laravel/DEPLOYMENT.md`.

- **No CI/CD.** A commit is not live until someone packages and uploads it. Before claiming something shipped, check: `curl https://hubly.eljincorp.com/backend/api/health` (→ `build.sha`) and `curl https://hubly.eljincorp.com/version.json`.
- **Deploy flow:** run any new `server-laravel/sql/` files on production → `node scripts/package-deploy.mjs` → extract `hubly-frontend-<sha>.zip` into `public_html/hubly/` and `hubly-backend-<sha>.zip` into the Laravel app folder → on the server `composer install --no-dev --optimize-autoloader` (unless packaged with `--vendor`), `php artisan config:cache && php artisan route:cache` → verify both version endpoints.
- The packaging script refuses to build if the tree is dirty, if `client/.env.production` doesn't set `VITE_API_URL=https://hubly.eljincorp.com/backend`, if `client/public/.htaccess` lost its `RewriteCond %{REQUEST_URI} !^/backend/` line (without it every API call returns `index.html`), if backend tests fail, or if the built bundle points at the wrong API.
- Host cron must run `sla:monitor` (~10 min) and `spaces:due-reminders` (hourly) — see `DEPLOYMENT.md` step 7.
- Email only works if production `.env` has `RESEND_API_KEY` (preferred) or `SMTP_HOST`; otherwise sends are logged no-ops.

## Security

- Never hardcode secrets. Backend env (`server-laravel/.env`, see `.env.example`): `APP_KEY`, `JWT_SECRET` (32+ chars), `JWT_EXPIRES_IN`, `DB_*`, `CORS_ORIGINS`, `TRUST_PROXY`, `APP_BASE_URL` (links in emails), `CRON_SECRET`, `RESEND_API_KEY` or `SMTP_*`, `MAIL_FROM`, `UNIFI_*`, `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`.
- Passwords are bcrypt-hashed (`Hash::make`); never stored or logged in plaintext (bulk import returns generated passwords once).
- Validate role/permission on the server even when the client gates the UI.
- Validate uploads (MIME allowlist + size cap; images are re-encoded). Every `/uploads/*` file is auth-gated and re-checks visibility of its owning record.
- `SecurityHeaders` middleware sets nosniff, `X-Frame-Options: DENY`, Referrer-Policy, CSP, and HSTS in production; CORS is limited to `CORS_ORIGINS`.
- Pass user-authored URLs through `safeUrl()` on the client.
- The seed admin accounts from the original schema (`admin@bwsuperbakeshop.ph`, `admin@mainframe.local`) have publicly known default passwords — make sure they're changed or deactivated on production.

## Performance

- Match existing indexes (status, priority, category, department, etc.) in WHERE clauses.
- Avoid N+1 patterns in ticket detail / activity loading; prefer a single JOIN or grouped query.
- Paginate list endpoints if result sets grow.

## Pull request expectations

When summarizing changes, include:

- What changed and why
- Any SQL files that must be run on production (and in what order)
- Assumptions made
- Tests / manual checks run
- Follow-up work or risks

## What Claude should avoid

- Large unrequested refactors
- Rewriting working code without reason
- Adding dependencies for small tasks (especially in `client/` — the dependency list is intentionally minimal)
- Changing formatting unrelated to the task
- Editing files under `node_modules/` or `vendor/`
- Touching `.env` or `.env.local` files
- Running `php artisan migrate`
- Making assumptions about product requirements without stating them

## Preferred response format

When completing a task, prefer:

1. **Summary** — what changed
2. **Files changed** — list touched files
3. **Notes** — assumptions, tradeoffs, risks, schema impact
4. **Verification** — checks run (manual or otherwise)

---

If this file conflicts with direct user instructions, follow the direct user instructions.
