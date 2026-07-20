import type {
  ExecutionApprovalGateItem,
  ExecutionAuthority,
  ExecutionEvidenceItem,
  ExecutionEvidenceKind,
  ExecutionRecord,
  ExecutionRecordStatus,
  ExecutionService,
  ExecutionSessionMode,
} from '../types';
import { uid, nowIso } from '../types';
import type { ExecutionAgentProfile } from './executionAgentRegistry';
import { getExecutionAgent } from './executionAgentRegistry';

/**
 * Pure domain logic for supervised execution records (DOS-AGT-001A).
 *
 * Everything here is deterministic and side-effect free: the UI stays thin
 * and every lifecycle rule is enforced HERE, never by button visibility.
 * No function performs or simulates any external action — records describe
 * work done OUTSIDE DavidOS by a service David operates himself.
 *
 * Validation errors identify field names and array indexes only. They must
 * NEVER echo user-entered content (titles, objectives, scope, stop
 * conditions, model labels, evidence, gate labels, summaries, paths, URLs).
 */

export const EXECUTION_SERVICES: readonly ExecutionService[] =
  Object.freeze(['claude_code', 'codex', 'gemini', 'antigravity', 'manual'] as const);
export const EXECUTION_SESSION_MODES: readonly ExecutionSessionMode[] =
  Object.freeze(['plan_only', 'supervised_implementation', 'review_only'] as const);
export const EXECUTION_STATUSES: readonly ExecutionRecordStatus[] =
  Object.freeze(['draft', 'ready', 'in_progress', 'blocked', 'awaiting_approval', 'completed', 'cancelled'] as const);
export const EXECUTION_EVIDENCE_KINDS: readonly ExecutionEvidenceKind[] =
  Object.freeze(['commit', 'pull_request', 'test_run', 'file_change', 'external_log', 'note'] as const);
export const GATE_DECISIONS = Object.freeze(['pending', 'approved', 'denied'] as const);

export const SERVICE_LABELS: Record<ExecutionService, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  manual: 'Manual coding service',
};

export const SESSION_MODE_LABELS: Record<ExecutionSessionMode, string> = {
  plan_only: 'Plan only',
  supervised_implementation: 'Supervised implementation',
  review_only: 'Review only',
};

export const STATUS_LABELS: Record<ExecutionRecordStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  in_progress: 'In progress',
  blocked: 'Blocked',
  awaiting_approval: 'Awaiting approval',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Badge tone per status (see styles: badge ok/info/warn/danger/neutral). */
export const STATUS_TONE: Record<ExecutionRecordStatus, string> = {
  draft: 'neutral',
  ready: 'info',
  in_progress: 'info',
  blocked: 'danger',
  awaiting_approval: 'warn',
  completed: 'ok',
  cancelled: 'neutral',
};

export const EVIDENCE_KIND_LABELS: Record<ExecutionEvidenceKind, string> = {
  commit: 'Commit',
  pull_request: 'Pull request',
  test_run: 'Test run',
  file_change: 'File change',
  external_log: 'External log',
  note: 'Note',
};

/** Authority flags in stable render order — every packet shows all of them. */
export const AUTHORITY_FIELDS: ReadonlyArray<{ key: keyof ExecutionAuthority; label: string }> =
  Object.freeze([
    { key: 'editCode', label: 'Code edits' },
    { key: 'runTests', label: 'Tests' },
    { key: 'editDocs', label: 'Documentation edits' },
    { key: 'push', label: 'Push' },
    { key: 'openPullRequests', label: 'Pull-request creation' },
    { key: 'merge', label: 'Merge' },
  ]);

const AUTHORITY_KEYS = AUTHORITY_FIELDS.map((field) => field.key);

/**
 * Capabilities that are locked in DOS-AGT-001A: they cannot be enabled for
 * anyone through this record, and DavidOS itself never has them. Rendered as
 * fixed UI copy so the boundary is visible, not implied.
 */
export const LOCKED_CAPABILITIES: readonly string[] = Object.freeze([
  'AI provider calls',
  'Shell execution by DavidOS',
  'Credential access',
  'Spending',
  'Service connections / network integrations',
  'Permission expansion',
  'Background jobs',
  'Autonomous execution',
  'Autonomous merge or deployment',
]);

