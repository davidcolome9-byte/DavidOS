import { describe, expect, it } from 'vitest';
import { commitImport } from '../storage/importCommit';
import { HEALTH_DRAFT_KEY, saveHealthDraft } from '../health/profileDraft';
import { buildDefaultState } from '../../data/defaultState';
import type { AppState, HealthFitnessProfile } from '../types';

// Centralized draft-aware import commit: the draft is re-checked at apply time
// and destroyed only after the imported state was durably written. All values
// are synthetic.

const SYNTHETIC_DRAFT: HealthFitnessProfile = {
  id: 'syn-unit-profile',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  nutritionTargets: { calories: 5151, notes: 'SYN-UNIT-NOTE' },
};

function memStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as unknown as Storage & { store: Map<string, string> };
}

function withDraft(storage: Storage) {
  const res = saveHealthDraft(SYNTHETIC_DRAFT, null, '2026-01-02T00:00:00.000Z', storage);
  expect(res.ok).toBe(true);
}

const next: AppState = buildDefaultState();
const base = { persistAllowed: true, discardDraftConfirmed: true };

describe('commitImport', () => {
  it('is a pass-through when no draft exists — never persists on its own', () => {
    const storage = memStorage();
    let persisted = 0;
    const res = commitImport(next, { ...base, storage, persist: () => (persisted++, true) });
    expect(res).toEqual({ ok: true });
    expect(persisted).toBe(0);
  });

  it('blocks when a draft exists and discard was not confirmed — nothing touched', () => {
    const storage = memStorage();
    withDraft(storage);
    const before = storage.store.get(HEALTH_DRAFT_KEY);
    let persisted = 0;
    const res = commitImport(next, {
      ...base,
      discardDraftConfirmed: false,
      storage,
      persist: () => (persisted++, true),
    });
    expect(res).toEqual({ ok: false, reason: 'draft_blocked' });
    expect(persisted).toBe(0);
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(before);
  });

  it('confirmed discard: persists FIRST, clears the draft only after success', () => {
    const storage = memStorage();
    withDraft(storage);
    const order: string[] = [];
    const res = commitImport(next, {
      ...base,
      storage,
      persist: (s) => {
        expect(s).toBe(next);
        // The draft must still exist at the moment of the durable write.
        expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(true);
        order.push('persist');
        return true;
      },
    });
    expect(res).toEqual({ ok: true });
    order.push('after');
    expect(order).toEqual(['persist', 'after']);
    expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(false);
  });

  it('a failed durable write aborts: draft intact, reason is value-free', () => {
    const storage = memStorage();
    withDraft(storage);
    const before = storage.store.get(HEALTH_DRAFT_KEY);
    const res = commitImport(next, { ...base, storage, persist: () => false });
    expect(res).toEqual({ ok: false, reason: 'commit_failed' });
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(before);
  });

  it('a throwing durable write is treated as a failed commit', () => {
    const storage = memStorage();
    withDraft(storage);
    const before = storage.store.get(HEALTH_DRAFT_KEY);
    const res = commitImport(next, {
      ...base,
      storage,
      persist: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    });
    expect(res).toEqual({ ok: false, reason: 'commit_failed' });
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(before);
  });

  it('suppressed persistence (recovery / stale tab) never destroys a draft', () => {
    const storage = memStorage();
    withDraft(storage);
    const before = storage.store.get(HEALTH_DRAFT_KEY);
    let persisted = 0;
    const res = commitImport(next, {
      ...base,
      persistAllowed: false,
      storage,
      persist: () => (persisted++, true),
    });
    expect(res).toEqual({ ok: false, reason: 'commit_failed' });
    expect(persisted).toBe(0);
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(before);
  });

  it('results carry only reason codes — no draft or imported values', () => {
    const storage = memStorage();
    withDraft(storage);
    for (const opts of [
      { ...base, discardDraftConfirmed: false, storage },
      { ...base, storage, persist: () => false },
    ]) {
      const res = commitImport(next, opts);
      const text = JSON.stringify(res);
      expect(text).not.toContain('5151');
      expect(text).not.toContain('SYN-UNIT-NOTE');
      expect(text.length).toBeLessThan(80);
    }
  });
});
