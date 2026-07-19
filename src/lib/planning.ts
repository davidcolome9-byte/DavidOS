import type { AppState } from './types';
import { buildPlanningContext, buildWeeklyReviewContext } from './planning/planningContext';

/** Compose the daily command brief from current local state. */
export function composeDailyBrief(state: AppState): string {
  const date = new Date().toDateString();
  const ctx = buildPlanningContext(state, 'planning');

  const lines: string[] = [];
  lines.push(`# Daily Command Brief — ${date}`);
  lines.push('');
  lines.push('## Top 3 priorities');
  ctx.priorities.slice(0, 3).forEach((p, i) => lines.push(`${i + 1}. ${p.label}`));
  lines.push('');
  lines.push('## Open loops');
  if (ctx.openLoops.length === 0) lines.push('- None. Clear board.');
  ctx.openLoops.forEach((l) => lines.push(`- ${l.label}`));
  lines.push('');
  lines.push('## Reminders');
  if (ctx.reminders.length === 0) lines.push('- None pending.');
  ctx.reminders.forEach((r) => lines.push(`- ${r.label}${r.due ? ` (due ${r.due})` : ''}`));
  lines.push('');
  lines.push('## Suggested next action');
  const next =
    ctx.projects.find((p) => p.nextAction)?.nextAction ??
    ctx.openLoops[0]?.label ??
    'Review priorities and pick one highest-leverage action.';
  lines.push(`- ${next}`);
  lines.push('');
  lines.push('## Risks');
  if (ctx.openLoops.length > 5) {
    lines.push(`- ${ctx.openLoops.length} open loops — consider closing or deferring some before adding more.`);
  } else {
    lines.push('- No overload detected.');
  }
  lines.push('');
  lines.push('## Deferred');
  ctx.priorities.slice(3).forEach((p) => lines.push(`- ${p.label}`));
  if (ctx.priorities.length <= 3) lines.push('- Nothing explicitly deferred.');
  return lines.join('\n');
}

/** Compose a weekly review scaffold from current local state. */
export function composeWeeklyReview(state: AppState): string {
  const ctx = buildWeeklyReviewContext(state);
  const lines: string[] = [];
  lines.push(`# Weekly Review — week of ${new Date().toDateString()}`);
  lines.push('');
  lines.push('## What moved this week');
  lines.push('- (fill in)');
  lines.push('');
  lines.push('## Open loops to resolve or defer');
  ctx.openLoops.forEach((l) => lines.push(`- [ ] ${l.label}`));
  lines.push('');
  lines.push('## Active projects and next actions');
  ctx.projects.forEach((p) => lines.push(`- ${p.name} → ${p.nextAction || 'define next action'}`));
  lines.push('');
  lines.push('## Next week: top 3');
  lines.push('1. ');
  lines.push('2. ');
  lines.push('3. ');
  return lines.join('\n');
}
