import { describe, expect, it } from 'vitest';
import { serializeState, parseImport } from '../storage/exportImport';
import { buildDefaultState } from '../../data/defaultState';

describe('export/import', () => {
  it('round-trips the default state', () => {
    const state = buildDefaultState();
    const json = serializeState(state);
    const imported = parseImport(json);
    expect(imported.schemaVersion).toBe(state.schemaVersion);
    expect(imported.projects.length).toBe(state.projects.length);
    expect(imported.prompts.length).toBe(state.prompts.length);
    expect(imported.contextItems.length).toBe(state.contextItems.length);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseImport('{not json')).toThrow('Not valid JSON');
  });

  it('rejects non-DavidOS files', () => {
    expect(() => parseImport('{"foo": 1}')).toThrow('Not a DavidOS backup');
  });

  it('rejects backups missing required sections', () => {
    const state = buildDefaultState();
    const broken = JSON.parse(serializeState(state));
    delete broken.state.prompts;
    expect(() => parseImport(JSON.stringify(broken))).toThrow('missing required section: prompts');
  });

  it('never fabricates a Health Profile for a backup that predates profiles', () => {
    // Regression: normalizeState's seed-if-undefined rule used to run in the
    // import path, creating a fake "imported profile" and a false conflict
    // dialog that could overwrite the user's real profile with a placeholder.
    const old = JSON.parse(serializeState(buildDefaultState()));
    delete old.state.healthProfile;
    delete old.state.artifacts; // older backups predate artifacts too
    const imported = parseImport(JSON.stringify(old));
    expect(imported.healthProfile).toBeNull();
    expect(imported.artifacts).toEqual([]);
  });

  it('preserves an explicitly null (user-deleted) Health Profile on import', () => {
    const env = JSON.parse(serializeState(buildDefaultState()));
    env.state.healthProfile = null;
    expect(parseImport(JSON.stringify(env)).healthProfile).toBeNull();
  });

  it('preserves a real Health Profile carried by the backup', () => {
    const env = JSON.parse(serializeState(buildDefaultState()));
    env.state.healthProfile = { ...env.state.healthProfile, promptSummary: 'carried through' };
    expect(parseImport(JSON.stringify(env)).healthProfile?.promptSummary).toBe('carried through');
  });

  it('repairs junk-typed optional sections instead of crashing later', () => {
    const env = JSON.parse(serializeState(buildDefaultState()));
    env.state.artifacts = 'junk';
    env.state.prompts = [{ id: 'p1', title: 'no versions key' }, null, 42];
    const imported = parseImport(JSON.stringify(env));
    expect(imported.artifacts).toEqual([]);
    expect(imported.prompts).toHaveLength(1);
    expect(imported.prompts[0].versions).toEqual([]);
    expect(imported.prompts[0].tags).toEqual([]);
  });
});
