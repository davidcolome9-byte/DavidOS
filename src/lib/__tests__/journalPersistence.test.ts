import { describe, expect, it } from 'vitest';
import { buildDefaultState } from '../../data/defaultState';
import { JournalPersistenceController } from '../storage/journalPersistence';
import {
  JOURNAL_GENERATION_PREFIX,
  JOURNAL_HEAD_KEYS,
  LEGACY_STATE_KEY,
  commitJournalState,
  selectJournalAuthority,
} from '../storage/stateJournal';
import type { ExclusiveLockCoordinator } from '../storage/stateJournal';

function memoryStorage() {
  const data = new Map<string, string>();
  const ops: Array<['set' | 'remove', string, string?]> = [];
  return {
    data,
    ops,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { ops.push(['set', key, value]); data.set(key, value); },
    removeItem: (key: string) => { ops.push(['remove', key]); data.delete(key); },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  } as Storage & { data: Map<string, string>; ops: Array<['set' | 'remove', string, string?]> };
}

class SerializedLocks implements ExclusiveLockCoordinator {
  private tail: Promise<void> = Promise.resolve();

  async requestExclusive<T>(_name: string, callback: () => Promise<T>) {
    const prior = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    try { return { status: 'acquired' as const, value: await callback() }; }
    finally { release(); }
  }
}

class PausedSecondRequest implements ExclusiveLockCoordinator {
  requests = 0;
  private releaseSecond!: () => void;
  secondWaiting = new Promise<void>((resolve) => { this.markWaiting = resolve; });
  private markWaiting!: () => void;
  private secondGate = new Promise<void>((resolve) => { this.releaseSecond = resolve; });

  async requestExclusive<T>(_name: string, callback: () => Promise<T>) {
    this.requests += 1;
    if (this.requests === 2) {
      this.markWaiting();
      await this.secondGate;
    }
    return { status: 'acquired' as const, value: await callback() };
  }

  release(): void { this.releaseSecond(); }
}

