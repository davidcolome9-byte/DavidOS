import { describe, expect, it } from 'vitest';
import { validateImportedState } from '../storage/importValidation';
import { parseImport, serializeState } from '../storage/exportImport';
import { buildDefaultState } from '../../data/defaultState';
import { CURRENT_SCHEMA_VERSION } from '../storage/localStore';
import type { AppState } from '../types';

const base = (): AppState => buildDefaultState();
const envelope = (mutate: (s: AppState) => void): string => {
  const s = JSON.parse(serializeState(base()));
  mutate(s.state);
  s.schemaVersion = s.state.schemaVersion;
  return JSON.stringify(s);
};

describe('validateImportedState (Phase 2C)', () => {
  it('accepts a valid current backup', () => {
    expect(validateImportedState(base())).toEqual([]);
  });

  it('accepts a valid older backup missing artifacts/healthProfile', () => {
    const s = base();
    delete (s as Partial<AppState>).artifacts;
    delete (s as Partial<AppState>).healthProfile;
    expect(validateImportedState(s)).toEqual([]);
  });

  const firstError = (mutate: (s: AppState) => void) => {
    const s = base();
    mutate(s);
    return validateImportedState(s);
  };

  it('flags a missing id', () => {
    const errs = firstError((s) => { s.projects = [{ name: 'x' } as never]; });
    expect(errs.some((e) => e.collection === 'projects' && e.field === 'id')).toBe(true);
  });

  it('flags a wrong primitive type', () => {
    const errs = firstError((s) => { s.priorities = [{ id: 'a', label: 'x', rank: 'nope' } as never]; });
    expect(errs.some((e) => e.collection === 'priorities' && e.field === 'rank' && e.expected === 'finite number')).toBe(true);
  });

  it('flags an invalid enum', () => {
    const errs = firstError((s) => { s.projects = [{ ...validProject(), status: 'archived' } as never]; });
    expect(errs.some((e) => e.field === 'status' && /active/.test(e.expected ?? ''))).toBe(true);
  });

  it('flags a malformed nested object (non-object item)', () => {
    const errs = firstError((s) => { s.prompts = [null as never]; });
    expect(errs.some((e) => e.collection === 'prompts' && /object/.test(e.message))).toBe(true);
  });

  it('flags a malformed date', () => {
    const errs = firstError((s) => { s.handoffs = [{ ...validHandoff(), createdAt: 'not-a-date' } as never]; });
    expect(errs.some((e) => e.field === 'createdAt' && /ISO date/.test(e.expected ?? ''))).toBe(true);
  });

  it('flags malformed settings', () => {
    const errs = firstError((s) => { (s.settings as { theme: string }).theme = 'neon'; });
    expect(errs.some((e) => e.collection === 'settings' && e.field === 'theme')).toBe(true);
  });

  it('flags a malformed artifact', () => {
    const errs = firstError((s) => { s.artifacts = [{ id: 'a', workflowId: 'w', artifactType: 'bogus', createdAt: new Date().toISOString(), content: 'c' } as never]; });
    expect(errs.some((e) => e.collection === 'artifacts' && e.field === 'artifactType')).toBe(true);
  });

  it('flags a malformed handoff', () => {
    const errs = firstError((s) => { s.handoffs = [{ ...validHandoff(), risk: 'ultra' } as never]; });
    expect(errs.some((e) => e.collection === 'handoffs' && e.field === 'risk')).toBe(true);
  });

  it('flags a malformed Health Profile when present', () => {
    const errs = firstError((s) => { s.healthProfile = { id: 5, createdAt: 'x', updatedAt: 'y' } as never; });
    expect(errs.some((e) => e.collection === 'healthProfile')).toBe(true);
  });

  it('error messages never echo rejected values', () => {
    const errs = firstError((s) => { s.projects = [{ ...validProject(), notes: { secret: 'PRIVATE-NOTE' } } as never]; });
    expect(JSON.stringify(errs)).not.toContain('PRIVATE-NOTE');
  });

  it('error messages never echo the item id (F-09)', () => {
    const errs = firstError((s) => { s.projects = [{ ...validProject(), id: 'SENTINEL-ID-abc123', rank: undefined, notes: 5 } as never]; });
    expect(errs.length).toBeGreaterThan(0);
    expect(JSON.stringify(errs)).not.toContain('SENTINEL-ID');
  });
});

