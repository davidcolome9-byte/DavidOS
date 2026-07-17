import { test, expect } from '@playwright/test';

// Daily-use routing trio — browser acceptance against the production build.
// Each exact request must classify as SUPPORTED with exactly one Run action
// for the required workflow, open at the canonical URL with the exact encoded
// input, and show no ambiguous / unsupported / multi-domain warning.

const CASES = [
  {
    id: 'C-fit-2',
    input: 'Review my fitness plan',
    wf: 'gravl-review',
    runName: 'Run Gravl Workout Review & Optimization',
  },
  {
    id: 'C-review-3',
    input: 'Give me a preview of my week',
    wf: 'weekly-review',
    runName: 'Run Weekly Review',
  },
  {
    id: 'C-wait-2',
    input: 'I am awaiting a reply from my supervisor',
    wf: 'universal-operations-review',
    runName: 'Run Universal Operations Review',
  },
];

for (const c of CASES) {
  test(`${c.id} · "${c.input}" routes to ${c.wf} with one Run action`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Command input').fill(c.input);
    await page.getByRole('button', { name: 'Route This' }).click();

    // Supported classification: exactly one Run action, for the required
    // workflow, and no honest-state warning of any kind.
    const runLinks = page.getByRole('link', { name: /^Run / });
    await expect(runLinks).toHaveCount(1);
    await expect(runLinks.first()).toHaveText(c.runName);
    await expect(page.getByText(/no workflow yet/i)).toHaveCount(0);
    await expect(page.getByText(/more than one goal/i)).toHaveCount(0);
    await expect(page.getByText(/No confident match/i)).toHaveCount(0);
    await expect(page.getByText(/pick one below/i)).toHaveCount(0);
    await expect(page.getByText(/intent is unclear/i)).toHaveCount(0);

    // Open it: canonical wf param plus the exact encoded input.
    await runLinks.first().click();
    await expect(page.getByRole('heading', { name: 'Workflow Runner' })).toBeVisible();
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toContain(`wf=${c.wf}`);
    expect(hash).toContain(`input=${encodeURIComponent(c.input)}`);
    // The routed request hydrates the workflow input verbatim.
    await expect(page.locator('#wf-input')).toHaveValue(c.input);
  });
}
