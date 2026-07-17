import { describe, expect, it } from 'vitest';
import { buildReadinessPrompt } from '../workflows/fitnessReadinessPrompt';
import { evaluatePromptValidity, buildPromptConfigKey } from '../workflows/promptValidity';
import type { HealthFitnessProfile } from '../types';

// All test data is invented — never personal.

describe('buildReadinessPrompt — structure & construction', () => {
  it('builds one Universal AI Prompt with all seven required output sections', () => {
    const r = buildReadinessPrompt({ request: 'Slept 5h, a bit sore, was going to do an easy run — train or rest?' });
    const p = r.fullPrompt;
    expect(p.startsWith('# Universal AI Prompt')).toBe(true);
    expect(p).toContain('1. **Readiness decision**');
    expect(p).toContain('2. **Main reasons**');
    expect(p).toContain('3. **Session modification');
    expect(p).toContain('4. **Recovery priorities**');
    expect(p).toContain('5. **Reassessment conditions**');
    expect(p).toContain('6. **Safety block**');
    expect(p).toContain('7. **Uncertainty statement**');
    // Enumerates the six readiness decisions.
    expect(p).toContain('train as planned');
    expect(p).toContain('modify session');
    expect(p).toContain('recovery activity only');
    expect(p).toContain('rest and reassess');
    expect(p).toContain('seek non-emergency medical advice');
    expect(p).toContain('urgent/emergency');
    expect(r.outputMode).toBe('custom');
    expect(r.historyProfile).toBe('fitness_health');
    // No AI is called and no history is pulled in.
    expect(r.priorCount).toBe(0);
  });

  it('carries the exact request through and exposes it as currentOnly', () => {
    const req = 'HRV down vs my baseline, legs day planned — go or deload?';
    const r = buildReadinessPrompt({ request: req });
    expect(r.currentOnly).toBe(req);
    expect(r.fullPrompt).toContain(req);
  });

  it('produces a copy/save-valid prompt (no unresolved tokens, no no-input marker)', () => {
    const r = buildReadinessPrompt({ request: 'Should I train today?' });
    const v = evaluatePromptValidity(r.fullPrompt, 'Should I train today?');
    expect(v.valid).toBe(true);
    expect(r.fullPrompt).not.toMatch(/\{\{.*\}\}/);
  });

  it('trims the request and never fabricates missing input', () => {
    const r = buildReadinessPrompt({ request: '   Train or rest?   ' });
    expect(r.currentOnly).toBe('Train or rest?');
  });
});

describe('buildReadinessPrompt — no diagnosis / no treatment', () => {
  it('instructs the AI to give decision support, not a diagnosis, and never prescribe', () => {
    const p = buildReadinessPrompt({ request: 'Feeling run down, hard session planned — train or rest?' }).fullPrompt;
    expect(p).toContain('DECISION SUPPORT, not a diagnosis');
    expect(p).toContain('do not diagnose');
    expect(p.toLowerCase()).toContain('do not select a medical diagnosis');
    expect(p).toContain('Do not diagnose any illness, injury, or condition');
    expect(p.toLowerCase()).toContain('do not recommend, start, stop, or change any medication');
    // Not a medical device / no certainty.
    expect(p).toContain('not a medical device');
    expect(p).toContain('Never promise certainty');
  });
});

describe('buildReadinessPrompt — red-flag escalation (forced, conservative)', () => {
  const RED_FLAG_INPUTS: [string, string][] = [
    ['chest pain', 'Crushing chest pain and short of breath, should I push through my workout?'],
    ['radiating pain', 'Chest tightness radiating to my arm during warmup — keep training?'],
    ['trouble breathing', 'Really struggling to breathe, was going to run — train or rest?'],
    ['fainting', 'Nearly fainted mid-set, should I finish my workout?'],
    ['confusion / neuro', 'Sudden confusion and slurred speech, still planning to lift — ok?'],
    ['heart attack / stroke', 'Think I might be having a heart attack but had a gym session planned'],
    ['severe dehydration', "Severely dehydrated and can't keep fluids down, should I train?"],
  ];

  it.each(RED_FLAG_INPUTS)('escalates for %s and puts the directive first', (_label, input) => {
    const r = buildReadinessPrompt({ request: input });
    expect(r.redFlagged).toBe(true);
    expect(r.fullPrompt).toContain('Possible emergency red flags detected');
    // Escalation must appear BEFORE the Role section so it can't be missed.
    expect(r.fullPrompt.indexOf('emergency red flags')).toBeLessThan(r.fullPrompt.indexOf('## Role'));
    expect(r.fullPrompt).toContain('urgent or emergency medical care');
  });

  it('does not cry wolf on ordinary soreness/fatigue', () => {
    const r = buildReadinessPrompt({ request: 'Legs are sore and I feel tired, deload week?' });
    expect(r.redFlagged).toBe(false);
    expect(r.fullPrompt).not.toContain('Possible emergency red flags detected');
  });

  it('always keeps the standing red-flag escalation rule even when nothing is detected', () => {
    const p = buildReadinessPrompt({ request: 'Feeling great, normal session — train as planned?' }).fullPrompt;
    expect(p).toContain('Escalate to urgent or emergency care');
    expect(p).toContain('chest pain');
  });
});

