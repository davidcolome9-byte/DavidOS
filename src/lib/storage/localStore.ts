import type { AppState, ExecutionRecord, Handoff, Project, Prompt, PromptVersion } from '../types';
import { seedHealthProfile } from '../../data/healthProfileSeed';
import { normalizeHandoffRelationships } from '../workflows/continuity';
import { validateExecutionRecordUnknown } from '../agents/executionRecords';
import { inspectRecordIntegrity, quarantineInvalidRecords, summarizeRecordQuarantine, summarizeStructuralDamage } from './bootValidation';
import type { RecordIntegrityReport } from './bootValidation';
import { selectJournalAuthority } from './stateJournal';

export const STORAGE_KEY = 'davidos-state-v1';
/** Unreadable or lossy-repaired blobs are preserved under unique keys with this prefix. */
export const RECOVERY_KEY_PREFIX = `${STORAGE_KEY}-recovery-`;

/**
 * The one authoritative schema version this build understands. Data stamped with
 * a HIGHER version was produced by a newer DavidOS and must not be normalized or
 * overwritten (we would silently drop fields we don't know about). It is
 * preserved and surfaced instead. Bump this only alongside a real migration.
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * localStorage-backed persistence for v1.
 * Isolated behind this module so it can be swapped for IndexedDB
 * or a Google Drive-synced store without touching the rest of the app.
 *
 * Fail-safe contract (see docs/DATA_MODEL.md → "Load & recovery states"):
 * the stored blob is only ever replaced after the exact original has been
 * preserved under a unique recovery key AND that write was read back and
 * confirmed. If preservation fails, persistence is suppressed for the
 * session so the only stored copy is never overwritten.
 */

export type RecoveryKind = 'none' | 'migrated' | 'repaired' | 'unreadable';

export interface RecoveryInfo {
  kind: RecoveryKind;
  /** True only when the original blob was written to a recovery key AND read back identical. */
  rawPreserved: boolean;
  /** The localStorage key holding the untouched original, when preserved. */
  recoveryKey?: string;
  /** False → StoreProvider must not persist this session (would overwrite the only copy). */
  canPersist: boolean;
  /** Human-readable summary for the UI banner; '' means nothing to show. */
  message: string;
}

export interface LoadResult {
  /** null → boot with defaults (fresh device or unreadable state). */
  state: AppState | null;
  recovery: RecoveryInfo;
  /** Null while booting from the legacy key or a fresh device. */
  committedGeneration: string | null;
  /** Zero while booting from the legacy key or a fresh device. */
  committedSequence: number;
  /** True when boot fell back past damaged journal metadata/generations. */
  journalReconciliationNeeded: boolean;
}

type RawLoadResult = Pick<LoadResult, 'state' | 'recovery'>;

const CLEAN: RecoveryInfo = { kind: 'none', rawPreserved: false, canPersist: true, message: '' };

/**
 * Strict plain-object predicate: accepts ONLY ordinary records whose
 * prototype is exactly `Object.prototype`. Rejects null, arrays,
 * primitives, and every exotic object (Date, Map, Set, RegExp, class
 * instances, and null-prototype objects).
 *
 * Policy (deliberate): every legitimate producer of state records here —
 * `JSON.parse` and in-app object literals — yields `Object.prototype`
 * records. Null-prototype objects never arise from valid flows, so they
 * classify as lossy like any other exotic object rather than being
 * quietly accepted.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

/** Collections must be arrays of plain objects; anything else is dropped, not crashed on. */
function objectArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x) => isPlainObject(x)) as T[];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : [];
}

/**
 * DOS-AGT-001A boot repair for execution records. A missing legacy
 * collection backfills to []. Every PRESENT record must pass the full
 * unknown-safe domain validation (authority shape, lifecycle invariants,
 * evidence/gate integrity, id grammar, timestamps) or it is DROPPED —
 * never "fixed up": fabricating authority or lifecycle values would turn
 * damage into authorization. Duplicate-id records keep only the first.
 * Dropping is lossy, so inspectStructure classifies any such record as
 * invalid FIRST and the standard preserve-then-repair recovery contract
 * applies before this repair may ever persist.
 */
