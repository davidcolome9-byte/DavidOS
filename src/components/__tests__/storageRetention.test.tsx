// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { StoreProvider } from '../../state/store';
import Settings from '../Settings';
import { STORAGE_KEY } from '../../lib/storage/localStore';
import { buildDefaultState } from '../../data/defaultState';
import type { AppState, Handoff, WorkflowArtifact } from '../../lib/types';

// OL-003 storage retention — the guarded prune flow. Pruning must be an
// explicit user action (type PRUNE), show its exact effect first, delete only
// the oldest artifacts beyond the keep-count, and never touch handoffs or any
// other collection. All fixture values are synthetic.

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

function synHandoff(id: string): Handoff {
  return {
    id,
    agentId: 'universal_ops',
    workflowId: 'syn-workflow',
    workflowName: 'SYN Workflow',
    inputSummary: `SYN-HANDOFF-${id}`,
    outputStyle: 'concise',
    content: `SYN-HANDOFF-CONTENT-${id}`,
    risk: 'read_only',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
  } as unknown as Handoff;
}

// Oldest → a1, newest → a4. Stored newest-first like the app prepends.
const ARTIFACTS = [
  synArtifact('a4', '2026-04-01T00:00:00.000Z'),
  synArtifact('a3', '2026-03-01T00:00:00.000Z'),
  synArtifact('a2', '2026-02-01T00:00:00.000Z'),
  synArtifact('a1', '2026-01-01T00:00:00.000Z'),
];
const HANDOFFS = [synHandoff('h1'), synHandoff('h2')];

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

let container: HTMLElement;
let root: Root | null = null;
let storage: ReturnType<typeof fakeLocalStorage>;
let baseline: AppState;

