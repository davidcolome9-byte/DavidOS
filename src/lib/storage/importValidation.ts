/**
 * Deep per-entity validation for IMPORTED backups (DOS-WF-001R Phase 2C + the
 * targeted correction pass).
 *
 * Boot-time loading stays fail-safe (normalizeState repairs item-level damage so
 * the app always starts). An explicit import is different: the user is replacing
 * their data with a file, so we validate it deeply and REJECT malformed data
 * BEFORE normalize/persist. Every error names the collection, the item (numeric
 * index only), the full nested field path, and the expected type/values — and
 * NEVER echoes the rejected value or the item's raw id (F-09), so a malformed
 * backup cannot leak a sensitive token through a diagnostic.
 */
import type { AppState } from '../types';
import { validateExecutionRecordsCollectionUnknown } from '../agents/executionRecords';

export interface ImportError {
  collection: string;
  item?: string;
  field?: string;
  expected?: string;
  message: string;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown) => typeof v === 'boolean';
const isObj = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStrArr = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isIsoDate = (v: unknown) => isStr(v) && v.trim() !== '' && !Number.isNaN(Date.parse(v));
const isEnum = (values: readonly string[]) => (v: unknown) => isStr(v) && values.includes(v);

// ---- shared enums ------------------------------------------------------------

const RISK_LEVELS = ['read_only', 'draft_only', 'local_write', 'external_write', 'sensitive_external_write', 'high_risk'];
const APPROVAL_STATUSES = ['not_required', 'approved', 'denied', 'blocked'];
const AGENT_IDS = ['universal-operations', 'daily_command', 'fitness', 'work_project', 'prompt_vault', 'calendar_planning', 'dogs_home_life_admin', 'content_asset'];
const DATE_CONFIDENCE = ['explicit', 'relative_resolved', 'unknown'];
const HANDOFF_STATUS = ['active', 'superseded', 'correction'];
const ARTIFACT_TYPES = ['full_prompt', 'current_handoff', 'ai_response', 'manual_note'];
const SOURCE_MODES = ['preview', 'full_prompt', 'current_only'];
const PRIMARY_GOALS = ['fat_loss', 'recomposition', 'muscle_gain', 'maintenance', 'performance', 'general_health'];
const COACHING_STYLES = ['conservative', 'moderate', 'aggressive', 'context_sensitive'];
const OUTPUT_DETAILS = ['short', 'standard', 'deep'];
const SOURCE_PRIORITIES = ['claude_gdrive', 'fallback_handoff', 'manual'];

// ---- flat field specs (top-level scalar fields of each list item) -----------

interface FieldSpec {
  name: string;
  ok: (v: unknown) => boolean;
  expected: string;
}

const enumSpec = (name: string, values: readonly string[]): FieldSpec => ({ name, ok: isEnum(values), expected: `one of ${values.join(' | ')}` });
const strField = (name: string): FieldSpec => ({ name, ok: isStr, expected: 'string' });
const numField = (name: string): FieldSpec => ({ name, ok: isNum, expected: 'finite number' });
const boolField = (name: string): FieldSpec => ({ name, ok: isBool, expected: 'boolean' });
const strArrField = (name: string): FieldSpec => ({ name, ok: isStrArr, expected: 'string[]' });
const isoField = (name: string): FieldSpec => ({ name, ok: isIsoDate, expected: 'ISO date string' });

const COLLECTION_SPECS: Record<string, FieldSpec[]> = {
  priorities: [strField('id'), strField('label'), numField('rank')],
  openLoops: [strField('id'), strField('label'), enumSpec('status', ['open', 'done']), isoField('createdAt')],
  reminders: [strField('id'), strField('label'), strField('due'), boolField('done')],
  projects: [
    strField('id'), strField('name'), enumSpec('status', ['active', 'paused', 'done']),
    strField('area'), strField('nextAction'), strField('notes'),
    strArrField('relatedPrompts'), strArrField('relatedWorkflows'), isoField('updatedAt'),
  ],
  prompts: [
    strField('id'), strField('title'), strField('body'), strField('category'),
    strArrField('tags'), boolField('favorite'), isoField('updatedAt'),
  ],
  contextItems: [
    strField('id'), strField('title'),
    enumSpec('kind', ['stable', 'priorities', 'private', 'workflow', 'session']),
    strField('body'), isoField('updatedAt'),
  ],
  handoffs: [
    strField('id'), enumSpec('agentId', AGENT_IDS), strField('workflowId'), strField('workflowName'),
    strField('inputSummary'), strField('outputStyle'), strField('content'),
    enumSpec('risk', RISK_LEVELS), isoField('createdAt'),
  ],
  artifacts: [
    strField('id'), strField('workflowId'), enumSpec('artifactType', ARTIFACT_TYPES),
    isoField('createdAt'), strField('content'),
  ],
  auditLog: [
    strField('id'), isoField('timestamp'), strField('command'),
    enumSpec('actionType', RISK_LEVELS), enumSpec('approvalStatus', APPROVAL_STATUSES),
    strField('resultSummary'),
  ],
};

