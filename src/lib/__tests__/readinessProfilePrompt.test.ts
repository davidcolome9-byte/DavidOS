import { describe, expect, it } from 'vitest';
import { buildProfilePromptBlock } from '../health/profilePrompt';
import type { HealthFitnessProfile } from '../types';

// Synthetic profile carrying BOTH readiness-relevant fields and unrelated
// private data that must never reach the readiness prompt. No personal data.
function leakyProfile(): HealthFitnessProfile {
  return {
    id: 'p-readiness',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
    goals: { primaryGoal: 'recomposition', goalNotes: 'Employer wellness bonus if I hit 12% bodyfat by Q4' },
    recoveryTargets: { sleepHours: '7-8h', hrvBaseline: '65', restingHeartRateBaseline: '52' },
    trainingPlan: { weeklyFrequency: '4x/week', split: 'upper/lower', movementRestrictions: ['No axial loading'], currentTrainingNotes: 'Deload every 5th week' },
    nutritionTargets: { calories: 2400, proteinGrams: 190 },
    bodyMetrics: { height: '180cm', currentWeight: '86kg', waist: '34in', bodyFatEstimate: '18%' },
    medicalContext: { injuryHistory: ['disc herniation (2019)'] },
    supplementsMedications: { supplements: ['creatine'], medications: ['sertraline', 'ibuprofen'] },
    promptSummary: 'Employer is Acme Corp; salary band 4; takes sertraline and ibuprofen; sees a therapist weekly.',
    freeformContext: 'Financial note: mortgage stress. Also occasional zolpidem for sleep.',
  };
}

describe('buildProfilePromptBlock — readinessSafe whitelist', () => {
  it('includes only readiness-relevant, non-private fields', () => {
    const block = buildProfilePromptBlock(leakyProfile(), { readinessSafe: true });
    const paths = block.metadata.includedFieldPaths ?? [];
    // Recovery baselines and training-load basics are the point of readiness.
    expect(paths).toContain('recoveryTargets.sleepHours');
    expect(paths).toContain('recoveryTargets.hrvBaseline');
    expect(paths).toContain('recoveryTargets.restingHeartRateBaseline');
    expect(paths).toContain('trainingPlan.weeklyFrequency');
    expect(paths).toContain('trainingPlan.split');
    expect(paths).toContain('trainingPlan.movementRestrictions');
    expect(paths).toContain('trainingPlan.currentTrainingNotes');
    expect(paths).toContain('goals.primaryGoal');
    // The generated movement-safety summary is carried (back-history present).
    expect(paths).toContain('medicalContext.safetySummary');
    expect(block.text).toContain('Movement safety context');
  });

  it('excludes nutrition, body metrics, medications, supplements, and all free text', () => {
    const block = buildProfilePromptBlock(leakyProfile(), { readinessSafe: true });
    const paths = block.metadata.includedFieldPaths ?? [];
    const t = block.text.toLowerCase();
    expect(paths).not.toContain('nutritionTargets');
    expect(paths).not.toContain('bodyMetrics.currentWeight');
    expect(paths).not.toContain('bodyMetrics.waist');
    expect(paths).not.toContain('bodyMetrics.bodyFatEstimate');
    expect(paths).not.toContain('supplementsMedications');
    // Free-text summary/freeform are dropped entirely under the whitelist.
    expect(block.metadata.promptSummaryCharCount).toBeUndefined();
    expect(block.metadata.freeformContextExcerptCharCount).toBeUndefined();
    // Concrete private leaks that free text could smuggle in must be absent.
    for (const leak of ['creatine', 'sertraline', 'ibuprofen', 'zolpidem', 'acme corp', 'salary', 'mortgage', 'therapist', '2400', '18%', 'employer']) {
      expect(t, leak).not.toContain(leak);
    }
  });

  it('carries no specific spinal-level personal fact in the safety summary', () => {
    const block = buildProfilePromptBlock(leakyProfile(), { readinessSafe: true });
    expect(block.text).not.toMatch(/[CTL][0-9][/-][CTLS][0-9]/);
  });

  it('is tighter than the Gravl whitelist (drops body metrics that Gravl keeps)', () => {
    const readiness = buildProfilePromptBlock(leakyProfile(), { readinessSafe: true }).metadata.includedFieldPaths ?? [];
    const gravl = buildProfilePromptBlock(leakyProfile(), { gravlSafe: true }).metadata.includedFieldPaths ?? [];
    expect(gravl).toContain('bodyMetrics.currentWeight');
    expect(readiness).not.toContain('bodyMetrics.currentWeight');
  });

  it('preserves missing vs zero: an absent baseline is omitted, a zero value is kept', () => {
    const missing = buildProfilePromptBlock(
      { id: 'p', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z', trainingPlan: { weeklyFrequency: '3x/week' } },
      { readinessSafe: true },
    );
    expect(missing.text).not.toContain('HRV baseline'); // missing → omitted, not "0"

    const zero = buildProfilePromptBlock(
      { id: 'p', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z', recoveryTargets: { restingHeartRateBaseline: '0' } },
      { readinessSafe: true },
    );
    expect(zero.text).toContain('Resting HR baseline: 0'); // zero preserved, not dropped
  });

  it('leaves gravlSafe and default (non-restricted) behavior unchanged', () => {
    const gravl = buildProfilePromptBlock(leakyProfile(), { gravlSafe: true });
    expect((gravl.metadata.includedFieldPaths ?? [])).not.toContain('nutritionTargets'); // gravl still excludes nutrition
    const full = buildProfilePromptBlock(leakyProfile());
    expect(full.text.toLowerCase()).toContain('creatine'); // default keeps meds/supplements
    expect(full.metadata.includedFieldPaths).toContain('nutritionTargets');
  });
});
