import { test, expect } from '@playwright/test';

// DOS-WF-001R Phase 2D — vault primary actions never silently no-op. An empty
// required field disables Save with a visible, accessible inline explanation.

test('Project Vault: empty name disables Save with inline feedback', async ({ page }) => {
  await page.goto('/#/projects');
  await page.getByRole('button', { name: '+ New' }).click();

  const save = page.getByRole('button', { name: 'Save (local)' });
  await expect(save).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('name is required');

  // A valid name enables Save and it works.
  await page.getByLabel(/Name/).fill('Synthetic project');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText('Synthetic project')).toBeVisible();
});

test('Prompt Vault: empty title disables Save with inline feedback', async ({ page }) => {
  await page.goto('/#/prompts');
  await page.getByRole('button', { name: '+ New' }).click();

  const save = page.getByRole('button', { name: 'Save (local)' });
  await expect(save).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('title is required');

  await page.getByLabel(/Title/).fill('Synthetic prompt');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText('Synthetic prompt')).toBeVisible();
});
