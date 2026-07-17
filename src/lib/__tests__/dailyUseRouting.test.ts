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

describe('C-review-3 · "Give me a preview of my week" → Weekly Review', () => {
  it('routes supported / calendar_planning / weekly-review', () => {
    const r = routeIntent('Give me a preview of my week');
    expect(r.classification).toBe('supported');
    expect(r.target).toBe('calendar_planning');
    expect(r.suggestedWorkflowId).toBe('weekly-review');
    expect(r.confidence).toBeLessThanOrEqual(0.9);
  });

  it('close weekly-preview phrasings also route', () => {
    for (const i of ['Weekly preview please', 'A preview of the week ahead']) {
      const r = routeIntent(i);
      expect(r.classification, i).toBe('supported');
      expect(r.suggestedWorkflowId, i).toBe('weekly-review');
    }
  });

  it('guard · slide/content/prompt previews keep their own domains', () => {
    const slide = routeIntent('Preview the slide deck before the meeting');
    expect(slide.target).toBe('work_project');
    expect(slide.suggestedWorkflowId).toBe('work-teachback');
    expect(routeIntent('Preview my content post').suggestedWorkflowId).not.toBe('weekly-review');
    expect(routeIntent('Preview this prompt').suggestedWorkflowId).not.toBe('weekly-review');
  });

  it('guard · weekly workout review stays fitness (Gravl)', () => {
    const r = routeIntent('Weekly workout review');
    expect(r.target).toBe('fitness');
    expect(r.suggestedWorkflowId).toBe('gravl-review');
  });

  it('guard · bare "week" and "preview" remain non-routed', () => {
    for (const i of ['week', 'preview']) {
      const r = routeIntent(i);
      expect(['ambiguous', 'unknown'], i).toContain(r.classification);
      expect(r.suggestedWorkflowId, i).toBeUndefined();
    }
  });

  it('guard · Review priorities stays Daily Brief', () => {
    const r = routeIntent('Review priorities');
    expect(r.target).toBe('daily_command');
    expect(r.suggestedWorkflowId).toBe('daily-brief');
  });
});

describe('C-wait-2 · "I am awaiting a reply from my supervisor" → Universal Operations', () => {
  it('routes supported / universal-operations / universal-operations-review', () => {
    const r = routeIntent('I am awaiting a reply from my supervisor');
    expect(r.classification).toBe('supported');
    expect(r.target).toBe('universal-operations');
    expect(r.suggestedWorkflowId).toBe('universal-operations-review');
    expect(r.confidence).toBeLessThanOrEqual(0.9);
  });

  it('"waiting for a reply" also routes as a waiting state', () => {
    const r = routeIntent('Still waiting for a reply from the vendor');
    expect(r.classification).toBe('supported');
    expect(r.suggestedWorkflowId).toBe('universal-operations-review');
  });

  it('guard · draft/write/send/answer a reply never become Universal Operations', () => {
    for (const i of [
      'Draft a reply to my supervisor',
      'Send a reply to the vendor',
      'Help me write a reply while I am awaiting a reply from my supervisor',
      'Answer the reply from my coworker',
    ]) {
      expect(routeIntent(i).suggestedWorkflowId, i).not.toBe('universal-operations-review');
    }
  });

  it('guard · generic "reply" alone stays non-routed', () => {
    const r = routeIntent('reply');
    expect(['ambiguous', 'unknown']).toContain(r.classification);
    expect(r.suggestedWorkflowId).toBeUndefined();
  });

  it('guard · Work Teachback precedence when a teachback action is material', () => {
    const r = routeIntent('My teachback presentation for coworkers is awaiting a reply');
    expect(r.classification).toBe('supported');
    expect(r.target).toBe('work_project');
    expect(r.suggestedWorkflowId).toBe('work-teachback');
  });

  it('guard · work-project requests stay put', () => {
    const r = routeIntent('Finish the quarterly work report');
    expect(r.suggestedWorkflowId).not.toBe('universal-operations-review');
    expect(r.target).toBe('work_project');
  });

  it('guard · independent goals joined by "and" stay multi-domain', () => {
    const r = routeIntent('Review my workout and tell me what is waiting on me');
    expect(r.classification).toBe('multi_domain');
  });
});
