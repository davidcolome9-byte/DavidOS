// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from '../../state/store';
import Settings from '../Settings';
import Layout from '../Layout';
import { STORAGE_KEY, RECOVERY_KEY_PREFIX, normalizeState } from '../../lib/storage/localStore';
import {
  commitJournalState,
  JOURNAL_GENERATION_PREFIX,
  JOURNAL_HEAD_KEYS,
  journalGenerationKey,
  selectJournalAuthority,
} from '../../lib/storage/stateJournal';
import { sha256Hex } from '../../lib/utils/hash';
import { buildDefaultState } from '../../data/defaultState';
import { QUOTA_UNITS_ESTIMATE } from '../../lib/storage/storageUsage';
import type { AppState, Handoff, WorkflowArtifact } from '../../lib/types';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function artifact(id: string, createdAt: string): WorkflowArtifact {
  return {
    id,
    workflowId: 'syn-workflow',
    artifactType: 'full_prompt',
    createdAt,
    title: `SYN-ARTIFACT-${id}`,
    content: `SYN-PROMPT-CONTENT-${id}`,
  };
}

function handoff(id: string): Handoff {
  return {
    id,
    agentId: 'universal-operations',
    workflowId: 'syn-workflow',
    workflowName: 'SYN Workflow',
    inputSummary: `SYN-HANDOFF-${id}`,
    outputStyle: 'concise',
    content: `SYN-HANDOFF-CONTENT-${id}`,
    risk: 'read_only',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
  };
}

const ARTIFACTS = [
  artifact('a4', '2026-04-01T00:00:00.000Z'),
  artifact('a3', '2026-03-01T00:00:00.000Z'),
  artifact('a2', '2026-02-01T00:00:00.000Z'),
  artifact('a1', '2026-01-01T00:00:00.000Z'),
];
const HANDOFFS = [handoff('h1'), handoff('h2')];

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

let container: HTMLElement;
let root: Root | null = null;
let storage: ReturnType<typeof fakeLocalStorage>;
let baseline: AppState;
let locks: LockHarness;
let probedState: AppState | null = null;
let probedUpdate: ((fn: (s: AppState) => AppState) => void) | null = null;
let probedCommittedSequence = 0;

function StateProbe() {
  const { state, update, committedSequence } = useStore();
  useEffect(() => {
    probedState = state;
    probedUpdate = update;
    probedCommittedSequence = committedSequence;
  });
  return null;
}

beforeEach(() => {
  storage = fakeLocalStorage();
  baseline = { ...buildDefaultState(), artifacts: ARTIFACTS, handoffs: HANDOFFS };
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
  probedUpdate = null;
  probedCommittedSequence = 0;
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

async function mountLayout() {
  probedState = null;
  probedUpdate = null;
  probedCommittedSequence = 0;
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StoreProvider>
        <MemoryRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<StateProbe />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </StoreProvider>,
    );
  });
  await flush();
}

/**
 * Seed a VALID single-generation journal whose one committed generation is a
 * synthetic state sized to `fraction` of the apparent quota. Because the
 * generation is authoritative and its raw round-trips through normalizeState
 * unchanged, the provider performs no migration or rewrite on mount — so the
 * enumerated total-origin usage is deterministic and drives classification.
 */
function seedSizedJournal(fraction: number) {
  storage.store.clear();
  const sized: AppState = {
    ...buildDefaultState(),
    artifacts: [artifact('sized', '2026-01-01T00:00:00.000Z')],
  };
  sized.artifacts[0] = {
    ...sized.artifacts[0],
    content: 'X'.repeat(Math.ceil(QUOTA_UNITS_ESTIMATE * fraction)),
  };
  // Store the NORMALIZED form so the raw is a fixed point of normalizeState:
  // boot re-normalizes to a byte-identical string, so the provider enqueues no
  // rewrite (equivalentState is true) and the enumerated total stays exactly
  // what we seed — no extra generation inflates the measurement.
  const raw = JSON.stringify(normalizeState(sized));
  const generationId = 'sized-generation-000001';
  const head = {
    journalVersion: 1 as const,
    sequence: 1,
    generationId,
    previousGenerationId: null,
    transactionId: 'sized-transaction-000001',
    generationHash: sha256Hex(raw),
    generationLength: raw.length,
    previousGenerationHash: null,
    previousGenerationLength: null,
  };
  storage.store.set(journalGenerationKey(generationId), raw);
  storage.store.set(JOURNAL_HEAD_KEYS[0], JSON.stringify(head));
}

