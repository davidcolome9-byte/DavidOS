import { describe, expect, it } from 'vitest';
import { routeIntent } from '../router/intentRouter';

describe('intentRouter', () => {
  it('routes fitness screenshot cleanup to the fitness agent', () => {
    const r = routeIntent('Turn these workout screenshots into a clean handoff and ignore goals or remaining.');
    expect(r.target).toBe('fitness');
    expect(r.suggestedWorkflowId).toBe('fitness-handoff');
    expect(r.confidence).toBeGreaterThan(0);
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
