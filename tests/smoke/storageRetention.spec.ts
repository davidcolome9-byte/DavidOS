import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  canonicalState,
  canonicalStateRaw,
  seedCanonicalState,
  waitForCanonicalState,
} from './helpers/journalState';

// OL-003 storage protection & retention. All values are SYNTHETIC. Runs at
// the project-default mobile viewport, so every flow is a mobile check too.


/** Seed N synthetic artifacts (oldest-first ids) into persisted state and reload. */
async function seedArtifacts(page: Page, count: number, contentSize = 64) {
  await page.goto('/#/');
  // First-run persistence happens in a mount effect — wait for it.
  await waitForCanonicalState(page);
  const state = await canonicalState<{ artifacts: unknown[] }>(page);
  const artifacts = [];
  for (let i = count; i >= 1; i--) {
    artifacts.push({
      id: `syn-artifact-${i}`,
      workflowId: 'syn-workflow',
      artifactType: 'full_prompt',
      createdAt: new Date(Date.UTC(2026, 0, i)).toISOString(),
      title: `SYN-PROMPT-${i}`,
      content: 'S'.repeat(contentSize),
    });
  }
  state.artifacts = artifacts; // newest-first, like the app prepends
  await seedCanonicalState(page, JSON.stringify(state));
  // Hash-only navigation is same-document — reload so the app boots from the
  // seeded state.
  await page.goto('/#/settings');
  await page.reload();
}

const storedArtifactIds = async (page: Page) => {
  const state = await canonicalState<{ artifacts: { id: string }[] }>(page);
  return state.artifacts.map((a) => a.id);
};

test('the storage meter is visible under Settings → Data', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByTestId('storage-meter')).toBeVisible();
  await expect(page.getByTestId('storage-usage-total')).toContainText('Using about');
  await expect(page.getByTestId('storage-breakdown')).toBeVisible();
  await expect(page.getByTestId('storage-level-badge')).toHaveText('ok');
});

test('prune is guarded: exact effect shown, PRUNE required, cancel deletes nothing', async ({ page }) => {
  await seedArtifacts(page, 4);
  const before = await canonicalStateRaw(page);

  await page.getByTestId('storage-prune-open').click();
  const dialog = page.getByTestId('storage-prune-dialog');
  await expect(dialog).toBeVisible();

  await page.getByTestId('storage-prune-keep').fill('2');
  await expect(page.getByTestId('storage-prune-effect')).toContainText('deletes the 2 oldest');
  // Guarded: nothing typed → disabled; wrong text → still disabled.
  await expect(page.getByTestId('storage-prune-confirm')).toBeDisabled();
  await page.getByTestId('storage-prune-confirm-text').fill('prune');
  await expect(page.getByTestId('storage-prune-confirm')).toBeDisabled();

  await page.getByTestId('storage-prune-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Prune cancelled — nothing was deleted.')).toBeVisible();
  // Artifacts are untouched (audit entries may differ, so compare artifacts).
  expect(await storedArtifactIds(page)).toEqual(
    JSON.parse(before as string).artifacts.map((a: { id: string }) => a.id),
  );
});

test('a confirmed prune keeps the newest N and persists; handoffs untouched', async ({ page }) => {
  await seedArtifacts(page, 4);
  const handoffsBefore = JSON.stringify(
    (await canonicalState<{ handoffs: unknown }>(page)).handoffs,
  );

  await page.getByTestId('storage-prune-open').click();
  await page.getByTestId('storage-prune-keep').fill('2');
  await page.getByTestId('storage-prune-confirm-text').fill('PRUNE');
  await page.getByTestId('storage-prune-confirm').click();

  await expect(page.getByTestId('storage-prune-dialog')).toHaveCount(0);
  await expect(page.getByText('Deleted 2 saved prompt(s); kept the newest 2.')).toBeVisible();
  await expect(page.getByTestId('storage-breakdown')).toContainText('Saved prompts (artifacts) (2)');

  expect(await storedArtifactIds(page)).toEqual(['syn-artifact-4', 'syn-artifact-3']);
  const handoffsAfter = JSON.stringify(
    (await canonicalState<{ handoffs: unknown }>(page)).handoffs,
  );
  expect(handoffsAfter).toBe(handoffsBefore);

  // Survives a reload — the prune was durably persisted.
  await page.reload();
  expect(await storedArtifactIds(page)).toEqual(['syn-artifact-4', 'syn-artifact-3']);
});

test('near-quota state raises an app-wide protection banner and deletes nothing', async ({ page }) => {
  // One ~4.8M-char artifact ≈ 92% of the ~5MB estimate → critical.
  //
  // DOS-STAB-001A honesty: immutable generations mean a commit needs room for
  // a SECOND copy of the state, so at this level the journal can no longer
  // commit at all. The app therefore escalates from the "nearly full" warning
  // to the stronger "saving is failing" banner (Layout shows exactly one, and
  // the failure banner wins). Either way the user gets an app-wide protection
  // banner, and NOTHING is deleted or repaired automatically.
  await seedArtifacts(page, 1, 4_800_000);
  const critical = page.getByTestId('storage-critical-banner');
  const anyProtectionBanner = page.locator(
    '[data-testid="storage-critical-banner"], .notice.risk-block:has-text("Saving to this device is failing")',
  );
  await expect(anyProtectionBanner.first()).toBeVisible();
  if (await critical.count()) {
    await expect(critical).toContainText('Nothing is deleted automatically');
  }
  await expect(page.getByTestId('storage-warning')).toBeVisible();
  await expect(page.getByTestId('storage-level-badge')).toHaveText('nearly full');

  // The seeded artifact is still there — no automatic deletion or repair.
  expect(await storedArtifactIds(page)).toEqual(['syn-artifact-1']);
});

// NOTE: there is deliberately no "prune recovers a critical level" case. Any
// state large enough to reach warning/critical on the ~5MB estimate is, by
// construction, too large for the journal to commit a second copy of, so the
// durable prune path cannot run at that level. The durable prune itself is
// covered above ("a confirmed prune keeps the newest N and persists"), and the
// capacity limitation is recorded in docs/OPEN_LOOPS.md (OL-032).

test('no artifacts → prune is disabled; meter still renders', async ({ page }) => {
  await page.goto('/#/settings');
  const raw = await canonicalStateRaw(page);
  const hasArtifacts = raw ? (JSON.parse(raw).artifacts as unknown[]).length > 0 : false;
  if (!hasArtifacts) {
    await expect(page.getByTestId('storage-prune-open')).toBeDisabled();
  }
  await expect(page.getByTestId('storage-meter')).toBeVisible();
});
