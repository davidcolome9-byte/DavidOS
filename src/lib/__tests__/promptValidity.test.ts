import { describe, expect, it } from 'vitest';
import { evaluatePromptValidity, buildPromptConfigKey, evaluateActability } from '../workflows/promptValidity';

describe('evaluatePromptValidity', () => {
  it('accepts a well-formed prompt built from real input', () => {
    const r = evaluatePromptValidity('## Request\n\nReview my workout.', 'Review my workout.');
    expect(r.valid).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('rejects an empty request', () => {
    expect(evaluatePromptValidity('some text', '   ').valid).toBe(false);
  });

  it('rejects the no-input marker', () => {
    expect(evaluatePromptValidity('Body: (no input provided)', 'x').valid).toBe(false);
  });

  it('rejects unresolved template tokens', () => {
    expect(evaluatePromptValidity('Do {{input}} now', 'x').valid).toBe(false);
    expect(evaluatePromptValidity('Style {{style}}', 'x').valid).toBe(false);
  });

  it('rejects unresolved [[placeholder]] sentinels', () => {
    expect(evaluatePromptValidity('Hello [[NAME]]', 'x').valid).toBe(false);
  });

  it('accepts an honestly-labeled intake prompt (no workout yet)', () => {
    const intake = '## Request\n\nReview my Gravl workout.\n\nNo Gravl workout has been provided yet. Ask David to paste it.';
    expect(evaluatePromptValidity(intake, 'Review my Gravl workout.').valid).toBe(true);
  });

  it('rejects an empty request by default even with real prompt text (DOS-WF-002A guard)', () => {
    expect(evaluatePromptValidity('## New Entry to Analyze\n\n(no additional notes for today)', '').valid).toBe(false);
  });

  it('allowEmptyRequest permits a zero-note planning prompt', () => {
    const r = evaluatePromptValidity('## New Entry to Analyze\n\n(no additional notes for today)', '', { allowEmptyRequest: true });
    expect(r.valid).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('allowEmptyRequest does not bypass the no-input-marker / placeholder checks', () => {
    expect(evaluatePromptValidity('Body: (no input provided)', '', { allowEmptyRequest: true }).valid).toBe(false);
    expect(evaluatePromptValidity('Hello [[NAME]]', '', { allowEmptyRequest: true }).valid).toBe(false);
  });
});

describe('buildPromptConfigKey', () => {
  const base = {
    input: 'Review my workout',
    workflowId: 'gravl-review',
    style: 'Universal AI Prompt',
    includeProfile: true,
    profileFingerprint: 'abc123',
  };

  it('is stable for identical config', () => {
    expect(buildPromptConfigKey(base)).toBe(buildPromptConfigKey({ ...base }));
  });

  it('changes when the input changes (staleness after edits)', () => {
    expect(buildPromptConfigKey(base)).not.toBe(buildPromptConfigKey({ ...base, input: 'Optimize it' }));
  });

  it('changes when the workflow changes (switching invalidates)', () => {
    expect(buildPromptConfigKey(base)).not.toBe(buildPromptConfigKey({ ...base, workflowId: 'fitness-handoff' }));
  });

  it('changes when the included Health Profile context changes', () => {
    expect(buildPromptConfigKey(base)).not.toBe(buildPromptConfigKey({ ...base, profileFingerprint: 'def456' }));
  });

  it('changes when profile inclusion is toggled off', () => {
    expect(buildPromptConfigKey(base)).not.toBe(buildPromptConfigKey({ ...base, includeProfile: false }));
  });

  it('changes when Gravl workout text or screenshots change', () => {
    expect(buildPromptConfigKey(base)).not.toBe(buildPromptConfigKey({ ...base, workoutText: 'Squat 3x5' }));
    expect(buildPromptConfigKey(base)).not.toBe(buildPromptConfigKey({ ...base, hasScreenshots: true }));
  });

  it('changes when planning-state inclusion is toggled (DOS-WF-002A)', () => {
    const withPlanning = { ...base, includePlanningState: true, planningContextFingerprint: 'p1' };
    expect(buildPromptConfigKey(withPlanning)).not.toBe(buildPromptConfigKey({ ...withPlanning, includePlanningState: false }));
  });

  it('changes when the included planning-state fingerprint changes', () => {
    const withPlanning = { ...base, includePlanningState: true, planningContextFingerprint: 'p1' };
    expect(buildPromptConfigKey(withPlanning)).not.toBe(buildPromptConfigKey({ ...withPlanning, planningContextFingerprint: 'p2' }));
  });

  it('ignores the planning-state fingerprint when inclusion is off', () => {
    const excludedA = { ...base, includePlanningState: false, planningContextFingerprint: 'p1' };
    const excludedB = { ...base, includePlanningState: false, planningContextFingerprint: 'p2' };
    expect(buildPromptConfigKey(excludedA)).toBe(buildPromptConfigKey(excludedB));
  });
});

describe('evaluateActability (defense-in-depth guard)', () => {
  const valid = { valid: true, reasons: [] };

  it('refuses when nothing is built (no local write / clipboard)', () => {
    const r = evaluateActability({ hasBuilt: false, validity: null, builtConfigKey: 'k', currentConfigKey: 'k' });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/build a prompt first/i);
  });

  it('refuses an invalid prompt and surfaces the reason', () => {
    const r = evaluateActability({
      hasBuilt: true,
      validity: { valid: false, reasons: ['The request is empty.'] },
      builtConfigKey: 'k',
      currentConfigKey: 'k',
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('The request is empty.');
  });

  it('refuses a stale prompt (built config differs from current)', () => {
    const r = evaluateActability({ hasBuilt: true, validity: valid, builtConfigKey: 'built', currentConfigKey: 'now' });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/out of date/i);
  });

  it('refuses when no build config was ever captured', () => {
    expect(evaluateActability({ hasBuilt: true, validity: valid, builtConfigKey: null, currentConfigKey: 'k' }).ok).toBe(false);
  });

  it('allows a valid, fresh prompt whose config matches', () => {
    const r = evaluateActability({ hasBuilt: true, validity: valid, builtConfigKey: 'same', currentConfigKey: 'same' });
    expect(r.ok).toBe(true);
    expect(r.message).toBeUndefined();
  });
});
