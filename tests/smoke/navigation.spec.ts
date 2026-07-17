import { test, expect, type Page } from '@playwright/test';

// DOS-WF-001R Phase 1G — workflow style ↔ URL sync and Logs tab ↔ URL sync.

const HANDOFF = '/#/workflows?wf=fitness-handoff';
const styleSelect = (page: Page) => page.locator('#wf-style');
const styleUrl = (s: string) => `${HANDOFF}&style=${encodeURIComponent(s)}`;

test('a URL style param selects that style', async ({ page }) => {
  await page.goto(styleUrl('Diary entry'));
  await expect(styleSelect(page)).toHaveValue('Diary entry');
});

test('removing the style param restores the workflow default', async ({ page }) => {
  await page.goto(styleUrl('Diary entry'));
  await expect(styleSelect(page)).toHaveValue('Diary entry');
  await page.goto(HANDOFF); // style param removed
  await expect(styleSelect(page)).toHaveValue('AI handoff'); // default (outputStyles[0])
});

test('browser Back/Forward restore the URL-selected style', async ({ page }) => {
  await page.goto(styleUrl('Plain summary'));
  await expect(styleSelect(page)).toHaveValue('Plain summary');
  await page.goto(styleUrl('Diary entry'));
  await expect(styleSelect(page)).toHaveValue('Diary entry');
  await page.goBack();
  await expect(styleSelect(page)).toHaveValue('Plain summary');
  await page.goForward();
  await expect(styleSelect(page)).toHaveValue('Diary entry');
});

test('a manual in-page style pick is not immediately overwritten', async ({ page }) => {
  await page.goto(HANDOFF);
  await styleSelect(page).selectOption('Diary entry');
  await expect(styleSelect(page)).toHaveValue('Diary entry');
  await page.waitForTimeout(150); // no effect clobbers it
  await expect(styleSelect(page)).toHaveValue('Diary entry');
});

test('switching workflows cannot retain an invalid previous style', async ({ page }) => {
  await page.goto(styleUrl('Diary entry')); // valid for fitness-handoff
  await expect(styleSelect(page)).toHaveValue('Diary entry');
  // weekly-review has no "Diary entry" style → must fall back to its default.
  await page.goto('/#/workflows?wf=weekly-review&style=Diary%20entry');
  const val = await styleSelect(page).inputValue();
  expect(val).not.toBe('Diary entry');
});

// ---- Logs tab ↔ URL ----

const tabChip = (page: Page, name: RegExp) => page.getByRole('button', { name });

test('Logs active tab follows the URL tab param', async ({ page }) => {
  await page.goto('/#/logs?tab=handoffs');
  await expect(tabChip(page, /Handoffs/)).toHaveClass(/selected/);
  await page.goto('/#/logs?tab=artifacts');
  await expect(tabChip(page, /Artifacts/)).toHaveClass(/selected/);
});

test('an invalid or missing Logs tab falls back to the audit log', async ({ page }) => {
  await page.goto('/#/logs?tab=nonsense');
  await expect(tabChip(page, /Audit log/)).toHaveClass(/selected/);
  await page.goto('/#/logs');
  await expect(tabChip(page, /Audit log/)).toHaveClass(/selected/);
});

test('browser Back/Forward move between Logs tabs', async ({ page }) => {
  await page.goto('/#/logs?tab=audit');
  await tabChip(page, /Handoffs/).click();
  await expect(tabChip(page, /Handoffs/)).toHaveClass(/selected/);
  await tabChip(page, /Artifacts/).click();
  await expect(tabChip(page, /Artifacts/)).toHaveClass(/selected/);

  await page.goBack();
  await expect(tabChip(page, /Handoffs/)).toHaveClass(/selected/);
  await page.goForward();
  await expect(tabChip(page, /Artifacts/)).toHaveClass(/selected/);
});