function ids(prefix: string) {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(8, '0')}`;
}

function state(theme: 'dark' | 'light' = 'dark', label?: string) {
  const base = buildDefaultState();
  return {
    ...base,
    settings: { theme },
    openLoops: label ? [{ id: `synthetic-${label}`, label, status: 'open' as const, createdAt: 'synthetic' }] : [],
  };
}

function controller(
  storage: Storage,
  coordinator: ExclusiveLockCoordinator | null,
  idFactory = ids('controller'),
) {
  return new JournalPersistenceController({
    storage,
    coordinator,
    committedGeneration: null,
    sequence: 0,
    reconciliationRequired: false,
    preservationFailed: false,
    idFactory,
  });
}

function generationWrites(storage: ReturnType<typeof memoryStorage>) {
  return storage.ops.filter(([op, key]) => op === 'set' && key.startsWith(JOURNAL_GENERATION_PREFIX));
}

function headWrites(storage: ReturnType<typeof memoryStorage>) {
  return storage.ops.filter(([op, key]) => op === 'set' && JOURNAL_HEAD_KEYS.includes(key as never));
}

describe('production journal persistence controller', () => {
  it('migrates legacy bytes once under a shared lock and both tabs observe the committed head', async () => {
    const storage = memoryStorage();
    const legacy = ` ${JSON.stringify(state())}\n`;
    storage.data.set(LEGACY_STATE_KEY, legacy);
    const locks = new SerializedLocks();
    const a = controller(storage, locks, ids('tab-a'));
    const b = controller(storage, locks, ids('tab-b'));

    await Promise.all([a.initialize(), b.initialize()]);

    expect(generationWrites(storage)).toHaveLength(1);
    expect(headWrites(storage)).toHaveLength(1);
    expect(a.getAuthority().committedGeneration).toBe(b.getAuthority().committedGeneration);
    expect(storage.getItem(LEGACY_STATE_KEY)).toBe(legacy);
  });

  it('unsupported Web Locks performs no migration or automatic-save mutation', async () => {
    const storage = memoryStorage();
    const legacy = JSON.stringify(state());
    storage.data.set(LEGACY_STATE_KEY, legacy);
    const persistence = controller(storage, null);
    persistence.enqueue(state('light'));
    await persistence.initialize();
    await persistence.whenIdle();

    expect(storage.ops).toEqual([]);
    expect(storage.getItem(LEGACY_STATE_KEY)).toBe(legacy);
    expect(persistence.getAuthority()).toMatchObject({
      persistenceAvailable: false,
      committedGeneration: null,
      lastFailure: 'unsupported_lock',
    });
  });

  it('unresolved head evidence blocks migration without creating a candidate', async () => {
    const storage = memoryStorage();
    storage.data.set(LEGACY_STATE_KEY, JSON.stringify(state()));
    storage.data.set(JOURNAL_HEAD_KEYS[0], '{malformed');
    const persistence = controller(storage, new SerializedLocks());
    await persistence.initialize();

    expect(generationWrites(storage)).toHaveLength(0);
    expect(persistence.getAuthority()).toMatchObject({
      persistenceAvailable: false,
      reconciliationRequired: true,
    });
  });

  it('coalesces unsent snapshots and leaves the newest state as final authority', async () => {
    const storage = memoryStorage();
    storage.data.set(LEGACY_STATE_KEY, JSON.stringify(state()));
    const locks = new PausedSecondRequest();
    const persistence = controller(storage, locks, ids('coalesce'));
    await persistence.initialize();

    persistence.enqueue(state('dark', 'first'));
    await locks.secondWaiting;
    persistence.enqueue(state('light', 'superseded'));
    persistence.enqueue(state('light', 'newest'));
    locks.release();
    await persistence.whenIdle();

    const selected = selectJournalAuthority(storage).authority!;
    expect(JSON.parse(selected.raw).openLoops[0].label).toBe('newest');
    const payloads = generationWrites(storage).map(([, , raw]) => raw ?? '');
    expect(JSON.parse(payloads[0]).openLoops).toEqual([]);
    expect(JSON.parse(payloads[payloads.length - 1]).openLoops[0].label).toBe('newest');
    expect(payloads.some((raw) => raw.includes('superseded'))).toBe(false);
  });

  it('rejects a local snapshot as stale after an external head advances while its lock waits', async () => {
    const storage = memoryStorage();
    storage.data.set(LEGACY_STATE_KEY, JSON.stringify(state()));
    const locks = new PausedSecondRequest();
    const persistence = controller(storage, locks, ids('local'));
    await persistence.initialize();
    const before = generationWrites(storage).length;

    persistence.enqueue(state('dark', 'stale-local'));
    await locks.secondWaiting;
    const current = selectJournalAuthority(storage).authority!;
    const external = await commitJournalState(state('light', 'external'), {
      storage,
      coordinator: new SerializedLocks(),
      expectedGeneration: current.generationId,
      idFactory: ids('external'),
    });
    expect(external.ok).toBe(true);
    locks.release();
    await persistence.whenIdle();

    expect(generationWrites(storage)).toHaveLength(before + 1);
    expect(selectJournalAuthority(storage).authority?.raw).toContain('external');
    expect(persistence.getAuthority()).toMatchObject({ externalChange: true, persistenceAvailable: false });
  });

  it('equivalent state is a no-op and one logical update advances one generation and one head', async () => {
    const storage = memoryStorage();
    const initial = state();
    storage.data.set(LEGACY_STATE_KEY, JSON.stringify(initial));
    const persistence = controller(storage, new SerializedLocks(), ids('single'));
    await persistence.initialize();
    const generations = generationWrites(storage).length;
    const heads = headWrites(storage).length;

    persistence.enqueue(initial);
    persistence.enqueue(initial);
    await persistence.whenIdle();
    expect(generationWrites(storage)).toHaveLength(generations);

    persistence.enqueue(state('light', 'one-update'));
    await persistence.whenIdle();
    expect(generationWrites(storage)).toHaveLength(generations + 1);
    expect(headWrites(storage)).toHaveLength(heads + 1);
  });

  it('a safe provider write failure suppresses every later automatic write', async () => {
    const base = memoryStorage();
    base.data.set(LEGACY_STATE_KEY, JSON.stringify(state()));
    let failCandidates = false;
    const storage = Object.create(base) as Storage;
    storage.setItem = (key: string, value: string) => {
      if (failCandidates && key.startsWith(JOURNAL_GENERATION_PREFIX)) throw new Error('synthetic quota');
      base.setItem(key, value);
    };
    const persistence = controller(storage, new SerializedLocks(), ids('failure'));
    await persistence.initialize();
    failCandidates = true;
    const before = generationWrites(base).length;

    persistence.enqueue(state('light', 'fails'));
    await persistence.whenIdle();
    persistence.enqueue(state('dark', 'must-not-run'));
    await persistence.whenIdle();

    expect(generationWrites(base)).toHaveLength(before);
    expect(persistence.getAuthority()).toMatchObject({ persistenceAvailable: false, lastFailure: 'candidate_write_failed' });
  });

  it('an uncertain provider outcome suppresses every later automatic write', async () => {
    const base = memoryStorage();
    base.data.set(LEGACY_STATE_KEY, JSON.stringify(state()));
    let failHeads = false;
    const storage = Object.create(base) as Storage;
    storage.setItem = (key: string, value: string) => {
      base.setItem(key, value);
      if (failHeads && JOURNAL_HEAD_KEYS.includes(key as never)) throw new Error('synthetic post-write interruption');
    };
    const persistence = controller(storage, new SerializedLocks(), ids('uncertain'));
    await persistence.initialize();
    failHeads = true;

    persistence.enqueue(state('light', 'uncertain'));
    await persistence.whenIdle();
    const afterUncertain = generationWrites(base).length;
    persistence.enqueue(state('dark', 'must-not-run'));
    await persistence.whenIdle();

    expect(generationWrites(base)).toHaveLength(afterUncertain);
    expect(persistence.getAuthority()).toMatchObject({
      persistenceAvailable: false,
      outcomeUncertain: true,
      lastFailure: 'head_write_failed',
    });
  });

  it('malformed external head evidence requires reconciliation and suppresses pending saves', async () => {
    const storage = memoryStorage();
    storage.data.set(LEGACY_STATE_KEY, JSON.stringify(state()));
    const persistence = controller(storage, new SerializedLocks());
    await persistence.initialize();
    storage.data.set(JOURNAL_HEAD_KEYS[1], '{malformed');

    persistence.handleExternalHeadChange();
    persistence.enqueue(state('light', 'must-not-save'));
    await persistence.whenIdle();

    expect(persistence.getAuthority()).toMatchObject({
      reconciliationRequired: true,
      externalChange: true,
      persistenceAvailable: false,
    });
  });

  it('commits one complete destructive candidate and absorbs the matching provider update', async () => {
    const storage = memoryStorage();
    storage.data.set(LEGACY_STATE_KEY, JSON.stringify(state()));
    const persistence = controller(storage, new SerializedLocks(), ids('destructive'));
    await persistence.initialize();
    const expected = persistence.getAuthority().committedGeneration;
    const generations = generationWrites(storage).length;
    const heads = headWrites(storage).length;
    const candidate = state('light', 'complete-destructive-candidate');

    const result = await persistence.commitDestructive(candidate, expected);
    expect(result.ok).toBe(true);
    expect(generationWrites(storage)).toHaveLength(generations + 1);
    expect(headWrites(storage)).toHaveLength(heads + 1);
    const writes = generationWrites(storage);
    expect(writes[writes.length - 1]?.[2]).toBe(JSON.stringify(candidate));

    persistence.enqueue(candidate);
    await persistence.whenIdle();
    expect(generationWrites(storage)).toHaveLength(generations + 1);
    expect(headWrites(storage)).toHaveLength(heads + 1);
  });

  it('returns distinct safe preflight failures without creating a candidate', async () => {
    const unsupportedStorage = memoryStorage();
    unsupportedStorage.data.set(LEGACY_STATE_KEY, JSON.stringify(state()));
    const unsupported = controller(unsupportedStorage, null);
    await unsupported.initialize();
    expect(await unsupported.commitDestructive(state('light'), null)).toEqual({
      ok: false,
      reason: 'unsupported_lock',
      outcome: 'safe_failure',
    });
    expect(generationWrites(unsupportedStorage)).toHaveLength(0);

    const preservedStorage = memoryStorage();
    const preservation = new JournalPersistenceController({
      storage: preservedStorage,
      coordinator: new SerializedLocks(),
      committedGeneration: null,
      sequence: 0,
      reconciliationRequired: false,
      preservationFailed: true,
    });
    expect(await preservation.commitDestructive(state('light'), null)).toEqual({
      ok: false,
      reason: 'preservation_failure',
      outcome: 'safe_failure',
    });

    const reconcileStorage = memoryStorage();
    const reconciliation = new JournalPersistenceController({
      storage: reconcileStorage,
      coordinator: new SerializedLocks(),
      committedGeneration: null,
      sequence: 0,
      reconciliationRequired: true,
      preservationFailed: false,
    });
    expect(await reconciliation.commitDestructive(state('light'), null)).toEqual({
      ok: false,
      reason: 'reconciliation_required',
      outcome: 'safe_failure',
    });
    expect(generationWrites(preservedStorage)).toHaveLength(0);
    expect(generationWrites(reconcileStorage)).toHaveLength(0);
  });

  it('classifies a destructive head interruption as uncertain and suppresses later writes', async () => {
    const base = memoryStorage();
    base.data.set(LEGACY_STATE_KEY, JSON.stringify(state()));
    let interruptHead = false;
    const storage = Object.create(base) as Storage;
    storage.setItem = (key: string, value: string) => {
      base.setItem(key, value);
      if (interruptHead && JOURNAL_HEAD_KEYS.includes(key as never)) {
        throw new Error('synthetic post-write interruption');
      }
    };
    const persistence = controller(storage, new SerializedLocks(), ids('destructive-uncertain'));
    await persistence.initialize();
    const expected = persistence.getAuthority().committedGeneration;
    interruptHead = true;

    expect(await persistence.commitDestructive(state('light'), expected)).toEqual({
      ok: false,
      reason: 'head_write_failed',
      outcome: 'uncertain',
    });
    const generations = generationWrites(base).length;
    persistence.enqueue(state('dark', 'must-not-save'));
    await persistence.whenIdle();
    expect(generationWrites(base)).toHaveLength(generations);
    expect(persistence.getAuthority()).toMatchObject({
      persistenceAvailable: false,
      outcomeUncertain: true,
    });
  });
});
