import { describe, expect, it } from 'vitest';
import { routeIntent } from '../router/intentRouter';

// Daily-use routing trio (fix/dos-routing-daily-use-trio). Each correction is
// a NARROW phrase registration; the guards prove no generic term was
// strengthened and no neighboring honest state regressed.

describe('C-fit-2 · "Review my fitness plan" → Gravl review', () => {
  it('routes supported / fitness / gravl-review', () => {
    const r = routeIntent('Review my fitness plan');
    expect(r.classification).toBe('supported');
    expect(r.target).toBe('fitness');
    expect(r.suggestedWorkflowId).toBe('gravl-review');
    expect(r.confidence).toBeLessThanOrEqual(0.9);
  });

  it('other review-style actions on a fitness plan also reach Gravl', () => {
    for (const i of ['Optimize my fitness plan', 'Improve my fitness plan']) {
      const r = routeIntent(i);
      expect(r.classification, i).toBe('supported');
      expect(r.suggestedWorkflowId, i).toBe('gravl-review');
    }
  });

  it('guard · meal plans and macros never become Gravl', () => {
    const meal = routeIntent('Review my meal plan');
    expect(meal.classification).toBe('unsupported'); // honest nutrition state
    expect(meal.recognizedDomain).toBe('fitness');
    const macros = routeIntent('Review my macros');
    expect(macros.suggestedWorkflowId).not.toBe('gravl-review');
  });

  it('guard · bare "fitness", "fitness plan", and "fitness goals" stay non-routed', () => {
    for (const i of ['fitness', 'my fitness plan', 'fitness goals']) {
      const r = routeIntent(i);
      expect(['ambiguous', 'unknown'], i).toContain(r.classification);
      expect(r.suggestedWorkflowId, i).toBeUndefined();
    }
  });

  it('guard · Work training/teachback precedence is preserved', () => {
    for (const i of [
      'Review the fitness plan presentation for coworkers',
      'Training presentation for coworkers',
      'Teachback on our fraud training program',
    ]) {
      const r = routeIntent(i);
      expect(r.target, i).toBe('work_project');
      expect(r.suggestedWorkflowId, i).toBe('work-teachback');
    }
  });

  it('guard · readiness questions stay honestly unsupported', () => {
    const r = routeIntent('I feel sick, should I skip the gym?');
    expect(r.classification).toBe('unsupported');
    expect(r.recognizedDomain).toBe('fitness');
  });
});
