import { test, expect } from '@playwright/test';
import { ACCOUNTS, signIn } from './helpers.js';

test.describe('sign-in', () => {
  test('a signed-out visitor is sent to the sign-in page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/signin/);
    await expect(page.locator('#email')).toBeVisible();
  });

  test('empty form is rejected without calling the API', async ({ page }) => {
    await page.goto('/signin');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('alert')).toContainText('enter your work email and password');
    await expect(page).toHaveURL(/\/signin/);
  });

  test('wrong password shows an error and stays on the page', async ({ page }) => {
    await signIn(page, ACCOUNTS.user, 'definitely-not-the-password');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/signin/);
  });

  test('valid credentials land on the dashboard', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(ACCOUNTS.admin.name).first()).toBeVisible();
  });
});
