// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from '../../state/store';
import Layout from '../Layout';
import { STORAGE_KEY } from '../../lib/storage/localStore';

// F-08 — the cross-tab stale-state dialog must be fully keyboard-accessible
// (focus moves in, focus is trapped, Escape dismisses, background is inert)
// WITHOUT weakening the data-loss guard: dismissing the dialog never clears
// the stale condition and never lets this tab overwrite newer state.

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function fakeLocalStorage() {
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
  };
}

/** A minimal page that can force a real state change from inside the app. */
function Probe() {
  const { audit } = useStore();
  return (
    <button
      onClick={() =>
        audit({
          command: 'probe_write',
          actionType: 'read_only',
          approvalStatus: 'not_required',
          resultSummary: 'Probe write for stale-guard tests.',
        })
      }
    >
      Probe Write
    </button>
  );
}

let container: HTMLElement;
let root: Root | null = null;
let storage: ReturnType<typeof fakeLocalStorage>;

beforeEach(() => {
  storage = fakeLocalStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container.remove();
});

async function mountApp() {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StoreProvider>
        <MemoryRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Probe />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </StoreProvider>,
    );
  });
}

/** Simulate another tab writing our storage key (fires only in OTHER tabs). */
async function fireExternalWrite() {
  const ev = new Event('storage');
  Object.defineProperty(ev, 'key', { value: STORAGE_KEY });
  await act(async () => {
    window.dispatchEvent(ev);
  });
}

const dialog = () => container.querySelector<HTMLElement>('[data-testid="crosstab-guard"]');
const banner = () => container.querySelector<HTMLElement>('[data-testid="crosstab-stale-banner"]');

function dialogButton(label: string): HTMLButtonElement {
  const b = [...dialog()!.querySelectorAll('button')].find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`dialog button "${label}" not found`);
  return b as HTMLButtonElement;
}

async function pressKey(target: Element, key: string, shiftKey = false) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
  });
}

describe('stale-tab dialog accessibility (F-08)', () => {
  it('opens with focus inside, an accessible name and description, and an inert background', async () => {
    await mountApp();
    expect(dialog()).toBeNull();
    await fireExternalWrite();

    const d = dialog();
    expect(d).not.toBeNull();
    expect(d!.getAttribute('role')).toBe('alertdialog');
    expect(d!.getAttribute('aria-modal')).toBe('true');
    // Name and description resolve to real elements with content.
    const title = container.querySelector(`#${d!.getAttribute('aria-labelledby')}`);
    const desc = container.querySelector(`#${d!.getAttribute('aria-describedby')}`);
    expect(title?.textContent).toContain('Updated in another tab');
    expect(desc?.textContent).toContain('stopped saving');
    // Focus moved into the dialog.
    expect(d!.contains(document.activeElement)).toBe(true);
    // Background regions are inert and hidden from assistive technology.
    for (const sel of ['header', 'main', 'nav']) {
      const el = container.querySelector(sel)!;
      expect(el.hasAttribute('inert')).toBe(true);
      expect(el.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('traps keyboard focus inside the dialog', async () => {
    await mountApp();
    await fireExternalWrite();
    const reload = dialogButton('Reload with latest');
    const dismiss = dialogButton('Keep reviewing without saving');

    // Tab from the last focusable wraps to the first.
    await act(async () => dismiss.focus());
    await pressKey(dismiss, 'Tab');
    expect(document.activeElement).toBe(reload);

    // Shift+Tab from the first focusable wraps to the last.
    await pressKey(reload, 'Tab', true);
    expect(document.activeElement).toBe(dismiss);

    // Shift+Tab from the dialog container itself also stays inside.
    await act(async () => dialog()!.focus());
    await pressKey(dialog()!, 'Tab', true);
    expect(document.activeElement).toBe(dismiss);
  });

  it('Escape dismisses the dialog to a persistent warning without clearing the stale state', async () => {
    await mountApp();

    // Baseline: this tab persists its own writes while healthy.
    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((b) => b.textContent === 'Probe Write')!
        .click();
    });
    expect(storage.store.get(STORAGE_KEY)).toContain('probe_write');

    await fireExternalWrite();
    await pressKey(document.activeElement!, 'Escape');

    // Dialog gone; persistent warning present; focus on its reopen control.
    expect(dialog()).toBeNull();
    const warn = banner();
    expect(warn).not.toBeNull();
    expect(warn!.getAttribute('role')).toBe('alert');
    expect(warn!.textContent).toContain('saving from this tab stays paused');
    const reopen = [...warn!.querySelectorAll('button')].find((b) => b.textContent === 'Show details')!;
    expect(document.activeElement).toBe(reopen);

    // Background is interactive and visible to assistive technology again.
    for (const sel of ['header', 'main', 'nav']) {
      const el = container.querySelector(sel)!;
      expect(el.hasAttribute('inert')).toBe(false);
      expect(el.hasAttribute('aria-hidden')).toBe(false);
    }

    // THE GUARD STILL HOLDS: a state change after dismissal is NOT persisted.
    const before = storage.store.get(STORAGE_KEY);
    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((b) => b.textContent === 'Probe Write')!
        .click();
    });
    expect(storage.store.get(STORAGE_KEY)).toBe(before);
  });

  it('the persistent warning can reopen the dialog, which is dismissible again', async () => {
    await mountApp();
    await fireExternalWrite();
    await pressKey(document.activeElement!, 'Escape');
    expect(dialog()).toBeNull();

    const reopen = [...banner()!.querySelectorAll('button')].find((b) => b.textContent === 'Show details')!;
    await act(async () => reopen.click());

    const d = dialog();
    expect(d).not.toBeNull();
    expect(d!.contains(document.activeElement)).toBe(true);
    expect(container.querySelector('main')!.hasAttribute('inert')).toBe(true);

    // Escape works again after reopening.
    await pressKey(document.activeElement!, 'Escape');
    expect(dialog()).toBeNull();
    expect(banner()).not.toBeNull();
  });
});