describe('buildReadinessPrompt — wearable / HRV uncertainty', () => {
  it('states wearables and HRV are supporting signals that never override symptoms', () => {
    const p = buildReadinessPrompt({ request: 'My wearable says fully recovered but I feel awful — train?' }).fullPrompt;
    expect(p).toContain('SUPPORTING context only');
    expect(p).toContain('NEVER overrides these symptoms');
    expect(p.toLowerCase()).toContain('never makes training safe on its own');
    expect(p).toContain('wearables and HRV are supporting signals');
  });

  it('does not treat the neck rule as a sufficient safety test', () => {
    const p = buildReadinessPrompt({ request: 'Head cold, sinuses only — is it safe to lift?' }).fullPrompt;
    expect(p).toContain('neck check');
    expect(p.toLowerCase()).toContain('not');
  });
});

describe('buildReadinessPrompt — respiratory illness guidance', () => {
  it('adds fever-free-24h / improving-overall guidance when respiratory signals are present', () => {
    const r = buildReadinessPrompt({ request: 'Fighting a cold with a fever, want to lift heavy — ok?' });
    expect(r.respiratoryIllness).toBe(true);
    expect(r.fullPrompt).toContain('fever-free for at least 24 hours');
    expect(r.fullPrompt).toContain('WITHOUT');
    expect(r.fullPrompt).toContain('improving overall');
  });

  it('omits respiratory guidance when there are no respiratory signals', () => {
    const r = buildReadinessPrompt({ request: 'Tweaked my knee, was going to squat — train or rest?' });
    expect(r.respiratoryIllness).toBe(false);
    expect(r.fullPrompt).not.toContain('fever-free for at least 24 hours');
  });
});

describe('buildReadinessPrompt — missing vs zero / unavailable handling', () => {
  it('instructs the AI to preserve the missing/unknown/unavailable/not-measured/zero/denied distinctions', () => {
    const p = buildReadinessPrompt({ request: 'train or rest?' }).fullPrompt;
    expect(p).toContain('missing, unknown, unavailable, not measured, zero, and explicitly denied');
    expect(p).toContain('Do not invent symptoms, numbers, or history');
    expect(p).toContain('never treat a missing value as if it were normal or reassuring');
  });

  it('renders a real profile signal but never fabricates one that was not provided', () => {
    // A provided baseline appears; an absent one does not become "0" or a guess.
    const withHrv = buildReadinessPrompt({
      request: 'train or rest?',
      profileBlock: 'Health Profile last updated: 2026-07-01\n\n- HRV baseline: 60\n- Resting HR baseline: 52',
    });
    expect(withHrv.fullPrompt).toContain('HRV baseline: 60');

    const withoutHrv = buildReadinessPrompt({ request: 'train or rest?' });
    expect(withoutHrv.fullPrompt).not.toContain('HRV baseline');
    expect(withoutHrv.fullPrompt).not.toContain(': 0'); // no fabricated zero
  });
});

describe('buildReadinessPrompt — Health Profile disclosure & staleness', () => {
  it('discloses whether Health Profile context was included, in prompt and helper text', () => {
    const included = buildReadinessPrompt({
      request: 'train or rest?',
      profileBlock: 'Health Profile last updated: 2026-07-01\n\n- Sleep: 7-8h',
    });
    expect(included.fullPrompt).toContain("readiness-specific whitelist");
    expect(included.fullPrompt).toContain('- Sleep: 7-8h');
    expect(included.helperText).toContain('Health Profile context included');

    const excluded = buildReadinessPrompt({ request: 'train or rest?' });
    expect(excluded.fullPrompt).toContain('No Health Profile context was included');
    expect(excluded.helperText).toContain('No Health Profile context included');
  });

  it('changes its hash when the request or included profile changes (stale-prompt invalidation)', () => {
    const a = buildReadinessPrompt({ request: 'train or rest?' });
    const b = buildReadinessPrompt({ request: 'train or rest today?' });
    expect(b.promptHash).not.toBe(a.promptHash);

    const withProfile = buildReadinessPrompt({ request: 'train or rest?', profileBlock: 'Health Profile last updated: 2026-07-01\n\n- Sleep: 7-8h' });
    expect(withProfile.promptHash).not.toBe(a.promptHash);

    // The runner's config key (which drives staleness) also differs on input.
    const key1 = buildPromptConfigKey({ input: 'train or rest?', workflowId: 'fitness-readiness', style: 'Universal AI Prompt', includeProfile: false });
    const key2 = buildPromptConfigKey({ input: 'train or rest today?', workflowId: 'fitness-readiness', style: 'Universal AI Prompt', includeProfile: false });
    expect(key1).not.toBe(key2);
  });
});

describe('buildReadinessPrompt — usual training context (no fabrication)', () => {
  it('summarizes only stated training context and warns against assuming the rest', () => {
    const profile: HealthFitnessProfile = {
      id: 'p', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      trainingPlan: { weeklyFrequency: '4x/week', split: 'upper/lower' },
      goals: { primaryGoal: 'recomposition' },
    };
    const p = buildReadinessPrompt({ request: 'train or rest?', healthProfile: profile }).fullPrompt;
    expect(p).toContain('Usual training frequency: 4x/week');
    expect(p).toContain('Usual split: upper/lower');
    const none = buildReadinessPrompt({ request: 'train or rest?' }).fullPrompt;
    expect(none).toContain('Do not assume a training history that was not provided');
  });
});
