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

export const GRAVL_WORKFLOW_ID = 'gravl-review';
export const FITNESS_HANDOFF_WORKFLOW_ID = 'fitness-handoff';

const GRAVL_WORKFLOW_NAME = 'Gravl Workout Review & Optimization';
const FITNESS_HANDOFF_NAME = 'Fitness Handoff';

interface Signal {
  term: string;
  weight: number;
}

const sig = (term: string, weight = 1): Signal => ({ term, weight });

/** Review / optimize / plan a Gravl workout → gravl-review. */
const GRAVL_SIGNALS: Signal[] = [
  sig('gravl', 3),
  sig('workout plan', 3), sig('workout program', 3), sig('training program', 2),
  sig('training plan', 2), sig('program review', 3),
  sig('workout review', 3), sig('review the workout', 3), sig('review my workout', 3),
  sig('review this workout', 3), sig('review a workout', 3),
  sig('optimize this workout', 3), sig('optimize my workout', 3),
  sig('optimize', 2), sig('optimise', 2), sig('optimization', 2), sig('optimisation', 2),
  sig('help with a workout', 3), sig('help with my workout', 3),
  sig('review', 2), sig('improve this workout', 3), sig('improve my workout', 3),
  sig('phase fit', 2), sig('phase-fit', 2), sig('progression', 1), sig('is this workout safe', 3),
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
    if (text.includes(term)) score += weight;
  }
  return score;
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
  const gravlScore = scoreSignals(text, GRAVL_SIGNALS);
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
