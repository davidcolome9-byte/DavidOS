import type { AppState } from '../types';
import { sha256Hex } from '../utils/hash';

export const JOURNAL_VERSION = 1;
export const JOURNAL_LOCK_NAME = 'davidos-app-state-journal-v1';
export const JOURNAL_GENERATION_PREFIX = 'davidos-state-generation-v1-';
export const JOURNAL_HEAD_KEYS = ['davidos-state-head-v1-a', 'davidos-state-head-v1-b'] as const;
export const LEGACY_STATE_KEY = 'davidos-state-v1';

const ID_PATTERN = /^[a-z0-9-]{8,80}$/;
const MAX_JOURNAL_KEYS_SCANNED = 256;

export interface JournalHead {
  journalVersion: 1;
  sequence: number;
  generationId: string;
  previousGenerationId: string | null;
  transactionId: string;
  generationHash: string;
  generationLength: number;
  previousGenerationHash: string | null;
  previousGenerationLength: number | null;
}

export interface JournalAuthority {
  generationId: string;
  sequence: number;
  headKey: (typeof JOURNAL_HEAD_KEYS)[number];
  head: JournalHead;
  raw: string;
}

export interface ExclusiveLockCoordinator {
  requestExclusive<T>(name: string, callback: () => Promise<T>): Promise<ExclusiveLockResult<T>>;
}

export type ExclusiveLockResult<T> =
  | { status: 'acquired'; value: T }
  | { status: 'unavailable' }
  | { status: 'request_failed' }
  | { status: 'callback_failed' };

export type JournalCommitFailure =
  | 'unsupported_lock'
  | 'lock_request_failed'
  | 'lock_callback_failed'
  | 'storage_unavailable'
  | 'stale_authority'
  | 'candidate_write_failed'
  | 'candidate_verification_failed'
  | 'head_write_failed'
  | 'head_verification_failed'
  | 'reconciliation_required';

export type JournalCommitResult =
  | { ok: true; authority: JournalAuthority; cleanupFailed: boolean }
  | { ok: false; reason: JournalCommitFailure; uncertain: boolean };

export interface JournalCommitOptions {
  storage: Storage;
  expectedGeneration: string | null;
  coordinator?: ExclusiveLockCoordinator | null;
  idFactory?: () => string;
}

export interface JournalSelection {
  authority: JournalAuthority | null;
  reconciliationNeeded: boolean;
}

export function browserLockCoordinator(): ExclusiveLockCoordinator | null {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) return null;
  return {
    requestExclusive: async (name, callback) => {
      type CallbackOutcome =
        | { status: 'acquired'; value: Awaited<ReturnType<typeof callback>> }
        | { status: 'callback_failed' };
      try {
        return await navigator.locks.request(name, { mode: 'exclusive' }, async (): Promise<CallbackOutcome> => {
          try {
            return { status: 'acquired', value: await callback() };
          } catch {
            return { status: 'callback_failed' };
          }
        });
      } catch {
        return { status: 'request_failed' };
      }
    },
  };
}

function generatedId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid.toLowerCase();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function generationKey(id: string): string {
  return `${JOURNAL_GENERATION_PREFIX}${id}`;
}

function isStateRaw(raw: string): boolean {
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      typeof (value as { schemaVersion?: unknown }).schemaVersion === 'number';
  } catch {
    return false;
  }
}

function parseHead(raw: string | null): JournalHead | null {
  if (raw === null) return null;
  try {
    const h = JSON.parse(raw) as Partial<JournalHead>;
    const previousOk = h.previousGenerationId === null ||
      (typeof h.previousGenerationId === 'string' && ID_PATTERN.test(h.previousGenerationId));
    if (
      h.journalVersion !== JOURNAL_VERSION ||
      !Number.isSafeInteger(h.sequence) || (h.sequence ?? 0) < 1 ||
      typeof h.generationId !== 'string' || !ID_PATTERN.test(h.generationId) ||
      !previousOk || typeof h.transactionId !== 'string' || !ID_PATTERN.test(h.transactionId) ||
      typeof h.generationHash !== 'string' || !/^[a-f0-9]{64}$/.test(h.generationHash) ||
      !Number.isSafeInteger(h.generationLength) || (h.generationLength ?? -1) < 0 ||
      !(h.previousGenerationHash === null ||
        (typeof h.previousGenerationHash === 'string' && /^[a-f0-9]{64}$/.test(h.previousGenerationHash))) ||
      !(h.previousGenerationLength === null ||
        (Number.isSafeInteger(h.previousGenerationLength) && (h.previousGenerationLength ?? -1) >= 0))
    ) return null;
    if ((h.previousGenerationId === null) !== (h.previousGenerationHash === null) ||
        (h.previousGenerationId === null) !== (h.previousGenerationLength === null)) return null;
    return h as JournalHead;
  } catch {
    return null;
  }
}

