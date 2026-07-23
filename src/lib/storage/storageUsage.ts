import type { AppState, WorkflowArtifact } from '../types';
import { STORAGE_KEY, RECOVERY_KEY_PREFIX } from './localStore';
import {
  JOURNAL_GENERATION_PREFIX,
  JOURNAL_HEAD_KEYS,
  LEGACY_STATE_KEY,
} from './stateJournal';
import { HEALTH_DRAFT_KEY } from '../health/profileDraft';

/**
 * Storage usage measurement and artifact retention (OL-003).
 *
 * localStorage quotas are commonly ~5MB counted in UTF-16 code units, so all
 * sizes here are measured in string length (UTF-16 units) and presented as
 * ESTIMATES — browsers differ and no API exposes the real localStorage quota.
 *
 * Retention policy (docs/DECISIONS.md 2026-07-18): pruning is an explicit,
 * guarded, user-visible action and applies to generated artifacts only.
 * Handoffs are append-only canonical history and are NEVER pruned. Nothing in
 * this module deletes anything by itself — it only measures and plans.
 */

/** ~5MB in UTF-16 code units — the common browser localStorage quota. */
export const QUOTA_UNITS_ESTIMATE = 5 * 1024 * 1024;

/*
 * Journal-adjusted thresholds (DOS-STAB-002A Stage 1, OL-032 Option 1).
 *
 * `usedFraction` is measured against the ESTIMATED TOTAL same-origin storage
 * usage: `measureStorageUsage` enumerates every localStorage key this origin
 * holds and sums the stored representation (key + value UTF-16 units) —
 * retained journal generations, journal heads, the legacy state key, quarantined
 * recovery blobs, the health-profile draft, and any unrelated same-origin keys —
 * ÷ the ~5MB quota estimate. This is deliberately NOT a single logical copy of
 * state: since DOS-STAB-001A a durable save keeps redundant generations, and a
 * commit must write ANOTHER full generation before the oldest is cleaned up, so
 * the real quota pressure is what is actually stored plus headroom for one more
 * copy. Warning at 35% / critical at 45% of that measured total leaves runway to
 * export, prune, or reduce saved history while a commit can still complete.
 * These constants do NOT raise the actual ceiling and do NOT add emergency
 * pruning — they only make the warning honest and early.
 */

/** Fraction of estimated total origin usage at which the UI recommends export-then-prune. */
export const WARNING_THRESHOLD = 0.35;
/** Fraction of estimated total origin usage at which the app-wide protection banner appears. */
export const CRITICAL_THRESHOLD = 0.45;

export type StorageUsageLevel = 'ok' | 'warning' | 'critical';

export interface CollectionUsage {
  /** AppState collection key. */
  key: string;
  /** Human label for the UI. */
  label: string;
  /** Serialized size in UTF-16 units. */
  units: number;
  /** Number of items in the collection. */
  count: number;
}

export interface StorageUsage {
  /**
   * Logical size of a single serialized copy of the live state (the storage
   * key + `JSON.stringify(state)`). Informational, and the deterministic
   * fallback for `totalUnits` when the origin cannot be enumerated. It is NOT
   * what drives classification when a real measurement is available.
   */
  stateUnits: number;
  /** Per-collection breakdown of the live state, largest first (display only). */
  collections: CollectionUsage[];
  /** Retained journal generations (current + any previous still kept). */
  generationUnits: number;
  generationCount: number;
  /** Journal head pointer records (davidos-state-head-v1-a/-b). */
  headUnits: number;
  headCount: number;
  /** Legacy pre-journal state key, if still present. */
  legacyUnits: number;
  /** Quarantined recovery blobs preserved by boot-time recovery. */
  recoveryUnits: number;
  recoveryCount: number;
  /** Unsaved Health Profile draft, if any. */
  draftUnits: number;
  /** Same-origin keys not owned by DavidOS state/journal/recovery/draft. */
  otherUnits: number;
  otherCount: number;
  /**
   * Estimated TOTAL same-origin storage usage — the sum of every enumerated
   * localStorage entry (each key counted exactly once). Falls back to
   * `stateUnits` when enumeration is incomplete, unreliable, or throws — a
   * partial tally is never reported as a total. Drives classification.
   */
  totalUnits: number;
  quotaUnits: number;
  /** totalUnits / quotaUnits, uncapped (can exceed 1). */
  usedFraction: number;
  level: StorageUsageLevel;
  /**
   * True ONLY when `totalUnits` came from a COMPLETE origin enumeration: every
   * index 0..length-1 yielded a key AND every enumerated key yielded a value.
   * False when the safe single-copy fallback was used — no storage, an
   * enumeration/read threw, `key(i)` returned null before `length` was reached,
   * or `getItem(key)` returned null for an enumerated key. When false, every
   * per-bucket field is zero: no partially measured total-origin accounting
   * survives, so the UI must not present measured-mode origin accounting.
   */
  measured: boolean;
}