/** Stub the object-URL download plumbing so real download controls can run in
 *  happy-dom; returns a counter of how many object URLs were created. */
function stubDownloads(): { count: () => number; restore: () => void } {
  const url = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
  const origCreate = url.createObjectURL;
  const origRevoke = url.revokeObjectURL;
  let created = 0;
  url.createObjectURL = () => { created += 1; return 'blob:stub'; };
  url.revokeObjectURL = () => {};
  return {
    count: () => created,
    restore: () => { url.createObjectURL = origCreate; url.revokeObjectURL = origRevoke; },
  };
}

const byTestId = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  container.querySelector<T>(`[data-testid="${id}"]`);

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

async function openAndArmPrune() {
  await click(byTestId('storage-prune-open')!);
  await setInput(byTestId<HTMLInputElement>('storage-prune-keep')!, '2');
  await setInput(byTestId<HTMLInputElement>('storage-prune-confirm-text')!, 'PRUNE');
  await flush();
}

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

describe('storage retention UI', () => {
  it('shows usage and requires the exact typed confirmation', async () => {
    await mountSettings();
    expect(byTestId('storage-breakdown')!.textContent).toContain('Saved prompts (artifacts) (4)');
    await click(byTestId('storage-prune-open')!);
    await setInput(byTestId<HTMLInputElement>('storage-prune-keep')!, '2');
    expect(byTestId('storage-prune-effect')!.textContent).toContain('deletes the 2 oldest');
    expect(byTestId<HTMLButtonElement>('storage-prune-confirm')!.disabled).toBe(true);
    await setInput(byTestId<HTMLInputElement>('storage-prune-confirm-text')!, 'prune');
    expect(byTestId<HTMLButtonElement>('storage-prune-confirm')!.disabled).toBe(true);
    await setInput(byTestId<HTMLInputElement>('storage-prune-confirm-text')!, 'PRUNE');
    expect(byTestId<HTMLButtonElement>('storage-prune-confirm')!.disabled).toBe(false);
  });

  it('cancel leaves artifacts unchanged', async () => {
    await mountSettings();
    await openAndArmPrune();
    await click(byTestId('storage-prune-cancel')!);
    expect(probedState!.artifacts.map((item) => item.id)).toEqual(['a4', 'a3', 'a2', 'a1']);
  });
});

describe('storage level classification drives displayed badge and copy (DOS-STAB-002A Stage 1)', () => {
  it('a tiny state stays ok: ok badge, no warning notice', async () => {
    await mountSettings(); // default baseline is well under 35%
    expect(byTestId('storage-level-badge')!.textContent).toBe('ok');
    expect(byTestId('storage-warning')).toBeNull();
  });

  it('total-origin usage ~38% → warning badge/copy: committed protected, export is backup-only, prune frees space', async () => {
    seedSizedJournal(0.38);
    await mountSettings();
    expect(byTestId('storage-level-badge')!.textContent).toBe('getting full');
    const warning = byTestId('storage-warning');
    expect(warning).not.toBeNull();
    const text = warning!.textContent!;
    expect(text).toContain('filling up');
    expect(text).toContain('redundant crash-safe copies');
    // Committed vs unsaved (finding 2): no "nothing is lost"; last saved data protected.
    expect(text).toContain('Your last successfully saved data stays protected');
    expect(text).toContain('new or unsaved changes may fail to save');
    expect(text).not.toContain('nothing is lost');
    // Export is backup-only; pruning/reducing history is what frees capacity (finding 3).
    expect(text).toContain('does not free local storage');
    expect(text).toContain('reducing saved history');
    expect(text).toContain('recovery downloads stay available');
    // Nothing deleted automatically (finding 2).
    expect(text).toContain('Nothing is deleted automatically');
  });

  it('total-origin usage ~50% → critical badge/copy: needs another full copy, may soon fail, committed protected', async () => {
    seedSizedJournal(0.50);
    await mountSettings();
    expect(byTestId('storage-level-badge')!.textContent).toBe('nearly full');
    const warning = byTestId('storage-warning');
    expect(warning).not.toBeNull();
    const text = warning!.textContent!;
    expect(text).toContain('nearly full');
    expect(text).toContain('another full copy before the old one is removed');
    expect(text).toContain('may soon fail');
    expect(text).toContain('Your last successfully saved data stays protected');
    expect(text).not.toContain('nothing is lost');
    expect(text).toContain('does not free local storage');
    expect(text).toContain('recovery downloads stay available');
    expect(text).toContain('Nothing is deleted automatically');
  });

  it('the meter breakdown accounts for the retained redundant crash-safe copy', async () => {
    seedSizedJournal(0.38);
    await mountSettings();
    // The enumerated total includes the journal generation, surfaced as a
    // distinct breakdown row — the total is not a single logical copy.
    expect(byTestId('storage-breakdown')!.textContent).toContain('Redundant crash-safe copies');
    // Attribution (finding 5): everything stored for this site/origin, not only
    // what DavidOS itself created.
    const totalText = byTestId('storage-usage-total')!.textContent!;
    expect(byTestId('storage-usage-total-measured')).not.toBeNull();
    expect(totalText).toContain('everything stored for this DavidOS site (browser origin)');
    expect(totalText).toContain('not only what DavidOS itself created');
  });
});