function verifiedGeneration(storage: Storage, id: string, hash: string, length: number): string | null {
  const raw = storage.getItem(generationKey(id));
  return raw !== null && raw.length === length && sha256Hex(raw) === hash && isStateRaw(raw) ? raw : null;
}

/** Select only a hash-verified generation referenced by controlled head metadata. */
export function selectJournalAuthority(storage: Storage): JournalSelection {
  const parsed = JOURNAL_HEAD_KEYS.map((headKey) => {
    const raw = storage.getItem(headKey);
    return { headKey, raw, head: parseHead(raw) };
  });
  const committed: JournalAuthority[] = [];
  const fallbacks: JournalAuthority[] = [];
  let reconciliationNeeded = false;
  for (const item of parsed) {
    if (!item.head) {
      if (item.raw !== null) reconciliationNeeded = true;
      continue;
    }
    const raw = verifiedGeneration(storage, item.head.generationId, item.head.generationHash, item.head.generationLength);
    if (raw !== null) committed.push({ generationId: item.head.generationId, sequence: item.head.sequence, headKey: item.headKey, head: item.head, raw });
    else {
      reconciliationNeeded = true;
      if (item.head.previousGenerationId && item.head.previousGenerationHash !== null && item.head.previousGenerationLength !== null) {
        const previousRaw = verifiedGeneration(storage, item.head.previousGenerationId, item.head.previousGenerationHash, item.head.previousGenerationLength);
        if (previousRaw !== null) fallbacks.push({
          generationId: item.head.previousGenerationId,
          sequence: Math.max(0, item.head.sequence - 1),
          headKey: item.headKey,
          head: item.head,
          raw: previousRaw,
        });
      }
    }
  }
  const candidates = committed.length > 0 ? committed : fallbacks;
  candidates.sort((a, b) => b.sequence - a.sequence);
  return { authority: candidates[0] ?? null, reconciliationNeeded };
}

