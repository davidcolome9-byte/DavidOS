/**
 * Deterministic workflow-level routing WITHIN the fitness domain.
 *
 * The agent-level intent router (routeIntent) decides "this is a fitness
 * request". This module decides WHICH fitness workflow it is — currently
 * either the Gravl Workout Review & Optimization workflow (review/optimize
 * a Gravl-provided workout) or the Fitness Handoff (clean / log / organize
 * existing notes). No AI is involved; pure keyword scoring so the same input
 * always resolves the same way.
 *
 * On a genuine tie (both workflows score equally and non-zero) we do NOT
 * silently pick one — the caller is told to offer two plain-language choices.
 */

import { matchesTerm } from './termMatch';

export const GRAVL_WORKFLOW_ID = 'gravl-review';
export const FITNESS_HANDOFF_WORKFLOW_ID = 'fitness-handoff';
export const FITNESS_READINESS_WORKFLOW_ID = 'fitness-readiness';

const GRAVL_WORKFLOW_NAME = 'Gravl Workout Review & Optimization';
const FITNESS_HANDOFF_NAME = 'Fitness Handoff';

interface Signal {
  term: string;
  weight: number;
}

const sig = (term: string, weight = 1): Signal => ({ term, weight });

/**
 * Workout-context ANCHORS make Gravl *eligible*. A generic verb like "review"
 * or "optimize" must never route to Gravl on its own (that would hijack
 * "review my meal plan", "review my macros"), so a context word is required.
 * Bare context words are eligibility-only — they carry NO score (see
 * GRAVL_SCORE) so a lone anchor can never outweigh a clear logging verb like
 * "log my workout" (that is a Handoff, not a review — DOS C-work-1).
 */
const GRAVL_CONTEXT: string[] = [
  'gravl', 'workout', 'workouts', 'exercise', 'training',
  'workout plan', 'workout program', 'training plan', 'training program',
  'program review', 'routine',
  // C-fit-2 — the narrow phrase only; bare "fitness" is NOT Gravl context, so
  // "review my meal plan"/"review my macros" stay ineligible here.
  'fitness plan',
];

/**
 * Gravl SCORE signals: Gravl-flavored phrases and review/optimize modifiers.
 * Counted only when a GRAVL_CONTEXT word is also present. A bare context word
 * ("workout", "training") scores 0 here on purpose.
 */
const GRAVL_SCORE: Signal[] = [
  sig('gravl', 3),
  sig('workout plan', 3), sig('workout program', 3),
  sig('training plan', 2), sig('training program', 2), sig('program review', 3),
  sig('review', 2), sig('improve', 2),
  sig('optimize', 2), sig('optimise', 2), sig('optimization', 2), sig('optimisation', 2),
  sig('phase fit', 2), sig('phase-fit', 2), sig('progression', 1),
  sig('is this workout safe', 2), sig('feedback', 2), sig('critique', 2),
];

/** Clean / log / organize existing notes → fitness-handoff. */
const HANDOFF_SIGNALS: Signal[] = [
  sig('clean up', 3), sig('clean-up', 3), sig('clean', 2), sig('tidy', 2), sig('tidy up', 3),
  sig('log', 2), sig('logging', 2), sig('log today', 3),
  sig('organize', 2), sig('organise', 2), sig('organizing', 2),
  sig('diary', 2), sig('handoff', 2), sig('hand off', 2),
  sig('notes', 1), sig('food log', 3), sig('training notes', 2), sig('workout notes', 3),
];

export interface FitnessWorkflowResolution {
  workflowId: string;
  /** True only when both workflows scored equally and non-zero. */
  tie: boolean;
  /** Present on a tie: two plain-language choices for the caller to show. */
  options?: { workflowId: string; label: string }[];
}

function scoreSignals(text: string, signals: Signal[]): number {
  let score = 0;
  for (const { term, weight } of signals) {
    if (matchesTerm(text, term)) score += weight;
  }
  return score;
}

/**
 * Gravl score, gated on workout context: no context word → 0 (Gravl
 * ineligible), so generic "review/optimize" requests never route here. With
 * context present, only the Gravl-flavored SCORE signals count — a bare
 * context word contributes nothing, so "log my workout" resolves to the
 * Handoff, not a review.
 */
function scoreGravl(text: string): number {
  const contextPresent = GRAVL_CONTEXT.some((term) => matchesTerm(text, term));
  if (!contextPresent) return 0;
  return scoreSignals(text, GRAVL_SCORE);
}

/**
 * Resolve fitness free text to a specific fitness workflow.
 * - clear Gravl signal wins → gravl-review
 * - clear cleaning/logging signal wins → fitness-handoff
 * - no specific signal → fitness-handoff (safe default; preserves prior behavior)
 * - genuine non-zero tie → both offered, no silent pick
 */
export function resolveFitnessWorkflow(input: string): FitnessWorkflowResolution {
  const text = input.toLowerCase();
  const gravlScore = scoreGravl(text);
  const handoffScore = scoreSignals(text, HANDOFF_SIGNALS);

  if (gravlScore > handoffScore) return { workflowId: GRAVL_WORKFLOW_ID, tie: false };
  if (handoffScore > gravlScore) return { workflowId: FITNESS_HANDOFF_WORKFLOW_ID, tie: false };

  // Equal scores from here down.
  if (gravlScore === 0) {
    // No specific signal at all — default to the general handoff workflow.
    return { workflowId: FITNESS_HANDOFF_WORKFLOW_ID, tie: false };
  }

  // Genuine tie: both matched with equal weight. Offer both.
  return {
    workflowId: GRAVL_WORKFLOW_ID,
    tie: true,
    options: [
      { workflowId: GRAVL_WORKFLOW_ID, label: GRAVL_WORKFLOW_NAME },
      { workflowId: FITNESS_HANDOFF_WORKFLOW_ID, label: FITNESS_HANDOFF_NAME },
    ],
  };
}
