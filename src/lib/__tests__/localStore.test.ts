import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CORRUPT_BACKUP_KEY,
  STORAGE_KEY,
  loadPersistedState,
  normalizeState,
  persistState,
} from '../storage/localStore';
import { buildDefaultState } from '../../data/defaultState';
import type { AppState } from '../types';

/** Minimal in-memory localStorage for node-environment tests. */
function fakeLocalStorage(overrides: Partial<Storage> = {}) {
  const store = new Map<string, string>();
  return {
    data: store,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
    ...overrides,
  } as Storage & { data: Map<string, string> };
}

let storage: ReturnType<typeof fakeLocalStorage>;

beforeEach(() => {
  storage = fakeLocalStorage();
  (globalThis as { localStorage?: Storage }).localStorage = storage;
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('normalizeState', () => {
  const bare = { schemaVersion: 1 } as unknown as AppState;

  it('backfills every collection so partial state cannot white-screen the app', () => {
    const n = normalizeState(bare);
    expect(n.priorities).toEqual([]);
    expect(n.openLoops).toEqual([]);
    expect(n.reminders).toEqual([]);
    expect(n.projects).toEqual([]);
    expect(n.prompts).toEqual([]);
    expect(n.contextItems).toEqual([]);
    expect(n.handoffs).toEqual([]);
    expect(n.artifacts).toEqual([]);
    expect(n.auditLog).toEqual([]);
    expect(n.settings).toEqual({ theme: 'dark' });
  });

  it('seeds a Health Profile when the field is missing (pre-profile state)', () => {
    expect(normalizeState(bare).healthProfile?.seedMetadata?.isSeededProfile).toBe(true);
  });

  it('respects an explicit null Health Profile (user deleted it)', () => {
    const n = normalizeState({ ...bare, healthProfile: null } as AppState);
    expect(n.healthProfile).toBeNull();
  });

  it('drops non-object items and junk-typed collections', () => {
    const dirty = {
      schemaVersion: 1,
      priorities: [null, 'x', { id: 'p', label: 'ok', rank: 1 }],
      prompts: 'junk',
      projects: [{ id: 'pr', name: 'proj' }],
      settings: { theme: 'purple' },
    } as unknown as AppState;
    const n = normalizeState(dirty);
    expect(n.priorities).toHaveLength(1);
    expect(n.prompts).toEqual([]);
    expect(n.projects[0].relatedPrompts).toEqual([]);
    expect(n.projects[0].relatedWorkflows).toEqual([]);
    expect(n.settings.theme).toBe('dark'); // invalid theme falls back
  });

  it('keeps valid data byte-identical (non-destructive)', () => {
    const state = buildDefaultState();
    expect(normalizeState(state)).toEqual(state);
  });
});

describe('loadPersistedState', () => {
  it('returns null when nothing is stored', () => {
    expect(loadPersistedState()).toBeNull();
  });

  it('quarantines unparseable JSON instead of losing it', () => {
    storage.setItem(STORAGE_KEY, '{"schemaVersion": ');
    expect(loadPersistedState()).toBeNull();
    expect(storage.getItem(CORRUPT_BACKUP_KEY)).toBe('{"schemaVersion": ');
  });

  it('quarantines a blob without schemaVersion', () => {
    storage.setItem(STORAGE_KEY, '{"foo": 1}');
    expect(loadPersistedState()).toBeNull();
    expect(storage.getItem(CORRUPT_BACKUP_KEY)).toBe('{"foo": 1}');
  });

  it('loads and normalizes structurally damaged but parseable state', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, prompts: 'junk' }));
    const loaded = loadPersistedState();
    expect(loaded).not.toBeNull();
    expect(loaded!.prompts).toEqual([]);
    expect(loaded!.settings.theme).toBe('dark');
  });
});

describe('persistState', () => {
  it('returns true on success', () => {
    expect(persistState(buildDefaultState())).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).toBeTruthy();
  });

  it('returns false when the write fails (quota) so the UI can warn', () => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage({
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(persistState(buildDefaultState())).toBe(false);
  });
});
