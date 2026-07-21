// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { StoreProvider } from '../../state/store';
import Settings from '../Settings';
import { STORAGE_KEY } from '../../lib/storage/localStore';
import {
  JOURNAL_GENERATION_PREFIX,
  JOURNAL_HEAD_KEYS,
  selectJournalAuthority,
} from '../../lib/storage/stateJournal';
import { serializeState } from '../../lib/storage/exportImport';
import { buildDefaultState } from '../../data/defaultState';
import { HEALTH_DRAFT_KEY, saveHealthDraft, loadHealthDraft } from '../../lib/health/profileDraft';
import type { AppState, HealthFitnessProfile } from '../../lib/types';

// Import vs unsaved Health Profile draft — the import flow must never destroy
// a draft without an explicit user decision, and a confirmed destructive
// import must clear the draft only as part of a successfully COMMITTED import
// (validated, durably persisted). All health values here are synthetic.

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Distinctive synthetic values — used to assert both preservation AND that
// they never leak into console output, flash text, or audit entries.
const SYN = {
  calories: 4343,
  note: 'SYN-DRAFT-NOTE-A1',
  medication: 'SYN-MED-XYZ-77',
} as const;

const SYNTHETIC_DRAFT: HealthFitnessProfile = {
  id: 'syn-draft-profile',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  nutritionTargets: { calories: SYN.calories, notes: SYN.note },
  supplementsMedications: { medications: [SYN.medication] },
};

type Op = ['set' | 'remove', string];

function fakeLocalStorage() {
  const store = new Map<string, string>();
  const ops: Op[] = [];
  let failStateWrites = false;
  return {
    store,
    ops,
    setFailStateWrites(v: boolean) {
      failStateWrites = v;
    },
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (failStateWrites && k.startsWith(JOURNAL_GENERATION_PREFIX)) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      ops.push(['set', k]);
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      ops.push(['remove', k]);
      store.delete(k);
    },
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
let confirmSpy: ReturnType<typeof vi.spyOn>;
let consoleLines: string[];
let baseline: AppState;

beforeEach(() => {
  storage = fakeLocalStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  // The journal transaction requires an exclusive Web Lock — grant it inline.
  Object.defineProperty(navigator, 'locks', {
    value: {
      request: async (_name: string, _options: LockOptions, callback: () => Promise<unknown>) =>
        callback(),
    },
    configurable: true,
  });
  baseline = buildDefaultState();
  storage.store.set(STORAGE_KEY, JSON.stringify(baseline));
  storage.ops.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true) as ReturnType<typeof vi.spyOn>;
  consoleLines = [];
  for (const m of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      consoleLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' '));
    });
  }
});

