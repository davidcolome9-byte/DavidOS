import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Import vs unsaved Health Profile draft. All health values are SYNTHETIC.
// The whole suite runs at the project-default mobile viewport (375×812), so
// every flow here is also a mobile-viewport check.

const SYN_CALORIES = '4141';
const SYN_MEDICATION = 'SYN-MED-PLAYWRIGHT-77';

/** Create a dirty synthetic draft in the Health Profile editor. */
async function createDraft(page: Page) {
  await page.goto('/#/health');
  const startBlank = page.getByRole('button', { name: 'Start blank' });
  if (await startBlank.isVisible().catch(() => false)) await startBlank.click();
  await page.getByLabel('Calories (kcal)').fill(SYN_CALORIES);
  // The medications field lives in a collapsed section — expand it first.
  await page.locator('summary', { hasText: 'Supplements / Medications' }).click();
  await page.getByLabel('Medications (one per line)').fill(SYN_MEDICATION);
  await expect(page.getByTestId('health-draft-banner')).toBeVisible();
}

/** A valid backup built from the CURRENT persisted state (passes validation). */
async function buildBackup(page: Page, opts: { nullProfile?: boolean; schemaVersion?: number } = {}) {
  return page.evaluate(({ nullProfile, schemaVersion }) => {
    const state = JSON.parse(localStorage.getItem('davidos-state-v1') as string);
    if (nullProfile) state.healthProfile = null;
    if (schemaVersion !== undefined) state.schemaVersion = schemaVersion;
    return JSON.stringify({
      app: 'davidos',
      exportedAt: new Date().toISOString(),
      schemaVersion: state.schemaVersion,
      state,
    });
  }, { nullProfile: opts.nullProfile ?? false, schemaVersion: opts.schemaVersion });
}

async function importFile(page: Page, json: string) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
}

const guardDialog = (page: Page) => page.getByTestId('import-draft-guard');

test('the warning appears BEFORE any data is mutated', async ({ page }) => {
  await createDraft(page);
  const backup = await buildBackup(page);
  const stateBefore = await page.evaluate(() => localStorage.getItem('davidos-state-v1'));

  await page.goto('/#/settings');
  await importFile(page, backup);

  await expect(guardDialog(page)).toBeVisible();
  // Nothing has been imported or destroyed while the dialog is open.
  const stateAfter = await page.evaluate(() => localStorage.getItem('davidos-state-v1'));
  expect(stateAfter).toBe(stateBefore);
  const draft = await page.evaluate(() => localStorage.getItem('davidos-health-draft-v1'));
  expect(draft).toContain(SYN_CALORIES);
});

test('Cancel keeps every visible draft value and the dirty banner', async ({ page }) => {
  await createDraft(page);
  const backup = await buildBackup(page);
  await page.goto('/#/settings');
  await importFile(page, backup);

  await guardDialog(page).getByRole('button', { name: /Cancel & keep my edits/ }).click();
  await expect(guardDialog(page)).toHaveCount(0);
  await expect(page.getByText('Import cancelled')).toBeVisible();

  await page.goto('/#/health');
  await expect(page.getByLabel('Calories (kcal)')).toHaveValue(SYN_CALORIES);
  await page.locator('summary', { hasText: 'Supplements / Medications' }).click();
  await expect(page.getByLabel('Medications (one per line)')).toHaveValue(SYN_MEDICATION);
  await expect(page.getByTestId('health-draft-banner')).toBeVisible();
});

test('confirmed discard imports the backup and clears the draft', async ({ page }) => {
  await createDraft(page);
  // The backup carries no profile → the flow uses the native replace-confirm.
  const backup = await buildBackup(page, { nullProfile: true });
  await page.goto('/#/settings');
  await importFile(page, backup);

  page.once('dialog', (d) => void d.accept());
  await guardDialog(page).getByRole('button', { name: /Discard edits & import/ }).click();
  await expect(page.getByText('Import complete.')).toBeVisible();

  // Draft gone; the unsaved values are no longer anywhere in the editor.
  await page.goto('/#/health');
  await expect(page.getByTestId('health-draft-banner')).toHaveCount(0);
  const draft = await page.evaluate(() => localStorage.getItem('davidos-health-draft-v1'));
  expect(draft).toBeNull();
});

