// @vitest-environment happy-dom
//
// DOS-AGT-001A — drives the REAL Supervised execution section on the Agents
// page: fixed profile display, accessible labels, independent readiness
// errors, authority defaults, lifecycle-derived actions, honest packet copy,
// terminal immutability, stale-summary clearing, persistence-disabled honesty,
// and audit privacy (ZZPRIV markers must never reach serialized audit output).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { StoreProvider } from '../../state/store';
import AgentsPage from '../AgentsPage';
import SupervisedExecutionSection from '../SupervisedExecutionSection';
import { STORAGE_KEY } from '../../lib/storage/localStore';
import { selectJournalAuthority } from '../../lib/storage/stateJournal';
import type { AppState } from '../../lib/types';
import { CODING_COORDINATOR } from '../../lib/agents/executionAgentRegistry';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const PRIV = 'ZZPRIV';

interface FakeStorage {
  store: Map<string, string>;
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  readonly length: number;
}

function fakeLocalStorage(seed?: string, failWrites = false): FakeStorage {
  const store = new Map<string, string>();
  if (seed !== undefined) store.set(STORAGE_KEY, seed);
  return {
    store,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (failWrites) throw new Error('quota');
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
let storage: FakeStorage;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  // DOS-STAB-001A: canonical writes go through the journal's exclusive Web
  // Lock. Without a coordinator the app is correctly read-only, so these
  // persistence tests must supply one.
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

/** Let the journal controller's async initialize/drain settle. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function mount(opts: { seed?: string; failWrites?: boolean; wholePage?: boolean } = {}) {
  storage = fakeLocalStorage(opts.seed, opts.failWrites);
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StoreProvider>
        <MemoryRouter initialEntries={['/agents']}>
          {opts.wholePage ? <AgentsPage /> : <SupervisedExecutionSection />}
        </MemoryRouter>
      </StoreProvider>,
    );
  });
  await settle();
}

function mockClipboard(behavior: 'ok' | 'fail'): string[] {
  const written: string[] = [];
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        if (behavior === 'fail') throw new Error('denied');
        written.push(text);
      },
    },
  });
  return written;
}

function button(label: string): HTMLButtonElement {
  const b = [...container.querySelectorAll('button')].find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`button "${label}" not found`);
  return b as HTMLButtonElement;
}

function maybeButton(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((x) => x.textContent?.trim() === label) as
    | HTMLButtonElement
    | undefined;
}

async function click(label: string) {
  await act(async () => button(label).click());
  await settle();
}

async function type(el: Element, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function byId(id: string): Element {
  const el = container.querySelector(`#${CSS.escape(id)}`);
  if (!el) throw new Error(`element #${id} not found`);
  return el;
}

/**
 * The state the app actually committed: the verified journal head's
 * generation, not the legacy single key (DOS-STAB-001A).
 */
const storedState = (): AppState =>
  JSON.parse(selectJournalAuthority(storage as unknown as Storage).authority!.raw) as AppState;

/** Fill the draft editor with valid (marker-carrying) values and create it. */
async function createFullDraft() {
  await click('+ New record');
  await type(byId('exec-title'), `${PRIV}-title`);
  await type(byId('exec-model'), `${PRIV}-model`);
  await type(byId('exec-objective'), `${PRIV}-objective`);
  await type(byId('exec-scope'), `${PRIV}-scope`);
  await type(byId('exec-stop'), `${PRIV}-stop`);
  await click('Create draft (local)');
}

describe('Supervised execution section (DOS-AGT-001A)', () => {
  it('renders on the Agents page with the fixed profile and honesty statement', async () => {
    await mount({ wholePage: true });
    expect(container.textContent).toContain('Supervised execution');
    expect(container.textContent).toContain(CODING_COORDINATOR.name);
    expect(container.textContent).toContain(CODING_COORDINATOR.supervisionStatement);
    // Existing domain-agent cards are untouched alongside it.
    expect(container.textContent).toContain('Agent specs live in');
    expect(maybeButton('+ New record')).toBeDefined();
  });

  it('every draft-editor control has an associated label', async () => {
    await mount({});
    await click('+ New record');
    const ids = [
      'exec-title', 'exec-service', 'exec-model', 'exec-mode',
      'exec-objective', 'exec-scope', 'exec-stop',
      'exec-auth-editCode', 'exec-auth-runTests', 'exec-auth-editDocs',
      'exec-auth-push', 'exec-auth-openPullRequests', 'exec-auth-merge',
    ];
    for (const id of ids) {
      expect(byId(id), id).toBeTruthy();
      expect(container.querySelector(`label[for="${id}"]`), `label for ${id}`).toBeTruthy();
    }
    // Objective, bounded scope, and stop conditions are separate controls.
    expect(byId('exec-objective')).not.toBe(byId('exec-scope'));
    expect(byId('exec-scope')).not.toBe(byId('exec-stop'));
    expect(byId('exec-scope').tagName).toBe('TEXTAREA');
    expect(byId('exec-stop').tagName).toBe('TEXTAREA');
  });

  it('missing objective, scope, and stop conditions produce independent readiness errors', async () => {
    await mount({});
    await click('+ New record');
    await type(byId('exec-title'), 'Only a title');
    await click('Create draft (local)');
    expect(container.textContent).toContain('Objective is required.');
    expect(container.textContent).toContain('Bounded scope is required.');
    expect(container.textContent).toContain('Stop conditions are required.');
    expect(button('Mark ready').disabled).toBe(true);
  });

  it('all authority defaults to NOT authorized and persists that way', async () => {
    await mount({});
    await createFullDraft();
    const record = storedState().executionRecords[0];
    expect(Object.values(record.authority).every((v) => v === false)).toBe(true);
    const notAuthorized = container.textContent!.match(/NOT authorized/g) ?? [];
    expect(notAuthorized.length).toBeGreaterThanOrEqual(6);
  });

  it('offers only valid lifecycle actions per status', async () => {
    await mount({});
    await createFullDraft();
    // Draft: no ready-state or in-progress actions.
    expect(maybeButton('Begin work (external)')).toBeUndefined();
    expect(maybeButton('Resume work')).toBeUndefined();
    expect(maybeButton('Complete')).toBeUndefined();
    expect(button('Mark ready').disabled).toBe(false);

    await click('Mark ready');
    expect(storedState().executionRecords[0].status).toBe('ready');
    expect(maybeButton('Mark ready')).toBeUndefined();
    expect(maybeButton('Complete')).toBeUndefined();
    expect(maybeButton('Return to draft')).toBeDefined();
    expect(maybeButton('Begin work (external)')).toBeDefined();
  });

  it('clears stale blocker and decision summaries when work resumes', async () => {
    await mount({});
    await createFullDraft();
    await click('Mark ready');
    await click('Begin work (external)');

    const idp = `exec-${storedState().executionRecords[0].id}`;
    await type(byId(`${idp}-blocker`), `${PRIV}-blocker-text`);
    await click('Mark blocked');
    expect(container.textContent).toContain(`Blocked: ${PRIV}-blocker-text`);
    expect(storedState().executionRecords[0].blockerSummary).toBe(`${PRIV}-blocker-text`);

    await click('Resume work');
    expect(storedState().executionRecords[0].blockerSummary).toBeUndefined();
    expect(container.textContent).not.toContain(`${PRIV}-blocker-text`);

    await type(byId(`${idp}-decision`), `${PRIV}-decision-text`);
    await click('Request approval');
    expect(container.textContent).toContain(`Required decision: ${PRIV}-decision-text`);
    await click('Resume work');
    expect(storedState().executionRecords[0].decisionSummary).toBeUndefined();
    expect(container.textContent).not.toContain(`${PRIV}-decision-text`);
  });

  it('requires evidence for completion and makes terminal records read-only', async () => {
    await mount({});
    await createFullDraft();
    await click('Mark ready');
    await click('Begin work (external)');
    expect(button('Complete').disabled).toBe(true);
    expect(container.textContent).toContain('Completion requires at least one valid evidence item.');

    const idp = `exec-${storedState().executionRecords[0].id}`;
    await type(byId(`${idp}-evidence-ref`), `${PRIV}-evidence-ref`);
    await click('Add evidence (local)');
    expect(storedState().executionRecords[0].evidence).toHaveLength(1);
    expect(button('Complete').disabled).toBe(false);

    await click('Complete');
    const record = storedState().executionRecords[0];
    expect(record.status).toBe('completed');
    expect(record.closedAt).toBeTruthy();
    // Terminal: no mutation or transition controls remain.
    for (const label of [
      'Complete', 'Mark blocked', 'Request approval', 'Resume work',
      'Cancel record…', 'Edit draft', 'Add evidence (local)', 'Add gate (local)',
    ]) {
      expect(maybeButton(label), label).toBeUndefined();
    }
    expect(container.textContent).toContain('terminal — read-only');
  });

  it('pending approval gates block completion until decided', async () => {
    await mount({});
    await createFullDraft();
    await click('Mark ready');
    await click('Begin work (external)');
    const idp = `exec-${storedState().executionRecords[0].id}`;
    await type(byId(`${idp}-evidence-ref`), 'evidence-x');
    await click('Add evidence (local)');
    await type(byId(`${idp}-gate`), `${PRIV}-gate-label`);
    await click('Add gate (local)');
    expect(button('Complete').disabled).toBe(true);
    await click('Approve');
    expect(storedState().executionRecords[0].approvalGates[0].decision).toBe('approved');
    expect(button('Complete').disabled).toBe(false);
  });

  it('copying the packet is honest and audited without user content', async () => {
    const written = mockClipboard('ok');
    await mount({});
    await createFullDraft();
    await click('Mark ready');
    await click('Copy packet (nothing is sent)');
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('BOUNDED SCOPE');
    expect(container.textContent).toContain(
      'Packet copied. Nothing was sent and nothing was executed by DavidOS.',
    );
    const log = storedState().auditLog;
    expect(log.some((e) => e.command.startsWith('execution_packet_copied'))).toBe(true);
    expect(JSON.stringify(log)).not.toContain(PRIV);
  });

  it('clipboard failure is honest: no copy claim, no status change, no audit success', async () => {
    mockClipboard('fail');
    await mount({});
    await createFullDraft();
    await click('Mark ready');
    const before = storedState();
    await click('Copy packet (nothing is sent)');
    expect(container.textContent).toContain('the packet was NOT copied');
    const after = storedState();
    expect(after.executionRecords[0].status).toBe('ready');
    expect(after.executionRecords[0].evidence).toHaveLength(0);
    expect(after.auditLog.some((e) => e.command.startsWith('execution_packet_copied'))).toBe(false);
    expect(after.auditLog.length).toBe(before.auditLog.length);
  });

  it('serialized audit output never contains user-entered content across a full lifecycle', async () => {
    mockClipboard('ok');
    await mount({});
    await createFullDraft();
    await click('Mark ready');
    await click('Begin work (external)');
    const idp = `exec-${storedState().executionRecords[0].id}`;
    await type(byId(`${idp}-blocker`), `${PRIV}-blocker`);
    await click('Mark blocked');
    await click('Resume work');
    await type(byId(`${idp}-evidence-ref`), `${PRIV}-evidence`);
    await click('Add evidence (local)');
    await type(byId(`${idp}-gate`), `${PRIV}-gate`);
    await click('Add gate (local)');
    await click('Approve');
    await click('Complete');
    const serialized = JSON.stringify(storedState().auditLog);
    expect(serialized).not.toContain(PRIV);
    expect(serialized).toContain('execution_record_created');
    expect(serialized).toContain('execution_status_changed');
  });

  it('cancel requires an explicit confirm step and is terminal', async () => {
    await mount({});
    await createFullDraft();
    await click('Cancel record…');
    // Nothing changed yet — confirm step only.
    expect(storedState().executionRecords[0].status).toBe('draft');
    await click('Confirm cancel (terminal)');
    expect(storedState().executionRecords[0].status).toBe('cancelled');
    expect(maybeButton('Cancel record…')).toBeUndefined();
    expect(maybeButton('Edit draft')).toBeUndefined();
  });

  it('inline cancel confirmation manages focus: open → confirm button, keep → opener, confirm → heading', async () => {
    await mount({});
    await createFullDraft();

    // Opening moves focus to the destructive confirmation button.
    await click('Cancel record…');
    const confirmBtn = button('Confirm cancel (terminal)');
    expect(document.activeElement).toBe(confirmBtn);
    // Native buttons → Enter/Space semantics come for free.
    expect(confirmBtn.tagName).toBe('BUTTON');
    // The confirmation context is exposed accessibly, not only via aria-live.
    const group = container.querySelector('[role="group"][aria-labelledby]');
    expect(group).toBeTruthy();
    const desc = container.querySelector(`#${group!.getAttribute('aria-labelledby')}`);
    expect(desc?.textContent).toContain('terminal');
    expect(desc?.textContent).toContain('sent and');
    expect(confirmBtn.getAttribute('aria-describedby')).toBe(desc?.id);

    // "Keep record" closes the confirmation and restores focus to the opener.
    await click('Keep record');
    expect(maybeButton('Confirm cancel (terminal)')).toBeUndefined();
    expect(document.activeElement).toBe(button('Cancel record…'));

    // Confirming lands focus on the surviving record heading — never <body>.
    await click('Cancel record…');
    await click('Confirm cancel (terminal)');
    const heading = container.querySelector('.exec-record h3');
    expect(document.activeElement).toBe(heading);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('audit entries never carry the record id — fixed event names only', async () => {
    await mount({});
    await createFullDraft();
    await click('Mark ready');
    const state = storedState();
    const recordId = state.executionRecords[0].id;
    expect(recordId.length).toBeGreaterThanOrEqual(8);
    const serialized = JSON.stringify(state.auditLog);
    expect(serialized).not.toContain(recordId);
    expect(state.auditLog.map((e) => e.command)).toEqual(
      expect.arrayContaining(['execution_record_created', 'execution_status_changed']),
    );
    for (const entry of state.auditLog) {
      expect(entry.command).not.toContain('·');
    }
  });

  it('disables record mutations honestly when persistence is suppressed', async () => {
    // An unreadable blob + failing writes → boot recovery cannot preserve the
    // original, so canPersist === false for the whole session.
    await mount({ seed: '{broken-json', failWrites: true });
    expect(button('+ New record').disabled).toBe(true);
    expect(container.textContent).toContain('Execution records are read-only right now');
    expect(container.textContent).not.toContain('Saved');
  });
});