function normalizeExecutionRecords(value: unknown): ExecutionRecord[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const records: ExecutionRecord[] = [];
  for (const item of value) {
    if (validateExecutionRecordUnknown(item).length > 0) continue;
    const record = item as ExecutionRecord;
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }
  return records;
}

/** True when boot repair would drop or alter anything in the collection. */
function executionRecordsDamaged(value: unknown): boolean {
  if (!Array.isArray(value)) return true; // non-array is repaired to []
  const seen = new Set<string>();
  for (const item of value) {
    if (validateExecutionRecordUnknown(item).length > 0) return true;
    const id = (item as ExecutionRecord).id;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

/**
 * Backfill and repair state so that older persisted state, older imported
 * backups, and structurally damaged data never crash the app.
 * Non-destructive for valid data: only fills what's missing and drops
 * values whose type makes them unrenderable. Callers that care whether a
 * repair would LOSE data must run inspectStructure() first.
 */
export function normalizeState(state: AppState): AppState {
  const prompts = objectArray<Prompt>(state.prompts).map((p) => ({
    ...p,
    tags: stringArray(p.tags),
    versions: objectArray<PromptVersion>(p.versions),
  }));
  const projects = objectArray<Project>(state.projects).map((p) => ({
    ...p,
    relatedPrompts: stringArray(p.relatedPrompts),
    relatedWorkflows: stringArray(p.relatedWorkflows),
  }));
  return {
    ...state,
    priorities: objectArray(state.priorities),
    openLoops: objectArray(state.openLoops),
    reminders: objectArray(state.reminders),
    projects,
    prompts,
    contextItems: objectArray(state.contextItems),
    // Repair correction relationships so a stored/imported set never carries an
    // orphaned correction or a stuck-superseded original.
    handoffs: normalizeHandoffRelationships(objectArray<Handoff>(state.handoffs)),
    artifacts: objectArray(state.artifacts),
    executionRecords: normalizeExecutionRecords(state.executionRecords),
    // Seed-if-missing: `undefined` means the state predates Health Profiles →
    // seed one (genuinely absent per the schema). `null` means the user
    // explicitly deleted it → respect that. A PRESENT value of any other
    // shape is malformed data and QUARANTINES to null — it must never be
    // silently converted into a seeded replacement profile (the untouched
    // original lives in the preserved raw blob; inspectStructure classifies
    // this as invalid, so the preserve-then-repair contract applies first).
    healthProfile:
      state.healthProfile === undefined
        ? seedHealthProfile()
        : state.healthProfile === null || isPlainObject(state.healthProfile)
          ? state.healthProfile
          : null,
    auditLog: objectArray(state.auditLog),
    settings: {
      theme: isPlainObject(state.settings) && state.settings.theme === 'light' ? 'light' : 'dark',
    },
  };
}

export interface StructuralReport {
  /** Fields absent entirely — normalizeState backfills them WITHOUT losing data. */
  missing: string[];
  /** Fields present but damaged — normalizeState would DROP or replace data. */
  invalid: string[];
}

function checkCollection(report: StructuralReport, name: string, value: unknown): unknown[] | null {
  if (value === undefined) {
    report.missing.push(name);
    return null;
  }
  if (!Array.isArray(value)) {
    report.invalid.push(name);
    return null;
  }
  // Items must be PLAIN objects — normalizeState drops arrays/primitives/null.
  if (value.some((x) => !isPlainObject(x))) report.invalid.push(name);
  return value;
}

function checkItemList(report: StructuralReport, name: string, value: unknown, kind: 'string' | 'object') {
  if (value === undefined) {
    report.missing.push(name); // additive backfill, nothing lost
    return;
  }
  if (!Array.isArray(value) || value.some((x) => (kind === 'string' ? typeof x !== 'string' : !isPlainObject(x)))) {
    report.invalid.push(name);
  }
}

/**
 * Classify parseable state: which fields normalizeState would merely
 * backfill (missing) vs which it would repair by dropping data (invalid).
 */
export function inspectStructure(state: AppState): StructuralReport {
  const report: StructuralReport = { missing: [], invalid: [] };

  for (const key of ['priorities', 'openLoops', 'reminders', 'contextItems', 'handoffs', 'artifacts', 'auditLog'] as const) {
    checkCollection(report, key, state[key]);
  }

  // executionRecords are deep-validated at boot (DOS-AGT-001A): a record the
  // domain validator rejects would be DROPPED by normalizeState, so it must
  // classify as invalid here — triggering preserve-then-repair recovery —
  // and can never be treated as structurally clean or silently reach the UI.
  if (state.executionRecords === undefined) report.missing.push('executionRecords');
  else if (executionRecordsDamaged(state.executionRecords)) report.invalid.push('executionRecords');
  const prompts = checkCollection(report, 'prompts', state.prompts);
  for (const [i, p] of (prompts ?? []).entries()) {
    if (p === null || typeof p !== 'object') continue; // already reported via prompts
    checkItemList(report, `prompts[${i}].tags`, (p as Prompt).tags, 'string');
    checkItemList(report, `prompts[${i}].versions`, (p as Prompt).versions, 'object');
  }
  const projects = checkCollection(report, 'projects', state.projects);
  for (const [i, p] of (projects ?? []).entries()) {
    if (p === null || typeof p !== 'object') continue;
    checkItemList(report, `projects[${i}].relatedPrompts`, (p as Project).relatedPrompts, 'string');
    checkItemList(report, `projects[${i}].relatedWorkflows`, (p as Project).relatedWorkflows, 'string');
  }

  if (state.healthProfile === undefined) report.missing.push('healthProfile');
  else if (state.healthProfile !== null && !isPlainObject(state.healthProfile)) report.invalid.push('healthProfile');

  if (state.settings === undefined) report.missing.push('settings');
  else if (!isPlainObject(state.settings)) report.invalid.push('settings'); // null, array, primitive
  else if (state.settings.theme === undefined) report.missing.push('settings.theme');
  else if (state.settings.theme !== 'dark' && state.settings.theme !== 'light') report.invalid.push('settings.theme');

  return report;
}

/**
 * True when boot-time handoff relationship normalization would CHANGE the
 * given (already quarantine-filtered) state — i.e. persisting the loaded
 * view would silently rewrite orphaned/contradictory correction pointers or
 * statuses. That is a LOSSY repair, so the caller must preserve the exact
 * original raw blob first. normalizeHandoffRelationships keeps the identity
 * of unchanged items, so reference inequality means a real mutation.
 */
function handoffRelationshipRepairNeeded(state: AppState): boolean {
  const list = objectArray<Handoff>(state.handoffs);
  const repaired = normalizeHandoffRelationships(list);
  return repaired.length !== list.length || repaired.some((h, i) => h !== list[i]);
}

/**
 * Write the exact raw blob to a unique recovery key and CONFIRM it by
 * reading it back. Never overwrites an earlier recovery record (unique,
 * collision-suffixed keys). Returns the key on confirmed success, null on
 * any failure.
 */
function preserveRawBlob(raw: string): string | null {
  try {
    const base = `${RECOVERY_KEY_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}`;
    let key = base;
    let n = 1;
    while (localStorage.getItem(key) !== null) key = `${base}-${n++}`;
    localStorage.setItem(key, raw);
    return localStorage.getItem(key) === raw ? key : null;
  } catch {
    return null;
  }
}

function loadRawState(rawOverride?: string): RawLoadResult {
  let raw: string | null;
  try {
    raw = rawOverride === undefined ? localStorage.getItem(STORAGE_KEY) : rawOverride;
  } catch {
    console.error('DavidOS: device storage is unavailable — running in memory only; nothing was overwritten.');
    return {
      state: null,
      recovery: {
        kind: 'unreadable',
        rawPreserved: false,
        canPersist: false,
        message: 'Device storage is unavailable, so changes cannot be saved on this device this session.',
      },
    };
  }
  // Only null means "key absent" (clean first run). An EXISTING empty
  // string is an unreadable blob and must go through recovery below —
  // `!raw` would have silently treated it as a fresh install.
  if (raw === null) return { state: null, recovery: CLEAN };

  let parsed: AppState;
  try {
    const candidate = JSON.parse(raw) as AppState;
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate) || typeof candidate.schemaVersion !== 'number') {
      throw new Error('not a DavidOS state object (missing schemaVersion)');
    }
    parsed = candidate;
  } catch {
    const key = preserveRawBlob(raw);
    if (key) {
      console.error('DavidOS: stored state is unreadable — the exact original was preserved on this device; booting with defaults.');
      return {
        state: null,
        recovery: {
          kind: 'unreadable',
          rawPreserved: true,
          recoveryKey: key,
          canPersist: true,
          message: 'Saved data could not be read. The untouched original was preserved on this device and the app started fresh.',
        },
      };
    }
    console.error('DavidOS: stored state is unreadable AND could not be preserved — running in memory only; the stored copy was NOT overwritten.');
    return {
      state: null,
      recovery: {
        kind: 'unreadable',
        rawPreserved: false,
        canPersist: false,
        message: 'Saved data could not be read, and backing it up failed. Saving is paused so the stored copy is not overwritten — free up storage, then reload.',
      },
    };
  }

  // Forward-version guard: data from a NEWER DavidOS must not be normalized or
  // overwritten (we would drop fields we don't understand). Preserve it exactly
  // and run in memory with defaults so the newer data survives for that version.
  if (parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
    const key = preserveRawBlob(raw);
    // Neither the log line nor the UI message echoes the stored version value
    // (POST-M-PRIV-01) — only this app's own supported version is named.
    console.warn(`DavidOS: stored data has a "schemaVersion" newer than this app understands (supported: ${CURRENT_SCHEMA_VERSION}); not overwriting it.`);
    return {
      state: null,
      recovery: {
        kind: 'unreadable',
        rawPreserved: Boolean(key),
        recoveryKey: key ?? undefined,
        canPersist: false,
        message:
          `This saved data was created by a newer version of DavidOS than this app understands ` +
          `(supported schema: ${CURRENT_SCHEMA_VERSION}). To avoid corrupting it, the app started ` +
          `with a blank workspace and will not save over your data. Open the newer version, or update ` +
          `this one.` + (key ? ` A copy was preserved on this device.` : ''),
      },
    };
  }

  const report = inspectStructure(parsed);
  // DOS-STAB-001A: deep per-record integrity on top of the structural check.
  // Malformed-but-parseable records (wrong types, invalid enums/dates, broken
  // nested items, duplicate ids) are QUARANTINED — valid neighbors keep
  // loading — after the exact original blob has been preserved.
  const records = inspectRecordIntegrity(parsed);
  // Handoff relationship normalization (orphaned corrections, contradictory
  // supersession) MUTATES data when it repairs, so it is lossy too. Detected
  // on the quarantine-filtered view (what would actually persist).
  const relationshipRepair = handoffRelationshipRepairNeeded(quarantineInvalidRecords(parsed, records));
  if (report.invalid.length === 0 && records.totalInvalid === 0 && !relationshipRepair) {
    const state = normalizeState(parsed);
    if (report.missing.length > 0) {
      // Collapsed to approved collection categories + counts, exactly like the
      // damage path: raw `missing` entries carry field paths and array indices
      // (e.g. `prompts[3].tags`), which must not reach console output.
      console.info(`DavidOS: state migrated additively (backfilled: ${summarizeStructuralDamage(report.missing)}).`);
      return { state, recovery: { kind: 'migrated', rawPreserved: false, canPersist: true, message: '' } };
    }
    return { state, recovery: CLEAN };
  }

  // Lossy repair/quarantine: preserve the exact original BEFORE anything may
  // replace it. The damage summary names fields, collections, and counts only
  // — never record contents, field values, ids, or storage keys.
  const damage = describeDamage(report, records);
  const key = preserveRawBlob(raw);
  const state = normalizeState(quarantineInvalidRecords(parsed, records));
  const excludedNote = damage
    ? `Some saved records were damaged and were quarantined — excluded from active data (${damage}).`
    : '';
  const repairNote = relationshipRepair
    ? 'Inconsistent handoff relationship links were repaired.'
    : '';
  const summary = [excludedNote, repairNote].filter(Boolean).join(' ');
  if (key) {
    console.warn(`DavidOS: ${summary} The exact original blob was preserved on this device first.`);
    return {
      state,
      recovery: {
        kind: 'repaired',
        rawPreserved: true,
        recoveryKey: key,
        canPersist: true,
        message: `${summary} The untouched original was preserved on this device and can be exported from Settings.`,
      },
    };
  }
  console.error(`DavidOS: ${summary} Preservation FAILED — the quarantined view stays in memory only; the stored original was NOT overwritten.`);
  return {
    state,
    recovery: {
      kind: 'repaired',
      rawPreserved: false,
      canPersist: false,
      message: `${summary} Backing up the original failed, so saving is paused and the stored copy is not overwritten — export a backup, free up storage, then reload.`,
    },
  };
}

