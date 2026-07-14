import { describe, expect, it } from 'vitest';
import { resolveFitnessWorkflow } from '../router/fitnessRouting';

describe('resolveFitnessWorkflow', () => {
  it('routes workout-plan requests to gravl-review', () => {
    expect(resolveFitnessWorkflow('I need help with a workout plan').workflowId).toBe('gravl-review');
  });

  it('routes review/optimize requests to gravl-review', () => {
    expect(resolveFitnessWorkflow('Review the workout Gravl gave me').workflowId).toBe('gravl-review');
    expect(resolveFitnessWorkflow('Optimize this workout').workflowId).toBe('gravl-review');
    expect(resolveFitnessWorkflow('Can you review my workout program?').workflowId).toBe('gravl-review');
  });

  it('routes cleaning/logging requests to fitness-handoff', () => {
    expect(resolveFitnessWorkflow('Clean up today’s workout notes').workflowId).toBe('fitness-handoff');
    expect(resolveFitnessWorkflow('Log today’s workout').workflowId).toBe('fitness-handoff');
    expect(resolveFitnessWorkflow('Organize my food log').workflowId).toBe('fitness-handoff');
  });

  it('defaults to fitness-handoff when there is no specific signal', () => {
    const r = resolveFitnessWorkflow('macros protein gym');
    expect(r.workflowId).toBe('fitness-handoff');
    expect(r.tie).toBe(false);
  });

  it('offers both workflows (no silent pick) on a genuine tie', () => {
    // A genuine tie now requires WORKOUT CONTEXT on both sides:
    // "workout" (gravl anchor, 2) ties "log" (handoff, 2), both non-zero.
    const r = resolveFitnessWorkflow('log this workout');
    expect(r.tie).toBe(true);
    expect(r.options?.map((o) => o.workflowId).sort()).toEqual(['fitness-handoff', 'gravl-review']);
  });

  // DOS-WF-001 correction: a generic verb (review/optimize/progression) must
  // NOT route to Gravl without workout context. Previously "review and
  // organize" produced a Gravl tie; it now routes to the handoff, and the
  // non-workout "review my …" requests never reach Gravl.
  it('does not route generic "review …" requests to Gravl without workout context', () => {
    for (const text of [
      'Review my meal plan',
      'Review my macros',
      'Review my nutrition',
      'Review my recovery progress',
      'review and organize',
    ]) {
      const r = resolveFitnessWorkflow(text);
      expect(r.workflowId, text).toBe('fitness-handoff');
      expect(r.tie, text).toBe(false);
    }
  });

  it('routes workout-context requests to Gravl', () => {
    for (const text of [
      'Review this workout',
      'Optimize this workout',
      'Is this workout safe for my back?',
      'I need help with a workout plan',
      'Review the workout Gravl gave me',
    ]) {
      expect(resolveFitnessWorkflow(text).workflowId, text).toBe('gravl-review');
    }
  });
});
