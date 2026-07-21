import { describe, expect, it } from 'vitest';
import { buildDefaultState } from '../../data/defaultState';
import {
  JOURNAL_GENERATION_PREFIX,
  JOURNAL_HEAD_KEYS,
  JOURNAL_LOCK_NAME,
  LEGACY_STATE_KEY,
  commitJournalState,
  browserLockCoordinator,
  journalGenerationKey,
  migrateLegacyState,
  selectJournalAuthority,
} from '../storage/stateJournal';
import type { ExclusiveLockCoordinator } from '../storage/stateJournal';

function memoryStorage() {
  const store = new Map<string, string>();
  const ops: Array<['set' | 'remove', string, string?]> = [];
  return {
    store,
    ops,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { ops.push(['set', key, value]); store.set(key, value); },
    removeItem: (key: string) => { ops.push(['remove', key]); store.delete(key); },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  } as Storage & { store: Map<string, string>; ops: Array<['set' | 'remove', string, string?]> };
}

class SerializedLocks implements ExclusiveLockCoordinator {
  active = 0;
  maxActive = 0;
  names: string[] = [];
  private tail: Promise<void> = Promise.resolve();

  async requestExclusive<T>(name: string, callback: () => Promise<T>) {
    this.names.push(name);
    const prior = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try { return { status: 'acquired' as const, value: await callback() }; }
    finally { this.active -= 1; release(); }
  }
}

