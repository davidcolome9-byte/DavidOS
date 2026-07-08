import type { Command } from './types';

/**
 * Slash commands — hidden power-user shortcuts behind the button UI.
 * target 'nav:/path' navigates; 'wf:id' opens the workflow runner
 * with that workflow preselected.
 */
export const COMMANDS: Command[] = [
  { slash: '/os status', label: 'OS Status', description: 'Show the DavidOS status dashboard', target: 'nav:/' },
  { slash: '/os route', label: 'Route input', description: 'Classify text into the right agent', target: 'route' },
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
