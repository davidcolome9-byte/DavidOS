import { test, expect } from '@playwright/test';
import {
  canonicalState,
  canonicalStateRaw,
  seedCanonicalState,
  waitForCanonicalState,
} from './helpers/journalState';

// DOS-STAB-001A — malformed synthetic boot state in the real production
// build: malformed records are quarantined AFTER byte-exact preservation,
// valid neighbors keep loading, a recovery warning appears with a working
// export of the untouched original, and no record contents leak. All data is
// synthetic inside an isolated Playwright context.

const RECOVERY_PREFIX = 'davidos-state-v1-recovery-';

test('malformed records are quarantined after byte-exact preservation; valid state loads', async ({ page }) => {
  const consoleLines: string[] = [];
  page.on('console', (msg) => consoleLines.push(msg.text()));

  // Seed the app's own synthetic default state…
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /OS Status/ })).toBeVisible();
  await waitForCanonicalState(page);

  // …then corrupt individual records exactly as damaged storage would look:
  // one priority with a numeric label (invalid type) and a duplicated
  // reminder id. The rest of the state stays valid. Seeding drops the journal
  // and writes the legacy blob, so the next boot migrates exactly these bytes
  // (writing the legacy key alone would be ignored — the journal wins).
  const state = await canonicalState<{
    priorities: { label: unknown }[];
    reminders: { id: string }[];
  }>(page);
  state.priorities[1].label = 987123; // SYN corruption: wrong primitive type
  if (state.reminders.length >= 2) state.reminders[1].id = state.reminders[0].id; // SYN duplicate id
  const corruptedRaw = JSON.stringify(state);
  await seedCanonicalState(page, corruptedRaw);
  const priorityCount = state.priorities.length;

  await page.reload();
  await expect(page.getByRole('heading', { name: /OS Status/ })).toBeVisible();

  // Recovery warning with counts-only messaging.
  const banner = page.getByTestId('recovery-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('priorities: 1 of ' + priorityCount);
  await expect(banner).toContainText('reminders: 1 of');
  await expect(banner).not.toContainText('987123');

  // The byte-exact original was preserved under a recovery key.
  const preserved = await page.evaluate((prefix) => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) return localStorage.getItem(key);
    }
    return null;
  }, RECOVERY_PREFIX);
  expect(preserved).toBe(corruptedRaw);

  // Only the malformed records were quarantined; valid neighbors survive.
  const stored = await canonicalState<{ priorities: unknown[] }>(page);
  expect(stored.priorities).toHaveLength(priorityCount - 1);
  expect(JSON.stringify(stored)).not.toContain('987123');
  // The quarantined view is what the app committed, and it never wrote the
  // corrupt bytes back over the preserved original.
  expect(await canonicalStateRaw(page)).not.toBe(corruptedRaw);

  // The preserved original can be exported from the banner, byte-exact intent.
  // The filename is fixed-format — never derived from the storage key.
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('recovery-download-original').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^davidos-preserved-original-[\dTZ-]+\.json$/);

  // No corrupted record contents in the console either.
  expect(consoleLines.join('\n')).not.toContain('987123');
});
