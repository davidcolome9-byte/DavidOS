import type { HistoryProfile, Workflow, WorkflowCategory, WorkflowOutputMode } from '../types';

// Weighted keyword fallback for workflows without explicit category metadata.
export const FITNESS_HEALTH_KEYWORDS = {
  strong: [
    'fitness', 'health', 'nutrition', 'workout', 'training', 'exercise', 'diet',
    'macro', 'macros', 'meal prep', 'body recomposition', 'fat loss', 'weight loss',
    'cutting', 'bulking', 'hypertrophy',
  ],
  medium: [
    'calories', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'water', 'hydration',
    'steps', 'sleep', 'recovery', 'soreness', 'pain', 'cardio', 'walk', 'lifting',
    'gym', 'body weight', 'scale weight', 'weigh-in', 'waist', 'measurements', 'body fat',
  ],
  weak: [
    'body', 'energy', 'stress', 'fatigue', 'rest', 'mobility', 'stretching',
    'sauna', 'hrv', 'rhr', 'heart rate', 'body battery', 'vo2', 'active calories',
  ],
};

export interface FitnessScore {
  score: number;
  strongHits: string[];
  mediumWeakHits: string[];
  isFitnessHealth: boolean;
}

/**
 * Score arbitrary text against the fitness/health keyword table.
 * Upgrade rules: 2 strong terms, or 1 strong + 2 medium/weak, or score >= 6.
 */
export function scoreFitnessHealth(text: string): FitnessScore {
  const t = text.toLowerCase();
  const hit = (term: string) => t.includes(term);
  const strongHits = FITNESS_HEALTH_KEYWORDS.strong.filter(hit);
  const mediumHits = FITNESS_HEALTH_KEYWORDS.medium.filter(hit);
  const weakHits = FITNESS_HEALTH_KEYWORDS.weak.filter(hit);
  const score = strongHits.length * 3 + mediumHits.length * 2 + weakHits.length;
  const mediumWeakHits = [...mediumHits, ...weakHits];
  const isFitnessHealth =
    strongHits.length >= 2 ||
    (strongHits.length >= 1 && mediumWeakHits.length >= 2) ||
    score >= 6;
  return { score, strongHits, mediumWeakHits, isFitnessHealth };
}

function workflowSearchText(workflow: Workflow): string {
  return [workflow.name, workflow.description, workflow.template, workflow.inputHint, ...(workflow.assumptions ?? [])]
    .join('\n');
}

/** Explicit metadata wins; keyword fallback fills the gaps. Never destructive. */
export function resolveCategory(workflow: Workflow): WorkflowCategory {
  if (workflow.category) return workflow.category;
  return scoreFitnessHealth(workflowSearchText(workflow)).isFitnessHealth ? 'fitness_health' : 'general';
}

export function resolveHistoryProfile(workflow: Workflow): HistoryProfile {
  if (workflow.historyProfile) return workflow.historyProfile;
  return resolveCategory(workflow) === 'fitness_health' ? 'fitness_health' : 'default';
}

export function resolveOutputMode(workflow: Workflow): WorkflowOutputMode {
  if (workflow.outputMode) return workflow.outputMode;
  return resolveCategory(workflow) === 'fitness_health'
    ? 'dashboard_full_analysis'
    : 'handoff_with_continuity_notes';
}

/** History window size per profile. */
export function historyTargetCount(profile: HistoryProfile): number {
  return profile === 'fitness_health' ? 7 : 3;
}
