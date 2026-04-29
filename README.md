# Mainframe

Internal IT operations platform for the IT department. Combines **ticketing**, **IT asset inventory**, and a **knowledge base** in one app.

```
new-mainframe/
├── client/   React + Vite + Tailwind landing page (and future UI)
├── server/   Node.js + Express + MySQL API
└── README.md
```

## Stack

- **Frontend:** React 18, Vite, Tailwind CSS
- **Backend:** Node.js, Express, mysql2
- **Database:** MySQL / MariaDB (XAMPP works out of the box)

---

## Prerequisites

- Node.js 18+ and npm
- MySQL or MariaDB running (XAMPP's MySQL on `localhost:3306` is fine)

## 1. Set up the database

Open phpMyAdmin (or any MySQL client) and run:

```bash
mysql -u root < server/sql/schema.sql
```

This creates the `mainframe_app` database with `tickets`, `assets`, and `kb_articles` tables, plus a small set of sample rows.

## 2. Start the backend

```bash
cd server
cp .env.example .env       # adjust DB_* values if needed
npm install
npm run dev
```

The API runs on `http://localhost:4000`. Health check: `GET /api/health`.

Endpoints:

| Method | Path                  | Purpose                       |
| ------ | --------------------- | ----------------------------- |
| GET    | `/api/health`         | Service + DB ping             |
| GET    | `/api/tickets`        | List recent tickets           |
| POST   | `/api/tickets`        | Create a ticket               |
| GET    | `/api/assets`         | List assets                   |
| POST   | `/api/assets`         | Create an asset record        |
| GET    | `/api/kb`             | List published KB articles    |
| GET    | `/api/kb/:slug`       | Read a KB article             |

## 3. Start the frontend

```bash
cd client
npm install
npm run dev
```

The landing page runs on `http://localhost:5173`. Vite proxies `/api/*` to the backend, so the dashboard widgets and future feature pages can call the API without CORS gymnastics.

---

## Roadmap

The landing page is the entry point. From here, the modules to build out are:

- **Ticketing** — intake form, list/detail views, status transitions, SLA timers
- **Asset Inventory** — searchable table, assignment history, CSV import/export
- **Knowledge Base** — markdown editor, versioning, link-from-ticket

Each module has a starter route in `server/src/routes/` and a corresponding table in `server/sql/schema.sql`.
