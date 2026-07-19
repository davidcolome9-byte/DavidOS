import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// DOS-WF-002A — canonical planning context, end-to-end against the production
// build. Default viewport is 375x812 (mobile-first, see playwright.config.ts)
// so this also covers the required mobile happy path.

async function gotoHome(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /OS Status/ })).toBeVisible();
}

test('Daily Brief: zero-note prompt building includes the canonical planning state', async ({ page }) => {
  await gotoHome(page);
  await page.goto('/#/workflows?wf=daily-brief');
  await expect(page.getByRole('heading', { name: 'Daily Brief' })).toBeVisible();

  const includeCheckbox = page.getByText('Include planning state', { exact: false }).locator('..').locator('input[type="checkbox"]');
  await expect(includeCheckbox).toBeChecked();

  const buildBtn = page.getByRole('button', { name: 'Build Prompt' });
  await expect(buildBtn).toBeEnabled();
  await buildBtn.click();

  await expect(page.getByText('(no additional notes for today)')).toBeVisible();

  await page.getByRole('button', { name: 'Full Prompt' }).click();
  await expect(page.locator('pre.output')).toContainText('## Current DavidOS State');
  await expect(page.locator('pre.output')).toContainText('Priorities:');

  // Copy Request Only stays disabled with an honest reason when nothing was typed.
  await expect(page.getByRole('button', { name: 'Copy Request Only' })).toBeDisabled();
  await expect(page.getByText('Nothing typed to copy.')).toBeVisible();
});

test('Daily Brief: excluding planning state omits the section', async ({ page }) => {
  await gotoHome(page);
  await page.goto('/#/workflows?wf=daily-brief');
  const includeCheckbox = page.getByText('Include planning state', { exact: false }).locator('..').locator('input[type="checkbox"]');
  await includeCheckbox.uncheck();

  await page.getByRole('button', { name: 'Build Prompt' }).click();
  await page.getByRole('button', { name: 'Full Prompt' }).click();
  await expect(page.locator('pre.output')).not.toContainText('## Current DavidOS State');
});

test('Weekly Review: zero-note building uses the weekly placeholder', async ({ page }) => {
  await gotoHome(page);
  await page.goto('/#/workflows?wf=weekly-review');
  await expect(page.getByRole('heading', { name: 'Weekly Review' })).toBeVisible();
  await page.getByRole('button', { name: 'Build Prompt' }).click();
  await expect(page.getByText('(no additional notes for this week)')).toBeVisible();
});

test('Planning page distinguishes local (no-AI) generation from the AI-prompt builder', async ({ page }) => {
  await gotoHome(page);
  await page.goto('/#/planning');
  await expect(page.getByRole('heading', { name: /Daily brief/ })).toBeVisible();

  await page.getByRole('button', { name: 'Generate locally (no AI)' }).first().click();
  await expect(page.locator('pre.output').first()).toContainText('# Daily Command Brief');

  await page.getByRole('link', { name: 'Build AI prompt (Workflow Runner)' }).first().click();
  await expect(page).toHaveURL(/\/workflows\?wf=daily-brief/);
  await expect(page.getByRole('heading', { name: 'Daily Brief' })).toBeVisible();
});