// Optional scalar fields per collection: validated only when present.
const OPTIONAL_FIELDS: Record<string, FieldSpec[]> = {
  openLoops: [isoField('closedAt')],
  prompts: [enumSpec('agentId', AGENT_IDS)],
  handoffs: [
    strField('contentHash'), strField('entryDate'), enumSpec('dateConfidence', DATE_CONFIDENCE),
    enumSpec('status', HANDOFF_STATUS), strField('correctsHandoffId'), strField('output'),
  ],
  auditLog: [enumSpec('agentId', AGENT_IDS), strField('workflowId'), boolField('actionTaken')],
  artifacts: [
    strField('title'), strField('sourceInput'), strField('promptHash'), strField('shortFingerprint'),
    numField('characterCount'), numField('priorHandoffCount'), strField('historyStrategy'),
    strArrField('includedHandoffIds'), boolField('rawFallbackUsed'), enumSpec('sourceMode', SOURCE_MODES),
  ],
};

const MAX_ERRORS = 25;

// ---- nested object validation -----------------------------------------------

interface ObjectField {
  key: string;
  ok: (v: unknown) => boolean;
  expected: string;
  required?: boolean;
}

const f = (key: string, ok: (v: unknown) => boolean, expected: string, required = false): ObjectField => ({ key, ok, expected, required });
const strObj = (key: string, required = false) => f(key, isStr, 'string', required);
const numObj = (key: string) => f(key, isNum, 'finite number');
const boolObj = (key: string, required = false) => f(key, isBool, 'boolean', required);
const strArrObj = (key: string) => f(key, isStrArr, 'string[]');
const enumObj = (key: string, values: readonly string[], required = false) => f(key, isEnum(values), `one of ${values.join(' | ')}`, required);

type Push = (e: ImportError) => void;

/** Join a nested field path without a leading dot when the prefix is empty. */
const join = (a: string, b: string): string => (a ? `${a}.${b}` : b);

/** Validate an object's fields at `path`. Present fields are type-checked; a
 *  required field that is absent is reported. Never echoes values. */
function checkObject(push: Push, collection: string, item: string, path: string, value: unknown, fields: ObjectField[]): void {
  if (!isObj(value)) {
    push({ collection, item, field: path, expected: 'object', message: `${collection}${item}: "${path}" must be an object.` });
    return;
  }
  const rec = value as Record<string, unknown>;
  for (const spec of fields) {
    const fieldPath = join(path, spec.key);
    const present = rec[spec.key] !== undefined && rec[spec.key] !== null;
    if (!present) {
      if (spec.required) {
        push({ collection, item, field: fieldPath, expected: spec.expected, message: `${collection}${item}: "${fieldPath}" is required and must be ${spec.expected}.` });
      }
      continue;
    }
    if (!spec.ok(rec[spec.key])) {
      push({ collection, item, field: fieldPath, expected: spec.expected, message: `${collection}${item}: field "${fieldPath}" must be ${spec.expected}.` });
    }
  }
}

/** Validate a nested sub-object only when present (absent optional object is ok). */
function checkOptionalObject(push: Push, collection: string, item: string, parent: Record<string, unknown>, path: string, key: string, fields: ObjectField[]): void {
  if (parent[key] === undefined || parent[key] === null) return;
  checkObject(push, collection, item, join(path, key), parent[key], fields);
}

// ---- collection-specific nested validators ----------------------------------

