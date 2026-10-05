// Shared constants for the smoke tests. The accounts are created by
// `php artisan e2e:data seed` (server-laravel/app/Console/Commands/E2eData.php) —
// keep these in sync with it.
export const PASSWORD = 'E2e-Pass-123!';

export const ACCOUNTS = {
  admin: { email: 'e2e-admin@e2e.test', name: 'E2E Admin', department: 'E2E Admin Dept' },
  user: { email: 'e2e-user@e2e.test', name: 'E2E User', department: 'E2E User Dept' },
  // The Document Controller for the run: ERP Access work orders are routed to them.
  documentController: { email: 'e2e-dc@e2e.test', name: 'E2E Doc Controller', department: 'E2E Doc Dept' }
};

export const AUTH_FILE = (role) => `e2e/.auth/${role}.json`;

// Today's date in the browser's (= this machine's) local time as YYYY-MM-DD —
// what an <input type="date"> that defaults to "today" should show.
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A unique title so a run's work orders are easy to find (and never collide across runs).
export function uniqueTitle(label) {
  return `[E2E] ${label} ${Date.now().toString(36)}`;
}

// Sign in through the real form.
export async function signIn(page, { email }, password = PASSWORD) {
  if (process.env.DEBUG_E2E) {
    page.on('response', (r) => r.url().includes('/api/') && console.log('[net]', r.status(), r.request().method(), r.url()));
    page.on('console', (m) => console.log('[console]', m.type(), m.text()));
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  }
  await page.goto('/signin');
  await page.getByLabel('Work email').or(page.locator('#email')).first().fill(email);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();
}
