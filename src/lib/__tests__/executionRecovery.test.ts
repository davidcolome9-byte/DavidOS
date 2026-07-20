import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RECOVERY_KEY_PREFIX,
  STORAGE_KEY,
  inspectStructure,
  loadPersistedState,
  normalizeState,
} from '../storage/localStore';
import { buildDefaultState } from '../../data/defaultState';
import {
  applyTransition,
  createExecutionRecord,
  validateExecutionRecordsCollectionUnknown,
} from '../agents/executionRecords';
import type { AppState, ExecutionRecord } from '../types';

// DOS-AGT-001A review correction 1 — malformed PERSISTED execution records
// must go through the standard deep-validation → invalid classification →
// preserve-then-repair recovery contract, never silently reach the UI as
// canonical records, and never be "fixed up" into authorization.

/** Synthetic privacy marker. */
const PRIV = 'ZZPRIV';
const T0 = '2026-07-19T10:00:00.000Z';

function fakeLocalStorage() {
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
  } as Storage & { data: Map<string, string> };
}

let storage: ReturnType<typeof fakeLocalStorage>;

beforeEach(() => {
  storage = fakeLocalStorage();
  (globalThis as { localStorage?: Storage }).localStorage = storage;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
  vi.restoreAllMocks();
});

function validRecord(id = 'validrec01'): ExecutionRecord {
  const draft = createExecutionRecord(
    {
      title: 'Valid task',
      objective: 'Valid objective.',
      scope: 'Valid scope.',
      stopConditions: 'Valid stop conditions.',
      targetService: 'manual',
      sessionMode: 'plan_only',
    },
    T0,
    id,
  );
  return applyTransition(draft, 'ready', T0);
}

function stateWith(executionRecords: unknown): string {
  const state = { ...buildDefaultState(), healthProfile: null } as unknown as Record<string, unknown>;
  state.executionRecords = executionRecords;
  return JSON.stringify(state);
}

/**
 * Every malformed-record shape the review requires boot coverage for.
 * Each case contains EXACTLY ONE malformed record, so the correct repaired
 * collection is exactly [] — asserted directly, never via a loop that could
 * pass vacuously (review follow-up fix 1). Duplicate-id survival has its own
 * dedicated test below.
 */
const MALFORMED_CASES: Array<[string, unknown]> = [
  ['null entry', [null]],
  ['primitive entry', [42]],
  ['missing authority', [{ ...validRecord(), authority: undefined }]],
  ['malformed authority', [{ ...validRecord(), authority: { editCode: 'yes' } }]],
  ['unknown authority keys', [{ ...validRecord(), authority: { ...validRecord().authority, all: true } }]],
  ['missing evidence', [{ ...validRecord(), evidence: undefined }]],
  ['malformed evidence', [{ ...validRecord(), evidence: [{ id: 'e', kind: 'bogus', reference: ' ', addedAt: 'x' }] }]],
  ['missing approvalGates', [{ ...validRecord(), approvalGates: undefined }]],
  ['malformed approvalGates', [{ ...validRecord(), approvalGates: [{ id: '', label: ' ', decision: 'maybe' }] }]],
  ['invalid status', [{ ...validRecord(), status: `${PRIV}-status` }]],
  ['invalid timestamps', [{ ...validRecord(), createdAt: 'July 19, 2026' }]],
  ['missing required strings', [{ ...validRecord(), scope: undefined }]],
  ['contradictory lifecycle fields', [{ ...validRecord(), closedAt: T0 }]],
];

const DUPLICATE_CASE: [string, unknown] = [
  'duplicate record ids',
  [validRecord('duperec001'), { ...validRecord('duperec001'), title: 'Second copy' }],
];

