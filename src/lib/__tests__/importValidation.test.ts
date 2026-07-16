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
