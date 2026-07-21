import { describe, expect, it } from 'vitest';
import { commitImport } from '../storage/importCommit';
import { HEALTH_DRAFT_KEY, saveHealthDraft } from '../health/profileDraft';
import { buildDefaultState } from '../../data/defaultState';
import type { DestructiveCommitResult } from '../storage/journalPersistence';
import type { AppState, HealthFitnessProfile } from '../types';

// DOS-STAB-001A Phase 2A2b — draft-aware import commit on the SHARED journal
// transaction boundary (commitDestructiveState). The draft gate is re-checked
// at apply time; a draft is destroyed only AFTER the verified journal head
// advancement; a failed or uncertain commit never touches the draft. There is
// no rollback path and no legacy-key write. All values synthetic.

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

/** Records every call so tests can prove exactly one transaction attempt. */
function fakeCommit(result: DestructiveCommitResult) {
  const calls: Array<{ candidate: AppState; expectedGeneration: string | null }> = [];
  const commit = (candidate: AppState, expectedGeneration: string | null) => {
    calls.push({ candidate, expectedGeneration });
    return Promise.resolve(result);
  };
  return { calls, commit };
}

const OK: DestructiveCommitResult = {
  ok: true,
  authority: { generationId: 'syn-gen-2', sequence: 2 } as never,
  cleanupFailed: false,
};

describe('commitImport — shared journal transaction', () => {
  it('no draft: delegates the exact candidate and expected generation to the shared commit', async () => {
    const storage = memStorage();
    const { calls, commit } = fakeCommit(OK);
    const res = await commitImport(next, {
      discardDraftConfirmed: false,
      expectedGeneration: 'syn-gen-1',
      commit,
      storage,
    });
    expect(res).toEqual({ ok: true });
    expect(calls).toEqual([{ candidate: next, expectedGeneration: 'syn-gen-1' }]);
  });

  it('propagates a safe failure verbatim without touching anything', async () => {
    const storage = memStorage();
    withDraft(storage);
    const { commit } = fakeCommit({ ok: false, reason: 'stale_authority', outcome: 'safe_failure' });
    const res = await commitImport(next, {
      discardDraftConfirmed: true,
      expectedGeneration: 'syn-gen-1',
      commit,
      storage,
    });
    expect(res).toEqual({
      ok: false,
      reason: 'commit_failed',
      cause: 'stale_authority',
      outcome: 'safe_failure',
    });
    expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(true);
  });

  it('propagates an uncertain outcome honestly and keeps the draft', async () => {
    const storage = memStorage();
    withDraft(storage);
    const { commit } = fakeCommit({ ok: false, reason: 'head_write_failed', outcome: 'uncertain' });
    const res = await commitImport(next, {
      discardDraftConfirmed: true,
      expectedGeneration: null,
      commit,
      storage,
    });
    expect(res).toEqual({
      ok: false,
      reason: 'commit_failed',
      cause: 'head_write_failed',
      outcome: 'uncertain',
    });
    expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(true);
  });

  it('a commit boundary that THROWS is reported as uncertain, never as safe', async () => {
    const storage = memStorage();
    const res = await commitImport(next, {
      discardDraftConfirmed: false,
      expectedGeneration: null,
      commit: () => Promise.reject(new Error('synthetic boundary explosion')),
      storage,
    });
    expect(res).toMatchObject({ ok: false, reason: 'commit_failed', outcome: 'uncertain' });
  });
});

describe('commitImport — draft gate and ordering', () => {
  it('an unconfirmed draft blocks BEFORE the transaction is even attempted', async () => {
    const storage = memStorage();
    withDraft(storage);
    const { calls, commit } = fakeCommit(OK);
    const res = await commitImport(next, {
      discardDraftConfirmed: false,
      expectedGeneration: null,
      commit,
      storage,
    });
    expect(res).toEqual({ ok: false, reason: 'draft_blocked' });
    expect(calls).toHaveLength(0);
    expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(true);
  });

  it('a confirmed discard clears the draft only AFTER the commit resolves ok', async () => {
    const storage = memStorage();
    withDraft(storage);
    let draftAtCommitTime: boolean | null = null;
    const res = await commitImport(next, {
      discardDraftConfirmed: true,
      expectedGeneration: null,
      commit: () => {
        draftAtCommitTime = storage.store.has(HEALTH_DRAFT_KEY);
        return Promise.resolve(OK);
      },
      storage,
    });
    expect(res).toEqual({ ok: true });
    // The draft was still intact while the transaction ran…
    expect(draftAtCommitTime).toBe(true);
    // …and is cleared only after the verified success.
    expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(false);
  });

  it('a failed commit never clears a confirmed-discard draft', async () => {
    const storage = memStorage();
    withDraft(storage);
    const before = storage.store.get(HEALTH_DRAFT_KEY);
    const { commit } = fakeCommit({ ok: false, reason: 'candidate_write_failed', outcome: 'safe_failure' });
    const res = await commitImport(next, {
      discardDraftConfirmed: true,
      expectedGeneration: null,
      commit,
      storage,
    });
    expect(res.ok).toBe(false);
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(before);
  });

  it('no draft: success never touches the draft key', async () => {
    const storage = memStorage();
    const { commit } = fakeCommit(OK);
    const res = await commitImport(next, {
      discardDraftConfirmed: false,
      expectedGeneration: null,
      commit,
      storage,
    });
    expect(res).toEqual({ ok: true });
    expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(false);
  });
});