// Parameterized regression matrix for every Codex-reported nested validation
// failure. Each malformed shape MUST be rejected, at the named nested field,
// with no value or id echoed in the diagnostic.
describe('nested import validation matrix (Codex targeted corrections)', () => {
  const cases: { name: string; mutate: (s: AppState) => void; field: string }[] = [
    {
      name: 'malformed-prompt-version-item (IMP-005): versions[].body/savedAt wrong types',
      mutate: (s) => { s.prompts = [{ ...validPrompt(), versions: [{ body: 5, savedAt: 123 }] } as never]; },
      field: 'versions[0].body',
    },
    {
      name: 'malformed prompt versions container (not an array)',
      mutate: (s) => { s.prompts = [{ ...validPrompt(), versions: 'nope' } as never]; },
      field: 'versions',
    },
    {
      name: 'malformed-health-nested-calories: nutritionTargets.calories is a string',
      mutate: (s) => { s.healthProfile = { ...validHealth(), nutritionTargets: { calories: 'many' } } as never; },
      field: 'nutritionTargets.calories',
    },
    {
      name: 'malformed health nested enum: analysisPreferences.coachingStyle invalid',
      mutate: (s) => { s.healthProfile = { ...validHealth(), analysisPreferences: { coachingStyle: 'wild' } } as never; },
      field: 'analysisPreferences.coachingStyle',
    },
    {
      name: 'malformed health seedMetadata: missing required sourcePriority',
      mutate: (s) => { s.healthProfile = { ...validHealth(), seedMetadata: { isSeededProfile: true, sourceNote: 'x', needsVerification: false, seededAt: 'now' } } as never; },
      field: 'seedMetadata.sourcePriority',
    },
    {
      name: 'malformed-handoff-correction-fields: numeric correctsHandoffId',
      mutate: (s) => { s.handoffs = [{ ...validHandoff(), status: 'correction', correctsHandoffId: 123 } as never]; },
      field: 'correctsHandoffId',
    },
    {
      name: 'malformed handoff status enum',
      mutate: (s) => { s.handoffs = [{ ...validHandoff(), status: 'bogus' } as never]; },
      field: 'status',
    },
    {
      name: 'dangling correction reference (referential integrity)',
      mutate: (s) => { s.handoffs = [{ ...validHandoff(), id: 'c1', status: 'correction', correctsHandoffId: 'missing-original' } as never]; },
      field: 'correctsHandoffId',
    },
    {
      name: 'malformed audit entry: bad actionType enum',
      mutate: (s) => { s.auditLog = [{ id: 'a1', timestamp: new Date().toISOString(), command: 'x', actionType: 'nope', approvalStatus: 'approved', resultSummary: 'r' } as never]; },
      field: 'actionType',
    },
    {
      name: 'malformed artifact nested metadata: healthProfileIncluded not boolean',
      mutate: (s) => { s.artifacts = [{ id: 'w1', workflowId: 'w', artifactType: 'full_prompt', createdAt: new Date().toISOString(), content: 'c', healthProfilePromptMetadata: { healthProfileIncluded: 'yes' } } as never]; },
      field: 'healthProfilePromptMetadata.healthProfileIncluded',
    },
  ];

  for (const c of cases) {
    it(`rejects ${c.name}`, () => {
      const s = base();
      c.mutate(s);
      const errs = validateImportedState(s);
      expect(errs.length, 'expected at least one rejection').toBeGreaterThan(0);
      expect(errs.some((e) => e.field === c.field), `expected an error on field "${c.field}"`).toBe(true);
    });
  }

  it('a valid current backup with full nested structures still passes', () => {
    const s = base();
    s.prompts = [{ ...validPrompt(), versions: [{ body: 'v1', savedAt: new Date().toISOString() }] }] as never;
    s.healthProfile = validHealth() as never;
    expect(validateImportedState(s)).toEqual([]);
  });
});

describe('parseImport envelope-version consistency (F-02)', () => {
  it('rejects a future outer envelope wrapped around a current state', () => {
    const s = JSON.parse(serializeState(base()));
    s.schemaVersion = CURRENT_SCHEMA_VERSION + 5; // outer envelope claims newer
    // inner state.schemaVersion stays current
    expect(() => parseImport(JSON.stringify(s))).toThrow(/newer version|inconsistent|schema/i);
  });

  it('rejects an envelope whose version disagrees with its data', () => {
    const s = JSON.parse(serializeState(base()));
    s.schemaVersion = Math.max(0, s.state.schemaVersion - 1); // mismatch, still <= current
    expect(() => parseImport(JSON.stringify(s))).toThrow(/inconsistent|schema/i);
  });
});

describe('parseImport schema + forward-version guard (Phase 2C)', () => {
  it('imports a valid current backup', () => {
    const out = parseImport(envelope(() => {}));
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('rejects a backup from a newer schema version, leaving current data untouched', () => {
    const json = envelope((s) => { s.schemaVersion = CURRENT_SCHEMA_VERSION + 1; });
    expect(() => parseImport(json)).toThrow(/newer version|schema/i);
  });

  it('accepts a valid older-compatible backup (missing artifacts)', () => {
    const json = envelope((s) => { delete (s as Partial<AppState>).artifacts; });
    expect(() => parseImport(json)).not.toThrow();
  });
});

function validProject() {
  return { id: 'p', name: 'n', status: 'active', area: 'a', nextAction: '', notes: '', relatedPrompts: [], relatedWorkflows: [], updatedAt: new Date().toISOString() };
}
function validHandoff() {
  return { id: 'h', agentId: 'fitness', workflowId: 'fitness-handoff', workflowName: 'Fitness Handoff', inputSummary: 's', outputStyle: 'AI handoff', content: 'c', risk: 'draft_only', createdAt: new Date().toISOString() };
}
function validPrompt() {
  return { id: 'pr', title: 't', body: 'b', category: 'c', tags: [], favorite: false, versions: [], updatedAt: new Date().toISOString() };
}
function validHealth() {
  const now = new Date().toISOString();
  return { id: 'hp', createdAt: now, updatedAt: now };
}
