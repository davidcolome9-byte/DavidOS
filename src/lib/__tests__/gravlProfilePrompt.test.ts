import { describe, expect, it } from 'vitest';
import { buildProfilePromptBlock } from '../health/profilePrompt';
import type { HealthFitnessProfile } from '../types';

function profile(): HealthFitnessProfile {
  return {
    id: 'p1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    goals: { primaryGoal: 'recomposition' },
    trainingPlan: {
      weeklyFrequency: '4x/week',
      movementRestrictions: ['No axial loading'],
    },
    medicalContext: { injuryHistory: ['L4/L5 laminectomy (2019)'] },
    supplementsMedications: { supplements: ['creatine'], medications: ['ibuprofen'] },
  };
}

describe('buildProfilePromptBlock — Gravl exclusions', () => {
  it('keeps the L4/L5 movement-safety summary', () => {
    const block = buildProfilePromptBlock(profile(), { excludeSupplementsMedications: true });
    expect(block.text).toContain('L4/L5');
    expect(block.text.toLowerCase()).toContain('axial loading');
  });

  it('excludes medications and supplements when asked (Gravl default)', () => {
    const block = buildProfilePromptBlock(profile(), { excludeSupplementsMedications: true });
    expect(block.text).not.toContain('creatine');
    expect(block.text).not.toContain('ibuprofen');
    expect(block.metadata.includedFieldPaths).not.toContain('supplementsMedications');
  });

  it('still includes medications/supplements by default (non-Gravl fitness handoff)', () => {
    const block = buildProfilePromptBlock(profile());
    expect(block.text).toContain('creatine');
    expect(block.text).toContain('ibuprofen');
  });
});

describe('buildProfilePromptBlock — Gravl-safe field whitelist (gravlSafe)', () => {
  function leakyProfile(): HealthFitnessProfile {
    return {
      id: 'p2',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      goals: { primaryGoal: 'recomposition' },
      trainingPlan: { weeklyFrequency: '4x/week', movementRestrictions: ['No axial loading'] },
      nutritionTargets: { calories: 2400, proteinGrams: 190 },
      bodyMetrics: { height: '180cm', currentWeight: '86kg', waist: '34in', bodyFatEstimate: '18%' },
      medicalContext: { injuryHistory: ['L4/L5 laminectomy (2019)'] },
      supplementsMedications: { supplements: ['creatine'], medications: ['ibuprofen'] },
      // Free-text fields that can smuggle excluded detail back in:
      promptSummary: 'Takes ibuprofen 400mg and creatine; also on testosterone (TRT).',
      freeformContext: 'History note: metformin trial last year; occasional zolpidem for sleep.',
    };
  }

  it('excludes meds/supplements even when they appear in promptSummary or freeformContext', () => {
    const block = buildProfilePromptBlock(leakyProfile(), { gravlSafe: true });
    const t = block.text.toLowerCase();
    for (const leak of ['ibuprofen', 'creatine', 'testosterone', 'trt', 'metformin', 'zolpidem']) {
      expect(t, leak).not.toContain(leak);
    }
    // The free-text summary is dropped entirely under the whitelist.
    expect(block.metadata.promptSummaryCharCount).toBeUndefined();
    expect(block.metadata.freeformContextExcerptCharCount).toBeUndefined();
  });

  it('drops nutrition and non-whitelisted body metrics, keeps training-relevant fields + safety summary', () => {
    const block = buildProfilePromptBlock(leakyProfile(), { gravlSafe: true });
    const paths = block.metadata.includedFieldPaths ?? [];
    // Whitelisted, training-relevant:
    expect(paths).toContain('goals.primaryGoal');
    expect(paths).toContain('trainingPlan.weeklyFrequency');
    expect(paths).toContain('trainingPlan.movementRestrictions');
    expect(paths).toContain('medicalContext.safetySummary');
    expect(paths).toContain('bodyMetrics.currentWeight');
    // Excluded:
    expect(paths).not.toContain('nutritionTargets');
    expect(paths).not.toContain('bodyMetrics.waist');
    expect(paths).not.toContain('bodyMetrics.bodyFatEstimate');
    expect(paths).not.toContain('supplementsMedications');
    expect(block.text).toContain('L4/L5'); // the approved movement-safety summary
    expect(block.text).not.toContain('2400'); // no calories
  });

  it('leaves non-Gravl behavior unchanged (free-text summary + meds retained)', () => {
    const block = buildProfilePromptBlock(leakyProfile());
    expect(block.text).toContain('creatine');
    // promptSummary takes precedence over freeformContext (existing behavior)
    // and IS retained for non-Gravl callers.
    expect(block.text.toLowerCase()).toContain('testosterone');
    expect(block.metadata.promptSummaryCharCount).toBeGreaterThan(0);
    expect(block.metadata.includedFieldPaths).toContain('nutritionTargets');
  });

  // DOS-WF-001 correction 7: staleness must key on the FULL context hash, not
  // the shortened display fingerprint. Prove the full hash exists, is a full
  // sha256, differs from the short fingerprint, and changes with content.
  it('exposes a full promptContextHash distinct from the short display fingerprint', () => {
    const a = buildProfilePromptBlock(leakyProfile(), { gravlSafe: true });
    expect(a.metadata.promptContextHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.metadata.promptContextFingerprint).not.toBe(a.metadata.promptContextHash);
    expect(a.metadata.promptContextHash?.startsWith(a.metadata.promptContextFingerprint!.slice(0, 8))).toBe(true);

    const changed: HealthFitnessProfile = { ...leakyProfile(), goals: { primaryGoal: 'muscle_gain' } };
    const b = buildProfilePromptBlock(changed, { gravlSafe: true });
    expect(b.metadata.promptContextHash).not.toBe(a.metadata.promptContextHash);
  });
});
