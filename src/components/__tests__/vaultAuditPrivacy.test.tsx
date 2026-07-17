// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { StoreProvider } from '../../state/store';
import ProjectVault from '../ProjectVault';
import PromptVault from '../PromptVault';
import { STORAGE_KEY } from '../../lib/storage/localStore';

// POST-H-PRIV-01 — new Project and Prompt audit records must not store titles,
// descriptions, prompt bodies, or other personal free text verbatim. These
// tests drive the REAL vault components with distinctive synthetic private
// text and prove it never reaches the audit log or its serialized state.

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const SECRET_PROJECT = 'ZZPRIV-project-divorce-lawyer-search';
const SECRET_PROMPT_TITLE = 'ZZPRIV-prompt-salary-negotiation';
const SECRET_PROMPT_BODY = 'ZZPRIV-body-my-manager-is-Alex-and-I-earn-99999';

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

async function mount(children: React.ReactNode) {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StoreProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </StoreProvider>,
    );
  });
}

/** Set a controlled input/textarea value the way a user would. */
async function type(el: Element, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function button(label: string): HTMLButtonElement {
  const b = [...container.querySelectorAll('button')].find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`button "${label}" not found`);
  return b as HTMLButtonElement;
}

async function click(label: string) {
  await act(async () => button(label).click());
}

interface StoredAudit {
  command?: string;
  resultSummary?: string;
}

function auditLog(): StoredAudit[] {
  return (JSON.parse(storage.store.get(STORAGE_KEY) ?? '{}').auditLog ?? []) as StoredAudit[];
}

function serializedAuditLog(): string {
  return JSON.stringify(auditLog());
}

describe('Project audit privacy (POST-H-PRIV-01)', () => {
  it('create + delete audit records never contain the project name', async () => {
    await mount(<ProjectVault />);
    await click('+ New');
    await type(container.querySelector('#project-name')!, SECRET_PROJECT);
    await click('Save (local)');

    let log = auditLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].command).toMatch(/^project_created · fp [0-9a-f]{12} · \d+ chars$/);
    expect(serializedAuditLog()).not.toContain('ZZPRIV');

    // Delete it (confirm dialog auto-accepted).
    (globalThis as { confirm?: (m?: string) => boolean }).confirm = () => true;
    await click('Edit');
    await click('Delete');

    log = auditLog();
    expect(log[0].command).toMatch(/^project_deleted · fp [0-9a-f]{12} · \d+ chars$/);
    expect(serializedAuditLog()).not.toContain('ZZPRIV');
  });
});

describe('Prompt audit privacy (POST-H-PRIV-01)', () => {
  it('create + update audit records never contain the title or body', async () => {
    await mount(<PromptVault />);
    await click('+ New');
    await type(container.querySelector('#prompt-title')!, SECRET_PROMPT_TITLE);
    await type(container.querySelector('textarea')!, SECRET_PROMPT_BODY);
    await click('Save (local)');

    let log = auditLog();
    expect(log[0].command).toMatch(/^prompt_created · fp [0-9a-f]{12} · \d+ chars$/);
    expect(log[0].resultSummary).toMatch(/^Prompt created · body \d+ chars\.$/);
    expect(serializedAuditLog()).not.toContain('ZZPRIV');

    // Update the same prompt with a changed body.
    await click('Edit');
    await type(container.querySelector('textarea')!, `${SECRET_PROMPT_BODY}-v2`);
    await click('Save (local)');

    log = auditLog();
    expect(log[0].command).toMatch(/^prompt_updated · fp [0-9a-f]{12} · \d+ chars$/);
    expect(log[0].resultSummary).toMatch(/^Prompt updated \(previous version kept\) · body \d+ chars\.$/);
    expect(serializedAuditLog()).not.toContain('ZZPRIV');

    // The prompt itself IS stored (that's the vault's job) — only the audit
    // records must be clean.
    expect(storage.store.get(STORAGE_KEY)).toContain(SECRET_PROMPT_BODY);
  });
});
