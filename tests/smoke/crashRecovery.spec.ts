import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { canonicalStateRaw, waitForCanonicalState } from './helpers/journalState';

// DOS-STAB-001A — top-level crash recovery in the real production build. A
// render crash is induced WITHOUT any production crash hook: an init script
// sabotages Date.prototype.toLocaleDateString (used by the app shell render)
// only while a session flag is set. The boundary must replace the blank page
// with a recovery surface offering reload + byte-exact exports, and must not
// modify any stored data. All data is synthetic in an isolated context.

const SYN_RECOVERY_KEY = 'davidos-state-v1-recovery-2026-01-01T00-00-00-000Z';
const SYN_RECOVERY_BLOB = '{"syn":"SYN-RECOVERY-BLOB-PLAYWRIGHT"}';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (window.sessionStorage.getItem('syn-crash') === '1') {
        Date.prototype.toLocaleDateString = function () {
          throw new Error('synthetic render crash (crash-recovery spec)');
        };
      }
    } catch {
      /* ignore */
    }
  });
});

test('a render crash lands on the recovery surface with working exports and reload', async ({ page }) => {
  // 1. Healthy boot seeds synthetic state; plant a synthetic recovery blob too.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /OS Status/ })).toBeVisible();
  await waitForCanonicalState(page);
  await page.evaluate(
    ([recKey, recBlob]) => localStorage.setItem(recKey, recBlob),
    [SYN_RECOVERY_KEY, SYN_RECOVERY_BLOB],
  );
  // The user's CURRENT canonical data — the committed journal generation.
  const blobBefore = await canonicalStateRaw(page);

  // 2. Crash the app shell render.
  await page.evaluate(() => sessionStorage.setItem('syn-crash', '1'));
  await page.reload();

  // 3. The recovery surface replaces the blank page.
  const heading = page.getByRole('heading', { name: /DavidOS encountered an application error/ });
  await expect(heading).toBeVisible();
  // Focus lands on the heading for keyboard/screen-reader users.
  await expect(heading).toBeFocused();
  // No stack traces or state contents on screen.
  await expect(page.locator('body')).not.toContainText('synthetic render crash');
  await expect(page.locator('body')).not.toContainText('SYN-RECOVERY-BLOB-PLAYWRIGHT');

  // 4. Nothing was deleted, repaired, or reset automatically.
  expect(await canonicalStateRaw(page)).toBe(blobBefore);
  expect(await page.evaluate((k) => localStorage.getItem(k), SYN_RECOVERY_KEY)).toBe(SYN_RECOVERY_BLOB);

  // 5. Byte-exact export of the raw primary storage blob — no StoreProvider.
  const rawDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download saved data (exact copy)' }).click();
  const raw = await rawDownload;
  expect(readFileSync((await raw.path())!, 'utf8')).toBe(blobBefore);

  // 6. The preserved recovery blob is surfaced with its own byte-exact export.
  const recDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download recovery copy 1' }).click();
  const rec = await recDownload;
  expect(readFileSync((await rec.path())!, 'utf8')).toBe(SYN_RECOVERY_BLOB);

  // 7. Reload works: once the crash condition is gone, the app returns whole.
  await page.evaluate(() => sessionStorage.removeItem('syn-crash'));
  await page.getByRole('button', { name: 'Reload DavidOS' }).click();
  await expect(page.getByRole('heading', { name: /OS Status/ })).toBeVisible();
  expect(await canonicalStateRaw(page)).toBe(blobBefore);
});
