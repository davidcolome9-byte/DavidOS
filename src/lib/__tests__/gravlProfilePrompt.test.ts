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
