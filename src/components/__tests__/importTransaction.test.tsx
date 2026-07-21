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
import { serializeState } from '../../lib/storage/exportImport';
import { HEALTH_DRAFT_KEY, saveHealthDraft } from '../../lib/health/profileDraft';
import { buildDefaultState } from '../../data/defaultState';
import type { AppState, HealthFitnessProfile } from '../../lib/types';

// DOS-STAB-001A Phase 2A2b — Import runs on the SAME journal-backed
// destructive transaction as StoreProvider, Reset, and Prune: exactly one
// candidate generation carrying the COMPLETE imported state (audit included),
// exactly one verified head advancement, authority captured synchronously
// AFTER every await and re-read inside the exclusive lock, drafts cleared
// only after verified success, and honest safe-vs-uncertain messaging.
// All values synthetic.

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
  id: 'syn-import-draft-profile',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  nutritionTargets: { calories: 7373, notes: 'SYN-IMPORT-DRAFT-NOTE' },
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

/** Test control: swaps the Health Profile id mid-flow (same-tab update). */
function ProfileSwapper() {
  const { update } = useStore();
  return (
    <button
      data-testid="swap-profile"
      onClick={() =>
        update((s) => ({
          ...s,
          healthProfile: s.healthProfile ? { ...s.healthProfile, id: 'syn-profile-b' } : s.healthProfile,
        }))
      }
    >
      swap profile
    </button>
  );
}

beforeEach(() => {
  storage = fakeLocalStorage();
  baseline = buildDefaultState();
  storage.store.set(STORAGE_KEY, JSON.stringify(baseline));
  locks = new LockHarness();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(navigator, 'locks', {
    value: { request: locks.request },
    configurable: true,
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
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
          <ProfileSwapper />
        </MemoryRouter>
      </StoreProvider>,
    );
  });
  await flush();
}

