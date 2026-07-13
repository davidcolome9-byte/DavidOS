import type { AppState, Project, Prompt, PromptVersion } from '../types';
import { seedHealthProfile } from '../../data/healthProfileSeed';

export const STORAGE_KEY = 'davidos-state-v1';
/** Unreadable or lossy-repaired blobs are preserved under unique keys with this prefix. */
export const RECOVERY_KEY_PREFIX = `${STORAGE_KEY}-recovery-`;

/**
 * localStorage-backed persistence for v1.
 * Isolated behind this module so it can be swapped for IndexedDB
 * or a Google Drive-synced store without touching the rest of the app.
 *
 * Fail-safe contract (see docs/DATA_MODEL.md → "Load & recovery states"):
 * the stored blob is only ever replaced after the exact original has been
 * preserved under a unique recovery key AND that write was read back and
 * confirmed. If preservation fails, persistence is suppressed for the
 * session so the only stored copy is never overwritten.
 */

export type RecoveryKind = 'none' | 'migrated' | 'repaired' | 'unreadable';

export interface RecoveryInfo {
  kind: RecoveryKind;
  /** True only when the original blob was written to a recovery key AND read back identical. */
  rawPreserved: boolean;
  /** The localStorage key holding the untouched original, when preserved. */
  recoveryKey?: string;
  /** False → StoreProvider must not persist this session (would overwrite the only copy). */
  canPersist: boolean;
  /** Human-readable summary for the UI banner; '' means nothing to show. */
  message: string;
}

export interface LoadResult {
  /** null → boot with defaults (fresh device or unreadable state). */
  state: AppState | null;
  recovery: RecoveryInfo;
}

const CLEAN: RecoveryInfo = { kind: 'none', rawPreserved: false, canPersist: true, message: '' };

/** Arrays must be arrays of objects; anything else is dropped, not crashed on. */
function objectArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x) => x !== null && typeof x === 'object') as T[];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : [];
}

/**
 * Backfill and repair state so that older persisted state, older imported
 * backups, and structurally damaged data never crash the app.
 * Non-destructive for valid data: only fills what's missing and drops
 * values whose type makes them unrenderable. Callers that care whether a
 * repair would LOSE data must run inspectStructure() first.
 */
export function normalizeState(state: AppState): AppState {
  const prompts = objectArray<Prompt>(state.prompts).map((p) => ({
    ...p,
    tags: stringArray(p.tags),
    versions: objectArray<PromptVersion>(p.versions),
  }));
  const projects = objectArray<Project>(state.projects).map((p) => ({
    ...p,
    relatedPrompts: stringArray(p.relatedPrompts),
    relatedWorkflows: stringArray(p.relatedWorkflows),
  }));
  return {
    ...state,
    priorities: objectArray(state.priorities),
    openLoops: objectArray(state.openLoops),
    reminders: objectArray(state.reminders),
    projects,
    prompts,
    contextItems: objectArray(state.contextItems),
    handoffs: objectArray(state.handoffs),
    artifacts: objectArray(state.artifacts),
    // Seed-if-missing: `undefined` means the state predates Health Profiles →
    // seed one. `null` means the user explicitly deleted it → respect that.
    // Anything that isn't an object is unusable → reseed the generic starter.
    healthProfile:
      state.healthProfile === undefined
        ? seedHealthProfile()
        : state.healthProfile === null || typeof state.healthProfile === 'object'
          ? state.healthProfile
          : seedHealthProfile(),
    auditLog: objectArray(state.auditLog),
    settings: { theme: state.settings?.theme === 'light' ? 'light' : 'dark' },
  };
}

export interface StructuralReport {
  /** Fields absent entirely — normalizeState backfills them WITHOUT losing data. */
  missing: string[];
  /** Fields present but damaged — normalizeState would DROP or replace data. */
  invalid: string[];
}

function checkCollection(report: StructuralReport, name: string, value: unknown): unknown[] | null {
  if (value === undefined) {
    report.missing.push(name);
    return null;
  }
  if (!Array.isArray(value)) {
    report.invalid.push(name);
    return null;
  }
  if (value.some((x) => x === null || typeof x !== 'object')) report.invalid.push(name);
  return value;
}

function checkItemList(report: StructuralReport, name: string, value: unknown, kind: 'string' | 'object') {
  if (value === undefined) return; // additive backfill, nothing lost
  if (!Array.isArray(value) || value.some((x) => (kind === 'string' ? typeof x !== 'string' : x === null || typeof x !== 'object'))) {
    report.invalid.push(name);
  }
}

/**
 * Classify parseable state: which fields normalizeState would merely
 * backfill (missing) vs which it would repair by dropping data (invalid).
 */
