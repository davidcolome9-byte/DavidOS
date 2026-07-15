import { describe, expect, it } from 'vitest';
import { validateProfile, profileHash, changedFieldPaths } from '../health/profileValidation';
import { buildProfilePromptBlock } from '../health/profilePrompt';
import { seedHealthProfile } from '../../data/healthProfileSeed';
import type { HealthFitnessProfile } from '../types';

const base = (): HealthFitnessProfile => ({
  id: 'p1', createdAt: '2026-07-08T00:00:00.000Z', updatedAt: '2026-07-08T00:00:00.000Z',
});

describe('validateProfile', () => {
  it('blocks negative values', () => {
    const p = { ...base(), nutritionTargets: { calories: -100 } };
    expect(validateProfile(p).errors.length).toBeGreaterThan(0);
  });

  it('blocks NaN from malformed input', () => {
    const p = { ...base(), nutritionTargets: { proteinGrams: Number('17oo') } };
    expect(validateProfile(p).errors.length).toBeGreaterThan(0);
  });

  it('warns but allows suspicious values (protein 1700 g, water 35000 mL)', () => {
    const p = { ...base(), nutritionTargets: { proteinGrams: 1700, waterMl: 35000 } };
    const r = validateProfile(p);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('passes clean values silently', () => {
    const r = validateProfile(seedHealthProfile());
    expect(r.errors).toHaveLength(0);
  });
});

describe('profileHash / changedFieldPaths', () => {
  it('hash is stable regardless of key order', () => {
    const a = { ...base(), nutritionTargets: { calories: 2000, proteinGrams: 190 } };
    const b = { ...base(), nutritionTargets: { proteinGrams: 190, calories: 2000 } };
    expect(profileHash(a)).toBe(profileHash(b));
  });

  it('reports changed leaf paths without values', () => {
    const a = { ...base(), nutritionTargets: { calories: 2000 }, promptSummary: 'old' };
    const b = { ...base(), nutritionTargets: { calories: 1900 }, promptSummary: 'new' };
    const changed = changedFieldPaths(a, b);
    expect(changed).toContain('nutritionTargets.calories');
    expect(changed).toContain('promptSummary');
    expect(changed.join(',')).not.toContain('1900');
  });

  it('ignores bookkeeping fields', () => {
    const a = base();
    const b = { ...base(), updatedAt: '2026-07-09T00:00:00.000Z' };
    expect(changedFieldPaths(a, b)).toHaveLength(0);
  });
});

describe('buildProfilePromptBlock', () => {
  it('is empty for a profile with no usable data', () => {
    const block = buildProfilePromptBlock(base());
    expect(block.empty).toBe(true);
    expect(block.metadata.healthProfileIncluded).toBe(false);
  });

  it('includes structured fields and safety summary for a filled profile', () => {
    // Inline fixture — the public seed is generic; personal values arrive via import.
    const p: HealthFitnessProfile = {
      ...base(),
      nutritionTargets: { calories: 2000, proteinGrams: 190, waterMl: 3000 },
      medicalContext: { injuryHistory: ['disc herniation'] },
    };
    const block = buildProfilePromptBlock(p);
    expect(block.empty).toBe(false);
    expect(block.text).toContain('Nutrition targets');
    expect(block.text).toContain('Movement safety context:');
    expect(block.text).not.toMatch(/[CTL][0-9][/-][CTLS][0-9]/);
    expect(block.metadata.includedFieldPaths).toContain('nutritionTargets');
    expect(block.metadata.promptContextFingerprint).toMatch(/^[0-9a-f]{8} · /);
  });

  it('never inserts bracket placeholders from the generic seed into prompts', () => {
    const block = buildProfilePromptBlock(seedHealthProfile());
    expect(block.text).not.toContain('[Set your');
    expect(block.text).not.toContain('[Add calorie');
  });

  it('uses promptSummary verbatim when present', () => {
    const p = { ...base(), promptSummary: 'SUMMARY-TEXT', freeformContext: 'FREEFORM-TEXT' };
    const block = buildProfilePromptBlock(p);
    expect(block.text).toContain('SUMMARY-TEXT');
    expect(block.text).not.toContain('FREEFORM-TEXT');
    expect(block.metadata.promptSummaryCharCount).toBe('SUMMARY-TEXT'.length);
  });

  it('caps freeform excerpts', () => {
    const p = { ...base(), freeformContext: 'protein strategy notes. '.repeat(400) };
    const block = buildProfilePromptBlock(p, { deepAnalysis: false });
    expect(block.metadata.freeformContextExcerptCharCount!).toBeLessThanOrEqual(1500);
  });
});
