/**
 * Deep per-entity validation for IMPORTED backups (DOS-WF-001R Phase 2C).
 *
 * Boot-time loading stays fail-safe (normalizeState repairs item-level damage so
 * the app always starts). An explicit import is different: the user is replacing
 * their data with a file, so we validate it deeply and REJECT malformed data
 * with errors that name the collection, the item (index + id when safe), the
 * field, and the expected type/values — WITHOUT echoing the rejected value.
 */
import type { AppState } from '../types';

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

interface FieldSpec {
  name: string;
  ok: (v: unknown) => boolean;
  expected: string;
}

const enumSpec = (name: string, values: readonly string[]): FieldSpec => ({
  name,
  ok: (v) => isStr(v) && values.includes(v),
  expected: `one of ${values.join(' | ')}`,
});
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
    strField('id'), strField('agentId'), strField('workflowId'), strField('workflowName'),
    strField('inputSummary'), strField('outputStyle'), strField('content'),
    enumSpec('risk', ['read_only', 'draft_only', 'local_write', 'external_write', 'sensitive_external_write', 'high_risk']),
    isoField('createdAt'),
  ],
  artifacts: [
    strField('id'), strField('workflowId'),
    enumSpec('artifactType', ['full_prompt', 'current_handoff', 'ai_response', 'manual_note']),
    isoField('createdAt'), strField('content'),
  ],
};

const MAX_ERRORS = 25;

function itemLabel(index: number, item: unknown): string {
  const id = isObj(item) && isStr((item as { id?: unknown }).id) ? (item as { id: string }).id : undefined;
  return id ? `[${index}] (id "${id}")` : `[${index}]`;
}

/** Validate an imported AppState deeply. Returns [] when it is safe to accept. */
export function validateImportedState(state: AppState): ImportError[] {
  const errors: ImportError[] = [];
  const push = (e: ImportError) => { if (errors.length < MAX_ERRORS) errors.push(e); };

  // artifacts predate some backups and are backfilled at normalize time — absent
  // is fine; present-but-malformed is not.
  const OPTIONAL_COLLECTIONS = new Set(['artifacts']);

  for (const [collection, specs] of Object.entries(COLLECTION_SPECS)) {
    const list = (state as unknown as Record<string, unknown>)[collection];
    if (list === undefined && OPTIONAL_COLLECTIONS.has(collection)) continue;
    if (!Array.isArray(list)) {
      push({ collection, expected: 'array', message: `Section "${collection}" must be an array.` });
      continue;
    }
    list.forEach((item, index) => {
      if (!isObj(item)) {
        push({ collection, item: `[${index}]`, expected: 'object', message: `${collection}${`[${index}]`} must be an object.` });
        return;
      }
      const rec = item as Record<string, unknown>;
      const label = itemLabel(index, item);
      if (!isStr(rec.id)) {
        push({ collection, item: `[${index}]`, field: 'id', expected: 'string', message: `${collection}[${index}]: missing or non-string "id".` });
      }
      for (const spec of specs) {
        if (spec.name === 'id') continue; // already reported precisely above
        if (!spec.ok(rec[spec.name])) {
          push({
            collection, item: label, field: spec.name, expected: spec.expected,
            message: `${collection}${label}: field "${spec.name}" must be ${spec.expected}.`,
          });
        }
      }
    });
  }

  // settings (object, not a list)
  if (!isObj(state.settings)) {
    push({ collection: 'settings', expected: 'object', message: 'settings must be an object.' });
  } else if (state.settings.theme !== 'dark' && state.settings.theme !== 'light') {
    push({ collection: 'settings', field: 'theme', expected: 'dark | light', message: 'settings.theme must be "dark" or "light".' });
  }

  // healthProfile only when present and not explicitly null (older backups omit it).
  const hp = state.healthProfile;
  if (hp !== undefined && hp !== null) {
    if (!isObj(hp)) {
      push({ collection: 'healthProfile', expected: 'object or null', message: 'healthProfile must be an object or null.' });
    } else {
      const hpRec = hp as unknown as Record<string, unknown>;
      for (const f of [strField('id'), isoField('createdAt'), isoField('updatedAt')]) {
        if (!f.ok(hpRec[f.name])) {
          push({ collection: 'healthProfile', field: f.name, expected: f.expected, message: `healthProfile field "${f.name}" must be ${f.expected}.` });
        }
      }
    }
  }

  return errors;
}

/** A readable multi-line summary for a thrown import error. No source values. */
export function formatImportErrors(errors: ImportError[]): string {
  const lines = errors.map((e) => `• ${e.message}`);
  if (errors.length >= MAX_ERRORS) lines.push(`• …and possibly more (stopped after ${MAX_ERRORS}).`);
  return lines.join('\n');
}