function safeCleanup(storage: Storage, committed: JournalAuthority): boolean {
  const keep = new Set<string>([committed.generationId]);
  if (committed.head.previousGenerationId) keep.add(committed.head.previousGenerationId);
  for (const key of JOURNAL_HEAD_KEYS) {
    const head = parseHead(storage.getItem(key));
    if (!head) continue;
    keep.add(head.generationId);
    if (head.previousGenerationId) keep.add(head.previousGenerationId);
  }
  try {
    const limit = Math.min(storage.length, MAX_JOURNAL_KEYS_SCANNED);
    const remove: string[] = [];
    for (let i = 0; i < limit; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(JOURNAL_GENERATION_PREFIX)) {
        const id = key.slice(JOURNAL_GENERATION_PREFIX.length);
        if (!keep.has(id)) remove.push(key);
      }
    }
    for (const key of remove) storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function commitSerializedWhileLocked(
  serialized: string,
  options: Omit<JournalCommitOptions, 'coordinator'>,
): JournalCommitResult {
    let current: JournalSelection;
    try { current = selectJournalAuthority(options.storage); }
    catch { return { ok: false, reason: 'storage_unavailable', uncertain: false }; }
    if (current.reconciliationNeeded) {
      return { ok: false, reason: 'reconciliation_required', uncertain: false };
    }
    if ((current.authority?.generationId ?? null) !== options.expectedGeneration) {
      return { ok: false, reason: 'stale_authority', uncertain: false };
    }

    const makeId = options.idFactory ?? generatedId;
    const generationId = makeId();
    const transactionId = makeId();
    if (!ID_PATTERN.test(generationId) || !ID_PATTERN.test(transactionId)) {
      return { ok: false, reason: 'candidate_write_failed', uncertain: false };
    }
    const key = generationKey(generationId);
    try {
      if (options.storage.getItem(key) !== null) return { ok: false, reason: 'candidate_write_failed', uncertain: false };
      options.storage.setItem(key, serialized);
    } catch { return { ok: false, reason: 'candidate_write_failed', uncertain: false }; }
    try {
      if (options.storage.getItem(key) !== serialized) return { ok: false, reason: 'candidate_verification_failed', uncertain: false };
    } catch { return { ok: false, reason: 'candidate_verification_failed', uncertain: false }; }

    const heads = JOURNAL_HEAD_KEYS.map((k) => parseHead(options.storage.getItem(k))).filter((h): h is JournalHead => h !== null);
    const sequence = Math.max(current.authority?.sequence ?? 0, ...heads.map((h) => h.sequence), 0) + 1;
    const previous = current.authority;
    const head: JournalHead = {
      journalVersion: JOURNAL_VERSION,
      sequence,
      generationId,
      previousGenerationId: previous?.generationId ?? null,
      transactionId,
      generationHash: sha256Hex(serialized),
      generationLength: serialized.length,
      previousGenerationHash: previous ? sha256Hex(previous.raw) : null,
      previousGenerationLength: previous ? previous.raw.length : null,
    };
    const headKey = JOURNAL_HEAD_KEYS[(sequence - 1) % JOURNAL_HEAD_KEYS.length];
    const headRaw = JSON.stringify(head);
    try { options.storage.setItem(headKey, headRaw); }
    catch { return { ok: false, reason: 'head_write_failed', uncertain: true }; }
    try {
      if (options.storage.getItem(headKey) !== headRaw) return { ok: false, reason: 'head_verification_failed', uncertain: true };
    } catch { return { ok: false, reason: 'head_verification_failed', uncertain: true }; }

    try {
      const selected = selectJournalAuthority(options.storage).authority;
      if (!selected || selected.generationId !== generationId || selected.sequence !== sequence) {
        return { ok: false, reason: 'head_verification_failed', uncertain: true };
      }
      return { ok: true, authority: selected, cleanupFailed: !safeCleanup(options.storage, selected) };
    } catch {
      return { ok: false, reason: 'head_verification_failed', uncertain: true };
    }
}

type LockBoundaryFailure = {
  ok: false;
  reason: 'unsupported_lock' | 'lock_request_failed' | 'lock_callback_failed';
  uncertain: boolean;
};

async function withExclusiveJournalLock<T>(
  coordinator: ExclusiveLockCoordinator | null,
  callback: () => Promise<T> | T,
): Promise<T | LockBoundaryFailure> {
  if (!coordinator) return { ok: false, reason: 'unsupported_lock', uncertain: false };
  let lockResult: ExclusiveLockResult<T>;
  try {
    lockResult = await coordinator.requestExclusive(JOURNAL_LOCK_NAME, async () => callback());
  } catch {
    return { ok: false, reason: 'lock_request_failed', uncertain: false };
  }
  if (lockResult.status === 'unavailable') {
    return { ok: false, reason: 'unsupported_lock', uncertain: false };
  }
  if (lockResult.status === 'request_failed') {
    return { ok: false, reason: 'lock_request_failed', uncertain: false };
  }
  if (lockResult.status === 'callback_failed') {
    return { ok: false, reason: 'lock_callback_failed', uncertain: true };
  }
  return lockResult.value;
}

/** Immutable-generation commit. There is deliberately no rollback path. */
export async function commitJournalState(candidate: AppState, options: JournalCommitOptions): Promise<JournalCommitResult> {
  const coordinator = options.coordinator === undefined ? browserLockCoordinator() : options.coordinator;
  let serialized: string;
  try { serialized = JSON.stringify(candidate); } catch { return { ok: false, reason: 'candidate_write_failed', uncertain: false }; }
  return withExclusiveJournalLock<JournalCommitResult>(coordinator, () => commitSerializedWhileLocked(serialized, options));
}

export type LegacyMigrationResult = JournalCommitResult | { ok: true; authority: JournalAuthority; cleanupFailed: boolean; migrated: boolean } | { ok: false; reason: 'no_legacy_state' | 'invalid_legacy_state'; uncertain: false };

/** Initial migration leaves the legacy bytes untouched; a valid journal always wins thereafter. */
export async function migrateLegacyState(options: Omit<JournalCommitOptions, 'expectedGeneration'>): Promise<LegacyMigrationResult> {
  const coordinator = options.coordinator === undefined ? browserLockCoordinator() : options.coordinator;
  return withExclusiveJournalLock<LegacyMigrationResult>(coordinator, () => {
    let selected: JournalSelection;
    try { selected = selectJournalAuthority(options.storage); }
    catch { return { ok: false, reason: 'storage_unavailable', uncertain: false }; }
    if (selected.reconciliationNeeded) {
      return { ok: false, reason: 'reconciliation_required', uncertain: false };
    }
    if (selected.authority) {
      return { ok: true, authority: selected.authority, cleanupFailed: false, migrated: false };
    }
    let raw: string | null;
    try { raw = options.storage.getItem(LEGACY_STATE_KEY); }
    catch { return { ok: false, reason: 'storage_unavailable', uncertain: false }; }
    if (raw === null) return { ok: false, reason: 'no_legacy_state', uncertain: false } as const;
    if (!isStateRaw(raw)) return { ok: false, reason: 'invalid_legacy_state', uncertain: false } as const;
    const committed = commitSerializedWhileLocked(raw, { ...options, expectedGeneration: null });
    return committed.ok ? { ...committed, migrated: true } : committed;
  });
}

export const journalGenerationKey = generationKey;