describe('the Settings export control is directly available and functional (DOS-STAB-002A finding 4)', () => {
  const exportButton = (): HTMLButtonElement => {
    const b = [...container.querySelectorAll('button')]
      .find((x) => x.textContent?.trim() === 'Export backup (JSON)');
    if (!b) throw new Error('Settings export control not found');
    return b as HTMLButtonElement;
  };

  it('renders an enabled export control and clicking it exports a backup (not via the prune proxy)', async () => {
    seedSizedJournal(0.38); // saving paused-adjacent capacity, yet export must remain available
    await mountSettings();
    const button = exportButton();
    expect(button.disabled).toBe(false);
    const downloads = stubDownloads();
    try {
      await click(button);
    } finally {
      downloads.restore();
    }
    // A real download was triggered AND the export was audited — direct proof
    // the control works, not merely that the prune entry is present.
    expect(downloads.count()).toBe(1);
    expect(probedState!.auditLog.some((entry) => entry.command === 'Export backup')).toBe(true);
  });
});

describe('recovery availability is claimed, so the actual recovery control is asserted (finding 4)', () => {
  it('a preserved recovery blob renders a working Download-preserved-original control', async () => {
    // Seed an unreadable stored blob: boot preserves the exact original under a
    // recovery key and surfaces the app-wide recovery banner + download control.
    storage.store.clear();
    storage.store.set(STORAGE_KEY, '{ this is not valid json for DavidOS state');
    await mountLayout();

    const recoveryBanner = byTestId('recovery-banner');
    expect(recoveryBanner).not.toBeNull();
    const download = byTestId<HTMLButtonElement>('recovery-download-original');
    expect(download).not.toBeNull();

    const preservedKey = [...storage.store.keys()].find((k) => k.startsWith(RECOVERY_KEY_PREFIX));
    expect(preservedKey).toBeDefined();

    const downloads = stubDownloads();
    try {
      await click(download!);
    } finally {
      downloads.restore();
    }
    expect(downloads.count()).toBe(1); // the preserved original really downloads
  });
});

describe('the app-wide critical banner tells the truth about protection (findings 2 & 4)', () => {
  it('a critical total surfaces the banner: committed protected, unsaved may not persist, nothing auto-deleted', async () => {
    seedSizedJournal(0.50);
    await mountLayout();
    const banner = byTestId('storage-critical-banner');
    expect(banner).not.toBeNull();
    const text = banner!.textContent!;
    expect(text).toContain('Device storage is nearly full');
    expect(text).toContain('another full copy before the old one is removed');
    expect(text).toContain('Your last saved data stays protected');
    expect(text).toContain('new or unsaved changes may not be written');
    expect(text).not.toContain('nothing is lost');
    expect(text).toContain('does not itself free storage');
    expect(text).toContain('Nothing is deleted automatically');
  });
});

/**
 * The critical-storage guidance must never imply that pruning is available. The
 * Layout banner gates only on `persistFailed`, while `canPrune` in
 * StorageManager additionally requires recovery persistence, no stale tab, no
 * reconciliation, no uncertain commit, no preservation failure and no in-flight
 * write — so the banner can render while the prune control is disabled.
 */
