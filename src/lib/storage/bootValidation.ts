/**
 * Legacy-aware DEEP boot validation (DOS-STAB-001A).
 *
 * Normal boot previously accepted any parseable record whose CONTAINER was
 * structurally sound, so malformed-but-parseable entities (wrong primitive
 * types, invalid enums, invalid dates, broken nested items, duplicate ids)
 * could enter runtime state and reach crashing render paths. This module
 * closes that gap by reusing the explicit import validators per record.
 *
 * Policy (Program Control, binding):
 *  - missing OPTIONAL fields are legacy-compatible — never corruption;
 *  - invalid required fields, wrong primitive types, invalid enums/dates,
 *    malformed nested entities, and duplicate ids ARE corruption;
 *  - corruption is QUARANTINED per record (valid neighbors keep loading;
 *    one malformed record never denies access to all valid state);
 *  - the caller (localStore.loadPersistedState) preserves the byte-exact
 *    original blob BEFORE any quarantined view may persist;
 *  - no invented replacement values, ever — records are excluded, not fixed;
 *  - reporting is collection names + counts only; never record contents,
 *    field values, or ids.
 *
 * executionRecords are deliberately NOT covered here: they already have
 * dedicated deep boot validation (DOS-AGT-001A) in localStore/normalizeState,
 * whose behavior this package must preserve exactly.
 */
import type { AppState } from '../types';
import { VALIDATED_COLLECTIONS, validateCollectionItem, validateHealthProfile } from './importValidation';

const isObjLike = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Fields that normalizeState ADDITIVELY backfills when absent (and
 * inspectStructure classifies as "missing", i.e. valid legacy shape). At
 * boot, their ABSENCE must never quarantine a record — only a present but
 * wrong-typed value is corruption. Explicit import stays stricter.
 */
const ADDITIVE_BACKFILLED_FIELDS: Record<string, ReadonlySet<string>> = {
  prompts: new Set(['tags', 'versions']),
  projects: new Set(['relatedPrompts', 'relatedWorkflows']),
};

export interface RecordIntegrityReport {
  /** collection → ascending indices to quarantine (deep-invalid or duplicate-id). */
  invalidIndices: Record<string, number[]>;
  /** collection → total present items (for counts-only messaging). */
  totals: Record<string, number>;
  /** True when a present, object-shaped Health Profile fails deep validation. */
  healthProfileInvalid: boolean;
  /** Total quarantined records (healthProfile counts as one). */
  totalInvalid: number;
}

/**
 * Inspect every ID-keyed collection (and the Health Profile singleton) for
 * records the import validators would reject, plus duplicate ids. Pure
 * inspection — nothing is modified. Collections that are not arrays are
 * skipped here: the structural layer (inspectStructure/normalizeState)
 * already classifies and repairs those.
 */
export function inspectRecordIntegrity(state: AppState): RecordIntegrityReport {
  const invalidIndices: Record<string, number[]> = {};
  const totals: Record<string, number> = {};
  let totalInvalid = 0;

  for (const collection of VALIDATED_COLLECTIONS) {
    const list = (state as unknown as Record<string, unknown>)[collection];
    if (!Array.isArray(list)) continue;
    totals[collection] = list.length;
    const bad = new Set<number>();
    const backfilled = ADDITIVE_BACKFILLED_FIELDS[collection];
    list.forEach((item, index) => {
      let invalid = false;
      validateCollectionItem((e) => {
        // Legacy compatibility: an ABSENT additively-backfilled field is a
        // valid older shape (structural layer reports it as merely missing).
        if (
          backfilled !== undefined &&
          e.field !== undefined &&
          backfilled.has(e.field) &&
          isObjLike(item) &&
          item[e.field] === undefined
        ) {
          return;
        }
        invalid = true;
      }, collection, index, item);
      if (invalid) bad.add(index);
    });
    // Duplicate ids among otherwise-valid records: keep the FIRST occurrence
    // (matching the existing executionRecords precedent), quarantine the rest.
    const seen = new Set<string>();
    list.forEach((item, index) => {
      if (bad.has(index)) return;
      const id = (item as { id?: unknown }).id;
      if (typeof id !== 'string') return; // non-string id already reported above
      if (seen.has(id)) bad.add(index);
      else seen.add(id);
    });
    if (bad.size > 0) {
      invalidIndices[collection] = [...bad].sort((a, b) => a - b);
      totalInvalid += bad.size;
    }
  }

  // Health Profile singleton: deep-checked only when it is object-shaped;
  // undefined (seed), null (deleted), and non-object shapes stay on the
  // existing structural path.
  let healthProfileInvalid = false;
  const hp = (state as { healthProfile?: unknown }).healthProfile;
  if (hp !== undefined && hp !== null && isObjLike(hp)) {
    validateHealthProfile(() => {
      healthProfileInvalid = true;
    }, hp);
  }
  if (healthProfileInvalid) totalInvalid += 1;

  return { invalidIndices, totals, healthProfileInvalid, totalInvalid };
}

/**
 * Return a state with the reported records EXCLUDED (quarantined). A deep-
 * invalid Health Profile becomes null — the untouched original lives in the
 * preserved raw blob; no replacement values are invented. The input state is
 * not mutated.
 */
export function quarantineInvalidRecords(state: AppState, report: RecordIntegrityReport): AppState {
  const next = { ...state } as unknown as Record<string, unknown>;
  for (const [collection, indices] of Object.entries(report.invalidIndices)) {
    const list = next[collection];
    if (!Array.isArray(list)) continue;
    const drop = new Set(indices);
    next[collection] = list.filter((_, i) => !drop.has(i));
  }
  if (report.healthProfileInvalid) next.healthProfile = null;
  return next as unknown as AppState;
}

/**
 * "openLoops: 2 of 5, handoffs: 1 of 3, healthProfile" — collection names and
 * counts ONLY. Never record contents, field values, or ids.
 */
export function summarizeRecordQuarantine(report: RecordIntegrityReport): string {
  const parts = Object.entries(report.invalidIndices).map(
    ([collection, indices]) => `${collection}: ${indices.length} of ${report.totals[collection] ?? indices.length}`,
  );
  if (report.healthProfileInvalid) parts.push('healthProfile');
  return parts.join(', ');
}

/**
 * The ONLY category names a damage warning may carry: the fixed top-level
 * AppState collection/section identifiers this schema defines. Anything else
 * (and any structural detail beneath a category) aggregates into the generic
 * "AppState records" label — warnings never expose field paths, property
 * names, array indices, record ids, values, keys, or serialized data.
 */
const APPROVED_DAMAGE_CATEGORIES: ReadonlySet<string> = new Set([
  'priorities',
  'openLoops',
  'reminders',
  'projects',
  'prompts',
  'contextItems',
  'handoffs',
  'artifacts',
  'executionRecords',
  'healthProfile',
  'auditLog',
  'settings',
]);

/**
 * Collapse structural damage diagnostics (which internally carry precise
 * paths like `prompts[3].tags` or `settings.theme`) into collection-level
 * categories with issue counts, e.g. "prompts: 2, settings". Output is
 * allowlist-clean by construction: approved category names and counts only.
 */
export function summarizeStructuralDamage(invalidFields: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const field of invalidFields) {
    const top = field.split(/[.[]/, 1)[0];
    const label = APPROVED_DAMAGE_CATEGORIES.has(top) ? top : 'AppState records';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => (count > 1 ? `${label}: ${count}` : label))
    .join(', ');
}
