import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// DOS-WF-001 browser smoke tests for the Gravl Workout Review & Optimization
// workflow: input hydration, build, validity/staleness guards, and the
// review/intake/screenshot modes. Test data is invented — never personal.

const GRAVL_URL = '/#/workflows?wf=gravl-review';

async function openGravl(page: Page, input?: string) {
  await page.goto(input ? `${GRAVL_URL}&input=${encodeURIComponent(input)}` : GRAVL_URL);
  await expect(page.getByRole('heading', { name: 'Gravl Workout Review & Optimization' })).toBeVisible();
}

const requestBox = (page: Page) => page.getByLabel(/Your request/);
const buildBtn = (page: Page) => page.getByRole('button', { name: 'Build Prompt' });
const copyBtn = (page: Page) => page.getByRole('button', { name: 'Copy Prompt' });
const savePromptBtn = (page: Page) => page.getByRole('button', { name: 'Save Prompt' });

test('URL-routed input appears in the field and is used in the built prompt', async ({ page }) => {
  await openGravl(page, 'Review my current workout');
  await expect(requestBox(page)).toHaveValue('Review my current workout');

  await buildBtn(page).click();
  await page.getByRole('button', { name: 'Full Prompt' }).click();
  await expect(page.locator('pre.output')).toContainText('Review my current workout');
});

test('refresh preserves the routed input', async ({ page }) => {
  await openGravl(page, 'Optimize my push day');
  await expect(requestBox(page)).toHaveValue('Optimize my push day');
  await page.reload();
  await expect(requestBox(page)).toHaveValue('Optimize my push day');
});

test('empty request cannot build', async ({ page }) => {
  await openGravl(page);
  await expect(buildBtn(page)).toBeDisabled();
});

test('intake mode builds a valid, honestly-labeled prompt', async ({ page }) => {
  await openGravl(page);
  await requestBox(page).fill('Help me with a workout plan');
  await expect(page.getByText('No Gravl workout added. This prompt will ask for it.')).toBeVisible();
  await buildBtn(page).click();
  await expect(page.getByText(/Intake mode/)).toBeVisible();
  await expect(copyBtn(page)).toBeEnabled();
});

test('review mode includes the supplied workout text', async ({ page }) => {
  await openGravl(page);
  await requestBox(page).fill('Review this');
  await page.getByLabel(/Gravl workout/).fill('Back squat 5x5 at 100kg');
  await buildBtn(page).click();
  await page.getByRole('button', { name: 'Full Prompt' }).click();
  await expect(page.locator('pre.output')).toContainText('Back squat 5x5 at 100kg');
});

test('screenshot mode includes attach-in-AI instructions', async ({ page }) => {
  await openGravl(page);
  await requestBox(page).fill('Review my screenshots');
  await page.getByLabel('I have Gravl screenshots').check();
  await expect(page.getByText(/attach your screenshots there/i)).toBeVisible();
  await buildBtn(page).click();
  await page.getByRole('button', { name: 'Full Prompt' }).click();
  await expect(page.locator('pre.output')).toContainText('cannot read images');
});

test('editing input after building marks the prompt stale and disables copy/save', async ({ page }) => {
  await openGravl(page, 'Review my workout');
  await buildBtn(page).click();
  await expect(copyBtn(page)).toBeEnabled();

  await requestBox(page).fill('Review my workout and optimize volume');
  await expect(page.getByTestId('stale-notice')).toBeVisible();
  await expect(copyBtn(page)).toBeDisabled();
  await expect(savePromptBtn(page)).toBeDisabled();
});

test('switching workflow invalidates the built result', async ({ page }) => {
  await openGravl(page, 'Review my workout');
  await buildBtn(page).click();
  await expect(copyBtn(page)).toBeVisible();

  await page.goto('/#/workflows?wf=fitness-handoff');
  await expect(page.getByRole('heading', { name: /Fitness Handoff/ })).toBeVisible();
  await expect(copyBtn(page)).toHaveCount(0);
});

test('a valid prompt can be copied and saved locally', async ({ page }) => {
  await openGravl(page, 'Review my workout');
  await buildBtn(page).click();
  await expect(copyBtn(page)).toBeEnabled();
  await savePromptBtn(page).click();
  await expect(page.getByText('Prompt saved on this device only — view under Logs → Artifacts.')).toBeVisible();

  // Survives a reload (localStorage) and is visible in Logs → Artifacts.
  await page.goto('/#/logs?tab=artifacts');
  await expect(page.getByText('gravl-review', { exact: false }).first()).toBeVisible();
});

test('works on a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openGravl(page, 'Review my workout');
  await buildBtn(page).click();
  await expect(copyBtn(page)).toBeEnabled();
});

test.describe('laptop viewport', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('works on a laptop-sized viewport', async ({ page }) => {
    await openGravl(page, 'Review my workout');
    await buildBtn(page).click();
    await expect(copyBtn(page)).toBeEnabled();
  });
});
