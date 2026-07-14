import { describe, expect, it } from 'vitest';
import { evaluatePromptValidity, buildPromptConfigKey } from '../workflows/promptValidity';

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
});
