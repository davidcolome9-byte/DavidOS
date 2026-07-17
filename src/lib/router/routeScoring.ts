import type { AgentId } from '../types';
import { matchesTerm } from './termMatch';

interface Keyword {
  term: string;
  weight: number;
}

const kw = (term: string, weight = 1): Keyword => ({ term, weight });

/** Keyword tables per agent. Multi-word phrases carry more weight. */
export const AGENT_KEYWORDS: Record<AgentId, Keyword[]> = {
  'universal-operations': [
    kw('universal operations', 4), kw('ops review', 4), kw('operations review', 3),
    kw('waiting on me', 3), kw('waiting on user', 3), kw('autonomous work', 3),
    kw('autonomous blockers', 3), kw('capture inbox', 3), kw('process my capture', 3),
    kw('cross-domain', 2), kw('cross domain', 2), kw('source authority', 2),
    kw('one next action', 2), kw('approval boundary', 2),
  ],
  daily_command: [
    // "today"/"morning" removed: a bare temporal word is not evidence of the
    // Daily domain and produced false weak routes ("Not feeling well today" →
    // daily). Strong daily phrases below still carry the domain.
    kw('priorities'), kw('priority'), kw('focus'), kw('overwhelmed'),
    kw('daily brief', 2), kw('command brief', 2), kw('next move', 2),
    kw('what should i do', 3), kw('plan my day', 3), kw('bandwidth'),
  ],
  fitness: [
    kw('workout', 2), kw('gym'), kw('macro'), kw('macros'), kw('protein'), kw('meal'),
    kw('food'), kw('diary'), kw('garmin'), kw('weight'), kw('fat loss', 2),
    kw('muscle'), kw('training'), kw('recovery'), kw('calories'), kw('recomp', 2),
    kw('fitness', 2), kw('cardio'), kw('lift'), kw('screenshot'), kw('screenshots'),
    kw('goals or remaining', 3), kw('remaining'), kw('operation david', 3), kw('grams'),
    kw('gravl', 3),
  ],
  work_project: [
    kw('teachback', 3), kw('teach back', 3), kw('coworker', 2), kw('coworkers', 2),
    kw('fraud', 2), kw('cyber', 2), kw('cybersecurity', 2), kw('security'),
    kw('supervisor', 2), kw('job aid', 3), kw('training material', 2), kw('work'),
    kw('presentation'), kw('scam'), kw('phishing', 2), kw('red flag', 2),
    kw('ai caller', 3), kw('one-pager', 2), kw('slide'),
  ],
  prompt_vault: [
    kw('prompt', 2), kw('prompts', 2), kw('claude', 2), kw('chatgpt', 2),
    kw('codex', 2), kw('gemini', 2), kw('improve this', 1), kw('rewrite'),
    kw('system instruction', 2), kw('model'), kw('claude code', 2),
  ],
  calendar_planning: [
    kw('week'), kw('weekly', 2), kw('calendar', 2), kw('schedule', 2),
    kw('remind'), kw('reminder', 2), kw('reminders', 2), kw('plan the week', 3),
    kw('time block', 2), kw('appointment'), kw('open loops', 2), kw('weekly review', 3),
  ],
  dogs_home_life_admin: [
    kw('dog', 2), kw('dogs', 2), kw('vet', 2),
    kw('home'), kw('house'), kw('chore', 2), kw('chores', 2), kw('clean'),
    kw('errand', 2), kw('errands', 2), kw('grocery'), kw('groceries'),
    kw('yard'), kw('laundry'), kw('household', 2),
  ],
  content_asset: [
    kw('content', 2), kw('template', 2), kw('guide'), kw('digital product', 3),
    kw('sell'), kw('notion'), kw('audience'), kw('post'), kw('side income', 3),
    kw('side-income', 3), kw('asset', 2), kw('prompt pack', 3), kw('repurpose', 2),
  ],
};

export interface AgentScore {
  agentId: AgentId;
  score: number;
  matched: string[];
}

/** Score input text against every agent's keyword table. */
export function scoreInput(input: string): AgentScore[] {
  const text = input.toLowerCase();
  const scores: AgentScore[] = [];
  for (const agentId of Object.keys(AGENT_KEYWORDS) as AgentId[]) {
    let score = 0;
    const matched: string[] = [];
    for (const { term, weight } of AGENT_KEYWORDS[agentId]) {
      if (matchesTerm(text, term)) {
        score += weight;
        matched.push(term);
      }
    }
    scores.push({ agentId, score, matched });
  }
  return scores.sort((a, b) => b.score - a.score);
}
