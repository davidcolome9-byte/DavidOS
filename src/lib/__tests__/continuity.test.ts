import { describe, expect, it } from 'vitest';
import { getPriorHandoffs, buildPrompt, deleteHandoff, normalizeHandoffRelationships, hasCorrections } from '../workflows/continuity';
import type { Handoff, HealthFitnessProfile, Workflow } from '../types';

const mkHandoff = (over: Partial<Handoff>): Handoff => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  agentId: 'fitness',
  workflowId: 'fitness-handoff',
  workflowName: 'Fitness Handoff',
  inputSummary: 'x',
  outputStyle: 'AI handoff',
  content: 'calories 2000 protein 185',
  risk: 'draft_only',
  createdAt: '2026-07-01T10:00:00.000Z',
  ...over,
});

const fitnessWf: Workflow = {
  id: 'fitness-handoff', agentId: 'fitness', name: 'Fitness Handoff',
  description: 'fitness', inputHint: '', outputStyles: ['AI handoff'],
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

describe('correction-relationship integrity (Priority 4)', () => {
  const orig = () => mkHandoff({ id: 'orig', status: 'superseded', createdAt: '2026-06-01T10:00:00.000Z' });
  const corr = (over: Partial<Handoff> = {}) => mkHandoff({ id: 'fix', status: 'correction', correctsHandoffId: 'orig', createdAt: '2026-06-02T10:00:00.000Z', ...over });
  const unrelated = () => mkHandoff({ id: 'other', workflowId: 'daily-brief', createdAt: '2026-06-03T10:00:00.000Z' });

  it('deletes an uncorrected handoff and leaves the rest untouched', () => {
    const list = [mkHandoff({ id: 'a' }), unrelated()];
    const after = deleteHandoff(list, 'a');
    expect(after.map((h) => h.id)).toEqual(['other']);
  });

  it('deleting an original keeps its correction as a standalone active entry (no cascade)', () => {
    const after = deleteHandoff([orig(), corr(), unrelated()], 'orig');
    const fix = after.find((h) => h.id === 'fix')!;
    expect(after.some((h) => h.id === 'orig')).toBe(false); // original gone
    expect(fix).toBeDefined();                              // correction NOT cascaded
    expect(fix.status).toBe('active');                      // demoted from correction
    expect(fix.correctsHandoffId).toBeUndefined();          // dangling pointer cleared
    expect(after.find((h) => h.id === 'other')!.status).toBeUndefined(); // unrelated untouched
  });

  it('deleting a correction restores the original to active (not superseded)', () => {
    const after = deleteHandoff([orig(), corr()], 'fix');
    expect(after.some((h) => h.id === 'fix')).toBe(false);
    expect(after.find((h) => h.id === 'orig')!.status).toBe('active');
  });

  it('a correction chain (orig→c1→c2) preserves a valid newest correction on delete', () => {
    const chain: Handoff[] = [
      mkHandoff({ id: 'orig', status: 'superseded', createdAt: '2026-06-01T10:00:00.000Z' }),
      mkHandoff({ id: 'c1', status: 'superseded', correctsHandoffId: 'orig', createdAt: '2026-06-02T10:00:00.000Z' }),
      mkHandoff({ id: 'c2', status: 'correction', correctsHandoffId: 'c1', createdAt: '2026-06-03T10:00:00.000Z' }),
    ];
    // Delete newest correction c2 → c1 is no longer superseded but still corrects orig.
    const afterC2 = deleteHandoff(chain, 'c2');
    expect(afterC2.find((h) => h.id === 'c1')!.status).toBe('correction');
    expect(afterC2.find((h) => h.id === 'orig')!.status).toBe('superseded');
    // Delete the middle c1 → c2 orphaned (repaired to active), orig restored.
    const afterC1 = deleteHandoff(chain, 'c1');
    expect(afterC1.find((h) => h.id === 'c2')!.status).toBe('active');
    expect(afterC1.find((h) => h.id === 'c2')!.correctsHandoffId).toBeUndefined();
    expect(afterC1.find((h) => h.id === 'orig')!.status).toBe('active');
  });

  it('normalization repairs an orphaned correction at import/boot', () => {
    // A correction whose original is absent (corrupt/partial backup).
    const repaired = normalizeHandoffRelationships([corr()]);
    expect(repaired[0].status).toBe('active');
    expect(repaired[0].correctsHandoffId).toBeUndefined();
  });

  it('normalization is idempotent (reload preserves valid relationships)', () => {
    const once = normalizeHandoffRelationships([orig(), corr()]);
    const twice = normalizeHandoffRelationships(once);
    expect(twice).toEqual(once);
    expect(once.find((h) => h.id === 'orig')!.status).toBe('superseded');
    expect(once.find((h) => h.id === 'fix')!.status).toBe('correction');
  });

  it('retrieval prefers the surviving entry after deletion', () => {
    // Delete the correction → the restored original is retrieved (not a ghost).
    const after = deleteHandoff([orig(), corr()], 'fix');
    const got = getPriorHandoffs(after, 'fitness-handoff', 3);
    expect(got.map((h) => h.id)).toEqual(['orig']);
    // Delete the original → the correction survives and is retrieved.
    const after2 = deleteHandoff([orig(), corr()], 'orig');
    const got2 = getPriorHandoffs(after2, 'fitness-handoff', 3);
    expect(got2.map((h) => h.id)).toEqual(['fix']);
  });

  it('hasCorrections detects an original that owns a correction', () => {
    const list = [orig(), corr()];
    expect(hasCorrections(list, 'orig')).toBe(true);
    expect(hasCorrections(list, 'fix')).toBe(false);
  });
});

describe('buildPrompt', () => {
  const history = [
    mkHandoff({ id: 'p1', content: '2026-07-01 calories 1950 protein 190 steps 8000', createdAt: '2026-07-01T10:00:00.000Z' }),
    mkHandoff({ id: 'p2', content: '2026-07-02 calories 2050 protein 185 steps 9000', createdAt: '2026-07-02T10:00:00.000Z' }),
  ];

  it('orders sections: New Entry, Profile, Prior Context, Instructions', () => {
    const b = buildPrompt({
      workflow: fitnessWf, input: 'today: calories 2100 protein 197', style: 'AI handoff',
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
      workflow: fitnessWf, input: 'today: calories 2100', style: 'AI handoff',
      allHandoffs: history, profileBlock: 'PROFILE-BLOCK-CONTENT',
    });
    expect(b.currentOnly).toBe('today: calories 2100');
    expect(b.currentOnly).not.toContain('PROFILE-BLOCK-CONTENT');
    expect(b.currentOnly).not.toContain('Prior');
  });

  it('fitness workflows include dashboard instructions', () => {
    const b = buildPrompt({ workflow: fitnessWf, input: 'x', style: 'AI handoff', allHandoffs: history });
    expect(b.fullPrompt).toContain('## Fitness Dashboard Analysis');
    expect(b.fullPrompt).toContain('Never recommend medication');
  });

  it('adds a macro target snapshot when current nutrition and profile targets are available', () => {
    const b = buildPrompt({
      workflow: fitnessWf,
      input: 'Midday screenshot: 1240 kcal, protein 112g, carbs 130g, fat 62g, fiber 12g',
      style: 'AI handoff',
      allHandoffs: [],
      profileBlock: 'PROFILE-BLOCK-CONTENT',
      healthProfile,
    });
    expect(b.fullPrompt).toContain('## Macro Target Snapshot');
    expect(b.fullPrompt).toContain('Protein: floor 190g | current 112g | remaining 78g');
    expect(b.fullPrompt).toContain('MacroPilot-style correction cues');
  });

  it('says so when no profile targets are available on a fitness workflow', () => {
    const b = buildPrompt({ workflow: fitnessWf, input: 'x', style: 'AI handoff', allHandoffs: [] });
    expect(b.fullPrompt).toContain('No saved Health Profile targets were available');
  });

  it('general workflows omit the profile section entirely', () => {
    const b = buildPrompt({ workflow: generalWf, input: 'teachback notes', style: 'One-pager', allHandoffs: [] });
    expect(b.fullPrompt).not.toContain('## Personal Targets / Regimen Context');
  });

  it('reports helper text with counts', () => {
    const b = buildPrompt({ workflow: fitnessWf, input: 'x', style: 'AI handoff', allHandoffs: history });
    expect(b.helperText).toContain('2 prior handoffs included');
    expect(b.helperText).toContain('Health & Fitness history mode');
    const empty = buildPrompt({ workflow: fitnessWf, input: 'x', style: 'AI handoff', allHandoffs: [] });
    expect(empty.helperText).toBe('No prior saved handoffs found · Current handoff only');
  });

  it('identical inputs produce identical hashes (bar the date stamp)', () => {
    const a = buildPrompt({ workflow: generalWf, input: 'same', style: 'One-pager', allHandoffs: [] });
    const b = buildPrompt({ workflow: generalWf, input: 'same', style: 'One-pager', allHandoffs: [] });
    expect(a.promptHash).toBe(b.promptHash);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{8} · [\d,]+ chars$/);
  });

  // DOS-WF-001R E: a clean-handoff workflow defaults to a clean handoff and only
  // escalates to analysis when the request explicitly asks for it.
  describe('clean handoff default vs analysis-on-request', () => {
    const cleanWf: Workflow = { ...fitnessWf, outputMode: 'clean_handoff_only' };

    it('stays a clean handoff for a plain logging request', () => {
      const b = buildPrompt({ workflow: cleanWf, input: 'today: calories 2100 protein 197', style: 'AI handoff', allHandoffs: [] });
      expect(b.outputMode).toBe('clean_handoff_only');
      expect(b.fullPrompt).not.toContain('give practical recommendations');
      expect(b.fullPrompt).not.toContain('## Fitness Dashboard Analysis');
    });

    it('escalates to analysis only when the request explicitly asks', () => {
      for (const input of ['analyze my recovery this week', 'give me recommendations on my macros', 'evaluate how I am doing']) {
        const b = buildPrompt({ workflow: cleanWf, input, style: 'AI handoff', allHandoffs: [] });
        expect(b.outputMode, input).toBe('analysis_recommendations');
        expect(b.fullPrompt, input).toContain('give practical recommendations');
      }
    });
  });
});