describe('critical storage while pruning is DISABLED for a non-persistFailed reason (DOS-STAB-002A honesty finding 1)', () => {
  /** The exact governed sentence shared by the Layout banner and the Settings
   *  warning. Asserted verbatim in both places — the qualification is the
   *  contract, not incidental wording. */
  const GOVERNED_PRUNE_SENTENCE =
    'If pruning is available, pruning old saved prompts can reduce storage usage';

  /**
   * Critical total-origin usage with `persistFailed` FALSE and `canPrune` FALSE:
   * the stored blob is structurally damaged AND preserving it fails, so boot
   * reports `canPersist: false` (preservation failure). The controller's
   * initialize() returns early in that state, so it publishes no `lastFailure`
   * and the store never sets `persistFailed` — the critical banner renders while
   * pruning is disabled. The damaged blob is left in place (never overwritten),
   * so the enumerated total-origin usage stays critical.
   */
  function seedCriticalWithPreservationFailure() {
    storage.store.clear();
    const bloated = {
      ...baseline,
      artifacts: [{
        ...artifact('bloat', '2026-01-01T00:00:00.000Z'),
        content: 'X'.repeat(Math.ceil(QUOTA_UNITS_ESTIMATE * 0.50)),
      }],
      settings: 'damaged',
    };
    storage.store.set(STORAGE_KEY, JSON.stringify(bloated));
    storage.setFailRecoveryWrites(true);
  }

  async function mountLayoutWithSettings() {
    probedState = null;
    probedUpdate = null;
    probedCommittedSequence = 0;
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <StoreProvider>
          <MemoryRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<><Settings /><StateProbe /></>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </StoreProvider>,
      );
    });
    await flush();
  }

  it('the prune control is disabled while the critical banner is shown, and neither copy tells the user to prune', async () => {
    seedCriticalWithPreservationFailure();
    await mountLayoutWithSettings();

    // The scenario is real: critical classification, prune disabled, and the
    // reason is NOT the simple persistence-failure case.
    expect(byTestId('storage-level-badge')!.textContent).toBe('nearly full');
    expect(byTestId<HTMLButtonElement>('storage-prune-open')!.disabled).toBe(true);
    expect(byTestId('storage-prune-disabled-note')).not.toBeNull();
    const banner = byTestId('storage-critical-banner');
    expect(banner).not.toBeNull(); // renders only when persistFailed is FALSE
    expect(container.textContent).not.toContain('Saving to this device is failing');

    const bannerText = banner!.textContent!;
    const warningText = byTestId('storage-warning')!.textContent!;

    for (const text of [bannerText, warningText]) {
      // Availability-qualified guidance, asserted exactly.
      expect(text).toContain(GOVERNED_PRUNE_SENTENCE);
      // No unconditional imperative to prune, and no pointer to a prune control
      // that may be disabled.
      expect(text).not.toMatch(/\bprune old saved prompts\b/i);
      expect(text).not.toMatch(/\bprune below\b/i);
      expect(text).not.toMatch(/\bgo to settings and prune\b/i);
      expect(text).not.toContain('prompts below');
      expect(text).not.toContain('to free space');
      // Export is a copy — never described as freeing storage or raising quota.
      expect(text).toMatch(/does not (itself )?free (local )?storage/);
      // No implication that the deferred Option 3 emergency path exists.
      expect(text).not.toMatch(/emergency|recover space automatically|free up space for you/i);
    }

    // The banner additionally states WHY pruning may be unavailable.
    expect(bannerText).toContain('pruning is unavailable whenever saving is paused or failing');
  });
});

describe('measurement is read-only — persistence behavior is unchanged (DOS-STAB-002A)', () => {
  it('mounting the storage UI over a valid journal neither writes nor deletes any key', async () => {
    seedSizedJournal(0.38);
    const keysBefore = [...storage.store.keys()].sort();
    const rawBefore = new Map(storage.store);
    await mountSettings();
    // No generation/head churn from measuring, and nothing removed: the meter
    // only reads storage.
    expect([...storage.store.keys()].sort()).toEqual(keysBefore);
    for (const [k, v] of rawBefore) expect(storage.store.get(k)).toBe(v);
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    // Persistence still works end to end: a real prune commits durably below in
    // the "journal-backed prune transaction" suite; here we confirm the passive
    // meter path added no writes.
  });
});

