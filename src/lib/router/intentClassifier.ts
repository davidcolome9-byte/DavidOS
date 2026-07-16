/**
 * Honest intent classification (DOS-WF-001R, Phase 1).
 *
 * The agent-level scorer (routeScoring) tells us WHICH keyword tables lit up.
 * This module decides what that evidence actually MEANS, so the router can be
 * honest instead of always emitting a workflow:
 *
 *   - a *strong* supported signal (a registered phrase, or a domain anchor plus
 *     a compatible action) → a supported route;
 *   - a recognized-but-unsupported intent (readiness, meal planning, project
 *     planning, progress analysis) → we name the domain and say no workflow
 *     exists yet;
 *   - two independent goals → multi-domain clarification;
 *   - only a weak generic word → ambiguity, not a silent route;
 *   - nothing → unknown.
 *
 * Precedence (Phase 1C): a strong supported command wins over a weak unsupported
 * phrase; unsupported detection never blindly pre-empts a real command.
 *
 * All matching is word-aware via matchesTerm (no substring collisions).
 */
import type { AgentId } from '../types';
import { matchesTerm } from './termMatch';

export type IntentKind = 'supported' | 'unsupported';

export interface DetectedIntent {
  domain: AgentId;
  kind: IntentKind;
  /** Stable slug so two detectors for the same goal dedupe. */
  goal: string;
  /** Plain-language label shown to the user. */
  label: string;
  /** For supported intents: the workflow the command should run. */
  workflowId?: string;
}

const has = (text: string, terms: string[]): boolean => terms.some((t) => matchesTerm(text, t));

// ---- vocabulary --------------------------------------------------------------

// Real fitness anchors — NOT the weak generic word "training", which alone must
// never route (Phase 1B). "training plan"/"training program" are intentionally
// NOT fitness phrases: they collide with work "training program" (see L-3), so a
// physical anchor (workout/gym/…) is required for a fitness route.
const FITNESS_ANCHORS = ['workout', 'workouts', 'gym', 'exercise', 'lift', 'gravl', 'macro', 'macros', 'protein', 'cardio'];
const STRONG_GRAVL_PHRASES = ['gravl', 'workout plan', 'workout program', 'program review', 'is this workout safe'];
const GRAVL_ACTIONS = ['review', 'optimize', 'optimise', 'optimization', 'optimisation', 'improve', 'safe', 'progression', 'plan', 'planning', 'program', 'feedback', 'critique'];

// "training"/"routine" is a weak generic word that collides with WORK training
// ("training material"/"fraud training program for coworkers"). It is a fitness
// review/plan command ONLY when paired with a review/plan action AND no work
// teachback signal is present — so "training review"/"build a training plan"
// route to Gravl while "training presentation for coworkers" stays Work.
const TRAINING_CONTEXT = ['training', 'routine'];
const TRAINING_ACTIONS = ['review', 'optimize', 'optimise', 'optimization', 'optimisation', 'improve', 'progression', 'critique', 'feedback', 'plan', 'planning', 'program'];
const HANDOFF_ACTIONS = ['clean', 'clean up', 'clean-up', 'tidy', 'tidy up', 'log', 'logging', 'logged', 'organize', 'organise', 'diary', 'handoff', 'hand off', 'notes', 'food log', 'workout notes', 'training notes'];

// Food logging (a supported Handoff intent) vs meal planning (unsupported). The
// differentiator is the action: log/track existing food → Handoff; plan future
// meals → nutrition planning (no workflow).
const FOOD_WORDS = ['food', 'meal', 'meals', 'diary', 'foods'];
const LOG_VERBS = ['log', 'logged', 'logging', 'track', 'tracked', 'record'];

// Recognized-but-unsupported vocabularies.
const ILLNESS_WORDS = ['sick', 'ill', 'illness', 'unwell', 'under the weather', 'flu', 'cold', 'fever', 'nauseous', 'run down', 'rundown', 'not feeling well', 'feel awful'];
const RECOVERY_DOUBT = ['hrv', 'slept', 'sleep', 'sore', 'soreness', 'fatigued', 'fatigue', 'exhausted', 'overtrained', 'deload', 'rest day', 'readiness'];
const TRAIN_DECISION = ['train', 'training', 'workout', 'lift', 'gym', 'rest', 'skip'];

const NUTRITION_WORDS = ['meal', 'meals', 'nutrition', 'diet', 'eating', 'macros', 'calorie', 'calories'];
const PLANNING_WORDS = ['plan', 'planning', 'prep', 'prepare', 'meal plan', 'meal prep', 'meal-plan'];
// Cleanse / detox: a recognized nutrition intent with no workflow. Word-aware,
// so "cleanse" never collides with the dogs/home "clean" keyword.
const CLEANSE_WORDS = ['cleanse', 'detox', 'juice cleanse', 'juice fast'];

// A training-decision question ("should I train today?", "train or rest?") is a
// readiness call even without an explicit illness/recovery word.
const READINESS_DECISION = ['should i', 'do i', 'or rest', 'or train', 'or skip', 'rest or', 'train or', 'worth training', 'ok to train', 'safe to train', 'skip the gym'];