function validatePromptNested(push: Push, item: string, rec: Record<string, unknown>): void {
  // versions[] — each entry must be { body: string, savedAt: ISO } (IMP-005).
  const versions = rec.versions;
  if (versions === undefined) return; // older prompts may lack version history
  if (!Array.isArray(versions)) {
    push({ collection: 'prompts', item, field: 'versions', expected: 'array', message: `prompts${item}: "versions" must be an array.` });
    return;
  }
  versions.forEach((v, vi) => {
    checkObject(push, 'prompts', item, `versions[${vi}]`, v, [strObj('body', true), f('savedAt', isIsoDate, 'ISO date string', true)]);
  });
}

function validateArtifactNested(push: Push, item: string, rec: Record<string, unknown>): void {
  const snaps = rec.includedHandoffSnapshots;
  if (snaps !== undefined && snaps !== null) {
    if (!Array.isArray(snaps)) {
      push({ collection: 'artifacts', item, field: 'includedHandoffSnapshots', expected: 'array', message: `artifacts${item}: "includedHandoffSnapshots" must be an array.` });
    } else {
      snaps.forEach((s, si) => {
        checkObject(push, 'artifacts', item, `includedHandoffSnapshots[${si}]`, s, [
          strObj('handoffId', true), strObj('sourceHandoffHash', true), f('savedAt', isIsoDate, 'ISO date string', true),
          enumObj('dateConfidence', DATE_CONFIDENCE, true), strObj('entryDate'),
        ]);
        if (isObj(s) && (s as Record<string, unknown>).extractionSummary !== undefined) {
          checkObject(push, 'artifacts', item, `includedHandoffSnapshots[${si}].extractionSummary`, (s as Record<string, unknown>).extractionSummary, [
            f('highConfidenceFieldCount', isNum, 'finite number', true), f('mediumConfidenceFieldCount', isNum, 'finite number', true),
            f('lowConfidenceFieldCount', isNum, 'finite number', true), boolObj('rawFallbackUsed', true), boolObj('weakExtraction', true),
          ]);
        }
      });
    }
  }
  checkOptionalObject(push, 'artifacts', item, rec, '', 'healthProfilePromptMetadata', [
    boolObj('healthProfileIncluded', true), strArrObj('includedFieldPaths'),
    numObj('promptSummaryCharCount'), numObj('freeformContextExcerptCharCount'),
    strObj('promptContextHash'), strObj('promptContextFingerprint'),
    numObj('promptContextCharacterCount'), strObj('profileLastUpdatedAt'),
  ]);
  // DOS-WF-002A — counts/mode/hash only; never labels or rendered planning text.
  checkOptionalObject(push, 'artifacts', item, rec, '', 'planningContextPromptMetadata', [
    boolObj('planningStateIncluded', true), enumObj('mode', ['planning', 'weekly']),
    numObj('priorityCount'), numObj('openLoopCount'), numObj('reminderCount'), numObj('projectCount'),
    strObj('promptContextHash'), strObj('promptContextFingerprint'),
  ]);
}

// ---- handoff relationship validation (POST-H-IMPORT-01) -----------------------
//
// The correction model (see workflows/continuity.ts and AuditLog.tsx) supports
// exactly these relationship states:
//   - a standalone handoff: status active (or absent), no correctsHandoffId;
//   - a live correction: status "correction" + correctsHandoffId → a handoff
//     whose status is "superseded";
//   - a superseded former correction inside a chain: status "superseded" +
//     correctsHandoffId, itself corrected by a later entry;
//   - every supersession chain ends at exactly one live correction (the UI
//     never lets an already-superseded entry be corrected again).
// An import must REJECT anything else rather than silently normalize it into a
// different state: retrieval (getPriorHandoffs) hides superseded and corrected
// entries, so a contradictory relationship can make a handoff disappear.
// Errors reference items by numeric index only — never by imported id/value.

const VALID_STATUS = new Set(HANDOFF_STATUS);

interface HandoffNode {
  index: number;
  ref: string;
  id?: string;
  /** 'active' | 'superseded' | 'correction' | null when the enum is invalid (already reported). */
  status: string | null;
  corrects?: string;
}