function ids(prefix: string) {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(8, '0')}`;
}

const state = (marker: string) => ({ ...buildDefaultState(), settings: { theme: marker === 'light' ? 'light' as const : 'dark' as const } });

async function commit(storage: Storage, locks: ExclusiveLockCoordinator, expected: string | null, prefix: string, marker = 'dark') {
  return commitJournalState(state(marker), { storage, coordinator: locks, expectedGeneration: expected, idFactory: ids(prefix) });
}

describe('immutable generation journal', () => {
  it('serializes mutation sections and rejects stale authority after lock acquisition without writes', async () => {
    const storage = memoryStorage();
    const locks = new SerializedLocks();
    const [a, b] = await Promise.all([
      commit(storage, locks, null, 'transaction-a'),
      commit(storage, locks, null, 'transaction-b'),
    ]);
    expect(a.ok).toBe(true);
    expect(b).toEqual({ ok: false, reason: 'stale_authority', uncertain: false });
    expect(locks.maxActive).toBe(1);
    expect(locks.names).toEqual([JOURNAL_LOCK_NAME, JOURNAL_LOCK_NAME]);
    expect(storage.ops.filter(([op, key]) => op === 'set' && key.startsWith(JOURNAL_GENERATION_PREFIX))).toHaveLength(1);
    expect(storage.ops.filter(([op, key]) => op === 'set' && JOURNAL_HEAD_KEYS.includes(key as never))).toHaveLength(1);
  });

  it('B commits Y before delayed A obtains the lock; A observes Y and leaves it byte-identical', async () => {
    const storage = memoryStorage();
    const locks = new SerializedLocks();
    const b = await commit(storage, locks, null, 'winner-b', 'light');
    expect(b.ok).toBe(true);
    if (!b.ok) throw new Error('synthetic setup failed');
    const yRaw = storage.getItem(journalGenerationKey(b.authority.generationId));
    const opsBefore = storage.ops.length;
    const a = await commit(storage, locks, null, 'stale-a');
    expect(a).toEqual({ ok: false, reason: 'stale_authority', uncertain: false });
    expect(selectJournalAuthority(storage).authority?.generationId).toBe(b.authority.generationId);
    expect(storage.getItem(journalGenerationKey(b.authority.generationId))).toBe(yRaw);
    expect(storage.ops).toHaveLength(opsBefore);
  });

  it('alternates heads, increases sequences, keeps metadata value-free, and never overwrites committed generations', async () => {
    const storage = memoryStorage();
    const locks = new SerializedLocks();
    const first = await commit(storage, locks, null, 'first-txn');
    if (!first.ok) throw new Error('synthetic setup failed');
    const firstRaw = storage.getItem(journalGenerationKey(first.authority.generationId));
    const second = await commit(storage, locks, first.authority.generationId, 'second-txn', 'light');
    if (!second.ok) throw new Error('synthetic setup failed');
    expect(first.authority.sequence).toBe(1);
    expect(second.authority.sequence).toBe(2);
    expect(first.authority.headKey).not.toBe(second.authority.headKey);
    expect(storage.getItem(journalGenerationKey(first.authority.generationId))).toBe(firstRaw);
    const headText = storage.getItem(second.authority.headKey)!;
    expect(headText).not.toContain('settings');
    expect(headText).not.toContain('light');
    expect(headText).not.toContain('priorities');
  });

  it('has no destructive rollback when candidate verification fails', async () => {
    const base = memoryStorage();
    const locks = new SerializedLocks();
    const first = await commit(base, locks, null, 'base-txn');
    if (!first.ok) throw new Error('synthetic setup failed');
    const oldHead = base.getItem(first.authority.headKey);
    let generationWrites = 0;
    const storage = Object.create(base) as Storage;
    storage.setItem = (key: string, value: string) => {
      if (key.startsWith(JOURNAL_GENERATION_PREFIX)) {
        generationWrites += 1;
        base.store.set(key, value.slice(0, 12));
      } else base.setItem(key, value);
    };
    const result = await commit(storage, locks, first.authority.generationId, 'bad-candidate');
    expect(result).toEqual({ ok: false, reason: 'candidate_verification_failed', uncertain: false });
    expect(generationWrites).toBe(1);
    expect(base.getItem(first.authority.headKey)).toBe(oldHead);
    expect(base.ops.filter(([op]) => op === 'remove')).toEqual([]);
    expect(selectJournalAuthority(base).authority?.generationId).toBe(first.authority.generationId);
  });

  it('head verification uncertainty preserves the old head and pauses the caller', async () => {
    const base = memoryStorage();
    const locks = new SerializedLocks();
    const first = await commit(base, locks, null, 'base-head');
    if (!first.ok) throw new Error('synthetic setup failed');
    const oldHeadRaw = base.getItem(first.authority.headKey);
    const storage = Object.create(base) as Storage;
    storage.setItem = (key: string, value: string) => {
      if (JOURNAL_HEAD_KEYS.includes(key as never)) base.store.set(key, value.slice(0, 20));
      else base.setItem(key, value);
    };
    const result = await commit(storage, locks, first.authority.generationId, 'bad-head');
    expect(result).toEqual({ ok: false, reason: 'head_verification_failed', uncertain: true });
    expect(base.getItem(first.authority.headKey)).toBe(oldHeadRaw);
    expect(selectJournalAuthority(base).authority?.generationId).toBe(first.authority.generationId);
  });

  it('does not write when Web Locks coordination is unavailable', async () => {
    const storage = memoryStorage();
    const result = await commitJournalState(buildDefaultState(), { storage, coordinator: null, expectedGeneration: null });
    expect(result).toEqual({ ok: false, reason: 'unsupported_lock', uncertain: false });
    expect(storage.ops).toEqual([]);
  });

  it('an uncertain head write that actually landed is resolved by boot selection without rollback', async () => {
    const base = memoryStorage();
    const locks = new SerializedLocks();
    const first = await commit(base, locks, null, 'uncertain-base');
    if (!first.ok) throw new Error('synthetic setup failed');
    const storage = Object.create(base) as Storage;
    storage.setItem = (key: string, value: string) => {
      base.setItem(key, value);
      if (JOURNAL_HEAD_KEYS.includes(key as never)) throw new Error('synthetic post-write failure');
    };
    const result = await commit(storage, locks, first.authority.generationId, 'uncertain-new', 'light');
    expect(result).toEqual({ ok: false, reason: 'head_write_failed', uncertain: true });
    const reconciled = selectJournalAuthority(base).authority;
    expect(reconciled?.generationId).not.toBe(first.authority.generationId);
    expect(JSON.parse(reconciled!.raw).settings.theme).toBe('light');
    expect(base.store.has(journalGenerationKey(first.authority.generationId))).toBe(true);
    expect(base.ops.filter(([op]) => op === 'remove')).toEqual([]);
  });
});

describe('boot reconciliation and retention', () => {
  it('ignores valid and malformed orphan candidates while old heads remain authoritative', async () => {
    const storage = memoryStorage();
    const locks = new SerializedLocks();
    const first = await commit(storage, locks, null, 'old-authority');
    if (!first.ok) throw new Error('synthetic setup failed');
    storage.store.set(journalGenerationKey('orphan-valid-0001'), JSON.stringify(state('light')));
    storage.store.set(journalGenerationKey('orphan-broken-001'), '{private-looking-fragment');
    expect(selectJournalAuthority(storage).authority?.generationId).toBe(first.authority.generationId);
  });

  it('chooses the highest valid head and falls back when the highest references missing or invalid data', async () => {
    const storage = memoryStorage();
    const locks = new SerializedLocks();
    const one = await commit(storage, locks, null, 'head-one');
    if (!one.ok) throw new Error('synthetic setup failed');
    const two = await commit(storage, locks, one.authority.generationId, 'head-two', 'light');
    if (!two.ok) throw new Error('synthetic setup failed');
    expect(selectJournalAuthority(storage).authority?.generationId).toBe(two.authority.generationId);

    storage.store.delete(journalGenerationKey(two.authority.generationId));
    expect(selectJournalAuthority(storage)).toMatchObject({ authority: { generationId: one.authority.generationId }, reconciliationNeeded: true });
    storage.store.set(journalGenerationKey(two.authority.generationId), '{invalid');
    expect(selectJournalAuthority(storage).authority?.generationId).toBe(one.authority.generationId);
  });

  it('survives one malformed head and cleans orphans only after a verified commit', async () => {
    const storage = memoryStorage();
    const locks = new SerializedLocks();
    const one = await commit(storage, locks, null, 'retain-one');
    if (!one.ok) throw new Error('synthetic setup failed');
    storage.store.set(journalGenerationKey('orphan-clean-0001'), JSON.stringify(state('light')));
    expect(storage.store.has(journalGenerationKey('orphan-clean-0001'))).toBe(true);
    const two = await commit(storage, locks, one.authority.generationId, 'retain-two');
    if (!two.ok) throw new Error('synthetic setup failed');
    expect(storage.store.has(journalGenerationKey('orphan-clean-0001'))).toBe(false);
    expect(storage.store.has(journalGenerationKey(one.authority.generationId))).toBe(true);
    expect(storage.store.has(journalGenerationKey(two.authority.generationId))).toBe(true);
    storage.store.set(one.authority.headKey, '{malformed');
    expect(selectJournalAuthority(storage).authority?.generationId).toBe(two.authority.generationId);
  });

  it('cleanup failure does not invalidate a verified commit and repeated commits stay bounded', async () => {
    const base = memoryStorage();
    const locks = new SerializedLocks();
    const storage = Object.create(base) as Storage;
    Object.defineProperty(storage, 'length', { get: () => { throw new Error('synthetic cleanup failure'); } });
    const first = await commit(storage, locks, null, 'cleanup-fail');
    expect(first).toMatchObject({ ok: true, cleanupFailed: true });

    const bounded = memoryStorage();
    let expected: string | null = null;
    for (let i = 0; i < 8; i += 1) {
      const result = await commit(bounded, locks, expected, `bounded-${i}`);
      if (!result.ok) throw new Error('synthetic setup failed');
      expected = result.authority.generationId;
    }
    expect([...bounded.store.keys()].filter((key) => key.startsWith(JOURNAL_GENERATION_PREFIX)).length).toBeLessThanOrEqual(3);
  });
});

describe('legacy migration', () => {
  it('creates and verifies an initial journal while preserving legacy bytes exactly', async () => {
    const storage = memoryStorage();
    const legacy = `  ${JSON.stringify(buildDefaultState())}\n`;
    storage.store.set(LEGACY_STATE_KEY, legacy);
    const result = await migrateLegacyState({ storage, coordinator: new SerializedLocks(), idFactory: ids('migration') });
    expect(result).toMatchObject({ ok: true, migrated: true });
    expect(storage.getItem(LEGACY_STATE_KEY)).toBe(legacy);
    expect(selectJournalAuthority(storage).authority).not.toBeNull();
  });

  it('a generation-only interrupted migration leaves legacy authoritative', async () => {
    const base = memoryStorage();
    const legacy = JSON.stringify(buildDefaultState());
    base.store.set(LEGACY_STATE_KEY, legacy);
    const storage = Object.create(base) as Storage;
    storage.setItem = (key: string, value: string) => {
      if (JOURNAL_HEAD_KEYS.includes(key as never)) throw new Error('synthetic crash');
      base.setItem(key, value);
    };
    const result = await migrateLegacyState({ storage, coordinator: new SerializedLocks(), idFactory: ids('crash-migrate') });
    expect(result).toEqual({ ok: false, reason: 'head_write_failed', uncertain: true });
    expect(selectJournalAuthority(base).authority).toBeNull();
    expect(base.getItem(LEGACY_STATE_KEY)).toBe(legacy);
  });

  it('a head-write verification interruption is uncertain but preserves a valid landed head and legacy bytes', async () => {
    const base = memoryStorage();
    const legacy = JSON.stringify(buildDefaultState());
    base.store.set(LEGACY_STATE_KEY, legacy);
    const storage = Object.create(base) as Storage;
    let headWritten = false;
    let verificationInterrupted = false;
    storage.setItem = (key: string, value: string) => {
      base.setItem(key, value);
      if (JOURNAL_HEAD_KEYS.includes(key as never)) headWritten = true;
    };
    storage.getItem = (key: string) => {
      if (headWritten && !verificationInterrupted && JOURNAL_HEAD_KEYS.includes(key as never)) {
        verificationInterrupted = true;
        return null;
      }
      return base.getItem(key);
    };

    const result = await migrateLegacyState({ storage, coordinator: new SerializedLocks(), idFactory: ids('head-interrupt') });

    expect(result).toEqual({ ok: false, reason: 'head_verification_failed', uncertain: true });
    expect(selectJournalAuthority(base).authority).not.toBeNull();
    expect(base.getItem(LEGACY_STATE_KEY)).toBe(legacy);
  });

  it('a valid journal remains authoritative despite a later old-tab legacy write', async () => {
    const storage = memoryStorage();
    storage.store.set(LEGACY_STATE_KEY, JSON.stringify(state('dark')));
    const migrated = await migrateLegacyState({ storage, coordinator: new SerializedLocks(), idFactory: ids('priority') });
    if (!migrated.ok) throw new Error('synthetic setup failed');
    const generation = migrated.authority.generationId;
    storage.store.set(LEGACY_STATE_KEY, JSON.stringify(state('light')));
    expect(selectJournalAuthority(storage).authority?.generationId).toBe(generation);
  });
});

describe('browser Web Locks adapter', () => {
  it('distinguishes acquired callbacks, request failures, callback failures, and unavailability', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    try {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { locks: { request: async (_name: string, _options: LockOptions, callback: () => Promise<unknown>) => callback() } },
      });
      const acquired = browserLockCoordinator();
      expect(await acquired!.requestExclusive(JOURNAL_LOCK_NAME, async () => 'verified')).toEqual({
        status: 'acquired', value: 'verified',
      });
      expect(await acquired!.requestExclusive(JOURNAL_LOCK_NAME, async () => { throw new Error('synthetic callback'); })).toEqual({
        status: 'callback_failed',
      });

      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { locks: { request: async () => { throw new Error('synthetic request'); } } },
      });
      expect(await browserLockCoordinator()!.requestExclusive(JOURNAL_LOCK_NAME, async () => 'unused')).toEqual({
        status: 'request_failed',
      });

      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
      expect(browserLockCoordinator()).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, 'navigator', original);
      else Reflect.deleteProperty(globalThis, 'navigator');
    }
  });
});
