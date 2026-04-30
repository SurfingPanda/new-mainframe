# CLAUDE.md

This file gives Claude codebase-specific instructions for working in this repository.

## Project overview

- **Project name:** Mainframe
- **Purpose:** Internal IT operations platform combining ticketing, IT asset inventory, and a knowledge base in one app.
- **Primary stack:** React 18 + Vite + Tailwind (client), Node.js + Express + mysql2 (server)
- **Database:** MySQL 8 / MariaDB (XAMPP on `localhost:3306`)
- **Runtime(s):** Node.js 18+
- **Package manager(s):** npm (separate `client/` and `server/` workspaces — no monorepo tooling)

## Repository structure

```
new-mainframe/
├── client/                    React + Vite + Tailwind frontend
│   ├── public/images/         Logo and screenshots
│   └── src/
│       ├── App.jsx            Router (react-router-dom v7)
│       ├── main.jsx           Entry
│       ├── components/        Shared UI: Navbar, Modal, ProtectedRoute, MarkdownEditor, etc.
│       └── pages/             Route views: Landing, SignIn, Dashboard, AllTickets,
│                              CreateTicket, TicketDetail, Users, AllAssets, AddAsset,
│                              AllArticles, KbArticle, ArticleEditor, ModulePlaceholder
├── server/                    Node.js + Express API
│   ├── sql/schema.sql         Database schema + seed data
│   ├── uploads/               Ticket attachments (served via /uploads)
│   └── src/
│       ├── index.js           App bootstrap, route mounting, /api/health
│       ├── config/db.js       mysql2 pool, pingDb, ensureSchema
│       ├── middleware/auth.js JWT auth + role gates
│       └── routes/            auth, users, tickets, assets, kb
└── README.md
```

## Domain model (database)

Schema lives in `server/sql/schema.sql`. Key tables:

- **users** — id, email (unique), password_hash, name, `role` ENUM('admin','agent','user'), department, is_active, last_login_at
- **tickets** — title, description, `status` ENUM('open','in_progress','on_hold','resolved','closed'), `priority` ENUM('low','normal','high','urgent'), `request_type` ENUM('incident','service_request','question','change'), category, requester, assignee, asset_id
- **ticket_activity** — append-only audit log: type ('change'|'note'), field, old_value, new_value, body, attachment_id
- **ticket_kb_links** — many-to-many between tickets and KB articles
- **ticket_attachments** — uploaded files (stored on disk under `server/uploads/`, served via `/uploads/...`)
- **assets** — asset_tag (unique), type, model, serial_no, assignee, location, `status` ENUM('in_use','in_storage','repair','retired'), purchased_at
- **kb_articles** — title, slug (unique), category, body (markdown, MEDIUMTEXT), author, published flag

Database name: `mainframe_app` (utf8mb4_unicode_ci).

## API surface

Mounted in `server/src/index.js` under `/api`:

| Prefix          | File                          | Purpose                                  |
| --------------- | ----------------------------- | ---------------------------------------- |
| `/api/health`   | `index.js`                    | Service + DB ping                        |
| `/api/auth`     | `routes/auth.js`              | Login, JWT issue                         |
| `/api/users`    | `routes/users.js`             | User CRUD (admin)                        |
| `/api/tickets`  | `routes/tickets.js`           | Tickets, activity, KB links, attachments |
| `/api/assets`   | `routes/assets.js`            | Asset inventory                          |
| `/api/kb`       | `routes/kb.js`                | KB articles (read by slug, list)         |

Auth: JSON Web Tokens via `jsonwebtoken`, password hashing via `bcryptjs`. Middleware in `server/src/middleware/auth.js` enforces `requireAuth` and role-based gates.

File uploads: `multer` for ticket attachments. Files saved under `server/uploads/` and served statically.

## Frontend routing

Routes defined in `client/src/App.jsx`. Most routes wrap pages in `<ProtectedRoute>`; some require specific roles:

- `role="admin"` — `/users`
- `role={['admin', 'agent']}` — `/assets/new`, `/assets/edit/:id`, `/kb/new`, `/kb/edit/:slug`
- All other authenticated routes — any signed-in user

