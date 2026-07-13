import type { AppState } from '../types';
import { normalizeState } from './localStore';

// Arrays a valid backup must contain. artifacts/healthProfile are intentionally
// absent — older backups predate them and are backfilled by normalizeState.
const REQUIRED_ARRAYS: (keyof AppState)[] = [
  'priorities', 'openLoops', 'reminders', 'projects',
  'prompts', 'contextItems', 'handoffs', 'auditLog',
];

export interface ExportEnvelope {
  app: 'davidos';
  exportedAt: string;
  schemaVersion: number;
  state: AppState;
}

export function serializeState(state: AppState): string {
  const envelope: ExportEnvelope = {
    app: 'davidos',
    exportedAt: new Date().toISOString(),
    schemaVersion: state.schemaVersion,
    state,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Parse and validate an exported backup. Validation covers the envelope
 * and top-level structure (required arrays + settings) and throws a
 * readable message when those fail; item-level damage inside accepted
 * sections is repaired by normalizeState rather than rejected (deep
 * per-field validation is OL-005; forward-schemaVersion guard is OL-006).
 */
export function parseImport(json: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Backup must be a JSON object.');
  }
  const env = parsed as Partial<ExportEnvelope>;
  if (env.app !== 'davidos' || !env.state) {
    throw new Error('Not a DavidOS backup file (missing "app: davidos" envelope).');
  }
  const state = env.state as AppState;
  if (typeof state.schemaVersion !== 'number') {
    throw new Error('Backup missing schemaVersion.');
  }
  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(state[key])) {
      throw new Error(`Backup missing required section: ${key}.`);
    }
  }
  if (!state.settings || typeof state.settings !== 'object') {
    throw new Error('Backup missing settings.');
  }
  // A backup that predates Health Profiles carries no profile AT ALL. That
  // must import as "nothing to say about the profile" (null → the import
  // flow keeps the device's current profile), NOT as a freshly seeded
  // generic placeholder — normalizeState's seed-if-undefined rule is right
  // at boot but would fabricate a fake "imported profile" here, creating a
  // false conflict dialog that could overwrite the user's real profile.
  const hadProfileKey = state.healthProfile !== undefined;
  const normalized = normalizeState(state);
  if (!hadProfileKey) normalized.healthProfile = null;
  return normalized;
}

/** Trigger a browser download of the backup file. */
export function downloadBackup(state: AppState): void {
  const blob = new Blob([serializeState(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `davidos-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
