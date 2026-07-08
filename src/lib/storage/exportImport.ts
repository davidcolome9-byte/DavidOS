import type { AppState } from '../types';

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
 * Parse and validate an exported backup. Throws with a readable
 * message on anything malformed — never silently imports bad data.
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
  return state;
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
