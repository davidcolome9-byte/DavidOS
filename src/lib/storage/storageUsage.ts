import type { AppState, WorkflowArtifact } from '../types';
import { STORAGE_KEY, RECOVERY_KEY_PREFIX } from './localStore';
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

/** Fraction of quota at which the UI starts recommending export-then-prune. */
export const WARNING_THRESHOLD = 0.7;
/** Fraction of quota at which the app-wide protection banner appears. */
export const CRITICAL_THRESHOLD = 0.9;

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
  /** Serialized size of the whole persisted state. */
  stateUnits: number;
  /** Per-collection breakdown, largest first. */
  collections: CollectionUsage[];
  /** Quarantined recovery blobs preserved by boot-time recovery. */
  recoveryUnits: number;
  recoveryCount: number;
  /** Unsaved Health Profile draft, if any. */
  draftUnits: number;
  /** Everything measured: state + recovery blobs + draft. */
  totalUnits: number;
  quotaUnits: number;
  /** totalUnits / quotaUnits, uncapped (can exceed 1). */
  usedFraction: number;
  level: StorageUsageLevel;
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
 * Measure how much localStorage the app is using: the live state (serialized
 * the same way the journal stores a generation) plus the other DavidOS-owned keys
 * (recovery blobs, health draft) read from `storage`. Read-only.
 */
export function measureStorageUsage(state: AppState, storage: StorageReader | null): StorageUsage {
  const stateUnits = STORAGE_KEY.length + serializedUnits(state);

  const collections = COLLECTION_LABELS.map(({ key, label }) => {
    const value = state[key];
    const list = Array.isArray(value) ? value : [];
    return { key: key as string, label, units: serializedUnits(list), count: list.length };
  }).sort((a, b) => b.units - a.units);

  let recoveryUnits = 0;
  let recoveryCount = 0;
  let draftUnits = 0;
  if (storage) {
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key === null) continue;
        if (key.startsWith(RECOVERY_KEY_PREFIX)) {
          recoveryUnits += key.length + (storage.getItem(key)?.length ?? 0);
          recoveryCount += 1;
        } else if (key === HEALTH_DRAFT_KEY) {
          draftUnits = key.length + (storage.getItem(key)?.length ?? 0);
        }
      }
    } catch {
      // Storage unavailable — report state size only.
    }
  }

  const totalUnits = stateUnits + recoveryUnits + draftUnits;
  const usedFraction = totalUnits / QUOTA_UNITS_ESTIMATE;
  return {
    stateUnits,
    collections,
    recoveryUnits,
    recoveryCount,
    draftUnits,
    totalUnits,
    quotaUnits: QUOTA_UNITS_ESTIMATE,
    usedFraction,
    level: usageLevel(usedFraction),
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