beforeEach(() => {
  storage = fakeLocalStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  baseline = { ...buildDefaultState(), artifacts: ARTIFACTS, handoffs: HANDOFFS };
  storage.store.set(STORAGE_KEY, JSON.stringify(baseline));
  container = document.createElement('div');
  document.body.appendChild(container);
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

/** Set a controlled React input's value and fire the change. */
async function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const storedState = (): AppState => JSON.parse(storage.store.get(STORAGE_KEY)!) as AppState;

async function openPruneDialog() {
  await click(byTestId('storage-prune-open')!);
  const dialog = byTestId('storage-prune-dialog');
  expect(dialog).not.toBeNull();
  return dialog!;
}

describe('storage meter', () => {
  it('shows total usage, a per-collection breakdown, and the meter bar', async () => {
    await mountSettings();
    expect(byTestId('storage-meter')).not.toBeNull();
    expect(byTestId('storage-usage-total')?.textContent).toMatch(/Using about/);
    const breakdown = byTestId('storage-breakdown')!.textContent!;
    expect(breakdown).toContain('Saved prompts (artifacts) (4)');
    expect(breakdown).toContain('Handoff history (2)');
    expect(byTestId('storage-level-badge')?.textContent).toBe('ok');
    expect(byTestId('storage-warning')).toBeNull();
  });

  it('disables pruning when there are no artifacts', async () => {
    storage.store.set(STORAGE_KEY, JSON.stringify({ ...baseline, artifacts: [] }));
    await mountSettings();
    expect(byTestId<HTMLButtonElement>('storage-prune-open')!.disabled).toBe(true);
  });
});

describe('guarded prune flow', () => {
  it('opening the dialog changes nothing and requires typing PRUNE', async () => {
    await mountSettings();
    const before = storage.store.get(STORAGE_KEY);
    const dialog = await openPruneDialog();

    // Exact effect is shown before anything happens; keep defaults to 50 →
    // nothing to delete with only 4 artifacts, so confirm stays disabled.
    expect(byTestId('storage-prune-effect')!.textContent).toContain('Nothing to delete');
    const confirm = byTestId<HTMLButtonElement>('storage-prune-confirm')!;
    expect(confirm.disabled).toBe(true);

    await setInput(byTestId<HTMLInputElement>('storage-prune-keep')!, '2');
    expect(byTestId('storage-prune-effect')!.textContent).toContain('deletes the 2 oldest');
    // Still guarded: PRUNE not typed yet.
    expect(confirm.disabled).toBe(true);
    await setInput(byTestId<HTMLInputElement>('storage-prune-confirm-text')!, 'prune');
    expect(confirm.disabled).toBe(true); // exact match required
    await setInput(byTestId<HTMLInputElement>('storage-prune-confirm-text')!, 'PRUNE');
    expect(byTestId<HTMLButtonElement>('storage-prune-confirm')!.disabled).toBe(false);

    // Dialog open + everything typed, but NOT confirmed → artifacts unchanged.
    expect(storedState().artifacts).toHaveLength(4);
    expect(dialog.isConnected).toBe(true);
    // Only audit entries may have been appended since opening.
    expect(JSON.parse(before!).artifacts).toHaveLength(4);
  });

  it('cancel deletes nothing and audits the denial', async () => {
    await mountSettings();
    await openPruneDialog();
    await setInput(byTestId<HTMLInputElement>('storage-prune-keep')!, '1');
    await setInput(byTestId<HTMLInputElement>('storage-prune-confirm-text')!, 'PRUNE');
    await click(byTestId('storage-prune-cancel')!);

    expect(byTestId('storage-prune-dialog')).toBeNull();
    const s = storedState();
    expect(s.artifacts.map((a) => a.id)).toEqual(['a4', 'a3', 'a2', 'a1']);
    const cancelled = s.auditLog.find((e) => e.command === 'Prune saved prompts — cancelled');
    expect(cancelled?.actionTaken).toBe(false);
    expect(cancelled?.approvalStatus).toBe('denied');
  });

  it('a confirmed prune keeps the newest N, persists, audits, and never touches handoffs', async () => {
    await mountSettings();
    await openPruneDialog();
    await setInput(byTestId<HTMLInputElement>('storage-prune-keep')!, '2');
    await setInput(byTestId<HTMLInputElement>('storage-prune-confirm-text')!, 'PRUNE');
    await click(byTestId('storage-prune-confirm')!);

    expect(byTestId('storage-prune-dialog')).toBeNull();
    const s = storedState();
    // Newest two by createdAt survive in their original order.
    expect(s.artifacts.map((a) => a.id)).toEqual(['a4', 'a3']);
    // Handoffs (append-only canonical history) are byte-identical.
    expect(s.handoffs).toEqual(JSON.parse(JSON.stringify(HANDOFFS)));
    // Every other collection is untouched.
    expect(s.prompts).toEqual(baseline.prompts);
    expect(s.projects).toEqual(baseline.projects);
    const done = s.auditLog.find((e) => e.command === 'Prune saved prompts — completed');
    expect(done?.actionTaken).toBe(true);
    expect(done?.approvalStatus).toBe('approved');
    expect(done?.resultSummary).toContain('2 oldest');
    expect(done?.resultSummary).toContain('newest 2');
    // The UI reports the outcome.
    expect(container.textContent).toContain('Deleted 2 saved prompt(s)');
  });

  it('keep-count 0 is allowed but still requires the typed confirmation', async () => {
    await mountSettings();
    await openPruneDialog();
    await setInput(byTestId<HTMLInputElement>('storage-prune-keep')!, '0');
    expect(byTestId('storage-prune-effect')!.textContent).toContain('deletes the 4 oldest');
    expect(byTestId<HTMLButtonElement>('storage-prune-confirm')!.disabled).toBe(true);
    await setInput(byTestId<HTMLInputElement>('storage-prune-confirm-text')!, 'PRUNE');
    await click(byTestId('storage-prune-confirm')!);
    expect(storedState().artifacts).toEqual([]);
    expect(storedState().handoffs).toHaveLength(2);
  });
});