describe('the meter refreshes AFTER the journal commit lands, not on the memory-only change (DOS-STAB-002A finding 1)', () => {
  it('a real state update refreshes the displayed level only once the commit is verified, with no second state mutation', async () => {
    await mountSettings(); // boot migration has already drained during mount+flush
    expect(byTestId('storage-level-badge')!.textContent).toBe('ok');
    const seqBefore = probedCommittedSequence;

    // A real state update through the store's own updater. Its committed
    // generation, once written, will push total-origin usage into critical —
    // but the write is asynchronous and journal-verified, so the meter must not
    // display the new usage until that generation actually exists in storage.
    const big = artifact('big', '2026-05-01T00:00:00.000Z');
    big.content = 'X'.repeat(Math.ceil(QUOTA_UNITS_ESTIMATE * 0.5));

    // Hold the commit inside the exclusive lock (the generation is written only
    // inside the lock), so we can observe the window where memory has changed
    // but no committed bytes exist yet.
    locks.pauseNext();
    await act(async () => {
      probedUpdate!((s) => ({ ...s, artifacts: [big, ...s.artifacts] }));
    });
    await locks.waiting;
    const stateWhilePaused = probedState;

    // Memory changed, but the meter has NOT jumped ahead of persistence: no new
    // generation is committed yet, so classification stays exactly where the
    // last verified commit left it.
    expect(probedState!.artifacts[0].id).toBe('big');
    expect(probedCommittedSequence).toBe(seqBefore);
    expect(byTestId('storage-level-badge')!.textContent).toBe('ok');

    // Let the commit complete and be read-back verified.
    locks.release();
    await flush();

    // The committed generation advanced — a genuine, verified journal commit.
    expect(probedCommittedSequence).toBeGreaterThan(seqBefore);
    // The refresh was driven by that committed-generation signal, NOT by any
    // second state mutation: active state is the very same object it was while
    // the commit was mid-flight, and exactly one 'big' artifact exists.
    expect(probedState).toBe(stateWhilePaused);
    expect(probedState!.artifacts.filter((a) => a.id === 'big')).toHaveLength(1);
    // …yet the displayed level now reflects the just-committed generation.
    expect(byTestId('storage-level-badge')!.textContent).toBe('nearly full');
    expect(byTestId('storage-warning')).not.toBeNull();
  });

  it('the initial legacy migration refreshes the meter to reflect the retained legacy key plus the migrated generation', async () => {
    // A legacy-only store whose SINGLE copy sits under the warning band, but
    // whose post-migration footprint (retained legacy key + the migrated
    // generation, ~two copies) crosses into critical. If the meter measured
    // only the memory state / pre-migration storage it would read ok; it must
    // reflect the storage that actually exists after the migration commit.
    storage.store.clear();
    const migrating: AppState = {
      ...buildDefaultState(),
      artifacts: [artifact('legacy-big', '2026-01-01T00:00:00.000Z')],
    };
    migrating.artifacts[0] = {
      ...migrating.artifacts[0],
      content: 'X'.repeat(Math.ceil(QUOTA_UNITS_ESTIMATE * 0.32)),
    };
    storage.store.set(STORAGE_KEY, JSON.stringify(normalizeState(migrating)));

    await mountSettings(); // boot migration drains during mount+flush

    // The migration actually happened (a generation now exists) and the legacy
    // key was retained — so enumerated total is ~two copies.
    expect(generationWrites().length).toBeGreaterThanOrEqual(1);
    expect(storage.store.has(STORAGE_KEY)).toBe(true);
    expect(byTestId('storage-level-badge')!.textContent).toBe('nearly full');
    expect(byTestId('storage-breakdown')!.textContent).toContain('Redundant crash-safe copies');
    expect(byTestId('storage-breakdown')!.textContent).toContain('Earlier saved copy');
  });
});

