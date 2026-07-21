import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Browser-test access to canonical AppState (DOS-STAB-001A).
 *
 * Canonical state is no longer one mutable key: it is an immutable generation
 * referenced by the higher of two alternating journal heads. Specs must read
 * what the app ACTUALLY COMMITTED, so every "what is stored now?" assertion
 * goes through here instead of reading the legacy key (which, on a fresh
 * profile, is never written at all).
 *
 * Selection here mirrors the app's own rule — highest head sequence whose
 * referenced generation exists — with a legacy-key fallback for pre-migration
 * states. It deliberately does NOT re-verify hashes: the authoritative
 * selection algorithm (including hash verification, invalid-higher-head
 * fallback, and orphan exclusion) is proven in
 * src/lib/__tests__/stateJournal.test.ts and bootJournal.test.ts. These
 * helpers only need to observe the committed result.
 */

export const LEGACY_STATE_KEY = 'davidos-state-v1';
export const GENERATION_PREFIX = 'davidos-state-generation-v1-';
export const HEAD_KEYS = ['davidos-state-head-v1-a', 'davidos-state-head-v1-b'] as const;

/** Runs in the PAGE. Returns the serialized committed AppState, or null. */
function readCommitted(keys: { legacy: string; prefix: string; heads: string[] }): string | null {
  let best: { sequence: number; raw: string } | null = null;
  for (const headKey of keys.heads) {
    const rawHead = localStorage.getItem(headKey);
    if (rawHead === null) continue;
    let head: { sequence?: unknown; generationId?: unknown };
    try {
      head = JSON.parse(rawHead) as { sequence?: unknown; generationId?: unknown };
    } catch {
      continue;
    }
    if (typeof head.sequence !== 'number' || typeof head.generationId !== 'string') continue;
    const raw = localStorage.getItem(`${keys.prefix}${head.generationId}`);
    if (raw === null) continue;
    if (!best || head.sequence > best.sequence) best = { sequence: head.sequence, raw };
  }
  if (best) return best.raw;
  return localStorage.getItem(keys.legacy);
}

/** Runs in the PAGE. Clears journal records so a legacy seed can migrate cleanly. */
function clearJournal(keys: { prefix: string; heads: string[] }): void {
  for (const headKey of keys.heads) localStorage.removeItem(headKey);
  const doomed: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(keys.prefix)) doomed.push(key);
  }
  for (const key of doomed) localStorage.removeItem(key);
}

const KEYS = { legacy: LEGACY_STATE_KEY, prefix: GENERATION_PREFIX, heads: [...HEAD_KEYS] };

/** The serialized AppState the app has actually committed, or null. */
export function canonicalStateRaw(page: Page): Promise<string | null> {
  return page.evaluate(readCommitted, KEYS);
}

/** The committed AppState, parsed. Throws if nothing is committed yet. */
export async function canonicalState<T = Record<string, unknown>>(page: Page): Promise<T> {
  const raw = await canonicalStateRaw(page);
  if (raw === null) throw new Error('no canonical AppState has been committed');
  return JSON.parse(raw) as T;
}

/** Wait until the app has committed canonical state at least once. */
export async function waitForCanonicalState(page: Page): Promise<void> {
  await expect.poll(() => canonicalStateRaw(page).then((raw) => raw !== null)).toBe(true);
}

/**
 * Seed canonical state for a test: drop any journal records and write the
 * legacy blob, so the next load migrates exactly this state into a fresh
 * initial generation. (Writing the legacy key alone would be IGNORED once a
 * valid journal head exists — that is the intended production behavior.)
 */
export async function seedCanonicalState(page: Page, raw: string): Promise<void> {
  await page.evaluate(
    ([keys, blob]) => {
      const k = keys as { legacy: string; prefix: string; heads: string[] };
      for (const headKey of k.heads) localStorage.removeItem(headKey);
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(k.prefix)) doomed.push(key);
      }
      for (const key of doomed) localStorage.removeItem(key);
      localStorage.setItem(k.legacy, blob as string);
    },
    [KEYS, raw] as const,
  );
}

export { clearJournal };
