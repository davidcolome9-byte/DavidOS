import { describe, expect, it } from 'vitest';
import { getPriorHandoffs, buildPrompt } from '../workflows/continuity';
import type { Handoff, HealthFitnessProfile, Workflow } from '../types';

const mkHandoff = (over: Partial<Handoff>): Handoff => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  agentId: 'fitness',
  workflowId: 'fitness-handoff',
  workflowName: 'Fitness Handoff',
  inputSummary: 'x',
  outputStyle: 'Claude handoff',
  content: 'calories 2000 protein 185',
  risk: 'draft_only',
  createdAt: '2026-07-01T10:00:00.000Z',
  ...over,
});

const fitnessWf: Workflow = {
  id: 'fitness-handoff', agentId: 'fitness', name: 'Fitness Handoff',
  description: 'fitness', inputHint: '', outputStyles: ['Claude handoff'],
  risk: 'draft_only', assumptions: [], nextAction: 'copy it',
  template: 'Clean {{input}} in style {{style}} on {{date}}',
  category: 'fitness_health', historyProfile: 'fitness_health', outputMode: 'dashboard_full_analysis',
};

const generalWf: Workflow = {
  ...fitnessWf, id: 'work-teachback', agentId: 'work_project', name: 'Work Teachback',
  category: 'work', historyProfile: 'default', outputMode: 'handoff_with_continuity_notes',
};

const healthProfile: HealthFitnessProfile = {
  id: 'hp',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z',
  nutritionTargets: {
    calories: 2000,
    proteinGrams: 190,
    fatGrams: 75,
    fiberGrams: 30,
    waterMl: 3000,
  },
};

describe('getPriorHandoffs', () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    mkHandoff({ id: `h${i}`, createdAt: `2026-06-${String(i + 1).padStart(2, '0')}T10:00:00.000Z` }),
  );

  it('only pulls the same workflow id', () => {
    const other = mkHandoff({ id: 'other', workflowId: 'daily-brief' });
    const got = getPriorHandoffs([...many, other], 'fitness-handoff', 7);
    expect(got.some((h) => h.id === 'other')).toBe(false);
  });

  it('trims to target count, newest first', () => {
    const got = getPriorHandoffs(many, 'fitness-handoff', 7);
    expect(got).toHaveLength(7);
    expect(got[0].id).toBe('h9');
  });

  it('default target of 3 works', () => {
    expect(getPriorHandoffs(many, 'fitness-handoff', 3)).toHaveLength(3);
  });

  it('excludes superseded; missing status counts as active', () => {
    const withSuperseded = [
      mkHandoff({ id: 'a', createdAt: '2026-06-01T10:00:00.000Z' }),
      mkHandoff({ id: 'b', status: 'superseded', createdAt: '2026-06-02T10:00:00.000Z' }),
      mkHandoff({ id: 'c', status: 'active', createdAt: '2026-06-03T10:00:00.000Z' }),
    ];
    const got = getPriorHandoffs(withSuperseded, 'fitness-handoff', 3);
    expect(got.map((h) => h.id)).toEqual(['c', 'a']);
  });

  it('correction-aware dedupe drops the corrected original', () => {
    const list = [
      mkHandoff({ id: 'orig', createdAt: '2026-06-01T10:00:00.000Z' }),
      mkHandoff({ id: 'fix', status: 'correction', correctsHandoffId: 'orig', createdAt: '2026-06-02T10:00:00.000Z' }),
    ];
    const got = getPriorHandoffs(list, 'fitness-handoff', 3);
    expect(got.map((h) => h.id)).toEqual(['fix']);
  });

  it('orders by reliable entryDate over savedAt', () => {
    const list = [
      mkHandoff({ id: 'late-entry', entryDate: '2026-06-20', dateConfidence: 'explicit', createdAt: '2026-06-01T10:00:00.000Z' }),
      mkHandoff({ id: 'early-entry', entryDate: '2026-06-05', dateConfidence: 'explicit', createdAt: '2026-06-25T10:00:00.000Z' }),
    ];
    const got = getPriorHandoffs(list, 'fitness-handoff', 3);
    expect(got[0].id).toBe('late-entry');
  });
});

