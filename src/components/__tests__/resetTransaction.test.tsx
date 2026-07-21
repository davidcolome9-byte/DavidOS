// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { StoreProvider, useStore } from '../../state/store';
import Settings from '../Settings';
import { STORAGE_KEY, RECOVERY_KEY_PREFIX } from '../../lib/storage/localStore';
import {
  commitJournalState,
  JOURNAL_GENERATION_PREFIX,
  JOURNAL_HEAD_KEYS,
  selectJournalAuthority,
} from '../../lib/storage/stateJournal';
import { buildDefaultState } from '../../data/defaultState';
import { HEALTH_DRAFT_KEY, saveHealthDraft } from '../../lib/health/profileDraft';
import type { AppState, HealthFitnessProfile } from '../../lib/types';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

type Op = ['set' | 'remove', string, string?];

function fakeLocalStorage() {
  const store = new Map<string, string>();
  const ops: Op[] = [];
  let failGenerationWrites = false;
  let failRecoveryWrites = false;
  let throwAfterHeadWrite = false;
  return {
    store,
    ops,
    setFailGenerationWrites(value: boolean) { failGenerationWrites = value; },
    setFailRecoveryWrites(value: boolean) { failRecoveryWrites = value; },
    setThrowAfterHeadWrite(value: boolean) { throwAfterHeadWrite = value; },
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failGenerationWrites && key.startsWith(JOURNAL_GENERATION_PREFIX)) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      if (failRecoveryWrites && key.startsWith(RECOVERY_KEY_PREFIX)) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      ops.push(['set', key, String(value)]);
      store.set(key, String(value));
      if (throwAfterHeadWrite && JOURNAL_HEAD_KEYS.includes(key as never)) {
        throwAfterHeadWrite = false;
        throw new Error('synthetic interruption after head write');
      }
    },
    removeItem: (key: string) => {
      ops.push(['remove', key]);
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  };
}

class LockHarness {
  private paused = false;
  private gate: Promise<void> | null = null;
  private releaseGate: (() => void) | null = null;
  private enteredGate: (() => void) | null = null;
  waiting: Promise<void> = Promise.resolve();

  request = async (_name: string, _options: LockOptions, callback: () => Promise<unknown>) => {
    if (this.paused && this.gate) {
      this.paused = false;
      this.enteredGate?.();
      await this.gate;
    }
    return callback();
  };

  pauseNext() {
    this.paused = true;
    this.waiting = new Promise((resolve) => { this.enteredGate = resolve; });
    this.gate = new Promise((resolve) => { this.releaseGate = resolve; });
  }

  release() {
    this.releaseGate?.();
    this.releaseGate = null;
    this.gate = null;
  }
}

const DRAFT: HealthFitnessProfile = {
  id: 'syn-reset-draft-profile',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  nutritionTargets: { calories: 6262, notes: 'SYN-RESET-DRAFT-NOTE-B2' },
};

let container: HTMLElement;
let root: Root | null = null;
let storage: ReturnType<typeof fakeLocalStorage>;
let baseline: AppState;
let locks: LockHarness;
let probedState: AppState | null = null;

function StateProbe() {
  const { state } = useStore();
  useEffect(() => { probedState = state; });
  return null;
}

beforeEach(() => {
  storage = fakeLocalStorage();
  baseline = buildDefaultState();
  baseline.settings.theme = 'light';
  storage.store.set(STORAGE_KEY, JSON.stringify(baseline));
  locks = new LockHarness();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(navigator, 'locks', {
    value: { request: locks.request },
    configurable: true,
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  locks.release();
  if (root) await act(async () => root!.unmount());
  root = null;
  container.remove();
  Reflect.deleteProperty(navigator, 'locks');
  vi.restoreAllMocks();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountSettings() {
  probedState = null;
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StoreProvider>
        <MemoryRouter>
          <Settings />
          <StateProbe />
        </MemoryRouter>
      </StoreProvider>,
    );
  });
  await flush();
}

function pageButton(pattern: RegExp): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')]
    .find((item) => pattern.test(item.textContent ?? ''));
  if (!button) throw new Error(`button ${pattern} not found`);
  return button as HTMLButtonElement;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
}

