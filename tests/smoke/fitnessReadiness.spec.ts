import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { canonicalStateRaw, waitForCanonicalState } from './helpers/journalState';

// Browser smoke tests for the Training Readiness & Recovery workflow
// (fitness-readiness): Command Palette routing, URL hydration, build, Copy/Save
// guards, Health Profile included/excluded states, back/forward/reload, red-flag
// escalation, and privacy exclusion. All test data is invented — never personal.

const READINESS_URL = '/#/workflows?wf=fitness-readiness';

const requestBox = (page: Page) => page.getByLabel(/How do you feel/);
const buildBtn = (page: Page) => page.getByRole('button', { name: 'Build Prompt' });
const copyBtn = (page: Page) => page.getByRole('button', { name: 'Copy Prompt' });
const savePromptBtn = (page: Page) => page.getByRole('button', { name: 'Save Prompt' });
const fullPromptBtn = (page: Page) => page.getByRole('button', { name: 'Full Prompt' });

async function openReadiness(page: Page, input?: string) {
  await page.goto(input ? `${READINESS_URL}&input=${encodeURIComponent(input)}` : READINESS_URL);
  await expect(page.getByRole('heading', { name: 'Training Readiness & Recovery' })).toBeVisible();
}

// Inject a synthetic Health Profile into the app's own persisted state, so the
// schema stays valid. Carries readiness-relevant fields AND unrelated private
// data that must never reach the prompt. The merged state is re-applied via an
// init script on EVERY load, so a reload deterministically re-hydrates the store
// with the profile (a hash-only navigation would not re-read localStorage).
async function seedProfile(page: Page) {
  await page.goto('/#/');
  await waitForCanonicalState(page);
  const canonical = (await canonicalStateRaw(page)) as string;
  const merged = await page.evaluate((raw) => {
    const state = JSON.parse(raw as string);
    state.healthProfile = {
      id: 'synthetic-readiness',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
      goals: { primaryGoal: 'recomposition' },
      recoveryTargets: { sleepHours: '7-8h', hrvBaseline: '65ms', restingHeartRateBaseline: '52bpm' },
      trainingPlan: { weeklyFrequency: '4x/week', split: 'upper/lower', movementRestrictions: ['No axial loading'] },
      nutritionTargets: { calories: 2400, proteinGrams: 190 },
      bodyMetrics: { currentWeight: '86kg', bodyFatEstimate: '18pct' },
      supplementsMedications: { supplements: ['creatine'], medications: ['SYNTHETICMED'] },
      promptSummary: 'SYNTHETICEMPLOYER wellness bonus; salary band 4; sees a therapist weekly.',
      freeformContext: 'Financial note: SYNTHETICMORTGAGE stress; occasional SYNTHETICSLEEPAID.',
    };
    return JSON.stringify(state);
  }, canonical);
  // DOS-STAB-001A: a bare legacy-key write is IGNORED once a valid journal
  // head exists (that guard is the point of the journal). To keep this seed
  // deterministic on EVERY load, the init script drops the journal records
  // first, so each boot migrates exactly these bytes into a fresh generation.
  await page.addInitScript((m) => {
    for (const headKey of ['davidos-state-head-v1-a', 'davidos-state-head-v1-b']) {
      localStorage.removeItem(headKey);
    }
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('davidos-state-generation-v1-')) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
    localStorage.setItem('davidos-state-v1', m);
  }, merged);
}

// (1)(2)(3)(7) — every target readiness request routes through the Command
// Palette to exactly one Run action, opens at the canonical URL with the exact
// encoded input, and hydrates the workflow input verbatim.
const TARGET_REQUESTS = [
  'Should I train today?',
  'I feel sick, should I skip the gym?',
  'My HRV is low and I slept badly, train or rest?',
  'Fighting a cold, is it safe to lift heavy?',
  'Sore and tired, deload week?',
];

for (const input of TARGET_REQUESTS) {
  test(`Command Palette · "${input}" → one Run action for fitness-readiness`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Command input').fill(input);
    await page.getByRole('button', { name: 'Route This' }).click();

    const runLinks = page.getByRole('link', { name: /^Run / });
    await expect(runLinks).toHaveCount(1);
    await expect(runLinks.first()).toHaveText('Run Training Readiness & Recovery');
    // No honest-state warning of any kind.
    await expect(page.getByText(/no workflow yet/i)).toHaveCount(0);
    await expect(page.getByText(/more than one goal/i)).toHaveCount(0);
    await expect(page.getByText(/No confident match/i)).toHaveCount(0);
    await expect(page.getByText(/pick one below/i)).toHaveCount(0);

    await runLinks.first().click();
    await expect(page.getByRole('heading', { name: 'Training Readiness & Recovery' })).toBeVisible();
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toContain('wf=fitness-readiness');
    expect(hash).toContain(`input=${encodeURIComponent(input)}`);
    await expect(requestBox(page)).toHaveValue(input);
  });
}

// (4) — building produces one Universal AI Prompt with the required structure.
test('builds a Universal AI Prompt with the required readiness sections', async ({ page }) => {
  await openReadiness(page, 'Slept badly and a bit sore, easy run planned — train or rest?');
  await buildBtn(page).click();
  await fullPromptBtn(page).click();
  const out = page.locator('pre.output');
  await expect(out).toContainText('# Universal AI Prompt');
  await expect(out).toContainText('Readiness decision');
  await expect(out).toContainText('Recovery priorities');
  await expect(out).toContainText('Safety block');
  await expect(out).toContainText('Uncertainty statement');
  await expect(out).toContainText('decision support');
});

// (4) — empty input cannot build.
test('empty request cannot build', async ({ page }) => {
  await openReadiness(page);
  await expect(buildBtn(page)).toBeDisabled();
});

