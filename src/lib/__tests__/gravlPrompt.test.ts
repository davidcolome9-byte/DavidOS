import { describe, expect, it } from 'vitest';
import { buildGravlPrompt } from '../workflows/gravlPrompt';
import { evaluatePromptValidity } from '../workflows/promptValidity';

const PROVIDER_WORDS = /\b(claude|chatgpt|openai|anthropic|gemini|codex|copilot|grok)\b/i;

describe('buildGravlPrompt', () => {
  it('review mode includes the supplied workout text', () => {
    const b = buildGravlPrompt({ request: 'Optimize this', workoutText: 'Back squat 5x5 @ 100kg' });
    expect(b.mode).toBe('review');
    expect(b.fullPrompt).toContain('Back squat 5x5 @ 100kg');
    expect(b.fullPrompt).toContain('## Available Gravl Workout Information');
  });

  it('intake mode is valid and honestly labeled when no workout is provided', () => {
    const b = buildGravlPrompt({ request: 'Help me with a workout plan' });
    expect(b.mode).toBe('intake');
    expect(b.intakeNotice).toBe('No Gravl workout added. This prompt will ask for it.');
    expect(b.fullPrompt).toContain('No Gravl workout has been provided yet');
    expect(evaluatePromptValidity(b.fullPrompt, 'Help me with a workout plan').valid).toBe(true);
  });

  it('screenshot mode includes attach-in-AI-app instructions', () => {
    const b = buildGravlPrompt({ request: 'Review it', hasScreenshots: true });
    expect(b.mode).toBe('review');
    expect(b.fullPrompt).toContain('cannot read images');
    expect(b.fullPrompt.toLowerCase()).toContain('attached in the ai app');
  });

  it('produces a provider-neutral prompt (no AI vendor names)', () => {
    const b = buildGravlPrompt({
      request: 'Review and optimize my workout',
      workoutText: 'Deadlift 3x3',
      hasScreenshots: true,
    });
    expect(b.fullPrompt).not.toMatch(PROVIDER_WORDS);
  });

  it('requests Keep/Modify/Replace/Possibly unsafe, phase-fit, and exact Gravl changes', () => {
    const b = buildGravlPrompt({ request: 'Review', workoutText: 'Bench 3x8' });
    const p = b.fullPrompt;
    expect(p).toContain('Keep, Modify, Replace, or Possibly unsafe');
    expect(p).toContain('phase-fit');
    expect(p).toMatch(/volume, intensity, frequency, and exercise order/i);
    expect(p).toMatch(/enter directly into Gravl|Enter this into Gravl/);
    expect(p).toContain('Questions for David');
    expect(p).toContain('## Safety Boundaries');
  });

  it('carries the health/fitness context block when provided', () => {
    const b = buildGravlPrompt({
      request: 'Review',
      workoutText: 'x',
      profileBlock: '- Movement safety context: L4/L5 back history. Avoid axial loading.',
    });
    expect(b.fullPrompt).toContain('L4/L5 back history');
    expect(b.fullPrompt).toContain('## Relevant Health and Fitness Context');
  });

  // DOS-WF-001 correction 1: no private profile facts when the profile is
  // excluded — including in the Safety Boundaries section.
  it('contains NO L4/L5 / injury / axial / medication facts when the profile is excluded', () => {
    const b = buildGravlPrompt({ request: 'Optimize this workout', workoutText: 'Squat 5x5' });
    const p = b.fullPrompt.toLowerCase();
    expect(p).not.toContain('l4');
    expect(p).not.toContain('l5');
    expect(p).not.toContain('axial');
    expect(p).not.toContain('laminectomy');
    expect(p).not.toContain('herniat');
    // Generic safety language is still present.
    expect(b.fullPrompt).toContain('## Safety Boundaries');
    expect(p).toMatch(/pain, injury, and movement restriction|reported/);
    expect(b.fullPrompt).toContain('No Health Profile context was included for this prompt.');
  });

  it('includes the L4/L5 movement-safety summary ONLY via the included profile context', () => {
    const withProfile = buildGravlPrompt({
      request: 'Is this workout safe for my back?',
      workoutText: 'Deadlift 3x3',
      profileBlock:
        'Health Profile last updated: 2026-01-02\n\n- Movement safety context: L4/L5 back history. Avoid axial loading.',
    });
    // The L4/L5 text appears, and only inside the context section.
    expect(withProfile.fullPrompt).toContain('L4/L5 back history');
    const contextIdx = withProfile.fullPrompt.indexOf('## Relevant Health and Fitness Context');
    const safetyIdx = withProfile.fullPrompt.indexOf('## Safety Boundaries');
    expect(withProfile.fullPrompt.indexOf('L4/L5')).toBeGreaterThan(contextIdx);
    expect(withProfile.fullPrompt.indexOf('L4/L5')).toBeLessThan(safetyIdx);
  });

  it('no longer claims prior handoff history is included (truthful metadata)', () => {
    const b = buildGravlPrompt({ request: 'Review', workoutText: 'Bench 3x8' });
    expect(b.priorCount).toBe(0);
    expect(b.includedHandoffIds).toEqual([]);
    expect(b.fullPrompt.toLowerCase()).not.toContain('prior handoff');
    expect((b.helperText ?? '').toLowerCase()).not.toContain('history');
  });
});
