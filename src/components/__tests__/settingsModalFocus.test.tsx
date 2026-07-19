// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { StoreProvider } from '../../state/store';
import Settings from '../Settings';
import { STORAGE_KEY } from '../../lib/storage/localStore';
import { serializeState } from '../../lib/storage/exportImport';
import { buildDefaultState } from '../../data/defaultState';
import type { AppState, WorkflowArtifact } from '../../lib/types';

// OL-015 — the Settings dialogs (reset, import-conflict) and the Storage
// prune dialog on the shared focus contract: safe control takes initial
// focus, Escape is Cancel, Tab wraps inside the dialog, and focus returns
// to the surviving opener. All fixture values are synthetic.

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function synArtifact(id: string, createdAt: string): WorkflowArtifact {
  return {
    id,
    workflowId: 'syn-workflow',
    artifactType: 'full_prompt',
    createdAt,
    title: `SYN-ARTIFACT-${id}`,
    content: `SYN-PROMPT-CONTENT-${id}`,
  };
}

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

let container: HTMLElement;
let root: Root | null = null;
let storage: ReturnType<typeof fakeLocalStorage>;
let baseline: AppState;
let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  storage = fakeLocalStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  baseline = {
    ...buildDefaultState(),
    artifacts: [
      synArtifact('a2', '2026-02-01T00:00:00.000Z'),
      synArtifact('a1', '2026-01-01T00:00:00.000Z'),
    ],
  };
  storage.store.set(STORAGE_KEY, JSON.stringify(baseline));
  container = document.createElement('div');
  document.body.appendChild(container);
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true) as ReturnType<typeof vi.spyOn>;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
});

async function mountSettings() {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StoreProvider>
        <MemoryRouter>
          <Settings />
        </MemoryRouter>
      </StoreProvider>,
    );
  });
}

const byTestId = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  container.querySelector<T>(`[data-testid="${id}"]`);

function pageButton(re: RegExp): HTMLButtonElement {
  const b = [...container.querySelectorAll('button')].find((x) => re.test(x.textContent ?? ''));
  if (!b) throw new Error(`button ${re} not found`);
  return b as HTMLButtonElement;
}

function dialogWithText(text: string): HTMLElement | null {
  return (
    [...container.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) =>
      d.textContent?.includes(text),
    ) ?? null
  );
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function focusEl(el: HTMLElement) {
  await act(async () => el.focus());
}

async function pressKey(target: Element, key: string, shiftKey = false) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
    );
  });
}

