import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RECOVERY_KEY_PREFIX,
  STORAGE_KEY,
  inspectStructure,
  loadPersistedState,
  normalizeState,
  persistState,
} from '../storage/localStore';
import { buildResetState } from '../storage/resetState';
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

/** setItem succeeds for the main key but fails for recovery keys. */
function storageWhereQuarantineFails(initial: Record<string, string>) {
  const s = fakeLocalStorage();
  for (const [k, v] of Object.entries(initial)) s.data.set(k, v);
  const rawSet = s.setItem.bind(s);
  s.setItem = (k: string, v: string) => {
    if (k.startsWith(RECOVERY_KEY_PREFIX)) throw new Error('QuotaExceededError');
    rawSet(k, v);
  };
  return s;
}

let storage: ReturnType<typeof fakeLocalStorage>;

beforeEach(() => {
  storage = fakeLocalStorage();
  (globalThis as { localStorage?: Storage }).localStorage = storage;
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

function recoveryKeys() {
  return [...storage.data.keys()].filter((k) => k.startsWith(RECOVERY_KEY_PREFIX));
}

describe('inspectStructure', () => {
  it('classifies absent fields as missing (additive), damaged fields as invalid (lossy)', () => {
    const report = inspectStructure({
      schemaVersion: 1,
      prompts: 'junk',
      priorities: [{ id: 'p', label: 'ok', rank: 1 }],
    } as unknown as AppState);
    expect(report.invalid).toContain('prompts');
    expect(report.missing).toContain('artifacts');
    expect(report.missing).toContain('settings');
    expect(report.invalid).not.toContain('priorities');
  });

  it('reports a fully valid state as clean', () => {
    const report = inspectStructure(buildDefaultState());
    expect(report.invalid).toEqual([]);
    expect(report.missing).toEqual([]);
  });
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
    expect(normalizeState({ ...bare, healthProfile: null } as AppState).healthProfile).toBeNull();
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
    expect(n.settings.theme).toBe('dark');
  });

  it('keeps valid data byte-identical (non-destructive)', () => {
    const state = buildDefaultState();
    expect(normalizeState(state)).toEqual(state);
  });
});

describe('loadPersistedState — recovery contract', () => {
  it('returns clean recovery when nothing is stored', () => {
    const r = loadPersistedState();
    expect(r.state).toBeNull();
    expect(r.recovery.kind).toBe('none');
    expect(r.recovery.canPersist).toBe(true);
  });

  it('fully valid current state loads with no recovery', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify(buildDefaultState()));
    const r = loadPersistedState();
    expect(r.recovery.kind).toBe('none');
    expect(r.recovery.message).toBe('');
    expect(recoveryKeys()).toEqual([]);
  });

  it('valid older state (missing fields only) migrates additively and may persist', () => {
    const old = { ...buildDefaultState() } as Partial<AppState>;
    delete old.artifacts;
    delete old.healthProfile;
    storage.setItem(STORAGE_KEY, JSON.stringify(old));
    const r = loadPersistedState();
    expect(r.recovery.kind).toBe('migrated');
    expect(r.recovery.canPersist).toBe(true);
    expect(r.recovery.message).toBe(''); // console-only; nothing was lost
    expect(r.state!.artifacts).toEqual([]);
    expect(recoveryKeys()).toEqual([]); // no quarantine needed
  });

  it('quarantines the EXACT raw blob before a lossy repair, then allows persistence', () => {
    const raw = JSON.stringify({ schemaVersion: 1, prompts: 'junk' });
    storage.setItem(STORAGE_KEY, raw);
    const r = loadPersistedState();
    expect(r.recovery.kind).toBe('repaired');
    expect(r.recovery.rawPreserved).toBe(true);
    expect(r.recovery.canPersist).toBe(true);
    expect(r.recovery.recoveryKey).toBeTruthy();
    expect(r.recovery.message).toContain(r.recovery.recoveryKey!);
    expect(storage.getItem(r.recovery.recoveryKey!)).toBe(raw); // byte-identical
    expect(r.state!.prompts).toEqual([]);
  });

  it('suppresses persistence when the raw blob cannot be preserved (lossy path)', () => {
    const raw = JSON.stringify({ schemaVersion: 1, prompts: 'junk' });
    storage = storageWhereQuarantineFails({ [STORAGE_KEY]: raw });
    (globalThis as { localStorage?: Storage }).localStorage = storage;
    const r = loadPersistedState();
    expect(r.recovery.kind).toBe('repaired');
    expect(r.recovery.rawPreserved).toBe(false);
    expect(r.recovery.canPersist).toBe(false);
    expect(r.recovery.message).toContain('Saving is paused');
    expect(storage.getItem(STORAGE_KEY)).toBe(raw); // the only copy is untouched
  });

  it('quarantines unparseable JSON and boots with defaults', () => {
    storage.setItem(STORAGE_KEY, '{"schemaVersion": ');
    const r = loadPersistedState();
    expect(r.state).toBeNull();
    expect(r.recovery.kind).toBe('unreadable');
    expect(r.recovery.rawPreserved).toBe(true);
    expect(storage.getItem(r.recovery.recoveryKey!)).toBe('{"schemaVersion": ');
  });

  it('suppresses persistence when unreadable state cannot be quarantined', () => {
    storage = storageWhereQuarantineFails({ [STORAGE_KEY]: '{"foo": 1}' }); // no schemaVersion
    (globalThis as { localStorage?: Storage }).localStorage = storage;
    const r = loadPersistedState();
    expect(r.state).toBeNull();
    expect(r.recovery.kind).toBe('unreadable');
    expect(r.recovery.rawPreserved).toBe(false);
    expect(r.recovery.canPersist).toBe(false);
    expect(storage.getItem(STORAGE_KEY)).toBe('{"foo": 1}');
  });

  it('never overwrites an earlier recovery record (unique keys)', () => {
    storage.setItem(STORAGE_KEY, '{"schemaVersion": ');
    const first = loadPersistedState();
    storage.setItem(STORAGE_KEY, '{"schemaVersion":  '); // different damage
    const second = loadPersistedState();
    expect(first.recovery.recoveryKey).not.toBe(second.recovery.recoveryKey);
    expect(storage.getItem(first.recovery.recoveryKey!)).toBe('{"schemaVersion": ');
    expect(storage.getItem(second.recovery.recoveryKey!)).toBe('{"schemaVersion":  ');
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

describe('buildResetState (DAV-002)', () => {
  it('an ordinary Reset keeps an explicitly deleted (null) profile null', () => {
    const current = { ...buildDefaultState(), healthProfile: null };
    expect(buildResetState(current, false).healthProfile).toBeNull();
  });

  it('an ordinary Reset preserves a non-null profile exactly', () => {
    const current = buildDefaultState();
    current.healthProfile = { ...current.healthProfile!, promptSummary: 'mine' };
    expect(buildResetState(current, false).healthProfile).toBe(current.healthProfile);
  });

  it('only the explicit delete option nulls a non-null profile', () => {
    const current = buildDefaultState();
    expect(current.healthProfile).not.toBeNull();
    expect(buildResetState(current, true).healthProfile).toBeNull();
  });

  it('a later ordinary Reset does not recreate a deleted profile', () => {
    const afterDelete = buildResetState(buildDefaultState(), true);
    expect(afterDelete.healthProfile).toBeNull();
    expect(buildResetState(afterDelete, false).healthProfile).toBeNull();
  });
});
