import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RECOVERY_KEY_PREFIX,
  STORAGE_KEY,
  inspectStructure,
  isPlainObject,
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

describe('isPlainObject (prototype policy: Object.prototype only)', () => {
  it('accepts ordinary records and JSON.parse results', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ theme: 'dark' })).toBe(true);
    expect(isPlainObject(JSON.parse('{"a":1}'))).toBe(true);
  });

  it('rejects null, undefined, and primitives', () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject('record')).toBe(false);
    expect(isPlainObject(42)).toBe(false);
  });

  it('rejects arrays', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(['dark'])).toBe(false);
  });

  it('rejects exotic objects: Date, Map, Set, RegExp, class instances', () => {
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(new Set())).toBe(false);
    expect(isPlainObject(/re/)).toBe(false);
    class Exotic {
      theme = 'dark';
    }
    expect(isPlainObject(new Exotic())).toBe(false);
  });

  it('rejects null-prototype objects (never produced by valid flows)', () => {
    expect(isPlainObject(Object.create(null))).toBe(false);
  });
});

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

  // DAV-001-A: arrays satisfy `typeof === 'object'` — they must classify as
  // lossy (invalid), never as valid objects or as merely-missing fields.
  it('classifies a non-empty ARRAY-valued settings as lossy, not missing', () => {
    const report = inspectStructure({
      ...buildDefaultState(),
      settings: ['dark'],
    } as unknown as AppState);
    expect(report.invalid).toContain('settings');
    expect(report.missing).not.toContain('settings');
    expect(report.missing).not.toContain('settings.theme');
  });

  it('classifies an array-valued healthProfile as lossy', () => {
    const report = inspectStructure({
      ...buildDefaultState(),
      healthProfile: [],
    } as unknown as AppState);
    expect(report.invalid).toContain('healthProfile');
  });

  it('classifies array items inside collections as lossy', () => {
    const report = inspectStructure({
      ...buildDefaultState(),
      priorities: [['not', 'an', 'object']],
    } as unknown as AppState);
    expect(report.invalid).toContain('priorities');
  });

  it('a valid plain-object settings stays clean; a missing settings is additive', () => {
    expect(inspectStructure(buildDefaultState()).invalid).toEqual([]);
    const noSettings = { ...buildDefaultState() } as Partial<AppState>;
    delete noSettings.settings;
    const report = inspectStructure(noSettings as AppState);
    expect(report.missing).toContain('settings');
    expect(report.invalid).toEqual([]);
  });

  // DAV-001-A-R1: exotic prototypes must classify as LOSSY (invalid) in
  // inspectStructure — and normalizeState replaces them, so the only route
  // to persistence is the protected lossy-recovery path. Never "missing".
  it('classifies exotic-prototype values as lossy in agreement with normalizeState', () => {
    class Exotic {
      theme = 'dark';
    }
    const cases: Array<[string, Partial<AppState>]> = [
      ['settings (Date)', { settings: new Date() as unknown as AppState['settings'] }],
      ['settings (class instance)', { settings: new Exotic() as unknown as AppState['settings'] }],
      ['healthProfile (Map)', { healthProfile: new Map() as unknown as AppState['healthProfile'] }],
      ['healthProfile (class instance)', { healthProfile: new Exotic() as unknown as AppState['healthProfile'] }],
    ];
    for (const [label, patch] of cases) {
      const state = { ...buildDefaultState(), ...patch } as AppState;
      const report = inspectStructure(state);
      const field = label.split(' ')[0];
      expect(report.invalid, label).toContain(field);
      expect(report.missing, label).not.toContain(field);
      // normalizeState repairs the exotic value away (replacement, not keep)
      const repaired = normalizeState(state);
      expect(isPlainObject(repaired.settings), label).toBe(true);
      expect(
        repaired.healthProfile === null || isPlainObject(repaired.healthProfile),
        label,
      ).toBe(true);
    }
  });

  it('classifies a collection containing a non-plain object (Date item) as lossy', () => {
    const state = {
      ...buildDefaultState(),
      priorities: [new Date()],
    } as unknown as AppState;
    expect(inspectStructure(state).invalid).toContain('priorities');
    expect(normalizeState(state).priorities).toEqual([]); // dropped via repair
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

  // DAV-001-A: array-valued settings is a lossy repair → quarantine first.
  it('quarantines before repairing an array-valued settings', () => {
    const raw = JSON.stringify({ ...buildDefaultState(), settings: ['dark'] });
    storage.setItem(STORAGE_KEY, raw);
    const r = loadPersistedState();
    expect(r.recovery.kind).toBe('repaired');
    expect(r.recovery.rawPreserved).toBe(true);
    expect(storage.getItem(r.recovery.recoveryKey!)).toBe(raw); // byte-identical
    expect(r.state!.settings).toEqual({ theme: 'dark' });
  });

  it('suppresses persistence for an array-valued settings when quarantine fails', () => {
    const raw = JSON.stringify({ ...buildDefaultState(), settings: ['dark'] });
    storage = storageWhereQuarantineFails({ [STORAGE_KEY]: raw });
    (globalThis as { localStorage?: Storage }).localStorage = storage;
    const r = loadPersistedState();
    expect(r.recovery.kind).toBe('repaired');
    expect(r.recovery.canPersist).toBe(false);
    expect(storage.getItem(STORAGE_KEY)).toBe(raw); // only copy untouched
  });

  // DAV-001-B: an EXISTING empty string is an unreadable blob, not a fresh
  // install — it must enter the recovery path.
  it('treats an empty-string blob as unreadable and preserves it', () => {
    storage.setItem(STORAGE_KEY, '');
    const r = loadPersistedState();
    expect(r.state).toBeNull();
    expect(r.recovery.kind).toBe('unreadable');
    expect(r.recovery.rawPreserved).toBe(true);
    expect(r.recovery.canPersist).toBe(true);
    expect(storage.getItem(r.recovery.recoveryKey!)).toBe('');
  });

  it('suppresses persistence when an empty-string blob cannot be preserved', () => {
    storage = storageWhereQuarantineFails({ [STORAGE_KEY]: '' });
    (globalThis as { localStorage?: Storage }).localStorage = storage;
    const r = loadPersistedState();
    expect(r.state).toBeNull();
    expect(r.recovery.kind).toBe('unreadable');
    expect(r.recovery.rawPreserved).toBe(false);
    expect(r.recovery.canPersist).toBe(false);
    expect(r.recovery.message).toContain('Saving is paused');
    expect(storage.getItem(STORAGE_KEY)).toBe(''); // untouched
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

// DOS-WF-001R Phase 2C — data from a NEWER DavidOS must not be loaded, repaired,
// or overwritten at boot; it is preserved and the app runs blank + read-only.
describe('forward-version guard at boot', () => {
  it('rejects newer-schema data, preserves it, and refuses to persist over it', () => {
    const future = { ...buildDefaultState(), schemaVersion: 999 };
    storage.data.set(STORAGE_KEY, JSON.stringify(future));
    const result = loadPersistedState();
    expect(result.state).toBeNull();
    expect(result.recovery.canPersist).toBe(false);
    expect(result.recovery.message).toMatch(/newer version/i);
    // The original newer-version blob is left exactly as-is.
    expect(storage.data.get(STORAGE_KEY)).toBe(JSON.stringify(future));
  });

  it('still loads current-schema data normally', () => {
    storage.data.set(STORAGE_KEY, JSON.stringify(buildDefaultState()));
    expect(loadPersistedState().state).not.toBeNull();
  });
});