describe('when total-origin usage cannot be enumerated, the meter is honest about the estimate (DOS-STAB-002A finding 2)', () => {
  it('falls back to a single-copy estimate and states the real total is unknown, in neither direction', async () => {
    // localStorage access itself throws: the provider suppresses persistence and
    // the meter cannot enumerate the origin, so measured is false.
    Object.defineProperty(globalThis, 'localStorage', {
      get() { throw new Error('storage blocked'); },
      configurable: true,
    });
    await mountSettings();

    expect(byTestId('storage-usage-total-estimated')).not.toBeNull();
    expect(byTestId('storage-usage-total-measured')).toBeNull();
    const copy = byTestId('storage-usage-total')!.textContent!;
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

    // (A) The fallback sentence is a GOVERNED string: it is the only claim the
    // app is allowed to make when the origin could not be enumerated, so it is
    // pinned exactly. Changing it is a deliberate act that must update this
    // canonical value — not something a reword can drift past.
    expect(norm(byTestId('storage-usage-total-estimated')!.textContent!)).toBe(
      'Everything stored for this DavidOS site (browser origin) could not be read here, so this is ' +
      'a deterministic estimate of a single copy of your current data. The actual total stored under ' +
      'this origin could not be determined — it may be higher or lower than the figure shown. This ' +
      'does not change the browser’s actual limit.',
    );

    // (B) Semantic assertions, so a future reword still has to keep the meaning.
    // It identifies WHAT the number is: a deterministic single-copy estimate.
    expect(copy).toMatch(/deterministic estimate of a single copy/i);
    // …and that complete/actual total-origin usage is unavailable.
    expect(copy).toMatch(/could not be read|could not be determined/i);
    expect(copy).toMatch(/actual total[^.]*could not be determined/i);
    // Uncertainty must be stated symmetrically when a direction is mentioned.
    expect(copy).toMatch(/higher or lower/i);

    // It must not assert a direction the app cannot know. Enumeration failed, so
    // the real total is unknown — NOT provably higher…
    expect(copy).not.toMatch(/(real|actual) usage is higher/i);
    expect(copy).not.toMatch(/usage is higher/i);
    expect(copy).not.toMatch(/(higher|greater|more|larger) than (the figure |this |what is )?shown\b(?!.*lower)/i);
    // …and NOT provably lower either. The lookbehind lets the truthful
    // "higher or lower than the figure shown" through while still rejecting a
    // bare downward claim.
    expect(copy).not.toMatch(/(real|actual) usage is lower/i);
    expect(copy).not.toMatch(/usage is lower/i);
    expect(copy).not.toMatch(/(?<!higher or )\b(lower|less|smaller) than (the figure |this |what is )?shown\b/i);
    // No directional certainty in ANY phrasing — "is/are/will be higher",
    // "definitely more", "above/below the figure shown".
    expect(copy).not.toMatch(/\b(is|are|will be|would be)\s+(definitely\s+|certainly\s+|always\s+)?(higher|lower|greater|larger|smaller|more|less|above|below)\b/i);
    expect(copy).not.toMatch(/\b(definitely|certainly|always|guaranteed|in fact|in reality)\s+(higher|lower|greater|less|more|larger|smaller|above|below)\b/i);
    expect(copy).not.toMatch(/\b(above|below)\s+(the\s+)?(figure|number|total|amount|estimate)\b/i);
    expect(copy).not.toMatch(/\b(under|over)-?reports?\b/i);

    // It must not describe redundant-copy accounting as though enumeration
    // succeeded — in either the inclusive or the exclusive form…
    expect(copy).not.toMatch(/redundant crash-safe copies/i);
    expect(copy).not.toMatch(/including the redundant/i);
    expect(copy).not.toMatch(/does not include the redundant/i);
    // …nor claim any multi-copy accounting actually happened, in either word
    // order ("journal generations were counted" / "counted the redundant copies").
    expect(copy).not.toMatch(/\b(redundant|journal|crash-safe|multiple|stored|extra)\b[^.]*\b(cop(y|ies)|generations?)\b[^.]*\b(were|was|are|is|been)\s+(counted|measured|summed|enumerated|included|accounted|added up)/i);
    expect(copy).not.toMatch(/\b(counted|measured|summed|enumerated|added up)\b[^.]*\b(redundant|journal|crash-safe|multiple)\b/i);
    expect(copy).not.toMatch(/\b(journal generations|crash-safe copies|redundant generations|redundant copies|multiple stored copies)\b[^.]*\b(counted|measured|enumerated|summed)\b/i);
  });
});

