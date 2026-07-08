import type { AppState } from '../types';
import { seedHealthProfile } from '../../data/healthProfileSeed';

export const STORAGE_KEY = 'davidos-state-v1';

/**
 * localStorage-backed persistence for v1.
 * Isolated behind this module so it can be swapped for IndexedDB
 * or a Google Drive-synced store without touching the rest of the app.
 */
/**
 * Backfill fields added after a user's state was first written, so older
 * persisted state (or an imported older backup) never crashes the app.
 * Non-destructive: only fills what's missing.
 */
export function normalizeState(state: AppState): AppState {
  return {
    ...state,
    handoffs: state.handoffs ?? [],
    artifacts: state.artifacts ?? [],
    // Seed-if-missing: `undefined` means the state predates Health Profiles →
    // seed one. `null` means the user explicitly deleted it → respect that.
    healthProfile: state.healthProfile === undefined ? seedHealthProfile() : state.healthProfile,
    auditLog: state.auditLog ?? [],
  };
}

export function loadPersistedState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (typeof parsed.schemaVersion !== 'number') return null;
    return normalizeState(parsed);
  } catch {
    return null;
  }
}

export function persistState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // localStorage quota (~5MB) exceeded or unavailable — surface in console,
    // the app keeps working in-memory.
    console.error('DavidOS: failed to persist state', err);
  }
}

export function clearPersistedState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
