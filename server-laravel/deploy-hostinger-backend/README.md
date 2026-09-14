# Hostinger `/backend` front controller

These 4 files are a pre-edited copy of `server-laravel/public/` for the
**path-mounted** deployment described in `DEPLOYMENT.md` Step 2 — the
Laravel API lives at `hubly.eljincorp.com/backend/*`, inside the existing
frontend site's doc root, instead of on its own subdomain.

Upload these 4 files as-is to `public_html/hubly/backend/` (create the
`backend` folder if it doesn't exist yet). Don't copy `server-laravel/public/`
directly — `index.php` here has different `require` paths than the stock
copy, because it lives 3 directories deeper than a normal Laravel `public/`
folder would.

Only `index.php` differs from the stock `server-laravel/public/` copy (its
three `require`/`file_exists` paths point up to `../../../laravel/backend-f/`
instead of `../`) — regenerate it here, don't hand-edit a fresh copy, if the
stock `public/index.php` ever changes (e.g. a Laravel upgrade touches it).

Expected layout on the server:

```
domains/eljincorp.com/
├── public_html/
│   └── hubly/                      ← frontend site's doc root (dist/ upload)
│       ├── index.html              ← built frontend
│       ├── assets/                 ← built frontend
│       ├── .htaccess               ← client/public/.htaccess (SPA + /backend exclusion)
│       └── backend/                ← THIS FOLDER's 4 files go here
│           ├── index.php
│           ├── .htaccess
│           ├── robots.txt
│           └── favicon.ico
└── laravel/
    └── backend-f/                  ← the whole server-laravel/ app (composer install here)
        ├── app/
        ├── vendor/
        ├── bootstrap/
        ├── .env
        └── ...
```

`public_html/hubly/backend/.htaccess` is the *stock* Laravel front-controller
ruleset (unmodified) — it works because `index.php` is physically inside
`backend/`, so Laravel/Symfony auto-detects `/backend` as its base path and
routes `/backend/api/auth/login` internally as `/api/auth/login`. No route
changes needed in the app itself.
