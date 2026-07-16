import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Browser smoke tests: a thin safety net over the production build.
// They assert the app boots, navigates, persists, and recovers — not
// pixel-level UI. Test data is invented; never use personal values.

const STORAGE_KEY = 'davidos-state-v1';

async function gotoHome(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /OS Status/ })).toBeVisible();
}

test('boots to the dashboard without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await gotoHome(page);
  await expect(page.locator('.app-header h1')).toHaveText('DavidOS');
  // Service worker registration may warn on localhost; real errors fail.
  expect(errors.filter((e) => !/service worker|sw\.js/i.test(e))).toEqual([]);
});

test('bottom nav reaches every primary tab', async ({ page }) => {
  await gotoHome(page);
  const nav = page.locator('.bottom-nav');

  await nav.getByText('Workflows').click();
  await expect(page.getByRole('heading', { name: 'Workflow Runner' })).toBeVisible();

  await nav.getByText('Projects').click();
  await expect(page.getByRole('heading', { name: /Project Vault/ })).toBeVisible();

  await nav.getByText('Logs').click();
  await expect(page.getByRole('heading', { name: /Audit log/ })).toBeVisible();

  await nav.getByText('More').click();
  await expect(page.getByRole('heading', { name: 'More' })).toBeVisible();

  await nav.getByText('Home').click();
  await expect(page.getByRole('heading', { name: /OS Status/ })).toBeVisible();
});

test('risky free-text command shows the honest no-op, sends nothing', async ({ page }) => {
  await gotoHome(page);
  await page.getByLabel('Command input').fill('send an email to my boss about the report');
  await page.getByRole('button', { name: 'Route This' }).click();
  await expect(page.locator('strong', { hasText: 'Nothing was sent or changed.' })).toBeVisible();
});

test('a routed free-text command is never stored or rendered verbatim (privacy)', async ({ page }) => {
  const SECRET = 'SENTINEL-SECRET-audit-9f3a';
  await gotoHome(page);
  await page.getByLabel('Command input').fill(`remind me about ${SECRET} tomorrow`);
  await page.getByRole('button', { name: 'Route This' }).click();

  // The audit log renders a safe event label with a fingerprint — not the text.
  await page.locator('.bottom-nav').getByText('Logs').click();
  await expect(page.getByRole('heading', { name: /Audit log/ })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('SENTINEL-SECRET');
  await expect(page.getByText(/Routed command \(/).first()).toBeVisible();

  // The serialized local state must not contain the secret anywhere either.
  const serialized = await page.evaluate(([key]) => window.localStorage.getItem(key), [STORAGE_KEY]);
  expect(serialized ?? '').not.toContain('SENTINEL-SECRET');
});

test('slash command navigates to a workflow', async ({ page }) => {
  await gotoHome(page);
  await page.getByLabel('Command input').fill('/brief');
  await page.getByLabel('Command input').press('Enter');
  await expect(page).toHaveURL(/#\/workflows\?wf=daily-brief/);
  await expect(page.getByRole('heading', { name: 'Workflow Runner' })).toBeVisible();
});

test('workflow runner generates a local draft prompt', async ({ page }) => {
  await page.goto('/#/workflows?wf=daily-brief');
  await page.getByLabel(/Input — messy notes are fine/).fill('Smoke test: plan the day.');
  await page.getByRole('button', { name: 'Build Prompt' }).click();
  await expect(page.getByText('Draft only — nothing left this device')).toBeVisible();
  await expect(page.getByText(/Prompt fingerprint:/)).toBeVisible();
});

test('a saved project survives a reload (localStorage persistence)', async ({ page }) => {
  await gotoHome(page);
  await page.locator('.bottom-nav').getByText('Projects').click();
  await page.getByRole('button', { name: '+ New' }).click();
  const editCard = page.locator('.card', { has: page.getByRole('heading', { name: 'New project' }) });
  await editCard.locator('input[type="text"]').first().fill('Smoke Test Project');
  await editCard.getByRole('button', { name: 'Save (local)' }).click();
  await expect(page.getByText('Smoke Test Project')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Smoke Test Project')).toBeVisible();
});

test('recovers to seed state when stored data is malformed JSON', async ({ page }) => {
  await page.addInitScript(
    ([key]) => window.localStorage.setItem(key, '{"schemaVersion": '),
    [STORAGE_KEY],
  );
  await gotoHome(page); // no white screen — the app fell back to defaults
  await expect(page.locator('.bottom-nav')).toBeVisible();
  // The user sees a visible recovery warning and the original is preserved.
  await expect(page.getByTestId('recovery-banner')).toBeVisible();
  await expect(page.getByTestId('recovery-banner')).toContainText('preserved');
  const preserved = await page.evaluate(([key]) => {
    const k = Object.keys(window.localStorage).find((x) => x.startsWith(`${key}-recovery-`));
    return k ? window.localStorage.getItem(k) : null;
  }, [STORAGE_KEY]);
  expect(preserved).toBe('{"schemaVersion": ');
});

test('recovers when stored state is valid JSON but structurally wrong', async ({ page }) => {
  // schemaVersion alone passes the load gate; every collection is missing
  // or the wrong type. Pre-repair this white-screened the app.
  await page.addInitScript(
    ([key]) => window.localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, prompts: 'junk' })),
    [STORAGE_KEY],
  );
  await gotoHome(page);
  await expect(page.getByTestId('recovery-banner')).toContainText('repaired');
  await page.goto('/#/prompts'); // state.prompts.map would crash pre-repair
  await expect(page.getByRole('heading', { name: /Prompt Vault/ })).toBeVisible();
});
