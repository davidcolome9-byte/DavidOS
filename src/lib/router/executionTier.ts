import type { RouteResult } from '../types';
import { matchesTerm } from './termMatch';

/** Advisory execution setup, separate from the domain router and risk policy. */
export type ExecutionTier = 'tier_1_local' | 'tier_2_assistant' | 'tier_3_executor';

export interface ExecutionTierDecision {
  tier: ExecutionTier;
  confidence: number;
  reasoning: string;
  matched: string[];
  requiresSupervisedExecution: boolean;
}

export const EXECUTION_TIER_LABELS: Record<ExecutionTier, string> = {
  tier_1_local: 'Tier 1 · Local',
  tier_2_assistant: 'Tier 2 · Assistant',
  tier_3_executor: 'Tier 3 · Executor',
};

const LOCAL_DIRECT_ACTIONS = ['show', 'list', 'open', 'view', 'display'];
const LOCAL_STATE_OBJECTS = [
  'priority', 'priorities', 'reminder', 'reminders', 'open loop', 'open loops',
  'project', 'projects', 'prompt', 'prompts', 'context', 'agent', 'agents',
  'workflow', 'workflows', 'setting', 'settings', 'audit log',
];
const LOCAL_STRONG_PHRASES = [
  'what are my priorities', 'what are my open loops', 'what are my reminders',
];
const ASSISTANT_SIGNALS = [
  'research', 'look up', 'compare', 'analyze', 'analyse', 'summarize', 'summarise',
  'explain', 'recommend', 'review', 'investigate', 'draft', 'brainstorm',
  'evaluate', 'write me', 'how to',
];

// Require an actionable technical request at the start of the sentence. Broad
// word co-occurrence ("build" plus "app" anywhere) escalates life-planning text.
const REQUEST_PREFIX = '(?:(?:please|can you|could you|would you|i need you to)\\s+)?';
const EXECUTOR_PATTERNS: readonly [RegExp, string][] = [
  [new RegExp(`^${REQUEST_PREFIX}(?:write|edit|modify|change|refactor|debug|fix|implement|run|commit|push|deploy|install|migrate|create|build|delete)\\s+(?:(?:this|that|the|a|an|my|our|new|existing)\\s+){0,2}(?:bug|code|codebase|repository|repo|branch|commit|pull request|pr|(?:unit\\s+)?tests?|test suite|migration|database|schema|app|website|server|api|dependencies?|packages?|files?)\\b`), 'technical action'],
  [new RegExp(`^${REQUEST_PREFIX}implement\\s+(?:(?:this|the|a|an|my|our|new)\\s+)?feature\\b.*\\b(?:repository|repo|codebase|app)\\b`), 'implement feature in code'],
  [new RegExp(`^${REQUEST_PREFIX}open\\s+(?:(?:a|the)\\s+)?(?:pull request|pr)\\b`), 'open pull request'],
  [/^(?:npm run|git (?:commit|push|checkout|switch|branch))\b/, 'tool command'],
];

function matchingTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => matchesTerm(text, term));
}

/** The classifier only recommends a tier; it never starts work or creates a record. */
export function classifyExecutionTier(input: string, route: RouteResult): ExecutionTierDecision {
  const text = input.replace(/\s+/g, ' ').trim().toLowerCase();
  const executor = EXECUTOR_PATTERNS.find(([pattern]) => pattern.test(text));
  if (executor) {
    return {
      tier: 'tier_3_executor',
      confidence: 0.9,
      reasoning: 'This request calls for implementation or tool work. The existing Supervised Coding Coordinator is the future handoff point; nothing was executed.',
      matched: [executor[1]],
      requiresSupervisedExecution: true,
    };
  }

  // Questions about doing something are requests for interpretation, even if
  // they mention a local object or an executable command.
  const advisory = /^(?:please\s+)?(?:explain|research|compare|review|draft|summarize|summarise|how(?:\s+do\s+i|\s+to)|what\s+is|show\s+me\s+how\s+to)\b/.test(text);
  const localStrong = matchingTerms(text, LOCAL_STRONG_PHRASES);
  const localActions = matchingTerms(text, LOCAL_DIRECT_ACTIONS);
  const localObjects = matchingTerms(text, LOCAL_STATE_OBJECTS);
  if (!advisory && (localStrong.length > 0 || (localActions.length > 0 && localObjects.length > 0))) {
    return {
      tier: 'tier_1_local',
      confidence: 0.86,
      reasoning: 'This request can be handled from deterministic local DavidOS state or navigation.',
      matched: localStrong.length > 0 ? localStrong : [localActions[0]!, localObjects[0]!],
      requiresSupervisedExecution: false,
    };
  }

  const assistant = matchingTerms(text, ASSISTANT_SIGNALS);
  const routeHint = route.classification === 'unknown' || route.classification === 'ambiguous' || route.classification === 'multi_domain'
    ? ' The intent also needs clarification before any stronger action is considered.'
    : '';
  return {
    tier: 'tier_2_assistant',
    confidence: assistant.length > 0 ? 0.82 : 0.64,
    reasoning: 'This request needs reasoning, drafting, research, or interpretation.' + routeHint,
    matched: assistant,
    requiresSupervisedExecution: false,
  };
}
