import type { Agent, AgentId } from '../types';

import universalOperations from '../../../seed/agents/universal-operations.json';
import dailyCommand from '../../../seed/agents/daily-command.json';
import fitness from '../../../seed/agents/operation-david-fitness.json';
import workFraudCyber from '../../../seed/agents/work-fraud-cyber.json';
import promptVault from '../../../seed/agents/prompt-vault.json';
import calendarPlanning from '../../../seed/agents/calendar-planning.json';
import dogsHomeLifeAdmin from '../../../seed/agents/dogs-home-life-admin.json';
import contentAssetBuilder from '../../../seed/agents/content-asset-builder.json';

/**
 * Agents are defined as JSON specs in /seed/agents so other tools
 * (ChatGPT, Codex, Gemini) can read the exact same definitions.
 * v1 treats them as static — they are not user-editable in the app.
 */
const AGENT_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

export function validateAgentRegistry(agents: Agent[]): Agent[] {
  const seen = new Set<string>();
  for (const agent of agents) {
    if (!AGENT_ID_PATTERN.test(agent.id)) {
      throw new Error(`Agent registry contains malformed id: ${agent.id}`);
    }
    if (seen.has(agent.id)) {
      throw new Error(`Agent registry contains duplicate id: ${agent.id}`);
    }
    seen.add(agent.id);
  }
  return agents;
}

export const AGENTS: Agent[] = validateAgentRegistry([
  universalOperations,
  dailyCommand,
  fitness,
  workFraudCyber,
  promptVault,
  calendarPlanning,
  dogsHomeLifeAdmin,
  contentAssetBuilder,
] as Agent[]);

export function getAgent(id: AgentId | string): Agent | undefined {
  return AGENTS.find((a) => a.id === id);
}
