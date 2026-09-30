import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { canonicalState, canonicalStateRaw, waitForCanonicalState } from './helpers/journalState';
import type { AppState } from '../../src/lib/types';

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

test.describe('execution-tier routing', () => {
  // Keep this test's network guard observable; do not let a worker bypass it.
  test.use({ serviceWorkers: 'block' });

  test('shows each advisory badge, clears stale results, and executes nothing', async ({ page, context }) => {
    await gotoHome(page);
    await waitForCanonicalState(page);
    const before = await canonicalState<AppState>(page);
    const originalUrl = page.url();
    const attempts: string[] = [];
    // Classification needs no requests after boot. Fail even attempted calls,
    // and prevent provider/local shell or Git bridge requests from leaving.
    await context.route('**/*', (request) => {
      attempts.push(request.request().url());
      return request.abort();
    });
    await context.routeWebSocket('**/*', (socket) => {
      attempts.push(socket.url());
      socket.close();
    });
    page.on('popup', () => attempts.push('popup'));
    page.on('download', () => attempts.push('download'));

    const input = page.getByLabel('Command input');
    const route = page.getByRole('button', { name: 'Route This' });
    const badges = page.locator('.badge').filter({ hasText: /^Tier [123] · / });
    const cases = [
      ['Show my priorities', 'Tier 1 · Local'],
      ['Write me a message about the app', 'Tier 2 · Assistant'],
      ['Write unit tests', 'Tier 3 · Executor'],
      ['Delete the branch', 'Tier 3 · Executor'],
      ['Delete the branch and buy a server', 'Tier 3 · Executor'],
    ] as const;

    for (const [index, [text, label]] of cases.entries()) {
      await input.fill(text);
      await expect(badges).toHaveCount(0); // Editing invalidates the old result.
      await route.click();
      await expect(badges).toHaveCount(1);
      await expect(badges).toHaveText(label);
      await expect(badges).toBeVisible();
      if (label === 'Tier 3 · Executor') {
        await expect(page.getByText(/future handoff point; nothing was executed/)).toBeVisible();
      }
      // Wait for THIS route's audit write, not an earlier empty-record snapshot.
      await expect.poll(async () => {
        const state = await canonicalState<AppState>(page);
        return state.auditLog.length;
      }).toBe(before.auditLog.length + index + 1);
      const current = await canonicalState<AppState>(page);
      expect(current.auditLog[0]).toMatchObject({ actionTaken: false });
      expect(current.auditLog[0]?.resultSummary).toContain(`Execution tier: ${label}`);
      expect(current.executionRecords).toEqual(before.executionRecords);
      expect({ ...current, auditLog: before.auditLog }).toEqual(before);
      expect(page.url()).toBe(originalUrl);
      expect(attempts).toEqual([]);
    }

    // A Tier 3 label does not override the existing high-risk block.
    await expect(page.getByText('High risk — blocked in v1', { exact: true })).toBeVisible();
    await expect(page.getByText('Nothing was sent or changed.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    const routed = await canonicalState<AppState>(page);
    expect(routed.auditLog[0]).toMatchObject({ actionType: 'high_risk', approvalStatus: 'blocked', actionTaken: false });

    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(badges).toHaveCount(0);
    await expect(page.getByText(/future handoff point; nothing was executed/)).toHaveCount(0);
    await input.fill('Run a test');
    await route.click();
    await expect(badges).toHaveText('Tier 3 · Executor');
    await expect.poll(async () => (await canonicalState<AppState>(page)).auditLog.length)
      .toBe(before.auditLog.length + cases.length + 1);
    const lastRoute = await canonicalState<AppState>(page);
    await input.fill(''); // Deleting the text also clears the result.
    await expect(badges).toHaveCount(0);
    await route.click(); // Empty submissions do not reuse the old result.
    await expect(badges).toHaveCount(0);
    expect(await canonicalState<AppState>(page)).toEqual(lastRoute);
    expect({ ...lastRoute, auditLog: before.auditLog }).toEqual(before);
    expect(lastRoute.auditLog[0]).toMatchObject({ actionTaken: false });
    expect(attempts).toEqual([]);
  });
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

  // Visible text is not proof of a durable save: the store enqueues the write
  // from a passive effect (src/state/store.tsx), so the row can be in the DOM
  // before the journal generation is committed. The assertion above therefore
  // establishes no happens-before relationship with durability. In sampled
  // runs the commit did land first (7.8-16.4ms after the DOM text appeared),
  // so the reload was safe — but only by incidental scheduling margin, not by
  // any condition the test enforced. Waiting for the committed canonical
  // generation supplies that missing durability gate, and strengthens the
  // test: the project must reach durable storage, not just the screen.
  await expect
    .poll(() => canonicalStateRaw(page).then((raw) => (raw ?? '').includes('Smoke Test Project')))
    .toBe(true);

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
  // DOS-STAB-001A: the warning explicitly says damaged data was quarantined /
  // excluded from active state — "repaired" alone would be misleading.
  await expect(page.getByTestId('recovery-banner')).toContainText('quarantined');
  await page.goto('/#/prompts'); // state.prompts.map would crash pre-repair
  await expect(page.getByRole('heading', { name: /Prompt Vault/ })).toBeVisible();
});
