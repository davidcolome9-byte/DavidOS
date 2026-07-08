import type { AppState, AuditLogEntry } from '../types';
import { uid, nowIso } from '../types';

const MAX_ENTRIES = 300;

/** Build a complete audit entry from a partial one. */
export function makeAuditEntry(
  partial: Omit<AuditLogEntry, 'id' | 'timestamp'>,
): AuditLogEntry {
  return { id: uid(), timestamp: nowIso(), ...partial };
}

/** Append an entry, newest first, capped so localStorage stays small. */
export function appendAudit(state: AppState, entry: AuditLogEntry): AppState {
  return {
    ...state,
    auditLog: [entry, ...state.auditLog].slice(0, MAX_ENTRIES),
  };
}