export function inspectStructure(state: AppState): StructuralReport {
  const report: StructuralReport = { missing: [], invalid: [] };

  for (const key of ['priorities', 'openLoops', 'reminders', 'contextItems', 'handoffs', 'artifacts', 'auditLog'] as const) {
    checkCollection(report, key, state[key]);
  }
  const prompts = checkCollection(report, 'prompts', state.prompts);
  for (const [i, p] of (prompts ?? []).entries()) {
    if (p === null || typeof p !== 'object') continue; // already reported via prompts
    checkItemList(report, `prompts[${i}].tags`, (p as Prompt).tags, 'string');
    checkItemList(report, `prompts[${i}].versions`, (p as Prompt).versions, 'object');
  }
  const projects = checkCollection(report, 'projects', state.projects);
  for (const [i, p] of (projects ?? []).entries()) {
    if (p === null || typeof p !== 'object') continue;
    checkItemList(report, `projects[${i}].relatedPrompts`, (p as Project).relatedPrompts, 'string');
    checkItemList(report, `projects[${i}].relatedWorkflows`, (p as Project).relatedWorkflows, 'string');
  }

  if (state.healthProfile === undefined) report.missing.push('healthProfile');
  else if (state.healthProfile !== null && typeof state.healthProfile !== 'object') report.invalid.push('healthProfile');

  if (state.settings === undefined) report.missing.push('settings');
  else if (state.settings === null || typeof state.settings !== 'object') report.invalid.push('settings');
  else if (state.settings.theme === undefined) report.missing.push('settings.theme');
  else if (state.settings.theme !== 'dark' && state.settings.theme !== 'light') report.invalid.push('settings.theme');

  return report;
}

/**
 * Write the exact raw blob to a unique recovery key and CONFIRM it by
 * reading it back. Never overwrites an earlier recovery record (unique,
 * collision-suffixed keys). Returns the key on confirmed success, null on
 * any failure.
 */
function preserveRawBlob(raw: string): string | null {
  try {
    const base = `${RECOVERY_KEY_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}`;
    let key = base;
    let n = 1;
    while (localStorage.getItem(key) !== null) key = `${base}-${n++}`;
    localStorage.setItem(key, raw);
    return localStorage.getItem(key) === raw ? key : null;
  } catch {
    return null;
  }
}

export function loadPersistedState(): LoadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.error('DavidOS: device storage is unavailable — running in memory only; nothing was overwritten.', err);
    return {
      state: null,
      recovery: {
        kind: 'unreadable',
        rawPreserved: false,
        canPersist: false,
        message: 'Device storage is unavailable, so changes cannot be saved on this device this session.',
      },
    };
  }
  if (!raw) return { state: null, recovery: CLEAN };

  let parsed: AppState;
  try {
    const candidate = JSON.parse(raw) as AppState;
    if (candidate === null || typeof candidate !== 'object' || typeof candidate.schemaVersion !== 'number') {
      throw new Error('not a DavidOS state object (missing schemaVersion)');
    }
    parsed = candidate;
  } catch (err) {
    const key = preserveRawBlob(raw);
    if (key) {
      console.error(`DavidOS: stored state is unreadable — the exact original was preserved under localStorage key "${key}"; booting with defaults.`, err);
      return {
        state: null,
        recovery: {
          kind: 'unreadable',
          rawPreserved: true,
          recoveryKey: key,
          canPersist: true,
          message: `Saved data could not be read. The untouched original was preserved on this device (key "${key}") and the app started fresh.`,
        },
      };
    }
    console.error('DavidOS: stored state is unreadable AND could not be preserved — running in memory only; the stored copy was NOT overwritten.', err);
    return {
      state: null,
      recovery: {
        kind: 'unreadable',
        rawPreserved: false,
        canPersist: false,
        message: 'Saved data could not be read, and backing it up failed. Saving is paused so the stored copy is not overwritten — free up storage, then reload.',
      },
    };
  }

  const report = inspectStructure(parsed);
  if (report.invalid.length === 0) {
    const state = normalizeState(parsed);
    if (report.missing.length > 0) {
      console.info(`DavidOS: state migrated additively (backfilled: ${report.missing.join(', ')}).`);
      return { state, recovery: { kind: 'migrated', rawPreserved: false, canPersist: true, message: '' } };
    }
    return { state, recovery: CLEAN };
  }

  // Lossy repair: preserve the exact original BEFORE anything may replace it.
  const key = preserveRawBlob(raw);
  const state = normalizeState(parsed);
  if (key) {
    console.warn(`DavidOS: stored state was damaged (${report.invalid.join(', ')}) and repaired. The exact original was preserved under "${key}".`);
    return {
      state,
      recovery: {
        kind: 'repaired',
        rawPreserved: true,
        recoveryKey: key,
        canPersist: true,
        message: `Some saved data was damaged (${report.invalid.join(', ')}) and was repaired. The untouched original is preserved on this device (key "${key}").`,
      },
    };
  }
  console.error(`DavidOS: stored state is damaged (${report.invalid.join(', ')}) and preservation FAILED — the repaired copy stays in memory; the stored original was NOT overwritten.`);
  return {
    state,
    recovery: {
      kind: 'repaired',
      rawPreserved: false,
      canPersist: false,
      message: 'Some saved data was damaged and was repaired in memory, but backing up the original failed. Saving is paused so the stored copy is not overwritten — export a backup, free up storage, then reload.',
    },
  };
}

/** @returns false when the write failed (quota exceeded / unavailable). */
export function persistState(state: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    // localStorage quota (~5MB) exceeded or unavailable — the app keeps
    // working in-memory; the store surfaces this to the UI.
    console.error('DavidOS: failed to persist state', err);
    return false;
  }
}

export function clearPersistedState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
