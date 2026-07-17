import { describe, expect, it } from 'vitest';
import { routeIntent } from '../router/intentRouter';

/**
 * Routing locks for Training Readiness & Recovery (fitness-readiness).
 *
 * Precedence: illness/recovery + a train/rest/safety decision routes to Fitness
 * Readiness BEFORE generic Gravl or Fitness Handoff resolution. Ordinary workout
 * review/safety with no illness/recovery stays Gravl. Bare symptoms with no
 * training decision are never routed (negative guards).
 */

const wf = (i: string) => routeIntent(i).suggestedWorkflowId;
const cls = (i: string) => routeIntent(i).classification;
const target = (i: string) => routeIntent(i).target;

describe('readiness routing — target requests route to fitness-readiness', () => {
  const CASES = [
    'Should I train today?',
    'I feel sick, should I skip the gym?',
    'My HRV is low and I slept badly, train or rest?',
    'Fighting a cold, is it safe to lift heavy?',
    'Sore and tired, deload week?',
    'I feel sick and do not know whether to train',
    'I have a cold. Is it safe to lift today?',
    'My HRV is down and I barely slept. Train or rest?',
    'I feel sick. Should I skip the gym?',
    'I am unusually sore and exhausted. Should I deload?',
  ];
  it.each(CASES)('%s → supported / fitness / fitness-readiness', (input) => {
    expect(cls(input)).toBe('supported');
    expect(target(input)).toBe('fitness');
    expect(wf(input)).toBe('fitness-readiness');
  });
});

describe('readiness routing — precedence corrects the unsafe R-3 outcome', () => {
  it('illness + "safe to lift heavy" no longer reaches Fitness Handoff', () => {
    expect(wf('Fighting a cold, is it safe to lift heavy?')).toBe('fitness-readiness');
    expect(wf('Fighting a cold, is it safe to lift heavy?')).not.toBe('fitness-handoff');
  });
});

describe('readiness routing — ordinary workout requests stay Gravl (no illness/recovery)', () => {
  const GRAVL = [
    'Review this workout',
    'Is this workout safe for my back?',
    'Review my workout progression',
    'Optimize this Gravl workout',
    'Optimize my Gravl program',
    'Is this workout safe?',
    'Training review',
    'Weekly workout review',
    'Review my fitness plan',
  ];
  it.each(GRAVL)('%s → gravl-review', (input) => {
    expect(wf(input)).toBe('gravl-review');
  });
});

describe('readiness routing — negative guards (bare symptom, no training decision)', () => {
  const BARE = ['I feel sick', 'HRV', 'tired', 'sore', 'sleep was bad', 'cold', 'fever', 'chest pain', 'Not feeling well today'];
  it.each(BARE)('%s is not routed to any workflow', (input) => {
    const r = routeIntent(input);
    expect(r.suggestedWorkflowId, input).toBeUndefined();
    expect(r.classification, input).not.toBe('supported');
  });
});

describe('readiness routing — collisions preserved', () => {
  it('Fitness Handoff logging/cleaning stays Handoff', () => {
    expect(wf('Clean up today’s workout notes')).toBe('fitness-handoff');
    expect(wf('Log today’s workout')).toBe('fitness-handoff');
  });

  it('nutrition and fitness-progress honesty is preserved (unsupported, not routed)', () => {
    expect(cls('Review my meal plan')).toBe('unsupported');
    expect(cls('Help me plan my meals')).toBe('unsupported');
    expect(cls('Analyze my gym progress')).toBe('unsupported');
  });

  it('work training/teachback precedence is preserved (never flips to readiness)', () => {
    expect(wf('Training presentation for coworkers')).toBe('work-teachback');
    expect(wf('Explain this work procedure so I can teach it back')).toBe('work-teachback');
  });

  it('the three PR #7 corrections are preserved', () => {
    expect(wf('Review my fitness plan')).toBe('gravl-review');
    expect(wf('Give me a preview of my week')).toBe('weekly-review');
    expect(wf('I am awaiting a reply from my supervisor')).toBe('universal-operations-review');
  });

  it('multi-domain detection still fires for genuinely independent goals', () => {
    expect(cls('Plan my workout and my work presentation for the week')).toBe('multi_domain');
  });
});