const PROGRESS_WORDS = ['progress', 'trend', 'trending', 'trends'];
const ANALYSIS_WORDS = ['analyze', 'analyse', 'analysis', 'compare', 'evaluate', 'evaluation', 'insights', 'assessment'];
const FITNESS_CONTEXT = ['gym', 'workout', 'workouts', 'fat loss', 'weight', 'muscle', 'macros', 'lifts', 'lifting', 'fitness'];

const PROJECT_WORDS = ['project', 'projects'];
const PROJECT_PLANNING = ['organize', 'organise', 'plan', 'planning', 'milestone', 'milestones', 'phase', 'phases', 'tasks', 'roadmap', 'break down', 'break into', 'scope'];

// Work TEACHBACK requires a teachback/presentation ACTION — not just a security
// topic word (fraud/phishing/cybersecurity), which describes subject matter and
// must not by itself route a "plan this project" request into a teachback.
const WORK_TEACHBACK_SIGNALS = ['teachback', 'teach back', 'teach it back', 'coworker', 'coworkers', 'job aid', 'presentation', 'one-pager', 'slide', 'teach my team', 'teach the team'];
const CALENDAR_STRONG = ['weekly review', 'plan the week', 'plan my week', 'calendar', 'schedule', 'appointment', 'time block', 'open loops', 'reminder', 'reminders'];
const UNIVERSAL_STRONG = ['universal operations', 'ops review', 'operations review', 'waiting on me', 'waiting on user', 'capture inbox', 'process my capture', 'autonomous work', 'autonomous blockers', 'cross-domain', 'cross domain'];
const PROMPT_STRONG = ['prompt', 'prompts', 'claude code', 'system instruction', 'chatgpt', 'codex', 'gemini'];
const LIFEADMIN_STRONG = ['dog', 'dogs', 'vet', 'chore', 'chores', 'grocery', 'groceries', 'errand', 'errands', 'laundry', 'household', 'yard'];
const DAILY_STRONG = ['plan my day', 'what should i do', 'daily brief', 'command brief', 'next move', 'overwhelmed'];

/** Calendar signals that are merely a framing verb around another domain's goal. */
const CALENDAR_SUBORDINATE_ONLY = ['remind', 'reminder', 'reminders', 'schedule'];

// ---- detectors ---------------------------------------------------------------

function fitnessSupported(text: string): DetectedIntent | null {
  // A strong Gravl phrase, or a real anchor plus a compatible action, is a
  // supported fitness command. The specific workflow (Gravl vs Handoff) is
  // chosen by resolveFitnessWorkflow at route time, so we don't pre-decide.
  const strongPhrase = has(text, STRONG_GRAVL_PHRASES);
  const anchor = has(text, FITNESS_ANCHORS);
  const action = has(text, GRAVL_ACTIONS) || has(text, HANDOFF_ACTIONS);
  if (strongPhrase || (anchor && action)) {
    return { domain: 'fitness', kind: 'supported', goal: 'fitness', label: 'fitness', workflowId: undefined };
  }
  return null;
}

function foodLogging(text: string): DetectedIntent | null {
  if (has(text, FOOD_WORDS) && has(text, LOG_VERBS)) {
    return { domain: 'fitness', kind: 'supported', goal: 'fitness', label: 'food logging (Fitness Handoff)', workflowId: 'fitness-handoff' };
  }
  return null;
}

/**
 * A training review / plan command → Gravl (supported). Guarded so a WORK
 * teachback context ("training material/presentation for coworkers") never
 * flips to fitness. The specific fitness workflow is chosen at route time.
 */
function fitnessTrainingReview(text: string): DetectedIntent | null {
  if (has(text, WORK_TEACHBACK_SIGNALS)) return null;
  if (has(text, TRAINING_CONTEXT) && has(text, TRAINING_ACTIONS)) {
    return { domain: 'fitness', kind: 'supported', goal: 'fitness', label: 'fitness', workflowId: undefined };
  }
  return null;
}

function fitnessReadiness(text: string): DetectedIntent | null {
  const illness = has(text, ILLNESS_WORDS);
  const recovery = has(text, RECOVERY_DOUBT);
  const decision = has(text, READINESS_DECISION);
  const trainCtx = has(text, TRAIN_DECISION);
  if ((illness || recovery || decision) && trainCtx) {
    return { domain: 'fitness', kind: 'unsupported', goal: 'fitness-readiness', label: 'fitness readiness / illness-training decision' };
  }
  return null;
}

function nutritionPlanning(text: string): DetectedIntent | null {
  if (has(text, NUTRITION_WORDS) && has(text, PLANNING_WORDS)) {
    return { domain: 'fitness', kind: 'unsupported', goal: 'nutrition-planning', label: 'nutrition / meal planning' };
  }
  if (has(text, CLEANSE_WORDS)) {
    return { domain: 'fitness', kind: 'unsupported', goal: 'nutrition-planning', label: 'nutrition / meal planning' };
  }
  return null;
}

