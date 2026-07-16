import { test, expect } from '@playwright/test';

// DOS-WF-001R Phase 3 — the handoff correction flow, end to end. A correction is
// appended (the original is preserved and marked superseded), the relationship
// is visible in Logs, and retrieval prefers the correction (model-tested).

test('correct a saved handoff: appends a correction and supersedes the original', async ({ page }) => {
  // Create a handoff via the Fitness Handoff workflow.
  await page.goto('/#/workflows?wf=fitness-handoff&input=' + encodeURIComponent('calories 2000 protein 180'));
  await page.getByRole('button', { name: 'Build Prompt' }).click();
  await page.getByRole('button', { name: 'Save to Workflow History' }).click();

  // Open Logs → Handoffs; exactly one entry. Expand it (details are collapsed).
  await page.goto('/#/logs?tab=handoffs');
  await expect(page.getByTestId('handoff-item')).toHaveCount(1);
  await page.getByTestId('handoff-item').first().locator('summary').click();

  // Correct it — prefilled from the original.
  await page.getByRole('button', { name: 'Correct this entry' }).click();
  const editor = page.getByTestId('correction-editor');
  await expect(editor).toBeVisible();
  await expect(page.getByLabel('Corrected content')).not.toHaveValue('');
  await page.getByLabel('Corrected content').fill('corrected: calories 1950 protein 190');
  await page.getByRole('button', { name: 'Save correction' }).click();

  // Now two entries; the summary badges show the relationship (always visible).
  await expect(page.getByTestId('handoff-item')).toHaveCount(2);
  await expect(page.getByText('Superseded', { exact: true })).toBeVisible();
  await expect(page.getByText('Correction', { exact: true })).toBeVisible();
  // The relationship note is rendered on the superseded original (shown on expand).
  await expect(page.getByTestId('superseded-note')).toBeAttached();
  await expect(page.getByTestId('superseded-note')).toContainText('Superseded by a correction');
});

// Priority 4 — deleting a correction must not orphan the original: it is
// restored to active (no longer superseded) and stays retrievable.
test('deleting a correction restores the original to active (no orphaned history)', async ({ page }) => {
  await page.goto('/#/workflows?wf=fitness-handoff&input=' + encodeURIComponent('calories 2000 protein 180'));
  await page.getByRole('button', { name: 'Build Prompt' }).click();
  await page.getByRole('button', { name: 'Save to Workflow History' }).click();

  await page.goto('/#/logs?tab=handoffs');
  await page.getByTestId('handoff-item').first().locator('summary').click();
  await page.getByRole('button', { name: 'Correct this entry' }).click();
  await page.getByLabel('Corrected content').fill('corrected: calories 1950 protein 190');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByTestId('handoff-item')).toHaveCount(2);
  await expect(page.getByText('Superseded', { exact: true })).toBeVisible();

  // Delete the correction. The confirmation names the relationship; accept it.
  page.once('dialog', (d) => {
    expect(d.message()).toContain('restores the original');
    void d.accept();
  });
  // Corrections are prepended, so the correction is the FIRST handoff item.
  const correctionItem = page.getByTestId('handoff-item').first();
  await correctionItem.locator('summary').click();
  await expect(correctionItem.getByText('Correction', { exact: true })).toBeVisible();
  await correctionItem.getByRole('button', { name: 'Delete' }).click();

  // One entry remains and it is NOT superseded (original restored to active).
  await expect(page.getByTestId('handoff-item')).toHaveCount(1);
  await expect(page.getByText('Superseded', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Correction', { exact: true })).toHaveCount(0);

  // Survives a reload with a valid (non-superseded) relationship.
  await page.reload();
  await page.goto('/#/logs?tab=handoffs');
  await expect(page.getByTestId('handoff-item')).toHaveCount(1);
  await expect(page.getByText('Superseded', { exact: true })).toHaveCount(0);
});