function validateHandoffRelationships(push: Push, handoffs: unknown[]): void {
  const nodes: HandoffNode[] = handoffs.map((h, index) => {
    const ref = `[${index}]`;
    if (!isObj(h)) return { index, ref, status: null };
    const rec = h as Record<string, unknown>;
    const rawStatus = rec.status;
    const status =
      rawStatus === undefined || rawStatus === null
        ? 'active' // retrieval treats a missing status as active
        : isStr(rawStatus) && VALID_STATUS.has(rawStatus)
          ? rawStatus
          : null; // invalid enum — already reported by the field check
    return {
      index,
      ref,
      id: isStr(rec.id) ? rec.id : undefined,
      status,
      corrects: isStr(rec.correctsHandoffId) ? rec.correctsHandoffId : undefined,
    };
  });

  // Duplicate ids: every id must be unique or relationships become ambiguous.
  const byId = new Map<string, HandoffNode>();
  for (const n of nodes) {
    if (n.id === undefined) continue;
    const first = byId.get(n.id);
    if (first) {
      push({ collection: 'handoffs', item: n.ref, field: 'id', expected: 'unique handoff id', message: `handoffs${n.ref}: "id" duplicates the id of handoffs[${first.index}].` });
    } else {
      byId.set(n.id, n);
    }
  }

  // Which handoffs correct which (only counting resolvable, non-self pointers).
  const correctorsByTarget = new Map<string, HandoffNode[]>();

  for (const n of nodes) {
    // A correction must reference the handoff it corrects.
    if (n.status === 'correction' && n.corrects === undefined) {
      push({ collection: 'handoffs', item: n.ref, field: 'correctsHandoffId', expected: 'string (id of the corrected handoff)', message: `handoffs${n.ref}: a correction must set "correctsHandoffId".` });
    }
    if (n.corrects === undefined) continue;

    // Only a correction — or a superseded former correction in a chain — may
    // carry a correction pointer. An ACTIVE handoff with one is contradictory:
    // its target would be hidden from retrieval with no visible correction.
    if (n.status === 'active') {
      push({ collection: 'handoffs', item: n.ref, field: 'correctsHandoffId', expected: 'set only when status is "correction" (or "superseded" within a correction chain)', message: `handoffs${n.ref}: an active handoff must not set "correctsHandoffId".` });
      continue;
    }

    // A handoff can never correct itself.
    if (n.id !== undefined && n.corrects === n.id) {
      push({ collection: 'handoffs', item: n.ref, field: 'correctsHandoffId', expected: 'id of a DIFFERENT handoff', message: `handoffs${n.ref}: "correctsHandoffId" references the handoff itself.` });
      continue;
    }

    // The pointer must resolve inside this backup.
    const target = n.corrects !== undefined ? byId.get(n.corrects) : undefined;
    if (!target) {
      push({ collection: 'handoffs', item: n.ref, field: 'correctsHandoffId', expected: 'id of a handoff present in this backup', message: `handoffs${n.ref}: "correctsHandoffId" references a handoff that is not in this backup.` });
      continue;
    }

    // A corrected handoff must be marked superseded — otherwise it silently
    // vanishes from retrieval while still claiming to be active.
    if (target.status !== null && target.status !== 'superseded') {
      push({ collection: 'handoffs', item: n.ref, field: 'correctsHandoffId', expected: 'the corrected handoff must have status "superseded"', message: `handoffs${n.ref}: corrects handoffs[${target.index}], which is not marked superseded.` });
    }

    const list = correctorsByTarget.get(n.corrects) ?? [];
    list.push(n);
    correctorsByTarget.set(n.corrects, list);
  }

  // One correction per original: the app corrects an already-corrected entry by
  // correcting the CORRECTION (a chain), never by attaching a second correction
  // to the same original.
  for (const [, correctors] of correctorsByTarget) {
    if (correctors.length <= 1) continue;
    const first = correctors[0];
    for (const dup of correctors.slice(1)) {
      push({ collection: 'handoffs', item: dup.ref, field: 'correctsHandoffId', expected: 'at most one correction per corrected handoff', message: `handoffs${dup.ref}: targets the same handoff as handoffs[${first.index}]; only one correction may reference an original.` });
    }
  }

  // Every superseded handoff must be corrected, and its supersession chain must
  // end at a live correction (status "correction"). A missing corrector or a
  // cycle would hide the entry from retrieval with no surviving correction.
  for (const n of nodes) {
    if (n.status !== 'superseded') continue;
    if (n.id === undefined) continue; // unusable id — already reported
    const correctors = correctorsByTarget.get(n.id) ?? [];
    if (correctors.length === 0) {
      push({ collection: 'handoffs', item: n.ref, field: 'status', expected: 'a superseded handoff must be referenced by a correction', message: `handoffs${n.ref}: marked superseded, but no handoff in this backup corrects it.` });
      continue;
    }
    // Walk the chain: superseded → its corrector → … → a live correction.
    const visited = new Set<number>([n.index]);
    let cur = correctors[0];
    let terminated = false;
    for (;;) {
      if (visited.has(cur.index)) break; // cycle
      visited.add(cur.index);
      if (cur.status === 'correction') { terminated = true; break; }
      if (cur.status !== 'superseded' || cur.id === undefined) break; // contradiction reported elsewhere
      const next = (correctorsByTarget.get(cur.id) ?? [])[0];
      if (!next) break; // superseded-without-corrector reported on that node
      cur = next;
    }
    if (!terminated && visited.size > 1 && [...visited].every((i) => nodes[i]?.status === 'superseded')) {
      push({ collection: 'handoffs', item: n.ref, field: 'correctsHandoffId', expected: 'a supersession chain must end at a live correction', message: `handoffs${n.ref}: its correction chain never reaches an entry with status "correction" (dangling or cyclic supersession).` });
    }
  }
}