describe('buildPrompt', () => {
  const history = [
    mkHandoff({ id: 'p1', content: '2026-07-01 calories 1950 protein 190 steps 8000', createdAt: '2026-07-01T10:00:00.000Z' }),
    mkHandoff({ id: 'p2', content: '2026-07-02 calories 2050 protein 185 steps 9000', createdAt: '2026-07-02T10:00:00.000Z' }),
  ];

  it('orders sections: New Entry, Profile, Prior Context, Instructions', () => {
    const b = buildPrompt({
      workflow: fitnessWf, input: 'today: calories 2100 protein 197', style: 'Claude handoff',
      allHandoffs: history, profileBlock: 'PROFILE-BLOCK-CONTENT',
    });
    const iNew = b.fullPrompt.indexOf('## New Entry to Analyze');
    const iProf = b.fullPrompt.indexOf('## Personal Targets / Regimen Context');
    const iPrior = b.fullPrompt.indexOf('## Prior Context for Analysis');
    const iInstr = b.fullPrompt.indexOf('## Analysis Instructions');
    expect(iNew).toBeGreaterThanOrEqual(0);
    expect(iProf).toBeGreaterThan(iNew);
    expect(iPrior).toBeGreaterThan(iProf);
    expect(iInstr).toBeGreaterThan(iPrior);
  });

  it('current-only output excludes history and profile', () => {
    const b = buildPrompt({
      workflow: fitnessWf, input: 'today: calories 2100', style: 'Claude handoff',
      allHandoffs: history, profileBlock: 'PROFILE-BLOCK-CONTENT',
    });
    expect(b.currentOnly).toBe('today: calories 2100');
    expect(b.currentOnly).not.toContain('PROFILE-BLOCK-CONTENT');
    expect(b.currentOnly).not.toContain('Prior');
  });

  it('fitness workflows include dashboard instructions', () => {
    const b = buildPrompt({ workflow: fitnessWf, input: 'x', style: 'Claude handoff', allHandoffs: history });
    expect(b.fullPrompt).toContain('## Fitness Dashboard Analysis');
    expect(b.fullPrompt).toContain('Never recommend medication');
  });

  it('adds a macro target snapshot when current nutrition and profile targets are available', () => {
    const b = buildPrompt({
      workflow: fitnessWf,
      input: 'Midday screenshot: 1240 kcal, protein 112g, carbs 130g, fat 62g, fiber 12g',
      style: 'Claude handoff',
      allHandoffs: [],
      profileBlock: 'PROFILE-BLOCK-CONTENT',
      healthProfile,
    });
    expect(b.fullPrompt).toContain('## Macro Target Snapshot');
    expect(b.fullPrompt).toContain('Protein: floor 190g | current 112g | remaining 78g');
    expect(b.fullPrompt).toContain('MacroPilot-style correction cues');
  });

  it('says so when no profile targets are available on a fitness workflow', () => {
    const b = buildPrompt({ workflow: fitnessWf, input: 'x', style: 'Claude handoff', allHandoffs: [] });
    expect(b.fullPrompt).toContain('No saved Health Profile targets were available');
  });

  it('general workflows omit the profile section entirely', () => {
    const b = buildPrompt({ workflow: generalWf, input: 'teachback notes', style: 'One-pager', allHandoffs: [] });
    expect(b.fullPrompt).not.toContain('## Personal Targets / Regimen Context');
  });

  it('reports helper text with counts', () => {
    const b = buildPrompt({ workflow: fitnessWf, input: 'x', style: 'Claude handoff', allHandoffs: history });
    expect(b.helperText).toContain('2 prior handoffs included');
    expect(b.helperText).toContain('Health & Fitness history mode');
    const empty = buildPrompt({ workflow: fitnessWf, input: 'x', style: 'Claude handoff', allHandoffs: [] });
    expect(empty.helperText).toBe('No prior saved handoffs found · Current handoff only');
  });

  it('identical inputs produce identical hashes (bar the date stamp)', () => {
    const a = buildPrompt({ workflow: generalWf, input: 'same', style: 'One-pager', allHandoffs: [] });
    const b = buildPrompt({ workflow: generalWf, input: 'same', style: 'One-pager', allHandoffs: [] });
    expect(a.promptHash).toBe(b.promptHash);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{8} · [\d,]+ chars$/);
  });
});
