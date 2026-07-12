import { describe, expect, it } from 'vitest';
import { buildMacroTargetSnapshot } from '../health/macroAnalysis';
import type { HealthFitnessProfile } from '../types';

const profile: HealthFitnessProfile = {
  id: 'hp',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
  nutritionTargets: {
    calories: 2000,
    proteinGrams: 190,
    fatGrams: 75,
    fiberGrams: 30,
    waterMl: 3000,
  },
};

describe('buildMacroTargetSnapshot', () => {
  it('compares parsed current macros against profile targets', () => {
    const snapshot = buildMacroTargetSnapshot(
      profile,
      'Midday screenshot: 1,240 kcal, protein 112g, carbs 130g, fat 62g, fiber 12g, water 1.5 L',
    );

    expect(snapshot.hasNutritionData).toBe(true);
    expect(snapshot.text).toContain('Calories: target 2,000 kcal | current 1,240 kcal | remaining 760 kcal');
    expect(snapshot.text).toContain('Protein: floor 190g | current 112g | remaining 78g');
    expect(snapshot.text).toContain('Carbs: no hard target in profile | current 130g');
    expect(snapshot.text).toContain('Water: floor 3,000 mL | current 1,500 mL | remaining 1,500 mL');
    expect(snapshot.text).toContain('Protein is the main gap');
  });

  it('does not emit text when no nutrition data is present', () => {
    const snapshot = buildMacroTargetSnapshot(profile, 'Back felt okay. Push day later.');
    expect(snapshot.hasNutritionData).toBe(false);
    expect(snapshot.text).toBe('');
  });

  it('flags over-target calories without treating protein floor as over', () => {
    const snapshot = buildMacroTargetSnapshot(profile, 'Calories 2150 protein 205 fat 90 fiber 31');
    expect(snapshot.text).toContain('Calories: target 2,000 kcal | current 2,150 kcal | over by 150 kcal');
    expect(snapshot.text).toContain('Protein: floor 190g | current 205g | floor met');
    expect(snapshot.text).toContain('Calories are already over target');
  });
});
