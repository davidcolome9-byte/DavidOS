import type { RouteResult } from '../types';
import { scoreInput } from './routeScoring';

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

/**
 * Rule-based intent router (v1). Classifies free text into an agent
 * via keyword scoring. Confidence is a heuristic, capped at 0.9
 * because keyword matching is never certain.
 */
export function routeIntent(input: string): RouteResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      target: 'unknown',
      confidence: 0,
      reasoning: 'Empty input — nothing to route.',
      matched: [],
      nextAction: 'Type what you need help with, or pick an agent directly.',
    };
  }

  const scores = scoreInput(trimmed);
  const top = scores[0];
  const second = scores[1];

  if (top.score === 0) {
    return {
      target: 'unknown',
      confidence: 0,
      reasoning: 'No agent keywords matched this input.',
      matched: [],
      nextAction: 'Rephrase with more detail, or pick an agent from the dashboard.',
    };
  }

  const confidence = Math.min(0.9, top.score / (top.score + second.score + 0.5));

  return {
    target: top.agentId,
    confidence: Math.round(confidence * 100) / 100,
    reasoning: `Matched "${top.matched.join('", "')}" → ${AGENT_NAMES[top.agentId]}.`,
    matched: top.matched,
    suggestedWorkflowId: DEFAULT_WORKFLOW[top.agentId],
    nextAction: `Run the ${AGENT_NAMES[top.agentId]} agent's suggested workflow with this input.`,
  };
}