// (5)(9) — Health Profile INCLUDED: whitelisted fields appear; unrelated
// private data never does.
test('Health Profile included: readiness whitelist appears, private data does not', async ({ page }) => {
  await seedProfile(page);
  await openReadiness(page, 'HRV a bit low vs my baseline — train or rest?');
  await page.reload(); // re-hydrate the store from the seeded state
  await expect(requestBox(page)).toHaveValue('HRV a bit low vs my baseline — train or rest?');
  await buildBtn(page).click();
  await fullPromptBtn(page).click();
  const out = page.locator('pre.output');
  // Whitelisted, readiness-relevant fields are present.
  await expect(out).toContainText('HRV baseline: 65ms');
  await expect(out).toContainText('7-8h');
  await expect(out).toContainText('No axial loading');
  // Unrelated private data must NOT appear.
  await expect(out).not.toContainText('SYNTHETICMED');
  await expect(out).not.toContainText('SYNTHETICEMPLOYER');
  await expect(out).not.toContainText('SYNTHETICMORTGAGE');
  await expect(out).not.toContainText('SYNTHETICSLEEPAID');
  await expect(out).not.toContainText('creatine');
  await expect(out).not.toContainText('2400');
  await expect(out).not.toContainText('18pct');
  // The UI discloses Health Profile inclusion.
  await expect(page.getByText(/This prompt includes Health Profile data/i)).toBeVisible();
});

// (5) — Health Profile EXCLUDED: the prompt says so and carries no profile data.
test('Health Profile excluded: prompt honestly says so and includes no profile data', async ({ page }) => {
  await seedProfile(page);
  await openReadiness(page, 'HRV a bit low vs my baseline — train or rest?');
  await page.reload(); // re-hydrate the store from the seeded state
  await expect(requestBox(page)).toHaveValue('HRV a bit low vs my baseline — train or rest?');
  await page.getByRole('checkbox', { name: /Include Health Profile/ }).uncheck();
  await buildBtn(page).click();
  await fullPromptBtn(page).click();
  const out = page.locator('pre.output');
  await expect(out).toContainText('No Health Profile context was included');
  await expect(out).not.toContainText('HRV baseline: 65ms');
  await expect(out).not.toContainText('SYNTHETICEMPLOYER');
});

// (6) — Copy/Save guards: a valid prompt can be copied and saved; editing the
// request marks it stale and disables both.
test('Copy and Save guards: valid prompt is actionable, edits make it stale', async ({ page }) => {
  await openReadiness(page, 'Train or rest today?');
  await buildBtn(page).click();
  await expect(copyBtn(page)).toBeEnabled();
  await savePromptBtn(page).click();
  await expect(page.getByText('Prompt saved on this device only — view under Logs → Artifacts.')).toBeVisible();

  // Edit the request → stale → copy/save disabled.
  await requestBox(page).fill('Train or rest today, and should I deload?');
  await expect(page.getByTestId('stale-notice')).toBeVisible();
  await expect(copyBtn(page)).toBeDisabled();
  await expect(savePromptBtn(page)).toBeDisabled();
});

// (6) — a stale prompt performs no local write (defense-in-depth).
test('a stale readiness prompt performs no local write', async ({ page }) => {
  const artifactCount = () =>
    canonicalStateRaw(page).then((raw) => (raw ? (JSON.parse(raw).artifacts?.length ?? 0) : 0));
  await openReadiness(page, 'Train or rest today?');
  await buildBtn(page).click();
  await savePromptBtn(page).click();
  await expect.poll(artifactCount).toBe(1);

  await requestBox(page).fill('Train or rest today, or deload?');
  await expect(page.getByTestId('stale-notice')).toBeVisible();
  await expect(savePromptBtn(page)).toBeDisabled();
  await page.waitForTimeout(200);
  expect(await artifactCount()).toBe(1);
});

// (7) — reload, back, and forward preserve/restore the routed input.
test('reload preserves the routed input', async ({ page }) => {
  await openReadiness(page, 'Fighting a cold, lift or rest?');
  await expect(requestBox(page)).toHaveValue('Fighting a cold, lift or rest?');
  await page.reload();
  await expect(requestBox(page)).toHaveValue('Fighting a cold, lift or rest?');
});

test('browser back/forward restores the correct same-workflow input', async ({ page }) => {
  await openReadiness(page, 'first readiness request');
  await page.goto(`${READINESS_URL}&input=${encodeURIComponent('second readiness request')}`);
  await expect(requestBox(page)).toHaveValue('second readiness request');
  await page.goBack();
  await expect(requestBox(page)).toHaveValue('first readiness request');
  await page.goForward();
  await expect(requestBox(page)).toHaveValue('second readiness request');
});

// (8) — red-flag synthetic input produces the required emergency escalation.
test('red-flag input produces emergency escalation at the top of the prompt', async ({ page }) => {
  await openReadiness(page, 'Crushing chest pain radiating to my arm and short of breath, should I push through my workout?');
  await buildBtn(page).click();
  await fullPromptBtn(page).click();
  const text = await page.locator('pre.output').innerText();
  expect(text).toContain('Possible emergency red flags detected');
  expect(text).toContain('urgent or emergency medical care');
  // The escalation directive comes before the Role section.
  expect(text.indexOf('emergency red flags')).toBeLessThan(text.indexOf('## Role'));
});

// The page presents itself as decision support, not a medical device.
test('the page frames itself as decision support, not a medical device', async ({ page }) => {
  await openReadiness(page);
  await expect(page.getByTestId('readiness-safety-note')).toContainText('Decision support, not medical diagnosis');
  await expect(page.getByTestId('readiness-safety-note')).toContainText('optional supporting data');
});
