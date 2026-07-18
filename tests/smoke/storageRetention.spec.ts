import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// OL-003 storage protection & retention. All values are SYNTHETIC. Runs at
// the project-default mobile viewport, so every flow is a mobile check too.

const STATE_KEY = 'davidos-state-v1';

/** Seed N synthetic artifacts (oldest-first ids) into persisted state and reload. */
async function seedArtifacts(page: Page, count: number, contentSize = 64) {
  await page.goto('/#/');
  // First-run persistence happens in a mount effect — wait for it.
  await page.waitForFunction((key) => localStorage.getItem(key) !== null, STATE_KEY);
  await page.evaluate(({ key, count, contentSize }) => {
    const state = JSON.parse(localStorage.getItem(key) as string);
    const artifacts = [];
    for (let i = count; i >= 1; i--) {
      artifacts.push({
        id: `syn-artifact-${i}`,
        workflowId: 'syn-workflow',
        artifactType: 'full_prompt',
        createdAt: new Date(Date.UTC(2026, 0, i)).toISOString(),
        title: `SYN-PROMPT-${i}`,
        content: 'S'.repeat(contentSize),
      });
    }
    state.artifacts = artifacts; // newest-first, like the app prepends
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: STATE_KEY, count, contentSize });
  // Hash-only navigation is same-document — reload so the app boots from the
  // seeded state.
  await page.goto('/#/settings');
  await page.reload();
}

const storedArtifactIds = (page: Page) =>
  page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) as string);
    return (state.artifacts as { id: string }[]).map((a) => a.id);
  }, STATE_KEY);

test('the storage meter is visible under Settings → Data', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByTestId('storage-meter')).toBeVisible();
  await expect(page.getByTestId('storage-usage-total')).toContainText('Using about');
  await expect(page.getByTestId('storage-breakdown')).toBeVisible();
  await expect(page.getByTestId('storage-level-badge')).toHaveText('ok');
});

test('prune is guarded: exact effect shown, PRUNE required, cancel deletes nothing', async ({ page }) => {
  await seedArtifacts(page, 4);
  const before = await page.evaluate((k) => localStorage.getItem(k), STATE_KEY);

  await page.getByTestId('storage-prune-open').click();
  const dialog = page.getByTestId('storage-prune-dialog');
  await expect(dialog).toBeVisible();

  await page.getByTestId('storage-prune-keep').fill('2');
  await expect(page.getByTestId('storage-prune-effect')).toContainText('deletes the 2 oldest');
  // Guarded: nothing typed → disabled; wrong text → still disabled.
  await expect(page.getByTestId('storage-prune-confirm')).toBeDisabled();
  await page.getByTestId('storage-prune-confirm-text').fill('prune');
  await expect(page.getByTestId('storage-prune-confirm')).toBeDisabled();

  await page.getByTestId('storage-prune-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Prune cancelled — nothing was deleted.')).toBeVisible();
  // Artifacts are untouched (audit entries may differ, so compare artifacts).
  expect(await storedArtifactIds(page)).toEqual(
    JSON.parse(before as string).artifacts.map((a: { id: string }) => a.id),
  );
});

test('a confirmed prune keeps the newest N and persists; handoffs untouched', async ({ page }) => {
  await seedArtifacts(page, 4);
  const handoffsBefore = await page.evaluate(
    (k) => JSON.stringify(JSON.parse(localStorage.getItem(k) as string).handoffs),
    STATE_KEY,
  );

  await page.getByTestId('storage-prune-open').click();
  await page.getByTestId('storage-prune-keep').fill('2');
  await page.getByTestId('storage-prune-confirm-text').fill('PRUNE');
  await page.getByTestId('storage-prune-confirm').click();

  await expect(page.getByTestId('storage-prune-dialog')).toHaveCount(0);
  await expect(page.getByText('Deleted 2 saved prompt(s); kept the newest 2.')).toBeVisible();
  await expect(page.getByTestId('storage-breakdown')).toContainText('Saved prompts (artifacts) (2)');

  expect(await storedArtifactIds(page)).toEqual(['syn-artifact-4', 'syn-artifact-3']);
  const handoffsAfter = await page.evaluate(
    (k) => JSON.stringify(JSON.parse(localStorage.getItem(k) as string).handoffs),
    STATE_KEY,
  );
  expect(handoffsAfter).toBe(handoffsBefore);

  // Survives a reload — the prune was durably persisted.
  await page.reload();
  expect(await storedArtifactIds(page)).toEqual(['syn-artifact-4', 'syn-artifact-3']);
});

test('near-quota state raises the app-wide protection banner and Settings warning', async ({ page }) => {
  // One ~4.8M-char artifact ≈ 92% of the ~5MB estimate → critical.
  await seedArtifacts(page, 1, 4_800_000);
  await expect(page.getByTestId('storage-critical-banner')).toBeVisible();
  await expect(page.getByTestId('storage-critical-banner')).toContainText('Nothing is deleted automatically');
  await expect(page.getByTestId('storage-warning')).toBeVisible();
  await expect(page.getByTestId('storage-level-badge')).toHaveText('nearly full');

  // The banner points at Settings → Data, where pruning recovers the space.
  await page.getByTestId('storage-prune-open').click();
  await page.getByTestId('storage-prune-keep').fill('0');
  await page.getByTestId('storage-prune-confirm-text').fill('PRUNE');
  await page.getByTestId('storage-prune-confirm').click();
  await expect(page.getByTestId('storage-critical-banner')).toHaveCount(0);
  await expect(page.getByTestId('storage-level-badge')).toHaveText('ok');
});

test('no artifacts → prune is disabled; meter still renders', async ({ page }) => {
  await page.goto('/#/settings');
  const hasArtifacts = await page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw).artifacts as unknown[]).length > 0 : false;
  }, STATE_KEY);
  if (!hasArtifacts) {
    await expect(page.getByTestId('storage-prune-open')).toBeDisabled();
  }
  await expect(page.getByTestId('storage-meter')).toBeVisible();
});
