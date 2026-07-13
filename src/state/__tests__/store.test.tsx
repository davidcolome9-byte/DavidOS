// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from '../store';
import Layout from '../../components/Layout';
import { RECOVERY_KEY_PREFIX, STORAGE_KEY } from '../../lib/storage/localStore';

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
    key: () => null,
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
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container.remove();
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

describe('StoreProvider recovery behavior', () => {
  it('repairs damaged state, shows a visible warning, and keeps the original recoverable', async () => {
    const storage = fakeLocalStorage({ [STORAGE_KEY]: DAMAGED }, false);
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

    await mountApp();

    const banner = container.querySelector('[data-testid="recovery-banner"]');
    expect(banner?.textContent).toContain('preserved');
    // The repaired state was persisted (quarantine succeeded)…
    const persisted = JSON.parse(storage.store.get(STORAGE_KEY)!);
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
    expect(banner?.textContent).toContain('Saving is paused');
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
    expect(JSON.parse(storage.store.get(STORAGE_KEY)!).settings).toEqual({ theme: 'dark' });
  });

  it('an existing empty-string blob is preserved, warned about, and not treated as a fresh install', async () => {
    const storage = fakeLocalStorage({ [STORAGE_KEY]: '' }, true); // preservation fails
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

    await mountApp();

    const banner = container.querySelector('[data-testid="recovery-banner"]');
    expect(banner?.textContent).toContain('Saving is paused');
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
    const persisted = JSON.parse(storage.store.get(STORAGE_KEY)!);
    expect(persisted.artifacts).toEqual([]);
    expect(persisted.healthProfile).not.toBeUndefined();
    expect([...storage.store.keys()]).toEqual([STORAGE_KEY]); // no quarantine record
  });
});
