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

  it('round-trips a saved draft', () => {
    saveHealthDraft(profile, '2026-01-02T00:00:00.000Z', '2026-07-16T00:00:00.000Z', store);
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

  it('degrades to a no-op when storage is unavailable', () => {
    expect(() => saveHealthDraft(profile, null, 'now', null)).not.toThrow();
    expect(loadHealthDraft(null)).toBeNull();
    expect(hasHealthDraft(null)).toBe(false);
  });
});
