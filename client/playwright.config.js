import { defineConfig } from '@playwright/test';

// Browser smoke tests (sign-in, create work order, ERP Access). Run: `npm run test:e2e`.
//
// The run is self-contained and does not touch your dev servers:
//  - starts its own Laravel API on :8010 (MAIL_DISABLED=1, so nothing is ever emailed;
//    CACHE_STORE=array, so no throttle/cache state leaks into your dev cache) and its own
//    Vite dev server on :5180 proxying to it;
//  - seeds three throw-away @e2e.test accounts into the LOCAL database before the run and
//    removes them (and every work order they filed) afterwards — see
//    server-laravel/app/Console/Commands/E2eData.php, which refuses to run in production;
//  - drives your installed Google Chrome by default (no browser download). Set
//    PW_BROWSER=bundled to use Playwright's own Chromium (`npx playwright install chromium`).
const API_PORT = 8010;
const WEB_PORT = 5180;
const bundled = process.env.PW_BROWSER === 'bundled';

export default defineConfig({
  testDir: './e2e',
  // One worker: the tests share one database and some rely on the single Document Controller.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.js',
  globalTeardown: './e2e/global-teardown.js',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    ...(bundled ? {} : { channel: 'chrome' }),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    { name: 'anonymous', testMatch: /signin\.spec\.js/, dependencies: ['setup'] },
    { name: 'signed-in', testMatch: /work-orders\.spec\.js/, dependencies: ['setup'] }
  ],
  webServer: [
    {
      // Same invocation as `artisan serve`, minus its env filtering (which would drop MAIL_DISABLED):
      // the framework's router script loads index.php from the current directory, so run inside public/.
      command: 'php -S 127.0.0.1:' + API_PORT + ' -t . ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php',
      cwd: '../server-laravel/public',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { MAIL_DISABLED: '1', CACHE_STORE: 'array', APP_DEBUG: 'false' },
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { VITE_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000
    }
  ]
});
