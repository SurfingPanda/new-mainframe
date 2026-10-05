import { test as setup, expect } from '@playwright/test';
import { ACCOUNTS, AUTH_FILE, signIn } from './helpers.js';

// Sign each role in once through the real form and save the session (httpOnly cookie +
// the cached profile in localStorage) so the other specs start already signed in.
for (const role of ['admin', 'user']) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await signIn(page, ACCOUNTS[role]);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.context().storageState({ path: AUTH_FILE(role) });
  });
}
