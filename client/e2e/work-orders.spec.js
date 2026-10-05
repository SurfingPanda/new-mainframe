import { test, expect } from '@playwright/test';
import { ACCOUNTS, AUTH_FILE, todayLocal, uniqueTitle } from './helpers.js';

// A plain user filing work orders. The Document Controller for the run is
// "E2E Doc Controller" in "E2E Doc Dept" (seeded by `php artisan e2e:data seed`).
test.use({ storageState: AUTH_FILE('user') });

const dc = ACCOUNTS.documentController;
// Required fields render their label as "Department *", so match the name with an optional asterisk.
const labelExact = (text) => new RegExp(String.raw`^${text}\s*\*?$`);
const selectLabelled = (page, label) => page.getByLabel(labelExact(label)).and(page.locator('select'));

// "Work order WO00000123 created." banner -> numeric id.
async function createdId(page) {
  const banner = page.getByText(/Work order WO\d+ created/);
  await expect(banner).toBeVisible();
  return Number((await banner.textContent()).match(/WO(\d+)/)[1]);
}

test.describe('create work order', () => {
  test('files an ordinary work order and finds it in the list', async ({ page }) => {
    const title = uniqueTitle('ordinary');
    await page.goto('/tickets/create');

    // Required fields are enforced: nothing submits without a title.
    await expect(page.getByLabel('Title')).toBeVisible();
    await page.getByLabel('Title').fill(title);
    await expect(page.getByLabel('Requester')).toHaveValue(ACCOUNTS.user.name);

    // Department is required and chosen by the submitter for an ordinary category.
    const dept = selectLabelled(page, 'Department');
    await expect(dept).toBeEnabled();
    await dept.selectOption(ACCOUNTS.user.department);
    await expect(page.getByLabel('Assignee')).toBeEnabled();

    await page.getByRole('button', { name: 'Create work order' }).click();
    const id = await createdId(page);
    expect(id).toBeGreaterThan(0);

    // It shows up in the (server-paginated) list, found by searching its title.
    await expect(page).toHaveURL(/\/tickets\/all/);
    await page.getByPlaceholder(/Search by title or ID/).fill(title);
    await page.getByPlaceholder(/Search by title or ID/).press('Enter');
    await expect(page.getByRole('link', { name: title })).toBeVisible();

    // And the API stored what the form sent.
    const res = await page.request.get(`/api/tickets/${id}`);
    expect(res.ok()).toBeTruthy();
    const ticket = await res.json();
    expect(ticket.title).toBe(title);
    expect(ticket.requester).toBe(ACCOUNTS.user.name);
    expect(ticket.department).toBe(ACCOUNTS.user.department);
  });

  test('a title that is too short is rejected', async ({ page }) => {
    await page.goto('/tickets/create');
    await page.getByLabel('Title').fill('ab');
    await expect(page.getByText('Title needs at least 4 characters.').first()).toBeVisible();
  });
});

test.describe('ERP Access', () => {
  async function openErpForm(page) {
    await page.goto('/tickets/create');
    await page.getByLabel('Category', { exact: true }).selectOption('ERP Access');
    await page.getByLabel('Subcategory', { exact: true }).selectOption('Finance & Accounting');
    await page.getByLabel('Access Request Type').selectOption('New access request');
  }

  test('the date defaults to today', async ({ page }) => {
    await openErpForm(page);
    await expect(page.getByLabel(labelExact('Date'))).toHaveValue(todayLocal());
  });

  test('department and assignee are locked to the Document Controller', async ({ page }) => {
    await openErpForm(page);

    // The people lookup loads asynchronously, so wait for the locked values to appear.
    const dept = selectLabelled(page, 'Department');
    await expect(dept).toBeDisabled();
    await expect(dept).toHaveValue(dc.department);
    const assignee = page.getByLabel('Assignee');
    await expect(assignee).toBeDisabled();
    await expect(assignee).toHaveValue(dc.name);
    await expect(page.getByText('routed to the Document Controller')).toBeVisible();
  });

  test('leaving ERP Access unlocks them again', async ({ page }) => {
    await openErpForm(page);
    await expect(selectLabelled(page, 'Department')).toBeDisabled();

    const other = await page.getByLabel('Category', { exact: true }).locator('option').evaluateAll((opts) =>
      opts.map((o) => o.value).find((v) => v && v !== 'ERP Access' && v !== 'HR Concerns'));
    await page.getByLabel('Category', { exact: true }).selectOption(other);
    await expect(selectLabelled(page, 'Department')).toBeEnabled();
    await expect(page.getByLabel('Assignee')).toBeEnabled();
  });

  test('submitting routes the work order to the Document Controller', async ({ page }) => {
    const title = uniqueTitle('erp');
    await openErpForm(page);
    await page.getByLabel('Title').fill(title);
    await expect(selectLabelled(page, 'Department')).toHaveValue(dc.department);
    await page.getByLabel('Access Requirements / Changes').fill('Read access to the finance ledger (e2e).');

    await page.getByRole('button', { name: 'Create work order' }).click();
    const id = await createdId(page);

    // Server side: the submitter's (locked) choices were enforced and the DC owns it.
    const ticket = await (await page.request.get(`/api/tickets/${id}`)).json();
    expect(ticket.category).toBe('ERP Access');
    expect(ticket.assignee).toBe(dc.name);
    expect(ticket.department).toBe(dc.department);
    expect(ticket.description).toContain('Read access to the finance ledger');
  });

  test('ERP Access cannot be dodged by posting a different assignee or department', async ({ page }) => {
    // The form locks the fields, but the server is what enforces it.
    const res = await page.request.post('/api/tickets', {
      data: {
        title: uniqueTitle('erp-api'), requester: ACCOUNTS.user.name, category: 'ERP Access',
        subcategory: 'Finance & Accounting', subcategory2: 'New access request',
        department: 'Somewhere Else', assignee: ACCOUNTS.admin.name
      }
    });
    expect(res.status()).toBe(201);
    const ticket = await res.json();
    expect(ticket.assignee).toBe(dc.name);
    expect(ticket.department).toBe(dc.department);
  });
});

test.describe('HR forms default their dates to today', () => {
  async function openHrForm(page, form) {
    await page.goto('/tickets/create');
    await page.getByLabel('Category', { exact: true }).selectOption('HR Concerns');
    await page.getByLabel('Subcategory', { exact: true }).selectOption('Leave & Attendance');
    await page.getByLabel('Sub-subcategory').selectOption(form);
  }

  test('manpower request: Date Requested', async ({ page }) => {
    await openHrForm(page, 'Request for Manpower Personnel');
    await expect(page.getByLabel('Date Requested')).toHaveValue(todayLocal());
  });

  test('change schedule: Date Filed', async ({ page }) => {
    await openHrForm(page, 'Change Time Schedule / Cancel Restday / Change Restday');
    await expect(page.getByLabel('Date Filed')).toHaveValue(todayLocal());
  });
});