/** Every authority value defaults to NOT authorized. */
export function defaultAuthority(): ExecutionAuthority {
  return {
    editCode: false,
    runTests: false,
    editDocs: false,
    push: false,
    openPullRequests: false,
    merge: false,
  };
}

/**
 * Restrictive authority construction: copy ONLY recognized keys carrying an
 * actual boolean. undefined, strings, numbers, truthy objects, and unknown
 * keys can never replace a safe false default. No wildcard grants exist.
 */
export function sanitizeAuthority(input: unknown): ExecutionAuthority {
  const authority = defaultAuthority();
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return authority;
  const rec = input as Record<string, unknown>;
  for (const key of AUTHORITY_KEYS) {
    // OWN properties only — an inherited/prototype value can never grant.
    if (Object.prototype.hasOwnProperty.call(rec, key) && typeof rec[key] === 'boolean') {
      authority[key] = rec[key] as boolean;
    }
  }
  return authority;
}

/**
 * Conservative grammar of ids actually produced by `uid()` in types.ts
 * (base-36 timestamp + base-36 random): lowercase alphanumerics only, with
 * length bounds around what the helper can emit. Imported record ids outside
 * this grammar are rejected at the validation boundary so an id can never
 * smuggle paths/URLs/tokens — though audit output additionally never includes
 * raw record ids at all (see executionAudit.ts).
 */
export const EXECUTION_RECORD_ID_PATTERN = /^[a-z0-9]{8,20}$/;

const CANONICAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Strict canonical ISO timestamp check — exactly the format `nowIso()`
 * produces (`YYYY-MM-DDTHH:mm:ss.sssZ`), verified by shape AND round-trip
 * equality so impossible calendar dates (e.g. Feb 30), locale strings,
 * date-only strings, offset timezones, and other Date.parse-tolerated
 * inputs are all rejected.
 */
