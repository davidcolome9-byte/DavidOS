// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { buildDefaultState } from '../../data/defaultState';
import { StoreProvider, useStore } from '../store';
import Layout from '../../components/Layout';
import { RECOVERY_KEY_PREFIX, STORAGE_KEY } from '../../lib/storage/localStore';
import {
  JOURNAL_GENERATION_PREFIX,
  JOURNAL_HEAD_KEYS,
  commitJournalState,
  selectJournalAuthority,
} from '../../lib/storage/stateJournal';

// DAV-001: prove the mounted app honors the recovery contract — a lossy
// repair never replaces the only stored copy unless the exact original was
// preserved first, and the user sees a visible recovery warning.

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function fakeLocalStorage(initial: Record<string, string>, quarantineFails: boolean) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (quarantineFails && k.startsWith(RECOVERY_KEY_PREFIX)) throw new Error('QuotaExceededError');
      store.set(k, String(v));
    },
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

let container: HTMLElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, _options: LockOptions, callback: () => Promise<unknown>) => callback() },
  });
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container.remove();
  Reflect.deleteProperty(navigator, 'locks');
});

/** Test-only page exposing a button that performs a real user state update. */
function MutatePage() {
  const { update } = useStore();
  return (
    <button
      data-testid="mutate"
      onClick={() =>
        update((s) => ({
          ...s,
          openLoops: [{ id: 'x1', label: 'added after boot', status: 'open', createdAt: 'now' }, ...s.openLoops],
        }))
      }
    >
      mutate
    </button>
  );
}

async function mountApp() {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StoreProvider>
        <MemoryRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<MutatePage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </StoreProvider>,
    );
  });
}

const DAMAGED = JSON.stringify({ schemaVersion: 1, prompts: 'junk' });