/** Remount from scratch — simulates closing and reopening the app. */
async function remountSettings() {
  await act(async () => root!.unmount());
  root = null;
  container.remove();
  container = document.createElement('div');
  document.body.appendChild(container);
  await mountSettings();
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

/** A valid light-theme backup with no Health Profile → no conflict dialog. */
function lightThemeBackup(): string {
  const s: AppState = JSON.parse(JSON.stringify(buildDefaultState())) as AppState;
  s.settings.theme = 'light';
  s.healthProfile = null;
  return serializeState(s);
}

async function importBackup(json: string, name = 'backup.json') {
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  const file = new File([json], name, { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
  await flush();
}

/** A file-like object whose text() resolves only when the test says so. */
function deferredFile(json: string, name = 'backup.json') {
  let resolveText!: (v: string) => void;
  const promise = new Promise<string>((r) => {
    resolveText = r;
  });
  const file = { name, text: () => promise } as unknown as File;
  return { file, resolve: () => resolveText(json) };
}

/** Start an import without resolving the file read yet. */
async function startImport(file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/** Resolve the pending file read and flush the resumed import flow. */
async function resolveImport(d: { resolve: () => void }) {
  await act(async () => {
    d.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  await flush();
  await flush();
}

/** Simulate another tab's head write reaching this tab as a storage event. */
async function fireExternalHeadEvent() {
  const ev = new Event('storage');
  Object.defineProperty(ev, 'key', { value: JOURNAL_HEAD_KEYS[0] });
  await act(async () => {
    window.dispatchEvent(ev);
  });
  await flush();
}

const generationWrites = () => storage.ops.filter(
  ([op, key]) => op === 'set' && key.startsWith(JOURNAL_GENERATION_PREFIX),
);
const headWrites = () => storage.ops.filter(
  ([op, key]) => op === 'set' && JOURNAL_HEAD_KEYS.includes(key as never),
);
const legacyWrites = () => storage.ops.filter(([op, key]) => op === 'set' && key === STORAGE_KEY);
const committedState = (): AppState => {
  const raw = selectJournalAuthority(storage as unknown as Storage).authority?.raw;
  if (!raw) throw new Error('journal authority missing');
  return JSON.parse(raw) as AppState;
};
const flashText = () => container.querySelector('.flash')?.textContent ?? '';

function seedDraft() {
  expect(saveHealthDraft(DRAFT, null, '2026-01-02T00:00:00.000Z', storage as unknown as Storage).ok).toBe(true);
}

/** Advance the journal from another (simulated) tab. */
async function advanceExternalAuthority(prefix: string): Promise<string> {
  const current = selectJournalAuthority(storage as unknown as Storage).authority!;
  let id = 0;
  const external = await commitJournalState(
    { ...committedState(), priorities: [{ id: `syn-${prefix}`, label: `SYN-${prefix.toUpperCase()}`, rank: 1 }] } as AppState,
    {
      storage: storage as unknown as Storage,
      expectedGeneration: current.generationId,
      idFactory: () => `${prefix}-${++id}`,
    },
  );
  expect(external.ok).toBe(true);
  return selectJournalAuthority(storage as unknown as Storage).authority!.raw;
}

describe('journal-backed import transaction — success', () => {
  it('writes one generation and one head; the actual first payload is the complete imported state with its audit', async () => {
    await mountSettings();
    storage.ops.length = 0;
    await importBackup(lightThemeBackup());

    expect(flashText()).toContain('Import complete');
    expect(generationWrites()).toHaveLength(1);
    expect(headWrites()).toHaveLength(1);
    expect(legacyWrites()).toHaveLength(0);
    const first = JSON.parse(generationWrites()[0][2]!) as AppState;
    expect(first.settings.theme).toBe('light');
    const entry = first.auditLog.find((e) => e.command === 'Import backup');
    expect(entry).toMatchObject({ actionTaken: true, approvalStatus: 'approved' });
    // Committed authority IS the first candidate; active state matches it and
    // no second provider write followed.
    expect(committedState()).toEqual(first);
    expect(probedState).toEqual(first);
    expect(generationWrites()).toHaveLength(1);
  });

  it('reloading after a successful import restores the imported state', async () => {
    await mountSettings();
    await importBackup(lightThemeBackup());
    await remountSettings();

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(pageButton(/^Switch to dark mode$/)).toBeTruthy();
  });

  it('a confirmed-discard draft is cleared only AFTER the verified head advancement', async () => {
    seedDraft();
    await mountSettings();
    storage.ops.length = 0;
    await importBackup(lightThemeBackup());
    // The draft guard raises its dialog — explicitly discard to continue.
    await click(pageButton(/Discard edits & import/));

    expect(flashText()).toContain('Import complete');
    const generationIndex = storage.ops.findIndex(([, key]) => key.startsWith(JOURNAL_GENERATION_PREFIX));
    const headIndex = storage.ops.findIndex(([, key]) => JOURNAL_HEAD_KEYS.includes(key as never));
    const draftIndex = storage.ops.findIndex(([op, key]) => op === 'remove' && key === HEALTH_DRAFT_KEY);
    expect(generationIndex).toBeGreaterThanOrEqual(0);
    expect(headIndex).toBeGreaterThan(generationIndex);
    expect(draftIndex).toBeGreaterThan(headIndex);
    expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(false);
  });

  it('keep-current Health Profile uses the CURRENT authoritative profile, not the pre-await one', async () => {
    await mountSettings();
    // The backup carries no profile → the flow keeps the current one.
    const d = deferredFile(lightThemeBackup());
    await startImport(d.file);

    // While the file read is pending, the profile changes in THIS tab.
    await click(container.querySelector<HTMLElement>('[data-testid="swap-profile"]')!);

    await resolveImport(d);

    expect(flashText()).toContain('Import complete');
    expect(committedState().healthProfile?.id).toBe('syn-profile-b');
  });
});

describe('delayed File.text(): authority is captured AFTER the await and re-read inside the lock', () => {
  it('an external head advance DELIVERED as a storage event blocks the import with no journal mutation', async () => {
    seedDraft();
    await mountSettings();
    const stateBefore = JSON.stringify(probedState);
    const draftBefore = storage.store.get(HEALTH_DRAFT_KEY);
    const d = deferredFile(lightThemeBackup());
    await startImport(d.file);

    const externalRaw = await advanceExternalAuthority('external-evt');
    await fireExternalHeadEvent();
    storage.ops.length = 0;

    await resolveImport(d);
    // A pre-existing draft raises the guard first — discard to reach the commit.
    await click(pageButton(/Discard edits & import/));

    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    expect(legacyWrites()).toHaveLength(0);
    expect(selectJournalAuthority(storage as unknown as Storage).authority!.raw).toBe(externalRaw);
    expect(JSON.stringify(probedState)).toBe(stateBefore);
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(draftBefore);
    expect(flashText()).toContain('Import failed');
    expect(flashText()).toContain('another tab');
    expect(flashText()).not.toContain('Import complete');
  });

  it('an external head advance NOT yet delivered as an event is still refused inside the lock', async () => {
    await mountSettings();
    const stateBefore = JSON.stringify(probedState);
    const d = deferredFile(lightThemeBackup());
    await startImport(d.file);

    const externalRaw = await advanceExternalAuthority('external-silent');
    storage.ops.length = 0;

    await resolveImport(d);

    // The stale expectation is rejected BEFORE any candidate generation.
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    expect(selectJournalAuthority(storage as unknown as Storage).authority!.raw).toBe(externalRaw);
    expect(JSON.stringify(probedState)).toBe(stateBefore);
    expect(flashText()).toContain('Import failed');
    expect(flashText()).toContain('another tab');
  });

  it('authority current before the lock, advanced while waiting: import re-reads and aborts inside the lock', async () => {
    await mountSettings();
    const stateBefore = JSON.stringify(probedState);
    const d = deferredFile(lightThemeBackup());
    await startImport(d.file);

    // The import will be NEXT to request the exclusive lock — pause it there.
    locks.pauseNext();
    await act(async () => {
      d.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await locks.waiting;

    // While the import waits for the lock, another transaction advances the head.
    const externalRaw = await advanceExternalAuthority('external-lock');
    storage.ops.length = 0;

    locks.release();
    await flush();
    await flush();

    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    expect(selectJournalAuthority(storage as unknown as Storage).authority!.raw).toBe(externalRaw);
    expect(JSON.stringify(probedState)).toBe(stateBefore);
    expect(flashText()).toContain('Import failed');
  });
});

describe('blocked import — no journal mutation, no fallback write', () => {
  it('unsupported Web Locks blocks import before any candidate generation', async () => {
    Reflect.deleteProperty(navigator, 'locks');
    seedDraft();
    await mountSettings();
    const stateBefore = JSON.stringify(probedState);
    const draftBefore = storage.store.get(HEALTH_DRAFT_KEY);
    storage.ops.length = 0;
    await importBackup(lightThemeBackup());
    await click(pageButton(/Discard edits & import/));

    expect(flashText()).toContain('Import failed');
    expect(flashText()).toContain('Nothing was changed.');
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    expect(legacyWrites()).toHaveLength(0);
    expect(JSON.stringify(probedState)).toBe(stateBefore);
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(draftBefore);
    expect(storage.store.get(STORAGE_KEY)).toBe(JSON.stringify(baseline));
  });

  it('preservation failure (recovery boot) blocks import without journal mutation', async () => {
    const damaged = JSON.stringify({ ...baseline, prompts: 'junk' });
    storage.store.set(STORAGE_KEY, damaged);
    storage.setFailRecoveryWrites(true);
    await mountSettings();
    storage.ops.length = 0;
    await importBackup(lightThemeBackup());

    expect(flashText()).toContain('Import failed');
    expect(flashText()).not.toContain('Import complete');
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    expect(storage.store.get(STORAGE_KEY)).toBe(damaged); // only copy untouched
  });
});

describe('safe failure — proven unchanged, honestly worded', () => {
  it('candidate-write failure leaves state, draft, and authority deeply unchanged with no failure audit', async () => {
    seedDraft();
    await mountSettings();
    const stateBefore = JSON.stringify(probedState);
    const draftBefore = storage.store.get(HEALTH_DRAFT_KEY);
    const authorityBefore = selectJournalAuthority(storage as unknown as Storage).authority!.raw;
    storage.ops.length = 0;
    storage.setFailGenerationWrites(true);
    await importBackup(lightThemeBackup());
    await click(pageButton(/Discard edits & import/));

    expect(flashText()).toContain('Import failed');
    expect(flashText()).toContain('Nothing was changed.');
    expect(JSON.stringify(probedState)).toBe(stateBefore);
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(draftBefore);
    expect(selectJournalAuthority(storage as unknown as Storage).authority!.raw).toBe(authorityBefore);
    expect(headWrites()).toHaveLength(0);
    expect(probedState!.auditLog.some((e) => e.command.includes('Import') && e.command.includes('failed'))).toBe(false);
  });

  it('no draft: the safe-failure message never claims draft edits were preserved', async () => {
    await mountSettings();
    storage.setFailGenerationWrites(true);
    await importBackup(lightThemeBackup());

    expect(flashText()).toContain('Import failed');
    expect(flashText()).toContain('Nothing was changed.');
    expect(flashText()).not.toMatch(/edits were kept|draft/i);
  });

  it('with a draft: the preserved-draft claim appears only because the draft verifiably survived', async () => {
    seedDraft();
    await mountSettings();
    storage.setFailGenerationWrites(true);
    await importBackup(lightThemeBackup());
    await click(pageButton(/Discard edits & import/));

    expect(flashText()).toContain('Import failed');
    expect(flashText()).toContain('Nothing was changed.');
    expect(flashText()).toContain('Your unsaved Health Profile edits were kept.');
    expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(true);
  });
});

describe('uncertain outcome — honest wording, suppression, no rollback', () => {
  it('an interruption after the head write leaves active state and draft unchanged and pauses saving', async () => {
    seedDraft();
    await mountSettings();
    const stateBefore = JSON.stringify(probedState);
    const draftBefore = storage.store.get(HEALTH_DRAFT_KEY);
    storage.ops.length = 0;
    storage.setThrowAfterHeadWrite(true);
    await importBackup(lightThemeBackup());
    await click(pageButton(/Discard edits & import/));

    // Active state and draft untouched; no rollback removed the landed bytes.
    expect(JSON.stringify(probedState)).toBe(stateBefore);
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(draftBefore);
    expect(storage.ops.filter(([op, key]) => op === 'remove' && key.startsWith(JOURNAL_GENERATION_PREFIX))).toHaveLength(0);

    // Honest wording: no "nothing changed", no rollback claim, reload guidance.
    expect(flashText()).toContain('Import failed');
    expect(flashText()).not.toContain('Nothing was changed');
    expect(flashText()).not.toMatch(/rolled back|is unchanged/i);
    expect(flashText()).toContain('could not be confirmed');
    expect(flashText()).toMatch(/reload/i);

    // Future persistence is suppressed: a state change writes nothing.
    storage.ops.length = 0;
    await click(pageButton(/^Switch to light mode$/));
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
  });
});

describe('privacy — import failures never leak draft or imported values', () => {
  it('does not expose draft values in UI, journal metadata, or logs on failure', async () => {
    const lines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => lines.push(args.join(' ')));
    }
    seedDraft();
    await mountSettings();
    storage.setFailGenerationWrites(true);
    await importBackup(lightThemeBackup());
    await click(pageButton(/Discard edits & import/));

    const visible = `${container.textContent ?? ''}\n${lines.join('\n')}\n${headWrites().map((op) => op[2]).join('\n')}`;
    expect(visible).not.toContain('7373');
    expect(visible).not.toContain('SYN-IMPORT-DRAFT-NOTE');
    // No storage keys, generation ids, or raw JSON in the visible UI either.
    expect(container.textContent).not.toContain(JOURNAL_GENERATION_PREFIX);
    expect(container.textContent).not.toContain(STORAGE_KEY);
  });
});
