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