function validateHealthProfile(push: Push, hp: unknown): void {
  const item = ''; // healthProfile is a singleton, not a list item
  if (!isObj(hp)) {
    push({ collection: 'healthProfile', expected: 'object or null', message: 'healthProfile must be an object or null.' });
    return;
  }
  const rec = hp as Record<string, unknown>;
  // Required identity/date scalars.
  for (const spec of [strField('id'), isoField('createdAt'), isoField('updatedAt')]) {
    if (!spec.ok(rec[spec.name])) {
      push({ collection: 'healthProfile', field: spec.name, expected: spec.expected, message: `healthProfile field "${spec.name}" must be ${spec.expected}.` });
    }
  }
  const C = (path: string, key: string, fields: ObjectField[]) => checkOptionalObject(push, 'healthProfile', item, rec, path, key, fields);
  C('', 'goals', [enumObj('primaryGoal', PRIMARY_GOALS), strObj('goalNotes'), strObj('priorityNotes'), numObj('targetWeight'), numObj('targetBodyFatPercent'), numObj('targetWaist'), strObj('visualGoal')]);
  C('', 'nutritionTargets', [numObj('calories'), numObj('proteinGrams'), numObj('carbGrams'), numObj('fatGrams'), numObj('fiberGrams'), numObj('waterMl'), strObj('notes')]);
  C('', 'activityTargets', [numObj('stepsPerDay'), strObj('cardioTarget')]);
  C('', 'recoveryTargets', [strObj('sleepHours'), strObj('hrvBaseline'), strObj('restingHeartRateBaseline')]);
  C('', 'trainingPlan', [strObj('weeklyFrequency'), strObj('split'), strObj('preferredStyle'), strArrObj('movementRestrictions'), strArrObj('trainingRestrictions'), strObj('currentTrainingNotes'), strArrObj('cautionNotes')]);
  C('', 'bodyMetrics', [strObj('height'), strObj('currentWeight'), strObj('goalWeight'), strObj('waist'), strObj('bodyFatEstimate')]);
  C('', 'medicalContext', [strArrObj('injuryHistory'), strArrObj('movementRestrictions'), strArrObj('cautionNotes'), strArrObj('deviceContext')]);
  C('', 'supplementsMedications', [strArrObj('supplements'), strArrObj('medications'), strObj('notes')]);
  C('', 'analysisPreferences', [enumObj('coachingStyle', COACHING_STYLES), enumObj('outputDetail', OUTPUT_DETAILS), boolObj('compareAgainstTargets')]);
  C('', 'seedMetadata', [boolObj('isSeededProfile', true), strObj('sourceNote', true), enumObj('sourcePriority', SOURCE_PRIORITIES, true), strObj('lastVerifiedAt'), boolObj('needsVerification', true), strObj('seededAt', true), strObj('userModifiedAt')]);
  if (rec.promptSummary !== undefined && rec.promptSummary !== null && !isStr(rec.promptSummary)) {
    push({ collection: 'healthProfile', field: 'promptSummary', expected: 'string', message: 'healthProfile field "promptSummary" must be string.' });
  }
  if (rec.freeformContext !== undefined && rec.freeformContext !== null && !isStr(rec.freeformContext)) {
    push({ collection: 'healthProfile', field: 'freeformContext', expected: 'string', message: 'healthProfile field "freeformContext" must be string.' });
  }
}