function fitnessProgress(text: string): DetectedIntent | null {
  const progress = has(text, PROGRESS_WORDS);
  const analysis = has(text, ANALYSIS_WORDS);
  const ctx = has(text, FITNESS_CONTEXT);
  if ((progress || analysis) && ctx) {
    return { domain: 'fitness', kind: 'unsupported', goal: 'fitness-progress', label: 'fitness progress analysis' };
  }
  return null;
}

function workProjectPlanning(text: string): DetectedIntent | null {
  if (has(text, PROJECT_WORDS) && has(text, PROJECT_PLANNING)) {
    return { domain: 'work_project', kind: 'unsupported', goal: 'work-project-planning', label: 'work project planning' };
  }
  return null;
}

function workSupported(text: string): DetectedIntent | null {
  if (has(text, WORK_TEACHBACK_SIGNALS)) {
    return { domain: 'work_project', kind: 'supported', goal: 'work-teachback', label: 'Work Teachback', workflowId: 'work-teachback' };
  }
  return null;
}

function calendarSupported(text: string): DetectedIntent | null {
  if (has(text, CALENDAR_STRONG)) {
    return { domain: 'calendar_planning', kind: 'supported', goal: 'calendar', label: 'Calendar / Planning', workflowId: 'weekly-review' };
  }
  return null;
}

function universalSupported(text: string): DetectedIntent | null {
  if (has(text, UNIVERSAL_STRONG)) {
    return { domain: 'universal-operations', kind: 'supported', goal: 'universal-ops', label: 'Universal Operations', workflowId: 'universal-operations-review' };
  }
  return null;
}

function promptSupported(text: string): DetectedIntent | null {
  if (has(text, PROMPT_STRONG) && has(text, ['improve', 'improve this', 'rewrite', 'better', 'refine', 'system instruction', 'claude code'])) {
    return { domain: 'prompt_vault', kind: 'supported', goal: 'prompt', label: 'Prompt Vault', workflowId: 'prompt-improvement' };
  }
  return null;
}

function contentSupported(text: string): DetectedIntent | null {
  if (has(text, ['digital product', 'side income', 'side-income', 'prompt pack', 'repurpose', 'content planner', 'content plan', 'content calendar'])) {
    return { domain: 'content_asset', kind: 'supported', goal: 'content', label: 'Content / Side-Income Assets', workflowId: 'content-asset-planner' };
  }
  return null;
}

function lifeAdminSupported(text: string): DetectedIntent | null {
  if (has(text, LIFEADMIN_STRONG)) {
    return { domain: 'dogs_home_life_admin', kind: 'supported', goal: 'life-admin', label: 'Dogs / Home / Life Admin', workflowId: 'life-admin-checklist' };
  }
  return null;
}

function dailySupported(text: string): DetectedIntent | null {
  if (has(text, DAILY_STRONG)) {
    return { domain: 'daily_command', kind: 'supported', goal: 'daily', label: 'Daily Command', workflowId: 'daily-brief' };
  }
  return null;
}

/**
 * Detect every material intent in the input. Order matters only for readability;
 * dedupe is by `goal`. Supported detectors that would collide with an unsupported
 * one on the same domain are reconciled by the caller's precedence rules.
 */
export function detectIntents(input: string): DetectedIntent[] {
  const text = input.toLowerCase();
  const detectors = [
    fitnessSupported, foodLogging, workSupported, fitnessTrainingReview, calendarSupported,
    universalSupported, promptSupported, contentSupported, lifeAdminSupported, dailySupported,
    fitnessReadiness, nutritionPlanning, fitnessProgress, workProjectPlanning,
  ];
  const found: DetectedIntent[] = [];
  const seen = new Set<string>();
  for (const d of detectors) {
    const r = d(text);
    if (r && !seen.has(r.goal)) { seen.add(r.goal); found.push(r); }
  }

  // Subordinate reduction: a bare calendar framing verb ("remind me …") around a
  // stronger content domain is not an independent goal.
  const onlyCalendarFraming =
    has(text, CALENDAR_SUBORDINATE_ONLY) &&
    !has(text, ['weekly review', 'plan the week', 'calendar', 'appointment', 'time block', 'open loops']);
  if (onlyCalendarFraming) {
    const nonCalendar = found.filter((i) => i.domain !== 'calendar_planning');
    if (nonCalendar.length > 0) return dedupeGoals(nonCalendar);
  }
  return found;
}

function dedupeGoals(intents: DetectedIntent[]): DetectedIntent[] {
  const seen = new Set<string>();
  const out: DetectedIntent[] = [];
  for (const i of intents) if (!seen.has(i.goal)) { seen.add(i.goal); out.push(i); }
  return out;
}

/** True when the input joins independent goals ("… and …", "; ", "also"). */
export function hasConjunction(input: string): boolean {
  return /\b(and|also|plus|then|as well as)\b|[;&]/.test(input.toLowerCase());
}
