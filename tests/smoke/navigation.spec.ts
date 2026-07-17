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

// ---- F-07: manual style picks canonicalize the URL ----

const urlHash = (page: Page) => page.evaluate(() => window.location.hash);

test('a manual style pick writes the canonical style param to the URL', async ({ page }) => {
  await page.goto(HANDOFF);
  await styleSelect(page).selectOption('Diary entry');
  await expect.poll(() => urlHash(page)).toContain('style=Diary+entry');
  await expect.poll(() => urlHash(page)).toContain('wf=fitness-handoff');
});

test('manually picking the default style back removes the style param', async ({ page }) => {
  await page.goto(styleUrl('Diary entry'));
  await expect(styleSelect(page)).toHaveValue('Diary entry');
  await styleSelect(page).selectOption('AI handoff'); // the workflow default
  await expect(styleSelect(page)).toHaveValue('AI handoff');
  await expect.poll(() => urlHash(page)).not.toContain('style=');
  await expect.poll(() => urlHash(page)).toContain('wf=fitness-handoff');
});

test('reload after a manual style pick hydrates the same style', async ({ page }) => {
  await page.goto(HANDOFF);
  await styleSelect(page).selectOption('Diary entry');
  await expect.poll(() => urlHash(page)).toContain('style=Diary+entry');
  await page.reload();
  await expect(styleSelect(page)).toHaveValue('Diary entry');
});

test('Back/Forward restore manual style picks without duplicate entries', async ({ page }) => {
  await page.goto(HANDOFF);
  await styleSelect(page).selectOption('Diary entry');
  await expect(styleSelect(page)).toHaveValue('Diary entry');
  await styleSelect(page).selectOption('Plain summary');
  await expect(styleSelect(page)).toHaveValue('Plain summary');

  // Exactly one history entry per pick: a single Back lands on the previous
  // style, a second Back lands on the default (a duplicate would repeat one).
  await page.goBack();
  await expect(styleSelect(page)).toHaveValue('Diary entry');
  await page.goBack();
  await expect(styleSelect(page)).toHaveValue('AI handoff');
  await page.goForward();
  await expect(styleSelect(page)).toHaveValue('Diary entry');
  await page.goForward();
  await expect(styleSelect(page)).toHaveValue('Plain summary');
});

test('a manual style pick keeps typed input intact', async ({ page }) => {
  await page.goto(HANDOFF);
  await page.locator('#wf-input').fill('bench press felt heavy today');
  await styleSelect(page).selectOption('Diary entry');
  await expect(page.locator('#wf-input')).toHaveValue('bench press felt heavy today');
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