async function setInput(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function openResetAndType() {
  await click(pageButton(/^Reset to seed$/));
  await setInput(container.querySelector<HTMLInputElement>('#reset-confirm')!, 'RESET');
  await flush();
}

const confirmButton = () => pageButton(/^Reset (\(keep Health Profile\)|\+ delete Health Profile)$/);
const generationWrites = () => storage.ops.filter(
  ([op, key]) => op === 'set' && key.startsWith(JOURNAL_GENERATION_PREFIX),
);
const headWrites = () => storage.ops.filter(
  ([op, key]) => op === 'set' && JOURNAL_HEAD_KEYS.includes(key as never),
);
const committedState = (): AppState => {
  const raw = selectJournalAuthority(storage as unknown as Storage).authority?.raw;
  if (!raw) throw new Error('journal authority missing');
  return JSON.parse(raw) as AppState;
};

function seedDraft() {
  expect(saveHealthDraft(DRAFT, null, '2026-01-02T00:00:00.000Z', storage as unknown as Storage).ok).toBe(true);
}

describe('journal-backed reset transaction', () => {
  it('writes one generation and one head; the actual first payload has reset state and completion audit', async () => {
    await mountSettings();
    await openResetAndType();
    storage.ops.length = 0;
    await click(confirmButton());

    expect(generationWrites()).toHaveLength(1);
    expect(headWrites()).toHaveLength(1);
    const first = JSON.parse(generationWrites()[0][2]!) as AppState;
    expect(first.settings.theme).toBe('dark');
    expect(first.auditLog.find((entry) => entry.command.includes('Reset to seed') && entry.command.includes('completed')))
      .toMatchObject({ actionTaken: true, approvalStatus: 'approved' });
    expect(committedState()).toEqual(first);
    expect(probedState).toEqual(first);
    expect(generationWrites()).toHaveLength(1);
  });

  it('does not clear auxiliary draft data until after the verified head write', async () => {
    seedDraft();
    await mountSettings();
    await openResetAndType();
    storage.ops.length = 0;
    await click(confirmButton());

    const generationIndex = storage.ops.findIndex(([, key]) => key.startsWith(JOURNAL_GENERATION_PREFIX));
    const headIndex = storage.ops.findIndex(([, key]) => JOURNAL_HEAD_KEYS.includes(key as never));
    const draftIndex = storage.ops.findIndex(([op, key]) => op === 'remove' && key === HEALTH_DRAFT_KEY);
    expect(generationIndex).toBeGreaterThanOrEqual(0);
    expect(headIndex).toBeGreaterThan(generationIndex);
    expect(draftIndex).toBeGreaterThan(headIndex);
    expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(false);
  });

  it('keeps active state and auxiliary data unchanged while the exclusive lock is waiting', async () => {
    seedDraft();
    await mountSettings();
    await openResetAndType();
    const before = JSON.stringify(probedState);
    storage.ops.length = 0;
    locks.pauseNext();
    await click(confirmButton());
    await locks.waiting;

    expect(JSON.stringify(probedState)).toBe(before);
    expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(true);
    expect(generationWrites()).toHaveLength(0);
    locks.release();
    await flush();
    expect(JSON.stringify(probedState)).not.toBe(before);
  });

  it('safe candidate-write failure leaves full active state and draft unchanged with no failure audit', async () => {
    seedDraft();
    await mountSettings();
    await openResetAndType();
    const before = JSON.stringify(probedState);
    const draftBefore = storage.store.get(HEALTH_DRAFT_KEY);
    storage.ops.length = 0;
    storage.setFailGenerationWrites(true);
    await click(confirmButton());

    expect(JSON.stringify(probedState)).toBe(before);
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(draftBefore);
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    expect(container.textContent).toContain('Reset failed');
    expect(probedState!.auditLog.some((entry) => entry.command.includes('Reset') && entry.command.includes('failed'))).toBe(false);
  });

  it('uncertain landed-head outcome leaves active state unchanged and suppresses later saving', async () => {
    await mountSettings();
    await openResetAndType();
    const before = JSON.stringify(probedState);
    storage.ops.length = 0;
    storage.setThrowAfterHeadWrite(true);
    await click(confirmButton());

    expect(JSON.stringify(probedState)).toBe(before);
    expect(generationWrites()).toHaveLength(1);
    expect(headWrites()).toHaveLength(1);
    expect(container.textContent).toContain('could not be confirmed as saved');
    storage.ops.length = 0;
    await click(pageButton(/^Switch to dark mode$/));
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    await openResetAndType();
    expect(confirmButton().disabled).toBe(true);
  });

  it('stale expected generation is rejected inside the lock before any reset generation or head write', async () => {
    await mountSettings();
    await openResetAndType();
    const current = selectJournalAuthority(storage as unknown as Storage).authority!;
    let id = 0;
    const external = await commitJournalState(
      { ...committedState(), settings: { ...committedState().settings, theme: 'dark' } },
      {
        storage: storage as unknown as Storage,
        expectedGeneration: current.generationId,
        idFactory: () => `external-reset-${++id}`,
      },
    );
    expect(external.ok).toBe(true);
    const externalRaw = selectJournalAuthority(storage as unknown as Storage).authority!.raw;
    const before = JSON.stringify(probedState);
    storage.ops.length = 0;
    await click(confirmButton());

    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    expect(selectJournalAuthority(storage as unknown as Storage).authority!.raw).toBe(externalRaw);
    expect(JSON.stringify(probedState)).toBe(before);
    expect(container.textContent).toContain('another tab');
  });

  it('unsupported Web Locks blocks reset before creating a generation or head', async () => {
    Reflect.deleteProperty(navigator, 'locks');
    await mountSettings();
    await openResetAndType();

    expect(confirmButton().disabled).toBe(true);
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    expect(storage.store.get(STORAGE_KEY)).toBe(JSON.stringify(baseline));
  });

  it('preservation failure blocks reset without journal mutation', async () => {
    storage.store.set(STORAGE_KEY, JSON.stringify({ ...baseline, prompts: 'damaged' }));
    storage.setFailRecoveryWrites(true);
    await mountSettings();
    await openResetAndType();

    expect(confirmButton().disabled).toBe(true);
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
  });

  it('does not expose draft values in UI, journal metadata, or logs on failure', async () => {
    const lines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => lines.push(args.join(' ')));
    }
    seedDraft();
    await mountSettings();
    await openResetAndType();
    storage.setFailGenerationWrites(true);
    await click(confirmButton());
    const visible = `${container.textContent ?? ''}\n${lines.join('\n')}\n${headWrites().map((op) => op[2]).join('\n')}`;
    expect(visible).not.toContain('6262');
    expect(visible).not.toContain('SYN-RESET-DRAFT-NOTE-B2');
  });
});