export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_ISO.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function isTerminal(status: ExecutionRecordStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

function assertMutable(record: ExecutionRecord, action: string): void {
  if (isTerminal(record.status)) {
    throw new Error(`Cannot ${action}: the record is ${record.status} and terminal.`);
  }
}

// ---- construction -------------------------------------------------------------

export interface NewExecutionRecordInput {
  title?: string;
  objective?: string;
  scope?: string;
  stopConditions?: string;
  targetService: ExecutionService;
  model?: string;
  sessionMode: ExecutionSessionMode;
  authority?: unknown;
}

/**
 * Create a draft record. Enum-like inputs are validated at RUNTIME (never
 * trusted to TypeScript alone); draft text fields may be intentionally blank
 * — readiness enforces them before the record can leave draft. `now`/`id`
 * are injectable for deterministic tests.
 */
export function createExecutionRecord(
  input: NewExecutionRecordInput,
  now: string = nowIso(),
  id: string = uid(),
): ExecutionRecord {
  if (typeof id !== 'string' || !EXECUTION_RECORD_ID_PATTERN.test(id)) {
    throw new Error('Execution record id must match the generated-id grammar.');
  }
  if (!isIsoTimestamp(now)) {
    throw new Error('Execution record timestamp must be a valid ISO date string.');
  }
  if (!EXECUTION_SERVICES.includes(input.targetService)) {
    throw new Error('Execution record targetService is not a recognized service.');
  }
  if (!EXECUTION_SESSION_MODES.includes(input.sessionMode)) {
    throw new Error('Execution record sessionMode is not a recognized session mode.');
  }
  return {
    id,
    executionAgentId: 'coding-coordinator',
    title: typeof input.title === 'string' ? input.title.trim() : '',
    objective: typeof input.objective === 'string' ? input.objective.trim() : '',
    scope: typeof input.scope === 'string' ? input.scope.trim() : '',
    stopConditions: typeof input.stopConditions === 'string' ? input.stopConditions.trim() : '',
    targetService: input.targetService,
    model: typeof input.model === 'string' ? input.model.trim() : '',
    sessionMode: input.sessionMode,
    authority: sanitizeAuthority(input.authority),
    status: 'draft',
    evidence: [],
    approvalGates: [],
    createdAt: now,
    updatedAt: now,
  };
}

export interface DraftFieldUpdates {
  title?: string;
  objective?: string;
  scope?: string;
  stopConditions?: string;
  targetService?: ExecutionService;
  model?: string;
  sessionMode?: ExecutionSessionMode;
  authority?: unknown;
}

/**
 * Packet-defining fields are editable ONLY while the record is a draft
 * (return-to-draft is the sanctioned path back). Throws otherwise.
 */
export function updateDraftFields(
  record: ExecutionRecord,
  updates: DraftFieldUpdates,
  now: string = nowIso(),
): ExecutionRecord {
  if (record.status !== 'draft') {
    throw new Error('Packet-defining fields are editable only while the record is a draft.');
  }
  if (!isIsoTimestamp(now)) {
    throw new Error('Execution record timestamp must be a valid ISO date string.');
  }
  if (updates.targetService !== undefined && !EXECUTION_SERVICES.includes(updates.targetService)) {
    throw new Error('Execution record targetService is not a recognized service.');
  }
  if (updates.sessionMode !== undefined && !EXECUTION_SESSION_MODES.includes(updates.sessionMode)) {
    throw new Error('Execution record sessionMode is not a recognized session mode.');
  }
  const next: ExecutionRecord = { ...record, updatedAt: now };
  if (typeof updates.title === 'string') next.title = updates.title.trim();
  if (typeof updates.objective === 'string') next.objective = updates.objective.trim();
  if (typeof updates.scope === 'string') next.scope = updates.scope.trim();
  if (typeof updates.stopConditions === 'string') next.stopConditions = updates.stopConditions.trim();
  if (typeof updates.model === 'string') next.model = updates.model.trim();
  if (updates.targetService !== undefined) next.targetService = updates.targetService;
  if (updates.sessionMode !== undefined) next.sessionMode = updates.sessionMode;
  if (updates.authority !== undefined) next.authority = sanitizeAuthority(updates.authority);
  return next;
}

// ---- readiness -----------------------------------------------------------------

/** What blocks a draft from becoming ready. Objective, scope, and stop
 *  conditions are SEPARATE requirements — never combined. */
export function readinessErrors(record: ExecutionRecord): string[] {
  const errors: string[] = [];
  if (record.title.trim() === '') errors.push('Title is required.');
  if (record.objective.trim() === '') errors.push('Objective is required.');
  if (record.scope.trim() === '') errors.push('Bounded scope is required.');
  if (record.stopConditions.trim() === '') errors.push('Stop conditions are required.');
  if (!EXECUTION_SERVICES.includes(record.targetService)) errors.push('A recognized target service is required.');
  if (!EXECUTION_SESSION_MODES.includes(record.sessionMode)) errors.push('A recognized session mode is required.');
  return errors;
}

// ---- evidence & approval gates ---------------------------------------------------

function evidenceItemErrors(item: ExecutionEvidenceItem, ref: string): string[] {
  const errors: string[] = [];
  if (typeof item.id !== 'string' || item.id.trim() === '') errors.push(`${ref}.id must be a non-empty string.`);
  if (!EXECUTION_EVIDENCE_KINDS.includes(item.kind)) errors.push(`${ref}.kind is not a recognized evidence kind.`);
  if (typeof item.reference !== 'string' || item.reference.trim() === '') errors.push(`${ref}.reference must be non-blank.`);
  if (!isIsoTimestamp(item.addedAt)) errors.push(`${ref}.addedAt must be an ISO date string.`);
  return errors;
}

/** All structural problems in a record's evidence list (duplicates included). */
export function evidenceErrors(evidence: ExecutionEvidenceItem[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  evidence.forEach((item, i) => {
    const ref = `evidence[${i}]`;
    errors.push(...evidenceItemErrors(item, ref));
    if (typeof item.id === 'string' && item.id.trim() !== '') {
      if (seen.has(item.id)) errors.push(`${ref}.id duplicates an earlier evidence id.`);
      seen.add(item.id);
    }
  });
  return errors;
}

export function addEvidence(
  record: ExecutionRecord,
  kind: ExecutionEvidenceKind,
  reference: string,
  now: string = nowIso(),
  id: string = uid(),
): ExecutionRecord {
  assertMutable(record, 'add evidence');
  if (!EXECUTION_EVIDENCE_KINDS.includes(kind)) {
    throw new Error('Evidence kind is not recognized.');
  }
  if (typeof reference !== 'string' || reference.trim() === '') {
    throw new Error('Evidence reference must be non-blank.');
  }
  if (!isIsoTimestamp(now)) {
    throw new Error('Evidence timestamp must be a valid ISO date string.');
  }
  if (typeof id !== 'string' || id.trim() === '' || record.evidence.some((e) => e.id === id)) {
    throw new Error('Evidence id must be a unique non-empty string.');
  }
  const item: ExecutionEvidenceItem = { id, kind, reference: reference.trim(), addedAt: now };
  return { ...record, evidence: [...record.evidence, item], updatedAt: now };
}

export function addApprovalGate(
  record: ExecutionRecord,
  label: string,
  now: string = nowIso(),
  id: string = uid(),
): ExecutionRecord {
  assertMutable(record, 'add an approval gate');
  if (typeof label !== 'string' || label.trim() === '') {
    throw new Error('Approval gate label must be non-blank.');
  }
  if (!isIsoTimestamp(now)) {
    throw new Error('Approval gate timestamp must be a valid ISO date string.');
  }
  if (typeof id !== 'string' || id.trim() === '' || record.approvalGates.some((g) => g.id === id)) {
    throw new Error('Approval gate id must be a unique non-empty string.');
  }
  const gate: ExecutionApprovalGateItem = { id, label: label.trim(), decision: 'pending' };
  return { ...record, approvalGates: [...record.approvalGates, gate], updatedAt: now };
}

/**
 * Decide a pending gate. Terminal records reject the mutation (throw).
 * An unknown gate id — or a gate that is already decided — is a TRUE no-op:
 * the exact same record object is returned, updatedAt does not change, and
 * no caller may present it as a successful decision.
 */
export function decideApprovalGate(
  record: ExecutionRecord,
  gateId: string,
  decision: 'approved' | 'denied',
  now: string = nowIso(),
): ExecutionRecord {
  assertMutable(record, 'decide an approval gate');
  if (decision !== 'approved' && decision !== 'denied') {
    throw new Error('Approval gate decision must be approved or denied.');
  }
  if (!isIsoTimestamp(now)) {
    throw new Error('Approval gate timestamp must be a valid ISO date string.');
  }
  const gate = record.approvalGates.find((g) => g.id === gateId);
  if (!gate || gate.decision !== 'pending') return record;
  return {
    ...record,
    approvalGates: record.approvalGates.map((g) =>
      g.id === gateId ? { ...g, decision, decidedAt: now } : g,
    ),
    updatedAt: now,
  };
}

// ---- lifecycle -----------------------------------------------------------------

/** Legal transitions, as data. Self-transitions are invalid; terminal → []. */
export const EXECUTION_TRANSITIONS: Record<ExecutionRecordStatus, readonly ExecutionRecordStatus[]> = {
  draft: ['ready', 'cancelled'],
  ready: ['draft', 'in_progress', 'cancelled'],
  in_progress: ['blocked', 'awaiting_approval', 'completed', 'cancelled'],
  blocked: ['in_progress', 'awaiting_approval', 'cancelled'],
  awaiting_approval: ['in_progress', 'blocked', 'cancelled'],
  completed: [],
  cancelled: [],
};

export interface TransitionExtras {
  /** Required when entering `blocked`. */
  blockerSummary?: string;
  /** Required when entering `awaiting_approval`. */
  decisionSummary?: string;
  /** Optional free text when entering `completed`. */
  outcomeSummary?: string;
}

/**
 * Completion policy: PENDING gates block completion. Decided gates —
 * approved AND denied — do not: a denied gate is a resolved decision that
 * the gated action stays out of scope, not an unresolved question.
 */
function completionErrors(record: ExecutionRecord): string[] {
  const errors: string[] = [];
  const structural = evidenceErrors(record.evidence);
  if (record.evidence.length === 0 || structural.length > 0) {
    errors.push('Completion requires at least one valid evidence item.');
    errors.push(...structural);
  }
  if (record.approvalGates.some((g) => g.decision === 'pending')) {
    errors.push('Completion requires every approval gate to be decided.');
  }
  return errors;
}

/**
 * Why the record may not move to `to` (with the supplied extras). Empty
 * result = legal transition with all guards satisfied. This is THE lifecycle
 * enforcement point — the UI derives what it offers from here.
 */
export function transitionErrors(
  record: ExecutionRecord,
  to: ExecutionRecordStatus,
  extras: TransitionExtras = {},
): string[] {
  if (isTerminal(record.status)) {
    return [`A ${STATUS_LABELS[record.status].toLowerCase()} record is terminal and cannot change status.`];
  }
  if (to === record.status) {
    return ['A record cannot transition to its current status.'];
  }
  if (!EXECUTION_TRANSITIONS[record.status].includes(to)) {
    return [`Cannot move from ${STATUS_LABELS[record.status]} to ${STATUS_LABELS[to]}.`];
  }
  const errors: string[] = [];
  if (record.status === 'draft' && to === 'ready') {
    errors.push(...readinessErrors(record));
  }
  if (to === 'blocked' && (extras.blockerSummary ?? '').trim() === '') {
    errors.push('A blocker summary is required to mark this record blocked.');
  }
  if (to === 'awaiting_approval' && (extras.decisionSummary ?? '').trim() === '') {
    errors.push('A decision summary is required to mark this record awaiting approval.');
  }
  if (to === 'completed') {
    errors.push(...completionErrors(record));
  }
  return errors;
}

export function canTransition(
  record: ExecutionRecord,
  to: ExecutionRecordStatus,
  extras: TransitionExtras = {},
): boolean {
  return transitionErrors(record, to, extras).length === 0;
}

/**
 * Apply a lifecycle transition with normalization:
 * - entering in_progress clears blockerSummary, decisionSummary, closedAt;
 * - entering blocked stores the newly supplied trimmed blockerSummary and
 *   clears decisionSummary and closedAt;
 * - entering awaiting_approval stores the newly supplied trimmed
 *   decisionSummary and clears blockerSummary and closedAt;
 * - outcomeSummary exists ONLY on completed records: every other target
 *   (including cancelled) clears it; entering completed stores the supplied
 *   trimmed outcome when given (it remains optional in this model);
 * - entering completed/cancelled stamps closedAt; every nonterminal target
 *   clears stale closedAt;
 * - existing valid evidence is never cleared by any transition.
 * Cleared lifecycle fields are OMITTED (own property removed), not set to
 * undefined, so live records and their JSON round-trips share one canonical
 * shape. Throws on an illegal or unguarded transition.
 */
export function applyTransition(
  record: ExecutionRecord,
  to: ExecutionRecordStatus,
  now: string = nowIso(),
  extras: TransitionExtras = {},
): ExecutionRecord {
  if (!isIsoTimestamp(now)) {
    throw new Error('Transition timestamp must be a valid ISO date string.');
  }
  const errors = transitionErrors(record, to, extras);
  if (errors.length > 0) {
    throw new Error(`Illegal execution record transition: ${errors.join(' ')}`);
  }
  const next: ExecutionRecord = { ...record, status: to, updatedAt: now };
  delete next.blockerSummary;
  delete next.decisionSummary;
  delete next.outcomeSummary;
  delete next.closedAt;
  if (to === 'blocked') next.blockerSummary = (extras.blockerSummary ?? '').trim();
  if (to === 'awaiting_approval') next.decisionSummary = (extras.decisionSummary ?? '').trim();
  if (isTerminal(to)) {
    next.closedAt = now;
    if (to === 'completed' && typeof extras.outcomeSummary === 'string' && extras.outcomeSummary.trim() !== '') {
      next.outcomeSummary = extras.outcomeSummary.trim();
    }
  }
  return next;
}

// ---- unknown-safe deep validation -------------------------------------------------

const isPlainRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNonBlankStr = (v: unknown): v is string => isStr(v) && v.trim() !== '';

const NONBLANK_AFTER_DRAFT = ['title', 'objective', 'scope', 'stopConditions'] as const;

/**
 * Deep structural + invariant validation of a single record from UNKNOWN
 * input. Never throws — null, primitives, arrays, and malformed nested
 * objects all produce error strings instead. Messages name fields and
 * indexes only, never values. Nothing is repaired or fabricated: a missing
 * or malformed authority/lifecycle value is an ERROR, never a default.
 */
export function validateExecutionRecordUnknown(value: unknown): string[] {
  if (!isPlainRecord(value)) return ['record must be a plain object.'];
  const rec = value;
  const errors: string[] = [];

  if (typeof rec.id !== 'string' || !EXECUTION_RECORD_ID_PATTERN.test(rec.id)) {
    errors.push('"id" must match the generated-id grammar.');
  }
  if (rec.executionAgentId !== 'coding-coordinator') {
    errors.push('"executionAgentId" must be the known execution agent id.');
  }
  for (const key of ['title', 'objective', 'scope', 'stopConditions', 'model'] as const) {
    if (!isStr(rec[key])) errors.push(`"${key}" must be a string.`);
  }
  if (!isStr(rec.targetService) || !EXECUTION_SERVICES.includes(rec.targetService as ExecutionService)) {
    errors.push('"targetService" is not a recognized service.');
  }
  if (!isStr(rec.sessionMode) || !EXECUTION_SESSION_MODES.includes(rec.sessionMode as ExecutionSessionMode)) {
    errors.push('"sessionMode" is not a recognized session mode.');
  }
  const status = isStr(rec.status) && EXECUTION_STATUSES.includes(rec.status as ExecutionRecordStatus)
    ? (rec.status as ExecutionRecordStatus)
    : null;
  if (status === null) errors.push('"status" is not a recognized status.');
  if (!isIsoTimestamp(rec.createdAt)) errors.push('"createdAt" must be an ISO date string.');
  if (!isIsoTimestamp(rec.updatedAt)) errors.push('"updatedAt" must be an ISO date string.');

  // Authority: EXACTLY the six approved own keys, every value an actual
  // boolean. Unknown/wildcard properties (all, full, admin, …) are rejected
  // outright — never normalized into authorization. Unknown key NAMES are
  // user-controlled content and are not echoed in the error.
  if (!isPlainRecord(rec.authority)) {
    errors.push('"authority" must be an object.');
  } else {
    const authority = rec.authority;
    for (const key of AUTHORITY_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(authority, key) || typeof authority[key] !== 'boolean') {
        errors.push(`"authority.${key}" must be a boolean.`);
      }
    }
    if (Object.keys(authority).some((key) => !(AUTHORITY_KEYS as readonly string[]).includes(key))) {
      errors.push('"authority" must contain only the six recognized keys.');
    }
  }

  // Evidence.
  if (!Array.isArray(rec.evidence)) {
    errors.push('"evidence" must be an array.');
  } else {
    const seen = new Set<string>();
    rec.evidence.forEach((item, i) => {
      const ref = `evidence[${i}]`;
      if (!isPlainRecord(item)) {
        errors.push(`${ref} must be an object.`);
        return;
      }
      if (!isNonBlankStr(item.id)) errors.push(`${ref}.id must be a non-empty string.`);
      else if (seen.has(item.id)) errors.push(`${ref}.id duplicates an earlier evidence id.`);
      else seen.add(item.id);
      if (!isStr(item.kind) || !EXECUTION_EVIDENCE_KINDS.includes(item.kind as ExecutionEvidenceKind)) {
        errors.push(`${ref}.kind is not a recognized evidence kind.`);
      }
      if (!isNonBlankStr(item.reference)) errors.push(`${ref}.reference must be non-blank.`);
      if (!isIsoTimestamp(item.addedAt)) errors.push(`${ref}.addedAt must be an ISO date string.`);
    });
  }

  // Approval gates.
  if (!Array.isArray(rec.approvalGates)) {
    errors.push('"approvalGates" must be an array.');
  } else {
    const seen = new Set<string>();
    rec.approvalGates.forEach((gate, i) => {
      const ref = `approvalGates[${i}]`;
      if (!isPlainRecord(gate)) {
        errors.push(`${ref} must be an object.`);
        return;
      }
      if (!isNonBlankStr(gate.id)) errors.push(`${ref}.id must be a non-empty string.`);
      else if (seen.has(gate.id)) errors.push(`${ref}.id duplicates an earlier gate id.`);
      else seen.add(gate.id);
      if (!isNonBlankStr(gate.label)) errors.push(`${ref}.label must be non-blank.`);
      const decision = gate.decision;
      if (!isStr(decision) || !(GATE_DECISIONS as readonly string[]).includes(decision)) {
        errors.push(`${ref}.decision is not a recognized decision.`);
      } else if (decision === 'pending') {
        if (gate.decidedAt !== undefined) errors.push(`${ref}.decidedAt must be absent while pending.`);
      } else if (!isIsoTimestamp(gate.decidedAt)) {
        errors.push(`${ref}.decidedAt must be an ISO date string once decided.`);
      }
    });
  }

  // Optional summaries: strings when present.
  for (const key of ['blockerSummary', 'decisionSummary', 'outcomeSummary'] as const) {
    if (rec[key] !== undefined && !isStr(rec[key])) errors.push(`"${key}" must be a string when present.`);
  }

  // Lifecycle invariants (only meaningful when status parsed).
  if (status !== null) {
    if (status !== 'draft' && status !== 'cancelled') {
      for (const key of NONBLANK_AFTER_DRAFT) {
        if (isStr(rec[key]) && rec[key].trim() === '') {
          errors.push(`"${key}" must be non-blank once the record has left draft.`);
        }
      }
    }
    if (status === 'blocked' && !isNonBlankStr(rec.blockerSummary)) {
      errors.push('"blockerSummary" must be non-blank while blocked.');
    }
    if (status !== 'blocked' && isStr(rec.blockerSummary)) {
      errors.push('"blockerSummary" must be cleared outside blocked.');
    }
    if (status === 'awaiting_approval' && !isNonBlankStr(rec.decisionSummary)) {
      errors.push('"decisionSummary" must be non-blank while awaiting approval.');
    }
    if (status !== 'awaiting_approval' && isStr(rec.decisionSummary)) {
      errors.push('"decisionSummary" must be cleared outside awaiting approval.');
    }
    if (status !== 'completed' && rec.outcomeSummary !== undefined) {
      errors.push('"outcomeSummary" is allowed only on a completed record.');
    }
    if (isTerminal(status)) {
      if (!isIsoTimestamp(rec.closedAt)) errors.push('"closedAt" must be an ISO date string on a terminal record.');
    } else if (rec.closedAt !== undefined) {
      errors.push('"closedAt" must be absent on a nonterminal record.');
    }
    if (status === 'completed') {
      if (!Array.isArray(rec.evidence) || rec.evidence.length === 0) {
        errors.push('a completed record must carry at least one evidence item.');
      }
      if (Array.isArray(rec.approvalGates) &&
          rec.approvalGates.some((g) => isPlainRecord(g) && g.decision === 'pending')) {
        errors.push('a completed record must not carry pending approval gates.');
      }
    }
  }

  return errors;
}

/**
 * Unknown-safe validation of a whole executionRecords collection (used by
 * import validation). Never throws. Errors are prefixed with the item index;
 * duplicate record ids across the collection are rejected.
 */
export function validateExecutionRecordsCollectionUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return ['executionRecords must be an array.'];
  const errors: string[] = [];
  const seen = new Map<string, number>();
  value.forEach((item, i) => {
    for (const e of validateExecutionRecordUnknown(item)) {
      errors.push(`executionRecords[${i}]: ${e}`);
    }
    if (isPlainRecord(item) && isNonBlankStr(item.id)) {
      const first = seen.get(item.id);
      if (first !== undefined) {
        errors.push(`executionRecords[${i}]: "id" duplicates the id of executionRecords[${first}].`);
      } else {
        seen.set(item.id, i);
      }
    }
  });
  return errors;
}

