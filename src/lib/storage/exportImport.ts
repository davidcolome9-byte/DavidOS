import type { AppState } from '../types';
import { normalizeState, CURRENT_SCHEMA_VERSION } from './localStore';
import { validateImportedState, formatImportErrors } from './importValidation';

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
  // Forward-version guard: a backup from a NEWER DavidOS is not applied — we
  // would drop fields we don't understand. The current data is left untouched.
  if (state.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `This backup is from a newer version of DavidOS (schema ${state.schemaVersion}; ` +
      `this app understands ${CURRENT_SCHEMA_VERSION}). Update DavidOS to import it. ` +
      `Your current data was not changed.`,
    );
  }
  // The OUTER envelope version must be consistent with the inner state and must
  // not itself claim a newer schema. A future envelope wrapped around a current
  // state was previously accepted (its version metadata was ignored), which
  // violates the reject-before-replace guarantee.
  if (env.schemaVersion !== undefined) {
    if (typeof env.schemaVersion !== 'number') {
      throw new Error('Backup envelope schemaVersion must be a number.');
    }
    if (env.schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `This backup is from a newer version of DavidOS (envelope schema ${env.schemaVersion}; ` +
        `this app understands ${CURRENT_SCHEMA_VERSION}). Update DavidOS to import it. ` +
        `Your current data was not changed.`,
      );
    }
    if (env.schemaVersion !== state.schemaVersion) {
      throw new Error(
        `This backup is inconsistent (envelope schema ${env.schemaVersion} does not match ` +
        `its data schema ${state.schemaVersion}) and was not imported. Your current data was not changed.`,
      );
    }
  }
  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(state[key])) {
      throw new Error(`Backup missing required section: ${key}.`);
    }
  }
  if (!state.settings || typeof state.settings !== 'object') {
    throw new Error('Backup missing settings.');
  }
  // Deep per-entity validation — reject malformed items with a clear, value-free
  // message (boot-time recovery still repairs; import must not silently accept
  // structurally broken data).
  const errors = validateImportedState(state);
  if (errors.length > 0) {
    throw new Error(`This backup has invalid data and was not imported:\n${formatImportErrors(errors)}`);
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
