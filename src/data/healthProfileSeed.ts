import type { HealthFitnessProfile } from '../lib/types';
import { uid, nowIso } from '../lib/types';

/**
 * Generic starter Health & Fitness Profile.
 *
 * Deliberately contains NO personal values — this file ships in a public
 * repo/app bundle. Real targets, baselines, injury history, and regimen
 * belong in the (gitignored) personal backup JSON, imported per-device via
 * Settings → Import. The import flow never silently overwrites a profile.
 *
 * Seeding only happens when no profile exists; an explicit user deletion
 * (null) is respected and never re-seeded.
 */
export function seedHealthProfile(): HealthFitnessProfile {
  const now = nowIso();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    goals: {
      goalNotes: '[Set your primary goal and what matters most — e.g. fat loss with muscle preservation]',
    },
    nutritionTargets: {
      notes: '[Add calorie/macro targets. Canonical units: kcal, grams, mL.]',
    },
    trainingPlan: {
      movementRestrictions: [],
      currentTrainingNotes: '[Split, style, frequency — and any movement restrictions above]',
    },
    analysisPreferences: {
      coachingStyle: 'context_sensitive',
      outputDetail: 'standard',
      compareAgainstTargets: true,
    },
    seedMetadata: {
      isSeededProfile: true,
      sourceNote:
        'Generic starter profile — no personal data. Fill in your targets here, or import your ' +
        'personal backup (Settings → Import) to load your real profile.',
      sourcePriority: 'manual',
      needsVerification: true,
      seededAt: now,
    },
  };
}
