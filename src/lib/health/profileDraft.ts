/**
 * Health & Fitness Profile draft persistence (DOS-WF-001R Phase 2A).
 *
 * Unsaved profile edits are persisted to a DEDICATED localStorage key, entirely
 * separate from the main `davidos-state-v1` blob. Consequences by design:
 *  - unsaved edits survive internal navigation and component unmount/remount;
 *  - a corrupted draft can NEVER damage the saved profile (different key, and
 *    every read is guarded — a bad draft resolves to null, never throws);
 *  - drafts never enter the app state, so they never reach backups or the
 *    audit log.
 *
 * All functions accept an injectable Storage for tests; they default to
 * localStorage when available and degrade to a no-op otherwise.
 */
import type { HealthFitnessProfile } from '../types';

export const HEALTH_DRAFT_KEY = 'davidos-health-draft-v1';
const DRAFT_VERSION = 1 as const;

export interface HealthDraftEnvelope {
  version: typeof DRAFT_VERSION;
  savedAt: string;
  /** `updatedAt` of the saved profile the draft was based on (null if none). */
  baseUpdatedAt: string | null;
  profile: HealthFitnessProfile;
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Read the draft. Any corruption or read error resolves to null (fail-safe). */
export function loadHealthDraft(storage: Storage | null = defaultStorage()): HealthDraftEnvelope | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(HEALTH_DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { version?: unknown }).version !== DRAFT_VERSION ||
      typeof (parsed as { profile?: unknown }).profile !== 'object' ||
      (parsed as { profile?: unknown }).profile === null
    ) {
      return null;
    }
    return parsed as HealthDraftEnvelope;
  } catch {
    return null;
  }
}

/** Persist a draft. Write errors are swallowed — a draft is best-effort. */
export function saveHealthDraft(
  profile: HealthFitnessProfile,
  baseUpdatedAt: string | null,
  savedAt: string,
  storage: Storage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    const env: HealthDraftEnvelope = { version: DRAFT_VERSION, savedAt, baseUpdatedAt, profile };
    storage.setItem(HEALTH_DRAFT_KEY, JSON.stringify(env));
  } catch {
    /* quota or serialization error — drop the draft silently */
  }
}

export function clearHealthDraft(storage: Storage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(HEALTH_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function hasHealthDraft(storage: Storage | null = defaultStorage()): boolean {
  return loadHealthDraft(storage) !== null;
}
