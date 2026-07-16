import type { AgentId, RouteResult } from '../types';
import { scoreInput } from './routeScoring';
import { resolveFitnessWorkflow } from './fitnessRouting';
import { detectIntents, hasConjunction, type DetectedIntent } from './intentClassifier';

const AGENT_NAMES: Record<string, string> = {
  'universal-operations': 'Universal Operations',
  daily_command: 'Daily Command',
  fitness: 'Operation David Fitness',
  work_project: 'Work / Fraud / Cybersecurity',
  prompt_vault: 'Prompt Vault',
  calendar_planning: 'Calendar / Planning',
  dogs_home_life_admin: 'Dogs / Home / Life Admin',
  content_asset: 'Content / Side-Income Assets',
};

const DEFAULT_WORKFLOW: Record<string, string> = {
  'universal-operations': 'universal-operations-review',
  daily_command: 'daily-brief',
  fitness: 'fitness-handoff',
  work_project: 'work-teachback',
  prompt_vault: 'prompt-improvement',
  calendar_planning: 'weekly-review',
  dogs_home_life_admin: 'life-admin-checklist',
  content_asset: 'content-asset-planner',
};

const UNKNOWN = (reasoning: string, nextAction: string): RouteResult => ({
  target: 'unknown', classification: 'unknown', confidence: 0, reasoning, matched: [], nextAction,
});

function supportedResult(intent: DetectedIntent, matched: string[], confidence: number, input: string): RouteResult {
  // Fitness may still tie between Gravl and Handoff — preserve the existing
  // tie → alternatives behavior for a genuine coin-flip.
  let workflowId = intent.workflowId;
  let alternatives: RouteResult['alternatives'];
  let classification: RouteResult['classification'] = 'supported';
  let nextAction = `Run the ${AGENT_NAMES[intent.domain]} agent's ${intent.label} workflow.`;
  if (intent.domain === 'fitness') {
    const fit = resolveFitnessWorkflow(input);
    if (fit.tie) {
      classification = 'ambiguous';
      alternatives = fit.options;
      workflowId = undefined;
      nextAction = 'Two fitness workflows fit — pick one below.';
    } else {
      workflowId = fit.workflowId;
    }
  }
  return {
    target: intent.domain,
    classification,
    confidence,
    reasoning: `Matched "${matched.join('", "')}" → ${AGENT_NAMES[intent.domain]} (${intent.label}).`,
    matched,
    suggestedWorkflowId: workflowId,
    alternatives,
    nextAction,
  };
}

/**
 * Rule-based intent router (v2 — honest classification). Word-aware keyword
 * scoring decides the candidate domain; the intent classifier decides whether
 * that evidence is strong enough to route, only recognized-but-unsupported, a
 * genuine ambiguity, several independent goals, or nothing.
 */
export function routeIntent(input: string): RouteResult {
  // Collapse internal whitespace so extra spaces/newlines between words never
  // break a multi-word keyword match ("weekly   review" ≡ "weekly review").
  const trimmed = input.replace(/\s+/g, ' ').trim();
  if (!trimmed) return UNKNOWN('Empty input — nothing to route.', 'Type what you need help with, or pick an agent directly.');

  const intents = detectIntents(trimmed);
  const supported = intents.filter((i) => i.kind === 'supported');
  const unsupported = intents.filter((i) => i.kind === 'unsupported');

  // Distinct independent goals → multi-domain clarification (Phase 1C). Requires
  // a conjunction so a single request with incidental extra words does not fire.
  const goals = dedupeByDomainGoal(intents);
  if (goals.length >= 2 && hasConjunction(trimmed)) {
    return {
      target: 'unknown',
      classification: 'multi_domain',
      confidence: 0,
      reasoning: `Detected ${goals.length} independent goals: ${goals.map((g) => g.label).join('; ')}.`,
      matched: [],
      nextAction: 'This request mixes independent goals. Which would you like to handle first?',
      domains: goals.map((g) => ({ agentId: g.domain, label: g.label })),
    };
  }

  const scores = scoreInput(trimmed);
  const top = scores[0];
  const second = scores[1];

  // Precedence: a strong supported command wins over a weak unsupported phrase.
  if (supported.length >= 1) {
    const intent = supported[0];
    const matched = top.score > 0 ? top.matched : [intent.goal];
    const confidence = evidenceConfidence(top.score, second.score, /* strong */ true);
    return supportedResult(intent, matched, confidence, trimmed);
  }

  // Recognized but unsupported — name the domain, route nothing.
  if (unsupported.length >= 1) {
    const intent = unsupported[0];
    return {
      target: 'unknown',
      classification: 'unsupported',
      confidence: 0,
      reasoning: `Recognized a ${intent.label} request, but no workflow exists for it yet.`,
      matched: top.score > 0 ? top.matched : [],
      nextAction: `This looks like ${intent.label}. There's no workflow for it yet, so nothing was routed.`,
      recognizedDomain: intent.domain,
      intentLabel: intent.label,
    };
  }

  // No strong intent. If only weak generic keywords lit up, that is ambiguity,
  // not a confident route.
  if (top.score === 0) {
    return UNKNOWN('No agent keywords matched this input.', 'Rephrase with more detail, or pick an agent from the dashboard.');
  }

  // A bare fitness anchor (e.g. "workout") — offer the two fitness workflows.
  if (top.agentId === 'fitness') {
    return {
      target: 'fitness',
      classification: 'ambiguous',
      confidence: evidenceConfidence(top.score, second.score, false),
      reasoning: `Matched "${top.matched.join('", "')}" → fitness, but the action is unclear.`,
      matched: top.matched,
      alternatives: [
        { workflowId: 'gravl-review', label: 'Gravl Workout Review' },
        { workflowId: 'fitness-handoff', label: 'Fitness Handoff' },
      ],
      nextAction: 'Did you want a workout review or to log/clean up notes? Pick one below.',
    };
  }

  // A lone weak generic word in another domain — ask rather than route silently.
  return {
    target: top.agentId as AgentId,
    classification: 'ambiguous',
    confidence: evidenceConfidence(top.score, second.score, false),
    reasoning: `Matched only weak signal "${top.matched.join('", "')}" → ${AGENT_NAMES[top.agentId]}.`,
    matched: top.matched,
    intentLabel: `${AGENT_NAMES[top.agentId]} (unclear intent)`,
    nextAction: `This looks related to ${AGENT_NAMES[top.agentId]}, but the intent is unclear. Can you say what you want to do?`,
  };
}

function dedupeByDomainGoal(intents: DetectedIntent[]): DetectedIntent[] {
  const seen = new Set<string>();
  const out: DetectedIntent[] = [];
  for (const i of intents) if (!seen.has(i.goal)) { seen.add(i.goal); out.push(i); }
  return out;
}

/**
 * Confidence reflects evidence quality, not just the top/second ratio. A strong
 * signal (registered phrase or anchor+action) earns a real score; a weak-only
 * match is capped low so it can never masquerade as a confident route.
 */
function evidenceConfidence(topScore: number, secondScore: number, strong: boolean): number {
  if (!strong) return Math.min(0.35, Math.round((topScore / (topScore + secondScore + 2)) * 100) / 100);
  const ratio = topScore / (topScore + secondScore + 0.5);
  return Math.round(Math.min(0.9, 0.5 + ratio / 2) * 100) / 100;
}

export { DEFAULT_WORKFLOW, AGENT_NAMES };
