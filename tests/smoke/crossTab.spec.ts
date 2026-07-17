import { test, expect, type Page } from '@playwright/test';

// DOS-WF-001R Phase 2B — a stale tab must not clobber newer state from another
// tab. Two pages in one context share localStorage and receive `storage` events.

// A routed command is persisted with a privacy-safe label (never the raw text).
const hasRoutedCmd = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('davidos-state-v1');
    if (!raw) return false;
    if (raw.includes('Review this workout')) return false; // raw text must never be stored
    const log = (JSON.parse(raw).auditLog ?? []) as Array<{ command?: string }>;
    return log.some((e) => typeof e.command === 'string' && e.command.startsWith('Routed command'));
  });

test('a stale tab cannot silently clobber newer state from another tab', async ({ context }) => {
  const a = await context.newPage();
  await a.goto('/');
  await expect(a.getByRole('heading', { name: /OS Status/ })).toBeVisible();
  // Establish a shared persisted baseline before opening the second tab (real
  // usage: both tabs load the SAME stored state; the later one skips its write).
  await expect.poll(() => a.evaluate(() => !!localStorage.getItem('davidos-state-v1'))).toBe(true);

  const b = await context.newPage();
  await b.goto('/');
  await expect(b.getByRole('heading', { name: /OS Status/ })).toBeVisible();
  // Neither tab is stale yet (B loaded A's state without rewriting it).
  await expect(a.getByTestId('crosstab-guard')).toHaveCount(0);
  await expect(b.getByTestId('crosstab-guard')).toHaveCount(0);

  // (1,2) A writes newer state — routing a command audits → persists.
  await a.getByLabel('Command input').fill('Review this workout');
  await a.getByRole('button', { name: 'Route This' }).click();

  // (3,4) B detects the external change and blocks with a reload prompt so it
  // cannot silently overwrite A's write.
  await expect(b.getByTestId('crosstab-guard')).toBeVisible();
  await expect.poll(() => hasRoutedCmd(a)).toBe(true);
  // A's write is still the stored state (B did not clobber it).
  expect(await hasRoutedCmd(b)).toBe(true);

  // (5) Reloading B adopts A's state; the guard clears.
  await b.reload();
  await expect(b.getByTestId('crosstab-guard')).toHaveCount(0);
  expect(await hasRoutedCmd(b)).toBe(true);

  await a.close();
  await b.close();
});
