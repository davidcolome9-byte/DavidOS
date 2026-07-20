import type { ExecutionAgentId, ExecutionService } from '../types';

/**
 * Execution-agent registry (DOS-AGT-001A).
 *
 * Execution agents are LOCAL coordination profiles for work David performs
 * himself in an external tool (Claude Code, Codex, Gemini, Antigravity, or
 * manually). They are deliberately NOT part of the seed/agents registry:
 * they are never routing targets, have no workflows, and must not enter the
 * AgentId union — validate-seed enforces seed<->registry parity for routed
 * agents, and this registry stays outside that contract on purpose
 * (precedent: slash commands are TS data in lib/commands.ts).
 *
 * DOS-AGT-001A is fixed data: EXACTLY ONE profile, immutable at runtime,
 * not user-editable.
 */
export interface ExecutionAgentProfile {
  id: ExecutionAgentId;
  name: string;
  icon: string;
  purpose: string;
  /** Rendered in the UI and in every execution packet — the honesty contract. */
  supervisionStatement: string;
  allowedServices: readonly ExecutionService[];
  /** Hard boundaries, rendered as UI copy so they are visible, not implied. */
  neverDoes: readonly string[];
}

const EXECUTION_AGENT_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

const VALID_SERVICES: readonly ExecutionService[] =
  Object.freeze(['claude_code', 'codex', 'gemini', 'antigravity', 'manual'] as const);

/**
 * Reject malformed profiles at module load so a broken registry fails fast:
 * bad/duplicate ids, missing required strings, invalid or duplicate services,
 * and any violation of the DOS-AGT-001A one-profile contract.
 */
export function validateExecutionAgentRegistry(
  profiles: readonly ExecutionAgentProfile[],
): readonly ExecutionAgentProfile[] {
  if (profiles.length !== 1) {
    throw new Error(
      `Execution agent registry must contain exactly one profile in DOS-AGT-001A (got ${profiles.length}).`,
    );
  }
  const seen = new Set<string>();
  for (const profile of profiles) {
    if (!EXECUTION_AGENT_ID_PATTERN.test(profile.id)) {
      throw new Error(`Execution agent registry contains malformed id: ${profile.id}`);
    }
    if (seen.has(profile.id)) {
      throw new Error(`Execution agent registry contains duplicate id: ${profile.id}`);
    }
    seen.add(profile.id);
    for (const key of ['name', 'icon', 'purpose', 'supervisionStatement'] as const) {
      if (typeof profile[key] !== 'string' || profile[key].trim() === '') {
        throw new Error(`Execution agent profile "${profile.id}" is missing required field "${key}".`);
      }
    }
    if (profile.allowedServices.length === 0) {
      throw new Error(`Execution agent profile "${profile.id}" must allow at least one service.`);
    }
    const services = new Set<string>();
    for (const service of profile.allowedServices) {
      if (!VALID_SERVICES.includes(service)) {
        throw new Error(`Execution agent profile "${profile.id}" allows unknown service "${service}".`);
      }
      if (services.has(service)) {
        throw new Error(`Execution agent profile "${profile.id}" lists service "${service}" twice.`);
      }
      services.add(service);
    }
    if (profile.neverDoes.length === 0 || profile.neverDoes.some((s) => typeof s !== 'string' || s.trim() === '')) {
      throw new Error(`Execution agent profile "${profile.id}" must state its hard boundaries.`);
    }
  }
  // Exact identity, not just a syntactically valid id: DOS-AGT-001A ships
  // precisely the coding-coordinator, and a cast cannot smuggle another.
  if (profiles[0].id !== 'coding-coordinator') {
    throw new Error('Execution agent registry must contain exactly the "coding-coordinator" profile.');
  }
  return profiles;
}

/** Deep-freeze a profile so neither it nor its nested arrays can be mutated. */
function freezeProfile(profile: ExecutionAgentProfile): ExecutionAgentProfile {
  Object.freeze(profile.allowedServices);
  Object.freeze(profile.neverDoes);
  return Object.freeze(profile);
}

export const CODING_COORDINATOR: ExecutionAgentProfile = freezeProfile({
  id: 'coding-coordinator',
  name: 'DavidOS Coding Coordinator',
  icon: '🧭',
  purpose:
    'Tracks supervised coding work as bounded execution records and renders a ' +
    'copyable execution packet for the external service that actually does the work.',
  supervisionStatement:
    'Local-only supervised coordinator. DavidOS never sends or executes anything — ' +
    'it only records and copies instructions for work David runs himself in ' +
    'Claude Code, Codex, Gemini, Antigravity, or a manual coding service.',
  allowedServices: ['claude_code', 'codex', 'gemini', 'antigravity', 'manual'],
  neverDoes: [
    'Call an AI provider or any external API',
    'Execute shell commands',
    'Perform coding work itself',
    'Create commits or branches, push, open pull requests, or mutate GitHub',
    'Access credentials, tokens, or secrets',
    'Run background jobs or scheduled work',
    'Connect external services or use network integrations',
    'Spend money',
    'Merge or deploy autonomously',
    'Expand its own authority',
  ],
} satisfies ExecutionAgentProfile);

export const EXECUTION_AGENTS: readonly ExecutionAgentProfile[] = Object.freeze(
  validateExecutionAgentRegistry(Object.freeze([CODING_COORDINATOR])),
);

export function getExecutionAgent(id: ExecutionAgentId | string): ExecutionAgentProfile | undefined {
  return EXECUTION_AGENTS.find((a) => a.id === id);
}