describe('journal-backed prune transaction', () => {
  it('writes one generation and one head; the actual first payload has deletions and completion audit', async () => {
    await mountSettings();
    await openAndArmPrune();
    storage.ops.length = 0;
    await click(byTestId('storage-prune-confirm')!);

    expect(generationWrites()).toHaveLength(1);
    expect(headWrites()).toHaveLength(1);
    const first = JSON.parse(generationWrites()[0][2]!) as AppState;
    expect(first.artifacts.map((item) => item.id)).toEqual(['a4', 'a3']);
    expect(first.handoffs).toEqual(HANDOFFS);
    expect(first.auditLog.find((entry) => entry.command.includes('Prune saved prompts') && entry.command.includes('completed')))
      .toMatchObject({ actionTaken: true, approvalStatus: 'approved' });
    expect(committedState()).toEqual(first);
    expect(probedState).toEqual(first);
    expect(generationWrites()).toHaveLength(1);

    const authority = selectJournalAuthority(storage as unknown as Storage).authority!;
    expect(storage.store.has(journalGenerationKey(authority.generationId))).toBe(true);
    expect(authority.head.previousGenerationId).not.toBeNull();
    expect(storage.store.has(journalGenerationKey(authority.head.previousGenerationId!))).toBe(true);
  });

  it('keeps active state unchanged while the exclusive lock is waiting', async () => {
    await mountSettings();
    await openAndArmPrune();
    const before = JSON.stringify(probedState);
    storage.ops.length = 0;
    locks.pauseNext();
    await click(byTestId('storage-prune-confirm')!);
    await locks.waiting;

    expect(JSON.stringify(probedState)).toBe(before);
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    locks.release();
    await flush();
    expect(probedState!.artifacts.map((item) => item.id)).toEqual(['a4', 'a3']);
  });

  it('safe candidate-write failure leaves full active state unchanged with no failure audit or second write', async () => {
    await mountSettings();
    await openAndArmPrune();
    const before = JSON.stringify(probedState);
    storage.ops.length = 0;
    storage.setFailGenerationWrites(true);
    await click(byTestId('storage-prune-confirm')!);

    expect(JSON.stringify(probedState)).toBe(before);
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    expect(probedState!.auditLog.some((entry) => entry.command.includes('Prune') && entry.command.includes('failed'))).toBe(false);
    expect(container.textContent).toContain('Prune failed');
  });

  it('uncertain landed-head outcome leaves full active state unchanged and suppresses future persistence', async () => {
    await mountSettings();
    await openAndArmPrune();
    const before = JSON.stringify(probedState);
    storage.ops.length = 0;
    storage.setThrowAfterHeadWrite(true);
    await click(byTestId('storage-prune-confirm')!);

    expect(JSON.stringify(probedState)).toBe(before);
    expect(generationWrites()).toHaveLength(1);
    expect(headWrites()).toHaveLength(1);
    expect(container.textContent).toContain('could not be confirmed as saved');
    storage.ops.length = 0;
    const themeButton = [...container.querySelectorAll('button')]
      .find((button) => /Switch to (light|dark) mode/.test(button.textContent ?? ''))!;
    await click(themeButton);
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    expect(byTestId<HTMLButtonElement>('storage-prune-open')!.disabled).toBe(true);
  });

  it('stale expected generation is rejected before any prune generation or head write', async () => {
    await mountSettings();
    await openAndArmPrune();
    const current = selectJournalAuthority(storage as unknown as Storage).authority!;
    let id = 0;
    const external = await commitJournalState(
      { ...committedState(), priorities: [{ id: 'syn-new', label: 'SYN NEW', rank: 1 }] },
      {
        storage: storage as unknown as Storage,
        expectedGeneration: current.generationId,
        idFactory: () => `external-prune-${++id}`,
      },
    );
    expect(external.ok).toBe(true);
    const externalRaw = selectJournalAuthority(storage as unknown as Storage).authority!.raw;
    const before = JSON.stringify(probedState);
    storage.ops.length = 0;
    await click(byTestId('storage-prune-confirm')!);

    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    expect(selectJournalAuthority(storage as unknown as Storage).authority!.raw).toBe(externalRaw);
    expect(JSON.stringify(probedState)).toBe(before);
    expect(container.textContent).toContain('another tab');
  });

  it('unsupported Web Locks disables prune before creating a generation or head', async () => {
    Reflect.deleteProperty(navigator, 'locks');
    await mountSettings();

    expect(byTestId<HTMLButtonElement>('storage-prune-open')!.disabled).toBe(true);
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
    expect(storage.store.get(STORAGE_KEY)).toBe(JSON.stringify(baseline));
  });

  it('preservation failure blocks before mutation', async () => {
    storage.store.set(STORAGE_KEY, JSON.stringify({ ...baseline, settings: 'damaged' }));
    storage.setFailRecoveryWrites(true);
    await mountSettings();
    expect(byTestId<HTMLButtonElement>('storage-prune-open')!.disabled).toBe(true);
    expect(generationWrites()).toHaveLength(0);
    expect(headWrites()).toHaveLength(0);
  });
});
