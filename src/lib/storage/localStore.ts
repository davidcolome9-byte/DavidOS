import type { AppState } from '../types';

export const STORAGE_KEY = 'davidos-state-v1';

/**
 * localStorage-backed persistence for v1.
 * Isolated behind this module so it can be swapped for IndexedDB
 * or a Google Drive-synced store without touching the rest of the app.
 */
export function loadPersistedState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (typeof parsed.schemaVersion !== 'number') return null;
    return parsed;
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