Vite dev server proxies `/api/*` to the backend on `:4000`, so the client can fetch without CORS configuration.

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

### General

- ES modules everywhere (`"type": "module"` in both `client/` and `server/`). Use `import`, not `require`.
- Keep functions focused and reasonably small.
- Prefer descriptive names.
- Add comments only when intent is non-obvious.

### Backend (server/)

- Validate inputs at route boundaries before touching the DB.
- Use the shared mysql2 pool from `config/db.js`; do not create new connections per request.
- Use parameterized queries (`?` placeholders) — never string-concatenate user input into SQL.
- Handle errors explicitly; let the central error handler in `index.js` catch unexpected ones.
- Apply `requireAuth` and role middleware on protected routes.
- Keep route handlers thin; if logic grows, extract helpers near the route file.

### Frontend (client/)

- Functional React components with hooks. No class components.
- Tailwind utility classes for styling — match patterns already in `components/` and `pages/`.
- Reuse `Modal`, `MarkdownEditor`, `Navbar`, `DashboardHeader`, `ProtectedRoute` rather than duplicating.
- Wrap protected pages in `<ProtectedRoute>` (and pass `role` when admin/agent only).
- Handle loading, empty, and error states for any data fetched from `/api/*`.
- Use `react-router-dom` v7 patterns (`useNavigate`, `useParams`, `<Link>`).

## Commands

### Install

```bash
# backend
cd server && npm install

# frontend
cd client && npm install
```

### Database setup

```bash
mysql -u root < server/sql/schema.sql
```

This creates `mainframe_app` with seed assets, KB articles, and tickets. The server also calls `ensureSchema()` on boot.

### Run locally

```bash
# backend (http://localhost:4000)
cd server && npm run dev

# frontend (http://localhost:5173)
cd client && npm run dev
```

### Build

```bash
cd client && npm run build
```

### Test / Lint

No test runner or linter is configured yet. If adding tests, propose the framework before installing.

## Database and migrations

- Schema is a single file (`server/sql/schema.sql`) using `CREATE TABLE IF NOT EXISTS`. There is no migration tool yet.
- When changing schema: update `schema.sql`, ensure `ensureSchema()` in `config/db.js` still works on a fresh DB, and call out any manual migration steps for existing databases.
- Avoid destructive schema changes (DROP COLUMN, type narrowing) unless explicitly requested.
- Keep seed inserts idempotent (`ON DUPLICATE KEY UPDATE ...`).

## API changes

- Preserve existing response shapes unless asked to change them — pages in `client/src/pages/` consume them directly.
- If a response shape changes, update the consuming page(s) in the same change.
- Document any new endpoint in this file or the README.

## Security

- Never hardcode secrets. The server reads `JWT_SECRET`, `DB_*`, and `PORT` from `.env` (see `server/.env.example`).
- Always hash passwords with `bcryptjs` — never store plaintext.
- Always use parameterized SQL queries.
- Validate role on the server even when the client already gates the UI; `ProtectedRoute` is UX, not security.
- Sanitize/validate file uploads (size, mime) before persisting.

## Performance

- Use indexes already defined in `schema.sql` (status, role, category, etc.) — match them in WHERE clauses.
- Avoid N+1 patterns in ticket detail / activity loading; prefer a single JOIN when listing.
- Paginate list endpoints if result sets grow.

## Pull request expectations

When summarizing changes, include:

- What changed and why
- Any schema migrations or manual DB steps required
- Assumptions made
- Tests / manual checks run
- Follow-up work or risks

## What Claude should avoid

- Large unrequested refactors
- Rewriting working code without reason
- Adding dependencies for small tasks (especially in `client/` — the dependency list is intentionally minimal)
- Changing formatting unrelated to the task
- Editing files under `node_modules/`
- Touching `.env` or `.env.local`
- Making assumptions about product requirements without stating them

## Preferred response format

When completing a task, prefer:

1. **Summary** — what changed
2. **Files changed** — list touched files
3. **Notes** — assumptions, tradeoffs, risks, schema impact
4. **Verification** — checks run (manual or otherwise)

---

If this file conflicts with direct user instructions, follow the direct user instructions.
