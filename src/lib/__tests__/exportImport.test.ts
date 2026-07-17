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

  // DOS-WF-001R Phase 2C: import now deeply validates and REJECTS malformed data
  // (boot-time recovery still repairs — that path stays fail-safe). Errors name
  // the collection/field but never echo the rejected value.
  it('rejects junk-typed sections on import with a clear, value-free error', () => {
    const env = JSON.parse(serializeState(buildDefaultState()));
    env.state.artifacts = 'junk';
    env.state.prompts = [{ id: 'p1', title: 'no versions key' }, null, 42];
    let msg = '';
    try { parseImport(JSON.stringify(env)); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain('artifacts');
    expect(msg).toContain('prompts');
    expect(msg).not.toContain('junk'); // never echoes the rejected value
  });

  // POST-M-PRIV-01 — future-schema / envelope-version diagnostics must describe
  // the field and the compatibility problem WITHOUT echoing the supplied value.
  // The versions below are distinctive synthetic markers: if a diagnostic ever
  // contains them, it echoed imported data.
  describe('schema diagnostics never echo the supplied version (POST-M-PRIV-01)', () => {
    const SYNTH_STATE_VERSION = 424242;
    const SYNTH_ENV_VERSION = 434343;

    const thrownMessage = (mutate: (env: { schemaVersion: number; state: { schemaVersion: number } }) => void): string => {
      const env = JSON.parse(serializeState(buildDefaultState()));
      mutate(env);
      try {
        parseImport(JSON.stringify(env));
      } catch (e) {
        return (e as Error).message;
      }
      throw new Error('expected parseImport to reject this backup');
    };

    it('future data schemaVersion: names the field, not the value', () => {
      const msg = thrownMessage((env) => {
        env.state.schemaVersion = SYNTH_STATE_VERSION;
        env.schemaVersion = SYNTH_STATE_VERSION;
      });
      expect(msg).toMatch(/schemaVersion.*newer/i);
      expect(msg).not.toContain(String(SYNTH_STATE_VERSION));
    });

    it('future envelope schemaVersion: names the field, not the value', () => {
      const msg = thrownMessage((env) => {
        env.schemaVersion = SYNTH_ENV_VERSION; // inner state stays current
      });
      expect(msg).toMatch(/envelope.*schemaVersion.*newer/i);
      expect(msg).not.toContain(String(SYNTH_ENV_VERSION));
    });

    it('envelope/data version mismatch: names the inconsistency, not the values', () => {
      const msg = thrownMessage((env) => {
        // A distinctive envelope version that is ≤ current but ≠ the data version.
        env.schemaVersion = -424242;
      });
      expect(msg).toMatch(/inconsistent/i);
      expect(msg).not.toContain('424242');
    });
  });
});