function ids(prefix: string) {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(8, '0')}`;
}

describe('StoreProvider recovery behavior', () => {
  it('repairs damaged state, shows a visible warning, and keeps the original recoverable', async () => {
    const storage = fakeLocalStorage({ [STORAGE_KEY]: DAMAGED }, false);
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

    await mountApp();

    const banner = container.querySelector('[data-testid="recovery-banner"]');
    expect(banner?.textContent).toContain('preserved');
    // The repaired state was persisted (quarantine succeeded)…
    const persisted = JSON.parse(selectJournalAuthority(storage as unknown as Storage).authority!.raw);
    expect(persisted.prompts).toEqual([]);
    // …and the exact original remains recoverable under a recovery key.
    const recoveryKey = [...storage.store.keys()].find((k) => k.startsWith(RECOVERY_KEY_PREFIX));
    expect(recoveryKey).toBeTruthy();
    expect(storage.store.get(recoveryKey!)).toBe(DAMAGED);
  });

  it('never overwrites the only stored copy when quarantine fails', async () => {
    const storage = fakeLocalStorage({ [STORAGE_KEY]: DAMAGED }, true);
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

    await mountApp();

    const banner = container.querySelector('[data-testid="recovery-banner"]');
    expect(banner?.textContent).toMatch(/saving is paused/i);
    // The damaged blob is still the ONLY stored copy — untouched.
    expect(storage.store.get(STORAGE_KEY)).toBe(DAMAGED);
    expect([...storage.store.keys()]).toEqual([STORAGE_KEY]);
  });

  it('a LATER user update still cannot overwrite the primary blob after suppression', async () => {
    const storage = fakeLocalStorage({ [STORAGE_KEY]: DAMAGED }, true);
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

    await mountApp();
    await act(async () => {
      (container.querySelector('[data-testid="mutate"]') as HTMLButtonElement).click();
    });

    // The in-memory state changed, but persistence stays suppressed for the
    // whole session — the damaged original remains the only stored copy.
    expect(storage.store.get(STORAGE_KEY)).toBe(DAMAGED);
    expect([...storage.store.keys()]).toEqual([STORAGE_KEY]);
  });

  it('an array-valued settings is repaired only after byte-exact preservation', async () => {
    const arraySettings = JSON.stringify({ schemaVersion: 1, settings: ['dark'] });
    const storage = fakeLocalStorage({ [STORAGE_KEY]: arraySettings }, false);
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

    await mountApp();

    expect(container.querySelector('[data-testid="recovery-banner"]')?.textContent).toContain('preserved');
    const recoveryKey = [...storage.store.keys()].find((k) => k.startsWith(RECOVERY_KEY_PREFIX));
    expect(storage.store.get(recoveryKey!)).toBe(arraySettings);
    expect(JSON.parse(selectJournalAuthority(storage as unknown as Storage).authority!.raw).settings).toEqual({ theme: 'dark' });
  });

  it('an existing empty-string blob is preserved, warned about, and not treated as a fresh install', async () => {
    const storage = fakeLocalStorage({ [STORAGE_KEY]: '' }, true); // preservation fails
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

    await mountApp();

    const banner = container.querySelector('[data-testid="recovery-banner"]');
    expect(banner?.textContent).toMatch(/saving is paused/i);
    expect(storage.store.get(STORAGE_KEY)).toBe(''); // untouched
    expect([...storage.store.keys()]).toEqual([STORAGE_KEY]);
  });

  it('valid older state migrates additively, persists normally, no warning', async () => {
    const old = JSON.stringify({
      schemaVersion: 1,
      priorities: [], openLoops: [], reminders: [], projects: [],
      prompts: [], contextItems: [], handoffs: [], auditLog: [],
      settings: { theme: 'dark' },
      // no artifacts, no healthProfile — pre-v0.2 shape
    });
    const storage = fakeLocalStorage({ [STORAGE_KEY]: old }, false);
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

    await mountApp();

    expect(container.querySelector('[data-testid="recovery-banner"]')).toBeNull();
    const persisted = JSON.parse(selectJournalAuthority(storage as unknown as Storage).authority!.raw);
    expect(persisted.artifacts).toEqual([]);
    expect(persisted.healthProfile).not.toBeUndefined();
    expect(storage.store.get(STORAGE_KEY)).toBe(old); // migration never alters legacy bytes
  });

  it('ignores unrelated and legacy-key events, then suppresses saving for a valid external head', async () => {
    const initial = JSON.stringify(buildDefaultState());
    const storage = fakeLocalStorage({ [STORAGE_KEY]: initial }, false);
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    await mountApp();

    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'synthetic-unrelated' }));
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    });
    expect(container.querySelector('[data-testid="crosstab-guard"]')).toBeNull();

    const current = selectJournalAuthority(storage as unknown as Storage).authority!;
    const external = await commitJournalState(
      { ...buildDefaultState(), settings: { theme: 'light' } },
      {
        storage: storage as unknown as Storage,
        expectedGeneration: current.generationId,
        idFactory: ids('provider-external'),
      },
    );
    if (!external.ok) throw new Error('synthetic setup failed');
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: external.authority.headKey }));
    });
    expect(container.querySelector('[data-testid="crosstab-guard"]')).not.toBeNull();
  });

  it('treats malformed external head evidence as stale reconciliation evidence', async () => {
    const storage = fakeLocalStorage({ [STORAGE_KEY]: JSON.stringify(buildDefaultState()) }, false);
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    await mountApp();
    const active = selectJournalAuthority(storage as unknown as Storage).authority!;
    const malformedKey = JOURNAL_HEAD_KEYS.find((key) => key !== active.headKey)!;
    storage.store.set(malformedKey, '{malformed');

    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: malformedKey }));
    });

    expect(container.querySelector('[data-testid="crosstab-guard"]')).not.toBeNull();
  });

  it('keeps provider persistence read-only without Web Locks and creates no journal records', async () => {
    Reflect.deleteProperty(navigator, 'locks');
    const legacy = JSON.stringify(buildDefaultState());
    const storage = fakeLocalStorage({ [STORAGE_KEY]: legacy }, false);
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

    await mountApp();
    await act(async () => {
      (container.querySelector('[data-testid="mutate"]') as HTMLButtonElement).click();
    });

    expect(storage.store.get(STORAGE_KEY)).toBe(legacy);
    expect([...storage.store.keys()].some((key) => key.startsWith(JOURNAL_GENERATION_PREFIX))).toBe(false);
    expect([...storage.store.keys()].some((key) => JOURNAL_HEAD_KEYS.includes(key as never))).toBe(false);
  });
});