/** Minimal read-only view of Storage — injectable for tests. */
export interface StorageReader {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}

const COLLECTION_LABELS: ReadonlyArray<{ key: keyof AppState; label: string }> = [
  { key: 'artifacts', label: 'Saved prompts (artifacts)' },
  { key: 'executionRecords', label: 'Execution records' },
  { key: 'handoffs', label: 'Handoff history' },
  { key: 'auditLog', label: 'Audit log' },
  { key: 'prompts', label: 'Prompt vault' },
  { key: 'projects', label: 'Projects' },
  { key: 'contextItems', label: 'Context vault' },
  { key: 'priorities', label: 'Priorities' },
  { key: 'openLoops', label: 'Open loops' },
  { key: 'reminders', label: 'Reminders' },
];

function serializedUnits(value: unknown): number {
  const json = JSON.stringify(value);
  return json === undefined ? 0 : json.length;
}

export function usageLevel(usedFraction: number): StorageUsageLevel {
  if (usedFraction >= CRITICAL_THRESHOLD) return 'critical';
  if (usedFraction >= WARNING_THRESHOLD) return 'warning';
  return 'ok';
}

/**
 * Measure the estimated TOTAL same-origin storage usage by enumerating every
 * localStorage key and summing the stored representation (key + value UTF-16
 * units) — retained journal generations, journal heads, the legacy state key,
 * quarantined recovery blobs, the health-profile draft, and any unrelated
 * same-origin keys. Each key is classified into exactly one bucket, so nothing
 * is double-counted. Read-only: this never writes, deletes, or reorders storage.
 *
 * Enumeration must be COMPLETE to be reported as measured. When `storage` is
 * absent, any enumeration/read throws, `key(i)` returns null before `length` is
 * reached, or `getItem(key)` returns null for an enumerated key, the partial
 * tally is discarded, every bucket is zeroed, `totalUnits` degrades to the
 * deterministic single-copy fallback (`stateUnits`) and `measured` is false —
 * the classifier never reports a partial read as a total-origin measurement.
 * Nothing is retried, polled, or written to recover; the read stays read-only.
 *
 * `collections` remains a logical breakdown of the LIVE state for the UI; it is
 * display-only and is not summed into `totalUnits`.
 */
