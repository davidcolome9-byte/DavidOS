import type { AppState } from './types';

/** Compose the daily command brief from current local state. */
export function composeDailyBrief(state: AppState): string {
  const date = new Date().toDateString();
  const priorities = [...state.priorities].sort((a, b) => a.rank - b.rank);
  const openLoops = state.openLoops.filter((l) => l.status === 'open');
  const reminders = state.reminders.filter((r) => !r.done);
  const activeProjects = state.projects.filter((p) => p.status === 'active');

  const lines: string[] = [];
  lines.push(`# Daily Command Brief — ${date}`);
  lines.push('');
  lines.push('## Top 3 priorities');
  priorities.slice(0, 3).forEach((p, i) => lines.push(`${i + 1}. ${p.label}`));
  lines.push('');
  lines.push('## Open loops');
  if (openLoops.length === 0) lines.push('- None. Clear board.');
  openLoops.forEach((l) => lines.push(`- ${l.label}`));
  lines.push('');
  lines.push('## Reminders');
  if (reminders.length === 0) lines.push('- None pending.');
  reminders.forEach((r) => lines.push(`- ${r.label}${r.due ? ` (due ${r.due})` : ''}`));
  lines.push('');
  lines.push('## Suggested next action');
  const next =
    activeProjects.find((p) => p.nextAction)?.nextAction ??
    openLoops[0]?.label ??
    'Review priorities and pick one highest-leverage action.';
  lines.push(`- ${next}`);
  lines.push('');
  lines.push('## Risks');
  if (openLoops.length > 5) {
    lines.push(`- ${openLoops.length} open loops — consider closing or deferring some before adding more.`);
  } else {
    lines.push('- No overload detected.');
  }
  lines.push('');
  lines.push('## Deferred');
  priorities.slice(3).forEach((p) => lines.push(`- ${p.label}`));
  if (priorities.length <= 3) lines.push('- Nothing explicitly deferred.');
  return lines.join('\n');
}

/** Compose a weekly review scaffold from current local state. */
export function composeWeeklyReview(state: AppState): string {
  const openLoops = state.openLoops.filter((l) => l.status === 'open');
  const projects = state.projects.filter((p) => p.status !== 'done');
  const lines: string[] = [];
  lines.push(`# Weekly Review — week of ${new Date().toDateString()}`);
  lines.push('');
  lines.push('## What moved this week');
  lines.push('- (fill in)');
  lines.push('');
  lines.push('## Open loops to resolve or defer');
  openLoops.forEach((l) => lines.push(`- [ ] ${l.label}`));
  lines.push('');
  lines.push('## Active projects and next actions');
  projects.forEach((p) => lines.push(`- ${p.name} → ${p.nextAction || 'define next action'}`));
  lines.push('');
  lines.push('## Next week: top 3');
  lines.push('1. ');
  lines.push('2. ');
  lines.push('3. ');
  return lines.join('\n');
}