// ---- packet rendering ---------------------------------------------------------

/** The canonical honesty notice every packet carries. Asserted by tests — do not weaken. */
export const PACKET_HONESTY_NOTICE =
  'DavidOS did not execute commands, modify files, contact a provider, send ' +
  'this packet, mutate GitHub, or perform any external action. It only ' +
  'recorded and copied these instructions; all work is performed by the ' +
  'external service under David\'s supervision.';

/**
 * Deterministic execution packet: a pure function of (record, profile) —
 * no clock, randomness, locale, or environment reads; fixed '\n' newlines;
 * stable section order; repeated rendering is byte-identical. The record is
 * validated first and never mutated; nothing is cached or persisted.
 */
export function renderExecutionPacket(
  record: ExecutionRecord,
  profile?: ExecutionAgentProfile,
): string {
  const resolved = profile ?? getExecutionAgent(record.executionAgentId);
  if (!resolved) {
    throw new Error('Cannot render packet: unknown execution agent id.');
  }
  if (resolved.id !== record.executionAgentId) {
    throw new Error('Cannot render packet: profile does not match the record\'s execution agent.');
  }
  const problems = validateExecutionRecordUnknown(record);
  if (problems.length > 0) {
    // Field names/indexes only — safe to surface.
    throw new Error(`Cannot render packet for an invalid record: ${problems.join(' ')}`);
  }

  const lines: string[] = [];
  lines.push('DAVIDOS EXECUTION PACKET');
  lines.push('');
  lines.push(`Record: ${record.id}`);
  lines.push(`Coordinator: ${resolved.name} (${resolved.id})`);
  lines.push(`Status: ${STATUS_LABELS[record.status]}`);
  lines.push(`Created: ${record.createdAt}`);
  lines.push(`Updated: ${record.updatedAt}`);
  if (record.closedAt) lines.push(`Closed: ${record.closedAt}`);
  lines.push('');
  lines.push('NOTICE');
  lines.push(PACKET_HONESTY_NOTICE);
  lines.push(resolved.supervisionStatement);
  lines.push('');
  lines.push('TASK');
  lines.push(`Title: ${record.title}`);
  lines.push(`Target service: ${SERVICE_LABELS[record.targetService]}`);
  lines.push(`Model (manually entered label): ${record.model.trim() === '' ? '(not specified)' : record.model}`);
  lines.push(`Session mode: ${SESSION_MODE_LABELS[record.sessionMode]}`);
  lines.push('');
  lines.push('OBJECTIVE');
  lines.push(record.objective);
  lines.push('');
  lines.push('BOUNDED SCOPE');
  lines.push(record.scope);
  lines.push('');
  lines.push('STOP CONDITIONS');
  lines.push(record.stopConditions);
  lines.push('');
  lines.push('AUTHORITY (recorded for the external session — DavidOS grants nothing)');
  for (const field of AUTHORITY_FIELDS) {
    const authorized = record.authority[field.key];
    const suffix = field.key === 'merge' ? ' (merging/deploying always requires David)' : '';
    lines.push(`- ${field.label}: ${authorized ? 'Authorized' : 'NOT authorized'}${suffix}`);
  }
  lines.push('');
  lines.push('APPROVAL GATES');
  if (record.approvalGates.length === 0) {
    lines.push('(none)');
  } else {
    for (const gate of record.approvalGates) {
      const decided = gate.decidedAt ? ` at ${gate.decidedAt}` : '';
      lines.push(`- [${gate.decision}${decided}] ${gate.label}`);
    }
  }
  lines.push('');
  lines.push('EVIDENCE');
  if (record.evidence.length === 0) {
    lines.push('(none yet — completion requires at least one evidence item and all approval gates decided)');
  } else {
    for (const item of record.evidence) {
      lines.push(`- ${EVIDENCE_KIND_LABELS[item.kind]} (${item.addedAt}): ${item.reference}`);
    }
  }
  const detail: string[] = [];
  if ((record.blockerSummary ?? '').trim() !== '') detail.push(`Blocker: ${record.blockerSummary}`);
  if ((record.decisionSummary ?? '').trim() !== '') detail.push(`Required decision: ${record.decisionSummary}`);
  if ((record.outcomeSummary ?? '').trim() !== '') detail.push(`Outcome: ${record.outcomeSummary}`);
  if (detail.length > 0) {
    lines.push('');
    lines.push('STATUS DETAIL');
    lines.push(...detail);
  }
  lines.push('');
  return lines.join('\n');
}