export function measureStorageUsage(state: AppState, storage: StorageReader | null): StorageUsage {
  const stateUnits = STORAGE_KEY.length + serializedUnits(state);

  const collections = COLLECTION_LABELS.map(({ key, label }) => {
    const value = state[key];
    const list = Array.isArray(value) ? value : [];
    return { key: key as string, label, units: serializedUnits(list), count: list.length };
  }).sort((a, b) => b.units - a.units);

  let generationUnits = 0;
  let generationCount = 0;
  let headUnits = 0;
  let headCount = 0;
  let legacyUnits = 0;
  let recoveryUnits = 0;
  let recoveryCount = 0;
  let draftUnits = 0;
  let otherUnits = 0;
  let otherCount = 0;
  let measured = false;

  if (storage) {
    const headKeys = new Set<string>(JOURNAL_HEAD_KEYS);
    // Starts false and is only ever set by a failure path, so a loop that runs
    // to completion without breaking leaves it false — the initial value is the
    // "enumeration succeeded" state, not a placeholder.
    let incomplete = false;
    try {
      const length = storage.length;
      for (let i = 0; i < length; i++) {
        const key = storage.key(i);
        if (key === null) {
          // Enumeration ended before `length` promised — the origin changed
          // underneath the read, or the reader is unreliable. Whatever was
          // tallied so far is a PARTIAL view of the origin, so it is discarded
          // rather than reported as a measured total.
          incomplete = true;
          break;
        }
        const value = storage.getItem(key);
        if (value === null) {
          // The key was enumerated but its value could not be read. Treating a
          // missing value as 0 units would silently under-report the total, so
          // the whole measurement is treated as unreliable instead.
          incomplete = true;
          break;
        }
        const entryUnits = key.length + value.length;
        // Exactly one bucket per key (mutually exclusive prefixes/keys), so a
        // value is never counted twice. Recovery keys start with the legacy
        // key string, so they are matched by their own prefix BEFORE the exact
        // legacy-key comparison.
        if (headKeys.has(key)) {
          headUnits += entryUnits;
          headCount += 1;
        } else if (key.startsWith(JOURNAL_GENERATION_PREFIX)) {
          generationUnits += entryUnits;
          generationCount += 1;
        } else if (key.startsWith(RECOVERY_KEY_PREFIX)) {
          recoveryUnits += entryUnits;
          recoveryCount += 1;
        } else if (key === LEGACY_STATE_KEY) {
          legacyUnits += entryUnits;
        } else if (key === HEALTH_DRAFT_KEY) {
          draftUnits += entryUnits;
        } else {
          otherUnits += entryUnits;
          otherCount += 1;
        }
      }
    } catch {
      incomplete = true;
    }
    if (incomplete) {
      // Enumeration was incomplete, unreliable, or threw — discard the partial
      // tally and fall back to the deterministic single-copy estimate below.
      // Read-only: nothing is retried, re-read, or written to recover.
      generationUnits = 0;
      generationCount = 0;
      headUnits = 0;
      headCount = 0;
      legacyUnits = 0;
      recoveryUnits = 0;
      recoveryCount = 0;
      draftUnits = 0;
      otherUnits = 0;
      otherCount = 0;
      measured = false;
    } else {
      measured = true;
    }
  }

  const totalUnits = measured
    ? generationUnits + headUnits + legacyUnits + recoveryUnits + draftUnits + otherUnits
    : stateUnits;
  const usedFraction = totalUnits / QUOTA_UNITS_ESTIMATE;
  return {
    stateUnits,
    collections,
    generationUnits,
    generationCount,
    headUnits,
    headCount,
    legacyUnits,
    recoveryUnits,
    recoveryCount,
    draftUnits,
    otherUnits,
    otherCount,
    totalUnits,
    quotaUnits: QUOTA_UNITS_ESTIMATE,
    usedFraction,
    level: usageLevel(usedFraction),
    measured,
  };
}

/** "12.3 KB" / "1.2 MB" — sizes are UTF-16 units, close enough to bytes to label as such. */
export function formatUnits(units: number): string {
  if (units < 1024) return `${units} B`;
  if (units < 1024 * 1024) return `${(units / 1024).toFixed(1)} KB`;
  return `${(units / (1024 * 1024)).toFixed(2)} MB`;
}

export interface ArtifactPrunePlan {
  /** Artifacts that survive, in their original array order. */
  keep: WorkflowArtifact[];
  /** Artifacts that would be deleted (oldest beyond keepCount). */
  prune: WorkflowArtifact[];
  /** Serialized size of the pruned artifacts — the estimated space freed. */
  freedUnits: number;
}

/**
 * Plan keeping the newest `keepCount` artifacts by `createdAt` (array position
 * breaks ties — earlier positions are newer, matching the newest-first prepend
 * in WorkflowRunner). Pure planning only: callers must show the plan to the
 * user and get explicit confirmation before applying `keep`.
 */
export function planArtifactPrune(artifacts: WorkflowArtifact[], keepCount: number): ArtifactPrunePlan {
  const clamped = Math.max(0, Math.floor(keepCount));
  if (artifacts.length <= clamped) return { keep: [...artifacts], prune: [], freedUnits: 0 };

  const byNewest = artifacts
    .map((artifact, index) => ({ artifact, index }))
    .sort((a, b) => {
      const at = typeof a.artifact.createdAt === 'string' ? a.artifact.createdAt : '';
      const bt = typeof b.artifact.createdAt === 'string' ? b.artifact.createdAt : '';
      // ISO-8601 timestamps compare correctly as strings; missing/invalid
      // timestamps sort oldest so malformed items are pruned before real ones.
      if (at !== bt) return at > bt ? -1 : 1;
      return a.index - b.index;
    });

  const keptIndexes = new Set(byNewest.slice(0, clamped).map((x) => x.index));
  const keep = artifacts.filter((_, i) => keptIndexes.has(i));
  const prune = artifacts.filter((_, i) => !keptIndexes.has(i));
  return { keep, prune, freedUnits: serializedUnits(prune) };
}
