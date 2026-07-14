import { describe, expect, it } from 'vitest';
import { routeIntent } from '../router/intentRouter';

describe('intentRouter', () => {
  it('routes fitness screenshot cleanup to the fitness agent', () => {
    const r = routeIntent('Turn these workout screenshots into a clean handoff and ignore goals or remaining.');
    expect(r.target).toBe('fitness');
    expect(r.suggestedWorkflowId).toBe('fitness-handoff');
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('routes a workout-plan request to the Gravl workflow, not the handoff', () => {
    const r = routeIntent('I need help with a workout plan');
    expect(r.target).toBe('fitness');
    expect(r.suggestedWorkflowId).toBe('gravl-review');
  });

  it('routes a Gravl review/optimize request to the Gravl workflow', () => {
    expect(routeIntent('Review the workout Gravl gave me').suggestedWorkflowId).toBe('gravl-review');
    expect(routeIntent('Optimize this workout').suggestedWorkflowId).toBe('gravl-review');
  });

  it('still routes cleaning/logging requests to the Fitness Handoff', () => {
    expect(routeIntent('Clean up today’s workout notes').suggestedWorkflowId).toBe('fitness-handoff');
    expect(routeIntent('Log today’s workout').suggestedWorkflowId).toBe('fitness-handoff');
  });

  it('does not route generic nutrition/recovery "review" requests to Gravl', () => {
    // Fitness domain still, but the specific workflow must not be Gravl.
    expect(routeIntent('Review my meal plan').suggestedWorkflowId).not.toBe('gravl-review');
    expect(routeIntent('Review my macros').suggestedWorkflowId).not.toBe('gravl-review');
  });

  it('routes a workout review to Gravl', () => {
    expect(routeIntent('Review this workout').suggestedWorkflowId).toBe('gravl-review');
  });

  it('routes teachback requests to the work agent', () => {
    const r = routeIntent('Make this into a teachback for my coworkers.');
    expect(r.target).toBe('work_project');
    expect(r.suggestedWorkflowId).toBe('work-teachback');
  });

  it('routes weekly planning to calendar/planning', () => {
    const r = routeIntent('Help me plan the week and surface open loops.');
    expect(r.target).toBe('calendar_planning');
    expect(r.suggestedWorkflowId).toBe('weekly-review');
  });

  it('routes prompt improvement to the prompt vault', () => {
    const r = routeIntent('Improve this prompt for Claude Code.');
    expect(r.target).toBe('prompt_vault');
    expect(r.suggestedWorkflowId).toBe('prompt-improvement');
  });

  it('routes dog/home tasks to life admin', () => {
    const r = routeIntent('Remind me about the dogs vet stuff and weekend chores');
    expect(r.target).toBe('dogs_home_life_admin');
  });

  it('returns unknown for unmatched input', () => {
    const r = routeIntent('zzz qqq xyzzy');
    expect(r.target).toBe('unknown');
    expect(r.confidence).toBe(0);
  });

  it('returns unknown for empty input', () => {
    expect(routeIntent('   ').target).toBe('unknown');
  });

  it('never claims certainty (confidence capped at 0.9)', () => {
    const r = routeIntent('fitness fitness macros protein workout gym recomp');
    expect(r.confidence).toBeLessThanOrEqual(0.9);
  });

  it('explains its reasoning', () => {
    const r = routeIntent('Improve this prompt for Claude Code.');
    expect(r.reasoning).toContain('prompt');
  });
});
