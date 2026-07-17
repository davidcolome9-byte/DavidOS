import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// F-08 — the cross-tab stale-state dialog must be keyboard-accessible (focus
// moves in, focus is trapped, Escape dismisses, background is inert and
// hidden from assistive technology) without weakening the overwrite guard:
// dismissal never clears the stale condition or lets the stale tab persist.

const STORAGE_KEY = 'davidos-state-v1';

const storedState = (page: Page) =>
  page.evaluate(([key]) => window.localStorage.getItem(key) ?? '', [STORAGE_KEY]);

/** Open two tabs sharing storage and make tab B stale via a write in tab A. */
async function makeStaleTab(context: BrowserContext): Promise<{ a: Page; b: Page }> {
  const a = await context.newPage();
  await a.goto('/');
  await expect(a.getByRole('heading', { name: /OS Status/ })).toBeVisible();
  await expect.poll(() => a.evaluate(() => !!localStorage.getItem('davidos-state-v1'))).toBe(true);

  const b = await context.newPage();
  await b.goto('/');
  await expect(b.getByRole('heading', { name: /OS Status/ })).toBeVisible();
  await expect(b.getByTestId('crosstab-guard')).toHaveCount(0);

  await a.getByLabel('Command input').fill('Review this workout');
  await a.getByRole('button', { name: 'Route This' }).click();
  await expect(b.getByTestId('crosstab-guard')).toBeVisible();
  return { a, b };
}

const activeInsideDialog = (page: Page) =>
  page.evaluate(() => document.activeElement?.closest('[data-testid="crosstab-guard"]') !== null);

test('stale dialog: focus, accessible name, focus trap, and inert background', async ({ context }) => {
  const { a, b } = await makeStaleTab(context);
  const dialog = b.getByTestId('crosstab-guard');

  // Accessible name/description and modal semantics.
  await expect(dialog).toHaveAttribute('role', 'alertdialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toHaveAttribute('aria-labelledby', 'stale-dialog-title');
  await expect(dialog).toHaveAttribute('aria-describedby', 'stale-dialog-desc');

  // Focus moved into the dialog on open.
  await expect.poll(() => activeInsideDialog(b)).toBe(true);

  // Background is inert and hidden from assistive technology.
  for (const region of ['header', 'main', 'nav'] as const) {
    await expect(b.locator(region)).toHaveAttribute('inert', '');
    await expect(b.locator(region)).toHaveAttribute('aria-hidden', 'true');
  }

  // Focus trap: Tab from the last dialog control wraps to the first.
  await b.getByRole('button', { name: 'Keep reviewing without saving' }).focus();
  await b.keyboard.press('Tab');
  await expect
    .poll(() => b.evaluate(() => document.activeElement?.textContent))
    .toBe('Reload with latest');
  // Shift+Tab from the first wraps back to the last — never the background.
  await b.keyboard.press('Shift+Tab');
  await expect
    .poll(() => b.evaluate(() => document.activeElement?.textContent))
    .toBe('Keep reviewing without saving');

  await a.close();
  await b.close();
});

test('Escape dismisses the dialog but never the guard: no overwrite, reopen works', async ({ context }) => {
  const { a, b } = await makeStaleTab(context);

  await expect.poll(() => activeInsideDialog(b)).toBe(true);
  await b.keyboard.press('Escape');

  // Dialog closed; persistent warning shown; focus on its reopen control.
  await expect(b.getByTestId('crosstab-guard')).toHaveCount(0);
  const banner = b.getByTestId('crosstab-stale-banner');
  await expect(banner).toBeVisible();
  await expect
    .poll(() => b.evaluate(() => document.activeElement?.textContent))
    .toBe('Show details');

  // Background interactive and visible to assistive technology again.
  for (const region of ['header', 'main', 'nav'] as const) {
    await expect
      .poll(() => b.locator(region).evaluate((el) => el.hasAttribute('inert')))
      .toBe(false);
    await expect
      .poll(() => b.locator(region).evaluate((el) => el.hasAttribute('aria-hidden')))
      .toBe(false);
  }

  // THE GUARD STILL HOLDS: a write attempt in the dismissed stale tab is
  // never persisted — tab A's state stays exactly as it was.
  const before = await storedState(b);
  expect(before).not.toBe('');
  await b.getByLabel('Command input').fill('ZZSTALE this must never persist');
  await b.getByRole('button', { name: 'Route This' }).click();
  await b.waitForTimeout(300); // give any (wrong) persist a chance to fire
  const after = await storedState(b);
  expect(after).toBe(before);
  expect(after).not.toContain('ZZSTALE');

  // The persistent warning reopens the dialog, focused and dismissible again.
  await banner.getByRole('button', { name: 'Show details' }).click();
  await expect(b.getByTestId('crosstab-guard')).toBeVisible();
  await expect.poll(() => activeInsideDialog(b)).toBe(true);
  await b.keyboard.press('Escape');
  await expect(b.getByTestId('crosstab-guard')).toHaveCount(0);
  await expect(banner).toBeVisible();

  // The existing safe resolution still works: reload adopts the newer state.
  await b.reload();
  await expect(b.getByTestId('crosstab-guard')).toHaveCount(0);
  await expect(b.getByTestId('crosstab-stale-banner')).toHaveCount(0);

  await a.close();
  await b.close();
});
