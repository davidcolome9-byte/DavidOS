import { describe, expect, it } from 'vitest';
import { buildDefaultState } from '../../data/defaultState';
import { buildPlanningContext, buildWeeklyReviewContext, renderPlanningStateBlock } from '../planning/planningContext';
import type { AppState, Project } from '../types';

const NOTES_MARKER = 'MARKER-PROJECT-NOTES-7f3a';
const AREA_MARKER = 'MARKER-PROJECT-AREA-9c1b';

function baseState(): AppState {
  return buildDefaultState();
}

function withProjects(state: AppState, projects: Project[]): AppState {
  return { ...state, projects };
}

const mkProject = (over: Partial<Project>): Project => ({
  id: over.id ?? 'p1',
  name: over.name ?? 'Project',
  status: over.status ?? 'active',
  area: over.area ?? AREA_MARKER,
  nextAction: over.nextAction ?? 'Do the thing',
  notes: over.notes ?? NOTES_MARKER,
  relatedPrompts: [],
  relatedWorkflows: [],
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

describe('buildPlanningContext — approved fields only', () => {
  it('includes priority labels and ranks, sorted by rank', () => {
    const state = baseState();
    const ctx = buildPlanningContext(state, 'planning');
    expect(ctx.priorities.length).toBe(state.priorities.length);
    expect(ctx.priorities).toEqual(
      [...state.priorities].sort((a, b) => a.rank - b.rank).map((p) => ({ label: p.label, rank: p.rank })),
    );
  });

  it('includes only open loops (excludes done)', () => {
    const state = baseState();
    const doneId = state.openLoops[0].id;
    const withDone = {
      ...state,
      openLoops: state.openLoops.map((l) => (l.id === doneId ? { ...l, status: 'done' as const } : l)),
    };
    const ctx = buildPlanningContext(withDone, 'planning');
    expect(ctx.openLoops.length).toBe(state.openLoops.length - 1);
    expect(ctx.openLoops.some((l) => l.label === state.openLoops.find((o) => o.id === doneId)!.label)).toBe(false);
  });

  it('includes only pending reminders (excludes done) with label + due', () => {
    const state = baseState();
    const doneId = state.reminders[0].id;
    const withDone = {
      ...state,
      reminders: state.reminders.map((r) => (r.id === doneId ? { ...r, done: true } : r)),
    };
    const ctx = buildPlanningContext(withDone, 'planning');
    expect(ctx.reminders.length).toBe(state.reminders.length - 1);
    expect(ctx.reminders.every((r) => 'label' in r && 'due' in r)).toBe(true);
  });

  it('planning mode includes only active projects; excludes paused and done', () => {
    const state = withProjects(baseState(), [
      mkProject({ id: 'a', name: 'Active proj', status: 'active' }),
      mkProject({ id: 'b', name: 'Paused proj', status: 'paused' }),
      mkProject({ id: 'c', name: 'Done proj', status: 'done' }),
    ]);
    const ctx = buildPlanningContext(state, 'planning');
    expect(ctx.projects.map((p) => p.name)).toEqual(['Active proj']);
  });

  it('weekly mode includes active + paused projects; excludes done', () => {
    const state = withProjects(baseState(), [
      mkProject({ id: 'a', name: 'Active proj', status: 'active' }),
      mkProject({ id: 'b', name: 'Paused proj', status: 'paused' }),
      mkProject({ id: 'c', name: 'Done proj', status: 'done' }),
    ]);
    const ctx = buildWeeklyReviewContext(state);
    expect(ctx.projects.map((p) => p.name).sort()).toEqual(['Active proj', 'Paused proj']);
  });

  it('project fields are limited to name/status/nextAction (no notes/area on the item)', () => {
    const state = withProjects(baseState(), [mkProject({ id: 'a', name: 'Proj' })]);
    const ctx = buildPlanningContext(state, 'planning');
    expect(ctx.projects[0]).toEqual({ name: 'Proj', status: 'active', nextAction: 'Do the thing' });
    expect(Object.keys(ctx.projects[0])).not.toContain('notes');
    expect(Object.keys(ctx.projects[0])).not.toContain('area');
  });

  it('reports accurate counts', () => {
    const state = baseState();
    const ctx = buildPlanningContext(state, 'planning');
    expect(ctx.counts).toEqual({
      priorities: ctx.priorities.length,
      openLoops: ctx.openLoops.length,
      reminders: ctx.reminders.length,
      projects: ctx.projects.length,
    });
  });

  it('is empty only when every collection is empty', () => {
    const empty: AppState = {
      ...baseState(),
      priorities: [],
      openLoops: [],
      reminders: [],
      projects: [],
    };
    expect(buildPlanningContext(empty, 'planning').empty).toBe(true);
    expect(buildPlanningContext(baseState(), 'planning').empty).toBe(false);
  });
});

describe('buildPlanningContext — privacy boundary (marker-string tests)', () => {
  it('never leaks project notes or area into the built context or rendered block', () => {
    const state = withProjects(baseState(), [mkProject({ id: 'a', name: 'Proj' })]);
    const ctx = buildPlanningContext(state, 'planning');
    const rendered = renderPlanningStateBlock(ctx);
    const serializedContext = JSON.stringify(ctx);
    expect(serializedContext).not.toContain(NOTES_MARKER);
    expect(serializedContext).not.toContain(AREA_MARKER);
    expect(rendered.text).not.toContain(NOTES_MARKER);
    expect(rendered.text).not.toContain(AREA_MARKER);
  });
});

describe('renderPlanningStateBlock', () => {
  it('renders priorities, open loops, reminders, and projects with a hash + fingerprint', () => {
    const ctx = buildPlanningContext(baseState(), 'planning');
    const block = renderPlanningStateBlock(ctx);
    expect(block.empty).toBe(false);
    expect(block.text).toContain('Priorities:');
    expect(block.text).toContain('Open loops:');
    expect(block.text).toContain('Reminders:');
    expect(block.text).toContain('Active projects:');
    expect(block.hash).toBeTruthy();
    expect(block.fingerprint).toMatch(/^[0-9a-f]{8} · [\d,]+ chars$/);
  });

  it('returns empty text when the context is empty', () => {
    const empty: AppState = { ...baseState(), priorities: [], openLoops: [], reminders: [], projects: [] };
    const block = renderPlanningStateBlock(buildPlanningContext(empty, 'planning'));
    expect(block.empty).toBe(true);
    expect(block.text).toBe('');
  });

  it('fingerprint/hash changes when priorities change', () => {
    const state = baseState();
    const before = renderPlanningStateBlock(buildPlanningContext(state, 'planning'));
    const changed = { ...state, priorities: [{ id: 'x', label: 'New priority', rank: 1 }] };
    const after = renderPlanningStateBlock(buildPlanningContext(changed, 'planning'));
    expect(after.hash).not.toBe(before.hash);
  });

  it('fingerprint/hash changes when open loops change', () => {
    const state = baseState();
    const before = renderPlanningStateBlock(buildPlanningContext(state, 'planning'));
    const changed = { ...state, openLoops: [...state.openLoops, { id: 'new', label: 'New loop', status: 'open' as const, createdAt: '2026-07-01T00:00:00.000Z' }] };
    const after = renderPlanningStateBlock(buildPlanningContext(changed, 'planning'));
    expect(after.hash).not.toBe(before.hash);
  });

  it('fingerprint/hash changes when reminders change', () => {
    const state = baseState();
    const before = renderPlanningStateBlock(buildPlanningContext(state, 'planning'));
    const changed = { ...state, reminders: [...state.reminders, { id: 'new', label: 'New reminder', due: 'Fri', done: false }] };
    const after = renderPlanningStateBlock(buildPlanningContext(changed, 'planning'));
    expect(after.hash).not.toBe(before.hash);
  });

  it('fingerprint/hash changes when projects change', () => {
    const state = withProjects(baseState(), [mkProject({ id: 'a', name: 'Proj A' })]);
    const before = renderPlanningStateBlock(buildPlanningContext(state, 'planning'));
    const changed = withProjects(state, [mkProject({ id: 'a', name: 'Proj B' })]);
    const after = renderPlanningStateBlock(buildPlanningContext(changed, 'planning'));
    expect(after.hash).not.toBe(before.hash);
  });
});