// ---- top-level validation ---------------------------------------------------

/** Validate an imported AppState deeply. Returns [] when it is safe to accept. */
export function validateImportedState(state: AppState): ImportError[] {
  const errors: ImportError[] = [];
  const push = (e: ImportError) => { if (errors.length < MAX_ERRORS) errors.push(e); };

  // artifacts/healthProfile predate some backups and are backfilled at
  // normalize time — absent is fine; present-but-malformed is not.
  const OPTIONAL_COLLECTIONS = new Set(['artifacts']);

  for (const [collection, specs] of Object.entries(COLLECTION_SPECS)) {
    const list = (state as unknown as Record<string, unknown>)[collection];
    if (list === undefined && OPTIONAL_COLLECTIONS.has(collection)) continue;
    if (!Array.isArray(list)) {
      push({ collection, expected: 'array', message: `Section "${collection}" must be an array.` });
      continue;
    }
    list.forEach((item, index) => {
      const ref = `[${index}]`;
      if (!isObj(item)) {
        push({ collection, item: ref, expected: 'object', message: `${collection}${ref} must be an object.` });
        return;
      }
      const rec = item as Record<string, unknown>;
      if (!isStr(rec.id)) {
        push({ collection, item: ref, field: 'id', expected: 'string', message: `${collection}${ref}: missing or non-string "id".` });
      }
      for (const spec of specs) {
        if (spec.name === 'id') continue; // already reported precisely above
        if (!spec.ok(rec[spec.name])) {
          push({ collection, item: ref, field: spec.name, expected: spec.expected, message: `${collection}${ref}: field "${spec.name}" must be ${spec.expected}.` });
        }
      }
      for (const spec of OPTIONAL_FIELDS[collection] ?? []) {
        if (rec[spec.name] === undefined || rec[spec.name] === null) continue;
        if (!spec.ok(rec[spec.name])) {
          push({ collection, item: ref, field: spec.name, expected: spec.expected, message: `${collection}${ref}: field "${spec.name}" must be ${spec.expected}.` });
        }
      }
      // Collection-specific nested structures.
      if (collection === 'prompts') validatePromptNested(push, ref, rec);
      if (collection === 'artifacts') validateArtifactNested(push, ref, rec);
    });
  }

  // Handoff correction/supersession relationships are validated across the whole
  // collection (duplicates, self-correction, dangling or contradictory states).
  if (Array.isArray(state.handoffs)) {
    validateHandoffRelationships(push, state.handoffs as unknown[]);
  }

  // executionRecords (DOS-AGT-001A): optional — legacy backups predate it and
  // normalizeState backfills []. Present-but-malformed is rejected via the
  // unknown-safe domain validator (single source of truth for lifecycle,
  // authority, evidence, and gate invariants). Its messages are index/field
  // based and value-free, matching this module's privacy rule.
  const executionRecords = (state as unknown as Record<string, unknown>).executionRecords;
  if (executionRecords !== undefined) {
    for (const message of validateExecutionRecordsCollectionUnknown(executionRecords)) {
      push({ collection: 'executionRecords', message });
    }
  }

  // settings (object, not a list).
  if (!isObj(state.settings)) {
    push({ collection: 'settings', expected: 'object', message: 'settings must be an object.' });
  } else if (state.settings.theme !== 'dark' && state.settings.theme !== 'light') {
    push({ collection: 'settings', field: 'theme', expected: 'dark | light', message: 'settings.theme must be "dark" or "light".' });
  }

  // healthProfile only when present and not explicitly null (older backups omit it).
  const hp = state.healthProfile;
  if (hp !== undefined && hp !== null) validateHealthProfile(push, hp);

  return errors;
}

/** A readable multi-line summary for a thrown import error. No source values. */
export function formatImportErrors(errors: ImportError[]): string {
  const lines = errors.map((e) => `• ${e.message}`);
  if (errors.length >= MAX_ERRORS) lines.push(`• …and possibly more (stopped after ${MAX_ERRORS}).`);
  return lines.join('\n');
}