// DOS-WF-002A — canonical planning-state block insertion + zero-note building.
describe('buildPrompt — planning state (Current DavidOS State)', () => {
  const planningWf: Workflow = { ...generalWf, id: 'daily-brief', name: 'Daily Brief', stateContext: 'planning' };

  it('inserts "## Current DavidOS State" between New Entry and Prior Context', () => {
    const b = buildPrompt({
      workflow: planningWf, input: 'today notes', style: 'Command brief', allHandoffs: [],
      planningStateBlock: 'Priorities:\n1. Ship it',
    });
    const iNew = b.fullPrompt.indexOf('## New Entry to Analyze');
    const iState = b.fullPrompt.indexOf('## Current DavidOS State');
    const iPrior = b.fullPrompt.indexOf('## Prior Context for Analysis');
    expect(iState).toBeGreaterThan(iNew);
    expect(iPrior).toBeGreaterThan(iState);
    expect(b.fullPrompt).toContain('Priorities:\n1. Ship it');
  });

  it('omits the section entirely when no planning-state block is supplied', () => {
    const b = buildPrompt({ workflow: planningWf, input: 'today notes', style: 'Command brief', allHandoffs: [] });
    expect(b.fullPrompt).not.toContain('## Current DavidOS State');
  });

  it('insertion is caller-gated on the supplied block, matching the Health Profile precedent', () => {
    // buildPrompt() inserts whatever planningStateBlock is passed, the same
    // way it inserts whatever profileBlock is passed — WorkflowRunner is
    // responsible for only ever supplying one when workflow.stateContext is
    // set. This test documents that contract at the continuity.ts layer.
    const b = buildPrompt({
      workflow: generalWf, input: 'teachback notes', style: 'One-pager', allHandoffs: [],
      planningStateBlock: 'Priorities:\n1. Example',
    });
    expect(b.fullPrompt).toContain('## Current DavidOS State');
  });

  it('zero-note placeholder renders in New Entry instead of the generic marker', () => {
    const b = buildPrompt({
      workflow: planningWf, input: '', style: 'Command brief', allHandoffs: [],
      zeroNotePlaceholder: '(no additional notes for today)',
    });
    expect(b.currentOnly).toBe('(no additional notes for today)');
    expect(b.fullPrompt).not.toContain('no input provided');
  });

  it('typed input always wins over the zero-note placeholder', () => {
    const b = buildPrompt({
      workflow: planningWf, input: 'real notes', style: 'Command brief', allHandoffs: [],
      zeroNotePlaceholder: '(no additional notes for today)',
    });
    expect(b.currentOnly).toBe('real notes');
  });

  it('without a zeroNotePlaceholder, empty input still falls back to the generic marker', () => {
    const b = buildPrompt({ workflow: generalWf, input: '', style: 'One-pager', allHandoffs: [] });
    expect(b.currentOnly).toBe('(no input provided)');
  });
});
