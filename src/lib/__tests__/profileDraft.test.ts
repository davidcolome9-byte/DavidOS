import { describe, expect, it, beforeEach } from 'vitest';
import {
  HEALTH_DRAFT_KEY,
  loadHealthDraft,
  saveHealthDraft,
  clearHealthDraft,
  hasHealthDraft,
} from '../health/profileDraft';
import type { HealthFitnessProfile } from '../types';

// In-memory Storage double (no real localStorage; synthetic data only).
function mkStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, v); },
  } as Storage;
}

const profile: HealthFitnessProfile = {
  id: 'p1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  nutritionTargets: { calories: 2222, proteinGrams: 190 },
};

describe('profileDraft (Phase 2A)', () => {
  let store: Storage;
  beforeEach(() => { store = mkStorage(); });

  it('round-trips a saved draft and reports ok', () => {
    const res = saveHealthDraft(profile, '2026-01-02T00:00:00.000Z', '2026-07-16T00:00:00.000Z', store);
    expect(res).toEqual({ ok: true });
    const env = loadHealthDraft(store);
    expect(env?.profile.nutritionTargets?.calories).toBe(2222);
    expect(env?.baseUpdatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(hasHealthDraft(store)).toBe(true);
  });

  it('clear removes the draft', () => {
    saveHealthDraft(profile, null, 'now', store);
    clearHealthDraft(store);
    expect(loadHealthDraft(store)).toBeNull();
    expect(hasHealthDraft(store)).toBe(false);
  });

  it('corrupted JSON fails safe (returns null, does not throw)', () => {
    store.setItem(HEALTH_DRAFT_KEY, '{not valid json');
    expect(() => loadHealthDraft(store)).not.toThrow();
    expect(loadHealthDraft(store)).toBeNull();
  });

  it('rejects an unknown version or missing profile', () => {
    store.setItem(HEALTH_DRAFT_KEY, JSON.stringify({ version: 99, profile }));
    expect(loadHealthDraft(store)).toBeNull();
    store.setItem(HEALTH_DRAFT_KEY, JSON.stringify({ version: 1, profile: null }));
    expect(loadHealthDraft(store)).toBeNull();
  });

  it('uses the dedicated key, isolated from the app state blob', () => {
    saveHealthDraft(profile, null, 'now', store);
    expect(store.getItem(HEALTH_DRAFT_KEY)).not.toBeNull();
    expect(store.getItem('davidos-state-v1')).toBeNull();
  });

  it('degrades to a no-op when storage is unavailable, reporting the reason', () => {
    const res = saveHealthDraft(profile, null, 'now', null);
    expect(res).toEqual({ ok: false, reason: 'unavailable' });
    expect(loadHealthDraft(null)).toBeNull();
    expect(hasHealthDraft(null)).toBe(false);
  });

  it('reports a quota failure without throwing (DOMException code 22)', () => {
    const failing: Storage = {
      ...mkStorage(),
      setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
    } as Storage;
    const res = saveHealthDraft(profile, null, 'now', failing);
    expect(res).toEqual({ ok: false, reason: 'quota' });
  });

  it('reports a generic write failure when setItem throws a non-quota error', () => {
    const failing: Storage = {
      ...mkStorage(),
      setItem: () => { throw new Error('boom'); },
    } as Storage;
    const res = saveHealthDraft(profile, null, 'now', failing);
    expect(res).toEqual({ ok: false, reason: 'write' });
  });

  it('reports a serialization failure and never reaches storage', () => {
    let wrote = false;
    const guard: Storage = {
      ...mkStorage(),
      setItem: () => { wrote = true; },
    } as Storage;
    // A circular structure cannot be JSON.stringify'd.
    const circular = { ...profile } as HealthFitnessProfile & { self?: unknown };
    circular.self = circular;
    const res = saveHealthDraft(circular, null, 'now', guard);
    expect(res).toEqual({ ok: false, reason: 'serialize' });
    expect(wrote).toBe(false);
  });

  it('failure reason codes never contain profile values (privacy)', () => {
    const failing: Storage = {
      ...mkStorage(),
      setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
    } as Storage;
    const secret = { ...profile, promptSummary: 'SENTINEL-SECRET-9f3a' };
    const res = saveHealthDraft(secret, null, 'now', failing);
    expect(JSON.stringify(res)).not.toContain('SENTINEL-SECRET');
  });
});