/** Set a controlled React input's value and fire the change. */
async function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function importBackup(json: string, name = 'backup.json') {
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  const file = new File([json], name, { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // importData awaits file.text() — flush the microtask chain.
  await act(async () => {
    await Promise.resolve();
  });
}

const storedState = (): AppState => JSON.parse(storage.store.get(STORAGE_KEY)!) as AppState;

describe('reset dialog (OL-015 focus contract)', () => {
  it('opens with initial focus on Cancel; Escape cancels and restores focus to the opener', async () => {
    await mountSettings();
    const opener = pageButton(/^Reset to seed$/);
    await focusEl(opener);
    await click(opener);

    const dialog = dialogWithText('Reset to seed');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    const cancel = [...dialog!.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!;
    expect(document.activeElement).toBe(cancel);

    await pressKey(document.activeElement!, 'Escape');
    expect(dialogWithText('Reset to seed')).toBeNull();
    // Nothing was reset; the cancellation was audited as denied.
    const cancelled = storedState().auditLog.find((e) => e.command === 'Reset to seed — cancelled');
    expect(cancelled?.approvalStatus).toBe('denied');
    expect(cancelled?.actionTaken).toBe(false);
    // Focus returned to the surviving opener.
    expect(document.activeElement).toBe(opener);
  });

  it('clears the typed confirmation when the dialog is reopened', async () => {
    await mountSettings();
    await click(pageButton(/^Reset to seed$/));
    const input = container.querySelector<HTMLInputElement>('#reset-confirm')!;
    await setInput(input, 'RESET');
    const confirm = pageButton(/^Reset \(keep Health Profile\)$/);
    expect(confirm.disabled).toBe(false);

    await pressKey(container.querySelector('[role="dialog"]')!, 'Escape');
    expect(dialogWithText('Reset to seed')).toBeNull();

    await click(pageButton(/^Reset to seed$/));
    expect(container.querySelector<HTMLInputElement>('#reset-confirm')!.value).toBe('');
    expect(pageButton(/^Reset \(keep Health Profile\)$/).disabled).toBe(true);
  });
});

describe('import-conflict dialog (OL-015 focus contract)', () => {
  function conflictBackup(): string {
    const s: AppState = JSON.parse(JSON.stringify(buildDefaultState())) as AppState;
    s.settings.theme = 'light';
    return serializeState(s);
  }

  it('opens with initial focus on "Keep current"; Escape cancels with the existing flash', async () => {
    await mountSettings();
    const stateBefore = storage.store.get(STORAGE_KEY);
    const opener = pageButton(/^Import backup$/);
    await focusEl(opener);
    await importBackup(conflictBackup());

    const dialog = dialogWithText('Health Profile conflict');
    expect(dialog).not.toBeNull();
    const keepCurrent = [...dialog!.querySelectorAll('button')].find(
      (b) => b.textContent === 'Keep current',
    )!;
    expect(document.activeElement).toBe(keepCurrent);

    await pressKey(document.activeElement!, 'Escape');
    expect(dialogWithText('Health Profile conflict')).toBeNull();
    expect(container.querySelector('.flash')?.textContent).toContain('Import cancelled.');
    // Nothing was imported and the native replace-confirm never fired.
    expect(storage.store.get(STORAGE_KEY)).toBe(stateBefore);
    expect(confirmSpy).not.toHaveBeenCalled();
    // Focus returned to the surviving opener.
    expect(document.activeElement).toBe(opener);
  });

  it('Tab stays trapped inside the conflict dialog', async () => {
    await mountSettings();
    await importBackup(conflictBackup());
    const dialog = dialogWithText('Health Profile conflict')!;
    const buttons = [...dialog.querySelectorAll('button')];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    await focusEl(last as HTMLElement);
    await pressKey(last, 'Tab');
    expect(document.activeElement).toBe(first);
    await pressKey(first, 'Tab', true);
    expect(document.activeElement).toBe(last);
    await click(last as HTMLElement); // Cancel — close cleanly
  });
});

describe('storage prune dialog Tab wrapping (OL-015)', () => {
  it('wraps forward from Cancel to the first control, skipping the disabled confirm button', async () => {
    await mountSettings();
    await click(byTestId('storage-prune-open')!);
    const dialog = byTestId('storage-prune-dialog')!;
    const cancel = byTestId('storage-prune-cancel')!;
    expect(document.activeElement).toBe(cancel);

    // The confirm button is disabled (nothing typed) — Cancel is the last
    // focusable, so Tab wraps to the first (the keep-count input).
    expect(byTestId<HTMLButtonElement>('storage-prune-confirm')!.disabled).toBe(true);
    await pressKey(cancel, 'Tab');
    expect(document.activeElement).toBe(byTestId('storage-prune-keep'));

    // Shift+Tab from the first wraps back to Cancel.
    await pressKey(document.activeElement!, 'Tab', true);
    expect(document.activeElement).toBe(cancel);

    // Shift+Tab from the container itself stays inside.
    await focusEl(dialog);
    await pressKey(dialog, 'Tab', true);
    expect(document.activeElement).toBe(cancel);

    await click(cancel);
    expect(byTestId('storage-prune-dialog')).toBeNull();
    expect(storedState().artifacts).toHaveLength(2);
  });
});
