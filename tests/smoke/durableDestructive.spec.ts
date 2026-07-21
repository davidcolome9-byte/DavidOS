import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  GENERATION_PREFIX,
  canonicalState,
  canonicalStateRaw,
  waitForCanonicalState,
} from './helpers/journalState';

// DOS-STAB-001A — durable destructive flows in the real production build:
//  1. Reset under unsafe persistence deletes NOTHING and reports honestly.
//  2. A stale tab cannot Reset over newer state from another tab.
//  3. A no-draft Import performs a durable write that survives a reload.
// All data is the app's own synthetic seed inside an isolated Playwright
// context — no real profile or storage is ever used.
//
// Canonical state is read through the journal helper: the committed
// generation is what the app actually persisted.

/**
 * Make the journal's CANDIDATE GENERATION write fail while
 * window.__synFailWrites is set. That is the first storage write a commit
 * performs, so the transaction fails BEFORE any head advances — the
 * proven-safe failure class, where nothing may be deleted or replaced.
 */
async function installFailableWrites(page: Page) {
  await page.addInitScript((prefix) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if ((window as unknown as { __synFailWrites?: boolean }).__synFailWrites && k.startsWith(prefix)) {
        throw new DOMException('synthetic quota failure', 'QuotaExceededError');
      }
      return original.call(this, k, v);
    };
  }, GENERATION_PREFIX);
}

async function openResetDialog(page: Page) {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Reset to seed' }).click();
  await page.locator('#reset-confirm').fill('RESET');
}

test('Reset under unsafe persistence: nothing is deleted and failure is honest', async ({ page }) => {
  await installFailableWrites(page);
  await page.goto('/');
  await waitForCanonicalState(page);

  await openResetDialog(page);
  // Snapshot AFTER the dialog-opened audit committed, right before the
  // injected failure — the commit failure must leave this byte-identical.
  await expect
    .poll(() => canonicalStateRaw(page).then((raw) => (raw ?? '').includes('dialog opened')))
    .toBe(true);
  const blobBefore = await canonicalStateRaw(page);
  // The durable write fails for the first time AT the commit itself.
  await page.evaluate(() => {
    (window as unknown as { __synFailWrites?: boolean }).__synFailWrites = true;
  });
  await page.getByRole('button', { name: 'Reset (keep Health Profile)' }).click();

  await expect(page.getByText(/Reset failed/)).toBeVisible();
  await expect(page.getByText(/Reset to seed data/)).toHaveCount(0);
  // The committed state is byte-identical — nothing was deleted or replaced.
  expect(await canonicalStateRaw(page)).toBe(blobBefore);

  // After the failure clears, a reload still boots the ORIGINAL data.
  await page.evaluate(() => {
    (window as unknown as { __synFailWrites?: boolean }).__synFailWrites = false;
  });
  await page.reload(); // still on #/settings — a real boot from storage
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  expect(await canonicalStateRaw(page)).toBe(blobBefore);
});

test('a stale tab cannot Reset away newer state written by another tab', async ({ context }) => {
  const a = await context.newPage();
  await a.goto('/');
  await expect(a.getByRole('heading', { name: /OS Status/ })).toBeVisible();
  await waitForCanonicalState(a);

  const b = await context.newPage();
  await b.goto('/#/settings');
  await expect(b.getByRole('button', { name: 'Reset to seed' })).toBeVisible();

  // A writes newer state — routing a command audits → commits a new
  // generation. (The audit fingerprints the command rather than storing it
  // verbatim, so wait for the committed state to CHANGE, not for its text.)
  await a.goto('/');
  const blobBeforeRoute = await canonicalStateRaw(a);
  await a.getByLabel('Command input').fill('Review this workout');
  await a.getByRole('button', { name: 'Route This' }).click();
  await expect.poll(() => canonicalStateRaw(a).then((raw) => raw !== blobBeforeRoute)).toBe(true);
  const newerBlob = await canonicalStateRaw(a);

  // B is now stale: dismiss the blocking dialog to reach Settings…
  await expect(b.getByTestId('crosstab-guard')).toBeVisible();
  await b.getByRole('button', { name: 'Keep reviewing without saving' }).click();

  // …where Reset is BLOCKED, not merely warned.
  await b.getByRole('button', { name: 'Reset to seed' }).click();
  await b.locator('#reset-confirm').fill('RESET');
  await expect(b.getByTestId('reset-blocked-note')).toBeVisible();
  await expect(b.getByTestId('reset-blocked-note')).toContainText('Reset is unavailable');
  await expect(b.getByRole('button', { name: 'Reset (keep Health Profile)' })).toBeDisabled();

  // A's newer state is byte-identical — the stale tab deleted nothing.
  expect(await canonicalStateRaw(b)).toBe(newerBlob);

  await a.close();
  await b.close();
});

test('no-draft Import performs a durable write that survives a reload', async ({ page }) => {
  await page.goto('/#/settings');
  await waitForCanonicalState(page);

  // A valid backup built from the CURRENT committed state, marked light-theme,
  // no Health Profile → no draft, no conflict dialog.
  const state = await canonicalState<{
    schemaVersion: number;
    settings: { theme: string };
    healthProfile: unknown;
  }>(page);
  state.settings.theme = 'light';
  state.healthProfile = null;
  const backup = JSON.stringify({
    app: 'davidos',
    exportedAt: new Date().toISOString(),
    schemaVersion: state.schemaVersion,
    state,
  });

  page.once('dialog', (d) => void d.accept());
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await expect(page.getByText('Import complete.')).toBeVisible();

  // Durably committed: the committed generation carries the marker AND the
  // completed import audit entry (committed state and audit history agree),
  // proving the completion audit was part of the FIRST candidate generation.
  const stored = await canonicalState<{
    settings: { theme: string };
    auditLog: { command: string }[];
  }>(page);
  expect(stored.settings.theme).toBe('light');
  expect(stored.auditLog[0].command).toBe('Import backup');

  // The imported state survives a full reload.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