test('an invalid (corrupt) import preserves the draft and saved data', async ({ page }) => {
  await createDraft(page);
  const stateBefore = await page.evaluate(() => localStorage.getItem('davidos-state-v1'));
  await page.goto('/#/settings');
  await importFile(page, '{this is not valid json');

  await expect(page.getByText(/Import failed/)).toBeVisible();
  await expect(guardDialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('davidos-state-v1'))).toBe(stateBefore);

  await page.goto('/#/health');
  await expect(page.getByLabel('Calories (kcal)')).toHaveValue(SYN_CALORIES);
  await expect(page.getByTestId('health-draft-banner')).toBeVisible();
});

test('a future-schema backup is rejected before touching the draft', async ({ page }) => {
  await createDraft(page);
  const backup = await buildBackup(page, { schemaVersion: 999 });
  await page.goto('/#/settings');
  await importFile(page, backup);

  await expect(page.getByText(/Import failed/)).toBeVisible();
  await expect(page.getByText(/newer than this app understands/)).toBeVisible();
  await expect(guardDialog(page)).toHaveCount(0);

  await page.goto('/#/health');
  await expect(page.getByLabel('Calories (kcal)')).toHaveValue(SYN_CALORIES);
  await expect(page.getByTestId('health-draft-banner')).toBeVisible();
});

test('keyboard & focus: Cancel is the default, Escape cancels, Tab is trapped', async ({ page }) => {
  await createDraft(page);
  const backup = await buildBackup(page);
  await page.goto('/#/settings');
  await importFile(page, backup);

  const cancel = guardDialog(page).getByRole('button', { name: /Cancel & keep my edits/ });
  const discard = guardDialog(page).getByRole('button', { name: /Discard edits & import/ });
  // The safe choice has initial focus — Enter can never discard by accident.
  await expect(cancel).toBeFocused();
  // Tab cycles within the dialog only.
  await page.keyboard.press('Tab');
  await expect(discard).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(discard).toBeFocused();
  // Escape = Cancel: dialog closes, draft intact.
  await page.keyboard.press('Escape');
  await expect(guardDialog(page)).toHaveCount(0);
  await expect(page.getByText('Import cancelled')).toBeVisible();
  await page.goto('/#/health');
  await expect(page.getByLabel('Calories (kcal)')).toHaveValue(SYN_CALORIES);
});

test('the dialog is fully usable at the mobile viewport', async ({ page }) => {
  await createDraft(page);
  const backup = await buildBackup(page);
  await page.goto('/#/settings');
  await importFile(page, backup);

  const dialog = guardDialog(page);
  await expect(dialog).toBeVisible();
  const viewport = page.viewportSize()!;
  expect(viewport.width).toBeLessThanOrEqual(414); // phone-sized run
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  // Both choices are on-screen and clickable without scrolling the dialog.
  await expect(dialog.getByRole('button', { name: /Cancel & keep my edits/ })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: /Discard edits & import/ })).toBeInViewport();
  await dialog.getByRole('button', { name: /Cancel & keep my edits/ }).click();
});

test('no draft values ever reach the console, page errors, or the URL', async ({ page }) => {
  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => consoleLines.push(msg.text()));
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await createDraft(page);
  const backup = await buildBackup(page);
  await page.goto('/#/settings');
  // Exercise the guard (cancel), a corrupt import, and a future-schema import.
  await importFile(page, backup);
  await guardDialog(page).getByRole('button', { name: /Cancel & keep my edits/ }).click();
  await importFile(page, '{corrupt');
  await expect(page.getByText(/Import failed/)).toBeVisible();
  await importFile(page, await buildBackup(page, { schemaVersion: 999 }));
  await expect(page.getByText(/newer than this app understands/)).toBeVisible();

  const allConsole = consoleLines.join('\n');
  const allErrors = pageErrors.join('\n');
  for (const secret of [SYN_CALORIES, SYN_MEDICATION]) {
    expect(allConsole).not.toContain(secret);
    expect(allErrors).not.toContain(secret);
    expect(page.url()).not.toContain(secret);
  }
});
