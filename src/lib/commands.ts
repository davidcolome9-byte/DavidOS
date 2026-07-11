import type { Command } from './types';
import { getWorkflow } from './workflows/workflowRegistry';

export interface DomainWorkflowRoute {
  domain: string;
  workflowId: string;
  aliases: string[];
}

export const DOMAIN_WORKFLOW_ROUTES: DomainWorkflowRoute[] = [
  { domain: 'Universal Operations', workflowId: 'universal-operations-review', aliases: ['ops', 'operations', 'core', 'davidos core'] },
  { domain: 'Daily Command', workflowId: 'daily-brief', aliases: ['daily', 'today', 'command'] },
  { domain: 'Fitness', workflowId: 'fitness-handoff', aliases: ['operation david', 'health', 'training'] },
  { domain: 'Work', workflowId: 'work-teachback', aliases: ['fraud', 'cyber', 'cybersecurity', 'teachback'] },
  { domain: 'Prompt Vault', workflowId: 'prompt-improvement', aliases: ['prompt', 'prompts'] },
  { domain: 'Calendar Planning', workflowId: 'weekly-review', aliases: ['calendar', 'planning', 'weekly'] },
  { domain: 'Life Admin', workflowId: 'life-admin-checklist', aliases: ['home', 'dogs', 'house'] },
  { domain: 'Content Assets', workflowId: 'content-asset-planner', aliases: ['content', 'assets', 'side income'] },
];

function normalizeRouteText(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function resolveDomainWorkflowRoute(input: string): DomainWorkflowRoute | null {
  const normalized = normalizeRouteText(input);
  if (!normalized) return null;

  const route = DOMAIN_WORKFLOW_ROUTES.find((candidate) => {
    const terms = [candidate.domain, ...candidate.aliases];
    return terms.some((term) => normalizeRouteText(term) === normalized);
  });

  return route && getWorkflow(route.workflowId) ? route : null;
}

/**
 * Slash commands — hidden power-user shortcuts behind the button UI.
 * target 'nav:/path' navigates; 'wf:id' opens the workflow runner
 * with that workflow preselected.
 */
export const COMMANDS: Command[] = [
  { slash: '/os status', label: 'OS Status', description: 'Show the DavidOS status dashboard', target: 'nav:/' },
  { slash: '/os route', label: 'Route input', description: 'Classify text into the right agent', target: 'route' },
  { slash: '/ops-review', label: 'Universal operations review', description: 'Run the universal operations review workflow', target: 'wf:universal-operations-review' },
  { slash: '/capture', label: 'Capture inbox', description: 'Process generic capture inbox items through Universal Operations', target: 'wf:universal-operations-review' },
  { slash: '/waiting', label: 'Waiting on user', description: 'Review items waiting on the user', target: 'wf:universal-operations-review' },
  { slash: '/autonomous', label: 'Autonomous work', description: 'Review ready autonomous work and blockers', target: 'wf:universal-operations-review' },
  { slash: '/route', label: 'Route domain', description: 'Open the registered workflow for a known domain', target: 'domain-route' },
  { slash: '/brief', label: 'Daily brief', description: 'Generate today’s command brief', target: 'wf:daily-brief' },
  { slash: '/fitness', label: 'Fitness handoff', description: 'Operation David fitness handoff', target: 'wf:fitness-handoff' },
  { slash: '/work', label: 'Work teachback', description: 'Work / fraud / cyber teachback builder', target: 'wf:work-teachback' },
  { slash: '/project', label: 'Projects', description: 'Open the project vault', target: 'nav:/projects' },
  { slash: '/prompt', label: 'Prompts', description: 'Open the prompt vault', target: 'nav:/prompts' },
  { slash: '/calendar', label: 'Planning', description: 'Open planning and reminders', target: 'nav:/planning' },
  { slash: '/home', label: 'Life admin', description: 'Dogs, home, and life admin checklist', target: 'wf:life-admin-checklist' },
  { slash: '/content', label: 'Content assets', description: 'Content / side-income asset planner', target: 'wf:content-asset-planner' },
  { slash: '/weekly', label: 'Weekly review', description: 'Run the weekly review workflow', target: 'wf:weekly-review' },
  { slash: '/handoff', label: 'Handoffs', description: 'View saved handoffs', target: 'nav:/logs?tab=handoffs' },
  { slash: '/review', label: 'Open loop review', description: 'Review open loops in planning', target: 'nav:/planning' },
  { slash: '/settings', label: 'Settings', description: 'Open settings, export/import, integrations', target: 'nav:/settings' },
];

/** Match input like "/brief" or "/os route some text" to a command. */
export function matchCommand(input: string): { command: Command; args: string } | null {
  const text = input.trim();
  if (!text.startsWith('/')) return null;
  // Longest slash first so "/os status" beats a hypothetical "/os".
  const sorted = [...COMMANDS].sort((a, b) => b.slash.length - a.slash.length);
  for (const command of sorted) {
    if (text === command.slash || text.startsWith(command.slash + ' ')) {
      return { command, args: text.slice(command.slash.length).trim() };
    }
  }
  return null;
}
