import type { AppState, Project, Prompt, PromptVersion } from '../types';
import { seedHealthProfile } from '../../data/healthProfileSeed';

export const STORAGE_KEY = 'davidos-state-v1';
/** Unreadable stored blobs are preserved here for manual recovery. */
export const CORRUPT_BACKUP_KEY = `${STORAGE_KEY}-corrupt`;

/**
 * localStorage-backed persistence for v1.
 * Isolated behind this module so it can be swapped for IndexedDB
 * or a Google Drive-synced store without touching the rest of the app.
 */

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
 * values whose type makes them unrenderable.
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

export function loadPersistedState(): AppState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (typeof parsed.schemaVersion !== 'number') throw new Error('missing schemaVersion');
    return normalizeState(parsed);
  } catch (err) {
    // Preserve the unreadable blob before the mount-time persist effect
    // overwrites it with seed data — it may still be manually recoverable.
    try {
      if (raw) localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
    } catch {
      // Quota exhausted — nothing more we can do here.
    }
    console.error('DavidOS: stored state unreadable — booting with defaults. The old blob was kept under', CORRUPT_BACKUP_KEY, err);
    return null;
  }
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