afterEach(async () => {
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
  await flush();
}

/** Persist a synthetic dirty draft, exactly as the Health Profile editor would. */
function seedDraft() {
  const res = saveHealthDraft(SYNTHETIC_DRAFT, baseline.healthProfile?.updatedAt ?? null, '2026-01-02T00:00:00.000Z', storage as unknown as Storage);
  expect(res.ok).toBe(true);
  storage.ops.length = 0;
}

function backupJson(mutate: (s: AppState) => void = () => {}): string {
  const s: AppState = JSON.parse(JSON.stringify(buildDefaultState())) as AppState;
  mutate(s);
  return serializeState(s);
}

async function importBackup(json: string, name = 'backup.json') {
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  const file = new File([json], name, { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // importData awaits file.text() and the async journal transaction —
  // flush the microtask chain fully.
  await flush();
  await flush();
}

const draftDialog = () =>
  [...container.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) =>
    d.textContent?.includes('Unsaved Health Profile edits'),
  ) ?? null;

const profileConflictDialog = () =>
  [...container.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) =>
    d.textContent?.includes('Health Profile conflict'),
  ) ?? null;

function dialogButton(dialog: HTMLElement, re: RegExp): HTMLButtonElement {
  const b = [...dialog.querySelectorAll('button')].find((x) => re.test(x.textContent ?? ''));
  if (!b) throw new Error(`dialog button ${re} not found`);
  return b as HTMLButtonElement;
}

/** Committed state = the journal authority (the legacy key is read-only). */
const storedState = (): AppState => {
  const raw = selectJournalAuthority(storage as unknown as Storage).authority?.raw;
  if (!raw) throw new Error('journal authority missing');
  return JSON.parse(raw) as AppState;
};
const flashText = () => container.querySelector('.flash')?.textContent ?? '';

function expectNoSyntheticLeak() {
  const auditText = JSON.stringify(storedState().auditLog);
  for (const blob of [consoleLines.join('\n'), auditText, container.textContent ?? '']) {
    expect(blob).not.toContain(String(SYN.calories));
    expect(blob).not.toContain(SYN.note);
    expect(blob).not.toContain(SYN.medication);
  }
}

describe('import with no unsaved draft (behavior unchanged)', () => {
  it('imports directly without any draft interruption', async () => {
    await mountSettings();
    await importBackup(backupJson((s) => {
      s.healthProfile = null;
      s.settings.theme = 'light';
    }));
    expect(draftDialog()).toBeNull();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(flashText()).toContain('Import complete');
    expect(storedState().settings.theme).toBe('light');
    // The imported backup had no profile — the current one is kept, not wiped.
    expect(storedState().healthProfile).not.toBeNull();
  });

  it('does not incorrectly block when a draft key is absent', async () => {
    await mountSettings();
    expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(false);
    await importBackup(backupJson((s) => {
      s.healthProfile = null;
    }));
    expect(draftDialog()).toBeNull();
    expect(flashText()).toContain('Import complete');
  });
});

describe('dirty draft interrupts the import BEFORE any mutation', () => {
  it('shows the two-choice dialog and has not touched state or draft', async () => {
    seedDraft();
    const before = storage.store.get(STORAGE_KEY);
    const draftBefore = storage.store.get(HEALTH_DRAFT_KEY);
    await mountSettings();
    await importBackup(backupJson((s) => {
      s.settings.theme = 'light';
    }));

    const d = draftDialog();
    expect(d).not.toBeNull();
    // Both explicit choices present; nothing mutated yet.
    expect(dialogButton(d!, /Cancel/)).toBeTruthy();
    expect(dialogButton(d!, /Discard/)).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(storage.store.get(STORAGE_KEY)).toBe(before);
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(draftBefore);
  });

  it('the destructive choice is not the default: initial focus is on Cancel', async () => {
    seedDraft();
    await mountSettings();
    await importBackup(backupJson());
    const d = draftDialog()!;
    const cancel = dialogButton(d, /Cancel & keep my edits/);
    expect(document.activeElement).toBe(cancel);
  });

  it('Escape cancels the import and keeps the draft byte-for-byte', async () => {
    seedDraft();
    const draftBefore = storage.store.get(HEALTH_DRAFT_KEY);
    await mountSettings();
    await importBackup(backupJson());
    expect(draftDialog()).not.toBeNull();
    // Keyboard events land on the focused element (the Cancel button).
    await act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    expect(draftDialog()).toBeNull();
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(draftBefore);
    expect(flashText()).toContain('kept');
  });
});

describe('Cancel preserves everything', () => {
  it('keeps every draft field, dirty tracking, saved profile, and unrelated state', async () => {
    seedDraft();
    const stateBefore = storage.store.get(STORAGE_KEY);
    const draftBefore = storage.store.get(HEALTH_DRAFT_KEY);
    await mountSettings();
    await importBackup(backupJson((s) => {
      s.settings.theme = 'light';
    }));
    const d = draftDialog()!;
    await act(async () => dialogButton(d, /Cancel & keep my edits/).click());

    expect(draftDialog()).toBeNull();
    // Draft envelope byte-identical → every field and the dirty baseline survive.
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(draftBefore);
    const env = loadHealthDraft(storage as unknown as Storage)!;
    expect(env.profile).toEqual(SYNTHETIC_DRAFT);
    // Draft still differs from the saved profile → still "dirty".
    expect(JSON.stringify(env.profile)).not.toBe(JSON.stringify(storedState().healthProfile));
    // Saved profile and all unrelated state untouched; import did not happen.
    expect(storage.store.get(STORAGE_KEY)).toBe(stateBefore);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(flashText()).toContain('Import cancelled');
  });
});

describe('confirmed destructive import', () => {
  it('applies the import and clears the draft only after the commit is persisted', async () => {
    seedDraft();
    await mountSettings();
    await importBackup(backupJson((s) => {
      s.healthProfile = null;
      s.settings.theme = 'light';
    }));
    const d = draftDialog()!;
    await act(async () => dialogButton(d, /Discard edits & import/).click());
    await flush();

    expect(flashText()).toContain('Import complete');
    expect(storedState().settings.theme).toBe('light');
    expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(false);
    // Ordering: the imported state must be durably committed (verified head
    // advancement) BEFORE the draft is destroyed.
    const headWrite = storage.ops.findIndex(
      ([op, k]) => op === 'set' && JOURNAL_HEAD_KEYS.includes(k as never),
    );
    const draftClear = storage.ops.findIndex(([op, k]) => op === 'remove' && k === HEALTH_DRAFT_KEY);
    expect(headWrite).toBeGreaterThanOrEqual(0);
    expect(draftClear).toBeGreaterThan(headWrite);
    expectNoSyntheticLeak();
  });

  it('still asks the profile-conflict question and honors "Keep current"', async () => {
    seedDraft();
    await mountSettings();
    await importBackup(backupJson((s) => {
      s.settings.theme = 'light';
    }));
    await act(async () => dialogButton(draftDialog()!, /Discard edits & import/).click());
    await flush();
    const pc = profileConflictDialog();
    expect(pc).not.toBeNull();
    await act(async () => dialogButton(pc!, /Keep current/).click());
    await flush();
    expect(storedState().settings.theme).toBe('light');
    expect(JSON.stringify(storedState().healthProfile)).toBe(JSON.stringify(baseline.healthProfile));
    expect(storage.store.has(HEALTH_DRAFT_KEY)).toBe(false);
  });
});

describe('invalid imports never disturb the draft or saved data', () => {
  const cases: [string, () => string][] = [
    ['corrupt (not JSON)', () => '{not json'],
    ['invalid entity data', () => backupJson((s) => {
      (s.priorities as unknown[]).push({ id: 123 });
    })],
    ['future schema version', () => backupJson((s) => {
      s.schemaVersion = 999;
    })],
  ];
  for (const [label, make] of cases) {
    it(`${label}: draft and saved state preserved, error is value-free`, async () => {
      seedDraft();
      const stateBefore = storage.store.get(STORAGE_KEY);
      const draftBefore = storage.store.get(HEALTH_DRAFT_KEY);
      await mountSettings();
      await importBackup(make());
      expect(draftDialog()).toBeNull();
      expect(flashText()).toContain('Import failed');
      expect(storage.store.get(STORAGE_KEY)).toBe(stateBefore);
      expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(draftBefore);
      expectNoSyntheticLeak();
    });
  }
});

describe('commit failure (REPRODUCTION: draft must survive a failed commit)', () => {
  it('a confirmed import whose durable write fails preserves the draft and old state', async () => {
    seedDraft();
    const stateBefore = storage.store.get(STORAGE_KEY);
    const draftBefore = storage.store.get(HEALTH_DRAFT_KEY);
    await mountSettings();
    storage.setFailStateWrites(true);
    await importBackup(backupJson((s) => {
      s.healthProfile = null;
      s.settings.theme = 'light';
    }));
    await act(async () => dialogButton(draftDialog()!, /Discard edits & import/).click());
    await flush();

    // The import did not commit — the draft must NOT have been destroyed and
    // the stored state must be the old state: no partial mixture.
    expect(storage.store.get(HEALTH_DRAFT_KEY)).toBe(draftBefore);
    expect(storage.store.get(STORAGE_KEY)).toBe(stateBefore);
    expect(flashText()).not.toContain('Import complete');
    expect(flashText()).toContain('Import failed');
    expectNoSyntheticLeak();
  });
});

describe('draft appearing after the file-select gate (REPRODUCTION: no silent erase)', () => {
  it('a draft created while the profile-conflict dialog is open is not silently destroyed', async () => {
    // No draft at file-select time → the gate passes to the profile-conflict step.
    await mountSettings();
    await importBackup(backupJson((s) => {
      s.settings.theme = 'light';
    }));
    const pc = profileConflictDialog();
    expect(pc).not.toBeNull();
    // A draft comes into existence while the dialog sits open (e.g. edits in
    // another tab, or the dialog left open across a long pause).
    seedDraft();
    await act(async () => dialogButton(pc!, /Replace with imported/).click());
    await flush();

    // The draft must still exist — destroying it here would be silent erasure.
    expect(loadHealthDraft(storage as unknown as Storage)).not.toBeNull();
    expect(loadHealthDraft(storage as unknown as Storage)!.profile).toEqual(SYNTHETIC_DRAFT);
    // The user is asked explicitly instead.
    expect(draftDialog()).not.toBeNull();
    expectNoSyntheticLeak();
  });
});

describe('a draft does not block unrelated behavior', () => {
  it('normal state updates persist while a draft exists', async () => {
    seedDraft();
    await mountSettings();
    const themeBtn = [...container.querySelectorAll('button')].find((b) =>
      /Switch to (light|dark) mode/.test(b.textContent ?? ''),
    )!;
    await act(async () => themeBtn.click());
    await flush();
    expect(storedState().settings.theme).not.toBe(baseline.settings.theme);
    // The draft itself was not touched by unrelated activity.
    expect(loadHealthDraft(storage as unknown as Storage)!.profile).toEqual(SYNTHETIC_DRAFT);
  });
});
