// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { StoreProvider } from '../../state/store';
import ContextVault from '../ContextVault';
import RevealToggle from '../RevealToggle';
import { selectJournalAuthority } from '../../lib/storage/stateJournal';

// DOS-APP-20260919 — OL-019 (Context create) and OL-028 (reveal toggle).
// Synthetic data only. Persisted state is read from the verified journal head.

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const SECRET_TITLE = 'ZZPRIV-unit-context-title';
const SECRET_BODY = 'ZZPRIV-unit-context-body';

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
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
let storage: ReturnType<typeof fakeLocalStorage>;

beforeEach(() => {
  storage = fakeLocalStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, _options: LockOptions, callback: () => Promise<unknown>) => callback() },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container.remove();
  Reflect.deleteProperty(navigator, 'locks');
});

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function mountVault() {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StoreProvider>
        <MemoryRouter>
          <ContextVault />
        </MemoryRouter>
      </StoreProvider>,
    );
  });
  await settle();
}

function button(label: string): HTMLButtonElement {
  const b = [...container.querySelectorAll('button')].find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`button "${label}" not found`);
  return b as HTMLButtonElement;
}

async function click(label: string) {
  await act(async () => button(label).click());
  await settle();
}

async function type(el: Element, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function choose(el: Element, value: string) {
  await act(async () => {
    (el as HTMLSelectElement).value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function committed(): { contextItems: { title: string; kind: string; body: string }[]; auditLog: { command: string; resultSummary?: string }[] } {
  const raw = selectJournalAuthority(storage as unknown as Storage).authority?.raw ?? '{}';
  return JSON.parse(raw);
}

const field = (id: string): Element => container.querySelector(`#${id}`)!;

describe('Context Vault create (OL-019)', () => {
  it('requires title, kind, and body; discloses the local write; cancel persists nothing', async () => {
    await mountVault();
    const before = committed().contextItems?.length ?? 0;

    await click('+ New context item');
    expect(container.querySelector('[data-testid="context-local-write-notice"]')?.textContent).toContain('local write');
    expect(button('Save (local)').disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('required');

    await type(field('context-title'), SECRET_TITLE);
    expect(button('Save (local)').disabled).toBe(true); // kind and body still missing
    await choose(field('context-kind'), 'private');
    expect(button('Save (local)').disabled).toBe(true); // body still missing
    await type(field('context-new-body'), '   ');
    expect(button('Save (local)').disabled).toBe(true); // whitespace body is empty
    await type(field('context-new-body'), SECRET_BODY);
    expect(button('Save (local)').disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();

    await click('Cancel');
    expect(container.querySelector('[data-testid="context-new-form"]')).toBeNull();
    expect(container.textContent).not.toContain(SECRET_TITLE);
    expect(committed().contextItems?.length ?? 0).toBe(before);
  });

  it('saves a new item locally and audits only a redacted label', async () => {
    await mountVault();
    await click('+ New context item');
    await type(field('context-title'), SECRET_TITLE);
    await choose(field('context-kind'), 'private');
    await type(field('context-new-body'), SECRET_BODY);
    await click('Save (local)');

    expect(container.querySelector('[data-testid="context-new-form"]')).toBeNull();
    expect(container.textContent).toContain(SECRET_TITLE);
    const state = committed();
    expect(state.contextItems.find((c) => c.title === SECRET_TITLE)).toMatchObject({ kind: 'private', body: SECRET_BODY });
    const audit = state.auditLog.find((a) => a.command.startsWith('context_created'));
    expect(audit?.command).toMatch(/^context_created · fp [0-9a-f]{12} · \d+ chars$/);
    expect(audit?.resultSummary).toMatch(/^Context item created · kind private · body \d+ chars\.$/);
    expect(JSON.stringify(state.auditLog)).not.toContain('ZZPRIV');
  });

  it('shows the empty state only when no context items exist, and labels the edit textarea', async () => {
    await mountVault();
    expect(container.querySelector('[data-testid="context-empty"]')).toBeNull(); // seeded items exist
    await click('Edit');
    const textarea = container.querySelector('details textarea') as HTMLTextAreaElement;
    expect(textarea.id).not.toBe('');
    const label = container.querySelector(`label[for="${textarea.id}"]`);
    expect(label?.textContent).toBe('Context body');
  });
});

describe('RevealToggle (OL-028)', () => {
  async function mountToggle(revealed: boolean) {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <RevealToggle panelId="syn-panel" subject="Inserted Synthetic Text" revealed={revealed} onToggle={() => {}} text="synthetic body" />,
      );
    });
  }

  it('collapsed: the toggle is mounted with aria-expanded=false and no text in the DOM', async () => {
    await mountToggle(false);
    const toggle = container.querySelector('button')!;
    expect(toggle.textContent).toBe('Show Inserted Synthetic Text');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('syn-panel');
    expect(container.querySelector('#syn-panel')).toBeNull();
    expect(container.textContent).not.toContain('synthetic body');
  });

  it('expanded: the same toggle stays, and the panel is a labelled, focusable region', async () => {
    await mountToggle(true);
    const toggle = container.querySelector('button')!;
    expect(toggle.textContent).toBe('Hide Inserted Synthetic Text');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const panel = container.querySelector('#syn-panel')!;
    expect(panel.tagName).toBe('PRE');
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-label')).toBe('Inserted Synthetic Text');
    expect(panel.getAttribute('tabindex')).toBe('0');
    expect(panel.textContent).toBe('synthetic body');
  });
});
