import { beforeEach, describe, expect, it } from 'vitest';
import { buildDefaultState } from '../../data/defaultState';
import { loadPersistedState, STORAGE_KEY } from '../storage/localStore';
import {
  JOURNAL_HEAD_KEYS,
  commitJournalState,
  journalGenerationKey,
} from '../storage/stateJournal';
import type { ExclusiveLockCoordinator } from '../storage/stateJournal';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  } as Storage & { data: Map<string, string> };
}

const lock: ExclusiveLockCoordinator = {
  requestExclusive: async (_name, callback) => ({ status: 'acquired', value: await callback() }),
};

function ids(prefix: string) {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(8, '0')}`;
}

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});

async function journalState(theme: 'dark' | 'light', expected: string | null, prefix: string) {
  const candidate = { ...buildDefaultState(), settings: { theme } };
  return commitJournalState(candidate, { storage, coordinator: lock, expectedGeneration: expected, idFactory: ids(prefix) });
}

describe('journal-aware boot', () => {
  it('prefers a valid journal over legacy and later legacy writes', async () => {
    storage.data.set(STORAGE_KEY, JSON.stringify({ ...buildDefaultState(), settings: { theme: 'dark' } }));
    const committed = await journalState('light', null, 'boot-priority');
    if (!committed.ok) throw new Error('synthetic setup failed');
    expect(loadPersistedState()).toMatchObject({
      state: { settings: { theme: 'light' } },
      committedGeneration: committed.authority.generationId,
      recovery: { canPersist: true },
    });
    storage.data.set(STORAGE_KEY, JSON.stringify({ ...buildDefaultState(), settings: { theme: 'dark' } }));
    expect(loadPersistedState().state?.settings.theme).toBe('light');
  });

  it('falls back from a missing or invalid highest generation to the lower valid head', async () => {
    const one = await journalState('dark', null, 'fallback-one');
    if (!one.ok) throw new Error('synthetic setup failed');
    const two = await journalState('light', one.authority.generationId, 'fallback-two');
    if (!two.ok) throw new Error('synthetic setup failed');
    storage.data.delete(journalGenerationKey(two.authority.generationId));
    expect(loadPersistedState()).toMatchObject({ committedGeneration: one.authority.generationId, journalReconciliationNeeded: true });
    storage.data.set(journalGenerationKey(two.authority.generationId), '{invalid');
    expect(loadPersistedState().committedGeneration).toBe(one.authority.generationId);
  });

  it('falls back when the higher head is malformed and ignores orphan generations', async () => {
    const one = await journalState('dark', null, 'malformed-head');
    if (!one.ok) throw new Error('synthetic setup failed');
    storage.data.set(JOURNAL_HEAD_KEYS[1], '{malformed');
    storage.data.set(journalGenerationKey('orphan-boot-0001'), JSON.stringify({ ...buildDefaultState(), settings: { theme: 'light' } }));
    expect(loadPersistedState()).toMatchObject({ committedGeneration: one.authority.generationId, state: { settings: { theme: 'dark' } } });
  });

  it('runs journal bytes through quarantine and preserves the exact generation first', async () => {
    const damaged = { ...buildDefaultState(), prompts: [{ synthetic: 'invalid-record' }] };
    const committed = await commitJournalState(damaged as never, {
      storage, coordinator: lock, expectedGeneration: null, idFactory: ids('quarantine-journal'),
    });
    if (!committed.ok) throw new Error('synthetic setup failed');
    const raw = storage.getItem(journalGenerationKey(committed.authority.generationId));
    const loaded = loadPersistedState();
    expect(loaded.state?.prompts).toEqual([]);
    expect(loaded.recovery).toMatchObject({ kind: 'repaired', rawPreserved: true });
    expect(storage.getItem(loaded.recovery.recoveryKey!)).toBe(raw);
  });

  it('makes legacy boot read-only when journal evidence cannot be reconciled', () => {
    storage.data.set(STORAGE_KEY, JSON.stringify(buildDefaultState()));
    storage.data.set(JOURNAL_HEAD_KEYS[0], '{malformed');
    const loaded = loadPersistedState();
    expect(loaded.state).not.toBeNull();
    expect(loaded).toMatchObject({ committedGeneration: null, journalReconciliationNeeded: true, recovery: { canPersist: false } });
  });
});