/**
 * Journal-aware boot. A valid journal generation is authoritative over the
 * legacy key, then passes through the exact same preservation/quarantine
 * pipeline. Unreferenced generations are never considered here.
 */
export function loadPersistedState(): LoadResult {
  try {
    const journal = selectJournalAuthority(localStorage);
    if (journal.authority) {
      const loaded = loadRawState(journal.authority.raw);
      return {
        ...loaded,
        recovery: journal.reconciliationNeeded
          ? {
              ...loaded.recovery,
              canPersist: false,
              message: loaded.recovery.message ||
                'Saved-data authority requires reconciliation. Saving is paused; recovery and export remain available.',
            }
          : loaded.recovery,
        committedGeneration: journal.authority.generationId,
        committedSequence: journal.authority.sequence,
        journalReconciliationNeeded: journal.reconciliationNeeded,
      };
    }
    const loaded = loadRawState();
    return {
      ...loaded,
      recovery: journal.reconciliationNeeded
        ? {
            ...loaded.recovery,
            canPersist: false,
            message: loaded.recovery.message ||
              'Saved-data authority requires reconciliation. Saving is paused; recovery and export remain available.',
          }
        : loaded.recovery,
      committedGeneration: null,
      committedSequence: 0,
      journalReconciliationNeeded: journal.reconciliationNeeded,
    };
  } catch {
    return {
      state: null,
      committedGeneration: null,
      committedSequence: 0,
      journalReconciliationNeeded: true,
      recovery: {
        kind: 'unreadable',
        rawPreserved: false,
        canPersist: false,
        message: 'Saved-data authority could not be established. Saving is paused; recovery and export remain available.',
      },
    };
  }
}

/**
 * Human-readable damage summary combining collection-level structural
 * categories with per-record quarantine counts, e.g. "prompts: 2;
 * openLoops: 2 of 5". Approved category names and counts only — never field
 * paths, indices, ids, values, or storage keys (allowlist in bootValidation).
 */
function describeDamage(report: StructuralReport, records: RecordIntegrityReport): string {
  const parts: string[] = [];
  const structural = summarizeStructuralDamage(report.invalid);
  if (structural) parts.push(structural);
  const quarantine = summarizeRecordQuarantine(records);
  if (quarantine) parts.push(quarantine);
  return parts.join('; ');
}
