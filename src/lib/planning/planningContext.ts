/**
 * Canonical, privacy-bounded planning-context source (DOS-WF-002A). Used by
 * both the Planning page (local, no-AI generation) and the Workflow Runner
 * (Daily Brief / Weekly Review AI-prompt building), so the two surfaces can
 * never drift apart.
 *
 * Approved fields ONLY: priority labels + ranks, active open-loop labels,
 * pending reminder labels + due info, project name/status/next action.
 * Never included: project notes, project area, Context Vault content,
 * Health Profile, audit-record content, artifact content, handoff content
 * or summaries, or any other app state.
 */
import type { AppState, ProjectStatus } from '../types';
import { sha256Hex, shortFingerprint } from '../utils/hash';

export type PlanningContextMode = 'planning' | 'weekly';

export interface PlanningPriorityItem {
  label: string;
  rank: number;
}

export interface PlanningOpenLoopItem {
  label: string;
}

export interface PlanningReminderItem {
  label: string;
  due: string;
}

export interface PlanningProjectItem {
  name: string;
  status: ProjectStatus;
  nextAction: string;
}

export interface PlanningContextCounts {
  priorities: number;
  openLoops: number;
  reminders: number;
  projects: number;
}

export interface PlanningContext {
  mode: PlanningContextMode;
  priorities: PlanningPriorityItem[];
  openLoops: PlanningOpenLoopItem[];
  reminders: PlanningReminderItem[];
  projects: PlanningProjectItem[];
  counts: PlanningContextCounts;
  /** True when every included collection is empty — nothing to show or insert. */
  empty: boolean;
}

/**
 * Build the approved-fields-only planning context from current local state.
 * `mode: 'planning'` selects active projects only (daily-brief window);
 * `mode: 'weekly'` selects active + paused (not-done) projects, matching the
 * existing weekly-review window.
 */
export function buildPlanningContext(state: AppState, mode: PlanningContextMode = 'planning'): PlanningContext {
  const priorities: PlanningPriorityItem[] = [...state.priorities]
    .sort((a, b) => a.rank - b.rank)
    .map((p) => ({ label: p.label, rank: p.rank }));

  const openLoops: PlanningOpenLoopItem[] = state.openLoops
    .filter((l) => l.status === 'open')
    .map((l) => ({ label: l.label }));

  const reminders: PlanningReminderItem[] = state.reminders
    .filter((r) => !r.done)
    .map((r) => ({ label: r.label, due: r.due }));

  const projectSource =
    mode === 'weekly'
      ? state.projects.filter((p) => p.status !== 'done')
      : state.projects.filter((p) => p.status === 'active');
  const projects: PlanningProjectItem[] = projectSource.map((p) => ({
    name: p.name,
    status: p.status,
    nextAction: p.nextAction,
  }));

  return {
    mode,
    priorities,
    openLoops,
    reminders,
    projects,
    counts: {
      priorities: priorities.length,
      openLoops: openLoops.length,
      reminders: reminders.length,
      projects: projects.length,
    },
    empty: priorities.length === 0 && openLoops.length === 0 && reminders.length === 0 && projects.length === 0,
  };
}

/** Convenience wrapper: the weekly-window planning context. */
export function buildWeeklyReviewContext(state: AppState): PlanningContext {
  return buildPlanningContext(state, 'weekly');
}

export interface RenderedPlanningStateBlock {
  text: string;
  hash?: string;
  fingerprint?: string;
  empty: boolean;
}

/**
 * Render the plain-text block inserted as "## Current DavidOS State" in
 * Workflow Runner prompts (and reusable anywhere else the same approved
 * fields need a flat rendering). Returns `empty: true` with no text when the
 * context has nothing to show — callers should omit the section entirely.
 */
export function renderPlanningStateBlock(context: PlanningContext): RenderedPlanningStateBlock {
  if (context.empty) return { text: '', empty: true };

  const lines: string[] = [];
  lines.push('Priorities:');
  if (context.priorities.length === 0) lines.push('- None set.');
  context.priorities.forEach((p) => lines.push(`${p.rank}. ${p.label}`));
  lines.push('');
  lines.push('Open loops:');
  if (context.openLoops.length === 0) lines.push('- None open.');
  context.openLoops.forEach((l) => lines.push(`- ${l.label}`));
  lines.push('');
  lines.push('Reminders:');
  if (context.reminders.length === 0) lines.push('- None pending.');
  context.reminders.forEach((r) => lines.push(`- ${r.label}${r.due ? ` (due ${r.due})` : ''}`));
  lines.push('');
  lines.push(context.mode === 'weekly' ? 'Projects (active or paused):' : 'Active projects:');
  if (context.projects.length === 0) lines.push('- None.');
  context.projects.forEach((p) => lines.push(`- ${p.name} (${p.status}) → ${p.nextAction || 'next action not set'}`));

  const text = lines.join('\n');
  return { text, hash: sha256Hex(text), fingerprint: shortFingerprint(text), empty: false };
}
