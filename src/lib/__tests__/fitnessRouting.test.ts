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
    // "review" (gravl, 2) ties "organize" (handoff, 2), both non-zero.
    const r = resolveFitnessWorkflow('review and organize');
    expect(r.tie).toBe(true);
    expect(r.options?.map((o) => o.workflowId).sort()).toEqual(['fitness-handoff', 'gravl-review']);
  });
});