describe('boot deep validation of executionRecords (review correction 1)', () => {
  it('a non-array collection classifies invalid and repairs to [] after preservation', () => {
    storage.data.set(STORAGE_KEY, stateWith('not-an-array'));
    const { state, recovery } = loadPersistedState();
    expect(recovery.kind).toBe('repaired');
    expect(recovery.rawPreserved).toBe(true);
    expect(recovery.canPersist).toBe(true);
    expect(recovery.message).toContain('executionRecords');
    expect(state!.executionRecords).toEqual([]);
  });

  for (const [label, records] of MALFORMED_CASES) {
    it(`${label}: triggers recovery, preserves the raw blob, and never reaches the UI`, () => {
      const raw = stateWith(records);
      storage.data.set(STORAGE_KEY, raw);
      const { state, recovery } = loadPersistedState();
      // Classified as lossy damage — the standard recovery contract ran and
      // persistence stays enabled only because preservation succeeded.
      expect(recovery.kind).toBe('repaired');
      expect(recovery.rawPreserved).toBe(true);
      expect(recovery.canPersist).toBe(true);
      expect(recovery.message).toContain('executionRecords');
      const key = recovery.recoveryKey!;
      expect(key.startsWith(RECOVERY_KEY_PREFIX)).toBe(true);
      // The exact original blob is preserved byte-identical.
      expect(storage.data.get(key)).toBe(raw);
      // The single malformed record was REMOVED: the canonical UI state
      // carries exactly no execution records (a direct assertion — this can
      // never pass vacuously).
      expect(state!.executionRecords).toEqual([]);
      const serialized = JSON.stringify(state!.executionRecords);
      expect(serialized).not.toContain(PRIV);
      expect(serialized).not.toContain('bogus');
      expect(serialized).not.toContain('"all":true');
    });
  }

  it('duplicate record ids: exactly the FIRST valid record survives, fully valid', () => {
    const [, records] = DUPLICATE_CASE;
    const raw = stateWith(records);
    storage.data.set(STORAGE_KEY, raw);
    const { state, recovery } = loadPersistedState();
    expect(recovery.kind).toBe('repaired');
    expect(recovery.rawPreserved).toBe(true);
    expect(storage.data.get(recovery.recoveryKey!)).toBe(raw);
    // Exactly one survivor: the first record; the duplicate was removed.
    expect(state!.executionRecords).toHaveLength(1);
    expect(state!.executionRecords[0].id).toBe('duperec001');
    expect(state!.executionRecords[0].title).toBe('Valid task'); // first, not 'Second copy'
    expect(state!.executionRecords.filter((r) => r.title === 'Second copy')).toEqual([]);
    // The surviving collection passes the full unknown-safe validation —
    // this assertion fails meaningfully if an invalid record ever survives.
    expect(validateExecutionRecordsCollectionUnknown(state!.executionRecords)).toEqual([]);
  });

  // Review follow-up fix 2: a hostile imported/persisted record ID must be
  // rejected AND must never leak into console diagnostics, recovery
  // messages, canonical state, or audit output — raw, excerpted, or
  // transformed. Console assertions inspect the ACTUAL mocked call
  // arguments, not merely suppressed output.
  const HOSTILE_IDS = [
    `${PRIV}-ID-MARKER`,
    'C:\\private\\repository\\secret-file.ts',
    'https://private.example/token/value',
    'refs/heads/private-branch',
    'sk-proj-FAKE-PRIVATE-TOKEN',
  ];
  const HOSTILE_FRAGMENTS = [
    PRIV, 'ID-MARKER', 'secret-file', 'private.example', 'token/value',
    'private-branch', 'sk-proj', 'FAKE-PRIVATE-TOKEN', 'C:\\private',
  ];

  for (const hostileId of HOSTILE_IDS) {
    it(`hostile record id is quarantined without leaking: ${hostileId.slice(0, 12)}…`, () => {
      const raw = stateWith([{ ...validRecord(), id: hostileId }]);
      storage.data.set(STORAGE_KEY, raw);
      const { state, recovery } = loadPersistedState();
      // Rejected by validation → routed through recovery; nothing survives.
      expect(recovery.kind).toBe('repaired');
      expect(recovery.rawPreserved).toBe(true);
      expect(state!.executionRecords).toEqual([]);
      // Diagnostics stay value-free: safe field names only.
      expect(recovery.message).toContain('executionRecords');
      // Gather EVERY console argument actually emitted during the load.
      const consoleArgs = [console.warn, console.info, console.error]
        .flatMap((fn) => vi.mocked(fn).mock.calls.flat())
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg) ?? String(arg)))
        .join('\n');
      const surfaces: Array<[string, string]> = [
        ['console output', consoleArgs],
        ['recovery message', recovery.message],
        ['canonical state', JSON.stringify(state)],
        ['audit output', JSON.stringify(state!.auditLog)],
      ];
      for (const [surface, text] of surfaces) {
        expect(text, `${surface} must not carry the hostile id`).not.toContain(hostileId);
        for (const fragment of HOSTILE_FRAGMENTS) {
          expect(text, `${surface} must not carry fragment "${fragment}"`).not.toContain(fragment);
        }
      }
    });
  }

  it('when preservation fails, persistence is suppressed — never dishonestly reported', () => {
    const raw = stateWith([null]);
    storage.data.set(STORAGE_KEY, raw);
    const rawSet = storage.setItem.bind(storage);
    storage.setItem = (k: string, v: string) => {
      if (k.startsWith(RECOVERY_KEY_PREFIX)) throw new Error('QuotaExceededError');
      rawSet(k, v);
    };
    const { recovery } = loadPersistedState();
    expect(recovery.kind).toBe('repaired');
    expect(recovery.rawPreserved).toBe(false);
    expect(recovery.canPersist).toBe(false);
    // The stored original was NOT overwritten.
    expect(storage.data.get(STORAGE_KEY)).toBe(raw);
  });

  it('valid legacy state without executionRecords still loads silently with []', () => {
    const legacy = { ...buildDefaultState(), healthProfile: null } as unknown as Record<string, unknown>;
    delete legacy.executionRecords;
    storage.data.set(STORAGE_KEY, JSON.stringify(legacy));
    const { state, recovery } = loadPersistedState();
    expect(recovery.kind).toBe('migrated'); // additive backfill, nothing lost
    expect(recovery.canPersist).toBe(true);
    expect(state!.executionRecords).toEqual([]);
  });

  it('valid records load exactly, unchanged, with clean recovery', () => {
    const record = validRecord();
    storage.data.set(STORAGE_KEY, stateWith([JSON.parse(JSON.stringify(record))]));
    const { state, recovery } = loadPersistedState();
    expect(recovery.kind).toBe('none');
    expect(state!.executionRecords).toEqual(JSON.parse(JSON.stringify([record])));
  });

  it('unrelated AppState data survives an executionRecords repair', () => {
    const base = { ...buildDefaultState(), healthProfile: null };
    const raw = JSON.stringify({ ...base, executionRecords: [null] });
    storage.data.set(STORAGE_KEY, raw);
    const { state } = loadPersistedState();
    expect(state!.priorities).toEqual(base.priorities);
    expect(state!.projects).toEqual(base.projects);
    expect(state!.settings).toEqual(base.settings);
  });

  it('inspectStructure and normalizeState agree on every malformed case', () => {
    for (const [label, records] of [...MALFORMED_CASES, DUPLICATE_CASE]) {
      const state = JSON.parse(stateWith(records)) as AppState;
      const report = inspectStructure(state);
      expect(report.invalid, label).toContain('executionRecords');
      const normalized = normalizeState(state);
      // Whatever survives normalization passes the FULL unknown-safe
      // validation — nothing malformed passes through, and nothing is
      // fabricated into authorization. (Single-malformed cases survive as
      // []; the duplicate case survives as exactly one valid record.)
      expect(validateExecutionRecordsCollectionUnknown(normalized.executionRecords), label).toEqual([]);
      expect(
        normalized.executionRecords.length,
        label,
      ).toBe(label === 'duplicate record ids' ? 1 : 0);
    }
  });
});
