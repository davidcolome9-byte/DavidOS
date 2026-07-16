import { test, expect } from '@playwright/test';

// DOS-WF-001R Phase 2A — unsaved Health Profile edits survive navigation and
// unmount/remount via a dedicated draft key, and are clearly distinguished.

test('unsaved Health Profile edits survive navigation and are recoverable', async ({ page }) => {
  await page.goto('/#/health');

  // Ensure an editor is present (create a blank profile if none exists yet).
  const startBlank = page.getByRole('button', { name: 'Start blank' });
  if (await startBlank.isVisible().catch(() => false)) await startBlank.click();

  const calories = page.getByLabel('Calories (kcal)');
  await calories.fill('2222');
  await expect(calories).toHaveValue('2222');

  // Leave the page (unmount) and come back (remount).
  await page.goto('/#/');
  await page.goto('/#/health');

  // The draft is restored and clearly flagged as an unsaved recovered draft.
  await expect(page.getByLabel('Calories (kcal)')).toHaveValue('2222');
  await expect(page.getByTestId('health-draft-banner')).toContainText('Recovered unsaved draft');

  // Discarding clears the draft; it does not come back.
  await page.getByRole('button', { name: 'Discard' }).click();
  await page.goto('/#/');
  await page.goto('/#/health');
  await expect(page.getByTestId('health-draft-banner')).toHaveCount(0);
});

// Priority 1 — a valid import must not silently wipe an unsaved draft. It
// interrupts and lets the user keep their edits.
test('importing a backup does not silently discard an unsaved Health draft', async ({ page }) => {
  await page.goto('/#/health');
  const startBlank = page.getByRole('button', { name: 'Start blank' });
  if (await startBlank.isVisible().catch(() => false)) await startBlank.click();
  await page.getByLabel('Calories (kcal)').fill('1777');
  await expect(page.getByTestId('health-draft-banner')).toBeVisible();

  // Build a valid backup from the CURRENT persisted state (guaranteed to pass
  // deep import validation) and feed it to the Settings import input.
  const backup = await page.evaluate(() => {
    const raw = localStorage.getItem('davidos-state-v1');
    const state = JSON.parse(raw as string);
    return JSON.stringify({ app: 'davidos', exportedAt: new Date().toISOString(), schemaVersion: state.schemaVersion, state });
  });

  await page.goto('/#/settings');
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });

  // The draft-conflict interruption appears; cancelling keeps the edits.
  const dialog = page.getByRole('dialog').filter({ hasText: 'Unsaved Health Profile edits' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Discard edits/ })).toBeVisible();
  await dialog.getByRole('button', { name: /Cancel & keep my edits/ }).click();

  // Back on the profile, the unsaved draft is intact.
  await page.goto('/#/health');
  await expect(page.getByLabel('Calories (kcal)')).toHaveValue('1777');
  await expect(page.getByTestId('health-draft-banner')).toBeVisible();
});

// Priority 2 — when the draft cannot be persisted, the UI says so honestly and
// does not imply a reload will recover it. Saving the profile still works.
test('a failing draft write surfaces a visible non-persistence warning', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'davidos-health-draft-v1') throw new DOMException('quota', 'QuotaExceededError');
      return orig.call(this, key, value);
    };
  });

  await page.goto('/#/health');
  const startBlank = page.getByRole('button', { name: 'Start blank' });
  if (await startBlank.isVisible().catch(() => false)) await startBlank.click();
  await page.getByLabel('Calories (kcal)').fill('2020');

  const warning = page.getByTestId('draft-persist-warning');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('kept only in this tab');
  // Must not promise recovery on reload.
  await expect(warning).not.toContainText('recover');

  // Saving the profile still works even though the draft write failed.
  await page.getByRole('button', { name: 'Save Health Profile' }).click();
  await expect(page.getByText('Health Profile saved.')).toBeVisible();
});
