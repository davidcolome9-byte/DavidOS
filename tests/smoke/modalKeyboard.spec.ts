import { test, expect } from '@playwright/test';

// OL-015 — shared modal focus management, exercised end-to-end on the reset
// dialog at the project-default phone viewport (375×812): initial focus on
// the safe control, Tab / Shift+Tab trapped inside the dialog, Escape closes
// safely, and focus returns to the opener with no blank screen or navigation.

const activeInsideDialog = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null);

test('modal keyboard navigation: focus trap, Escape-as-Cancel, focus restoration', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Data' })).toBeVisible();

  // Open the reset dialog from a known opener so restoration is observable.
  const opener = page.getByRole('button', { name: 'Reset to seed' });
  await opener.focus();
  await opener.click();

  const dialog = page.getByRole('dialog').filter({ hasText: 'Reset to seed' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  // The safe control (Cancel) has initial focus — Enter can never reset.
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

  // Repeated Tab presses cycle inside the dialog only.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await activeInsideDialog(page)).toBe(true);
  }
  // Shift+Tab also stays inside.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await activeInsideDialog(page)).toBe(true);
  }

  // Escape closes the dialog safely: no reset happened, no navigation, no
  // blank screen, and focus returns to the opener.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(page.url()).toContain('#/settings');
  await expect(page.getByRole('heading', { name: 'Data' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export backup (JSON)' })).toBeVisible();
  await expect(opener).toBeFocused();
});
