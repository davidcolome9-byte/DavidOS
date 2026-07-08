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
});
