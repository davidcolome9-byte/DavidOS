import { describe, expect, it } from 'vitest';
import { scoreFitnessHealth, resolveCategory, resolveHistoryProfile, historyTargetCount, resolveOutputMode } from '../workflows/workflowMeta';
import type { Workflow } from '../types';

const wf = (over: Partial<Workflow>): Workflow => ({
  id: 'test', agentId: 'daily_command', name: 'Test', description: '', inputHint: '',
  outputStyles: ['x'], risk: 'draft_only', assumptions: [], nextAction: '', template: '',
  ...over,
});

describe('workflow metadata resolution', () => {
  it('explicit category and historyProfile win over keywords', () => {
    const w = wf({ name: 'Workout macros fitness', category: 'general', historyProfile: 'default' });
    expect(resolveCategory(w)).toBe('general');
    expect(resolveHistoryProfile(w)).toBe('default');
  });

  it('keyword fallback upgrades clearly fitness workflows', () => {
    const w = wf({ name: 'Morning log', description: 'Track workout, macros, and protein for recomp' });
    expect(resolveCategory(w)).toBe('fitness_health');
    expect(historyTargetCount(resolveHistoryProfile(w))).toBe(7);
    expect(resolveOutputMode(w)).toBe('dashboard_full_analysis');
  });

  it('weak single terms do not create false positives', () => {
    const w = wf({ name: 'Weekly review', description: 'Plan the week, check energy and stress levels' });
    expect(resolveCategory(w)).toBe('general');
    expect(historyTargetCount(resolveHistoryProfile(w))).toBe(3);
  });

  it('scoring: 1 strong + 2 medium upgrades', () => {
    const s = scoreFitnessHealth('fitness log with sleep and steps');
    expect(s.isFitnessHealth).toBe(true);
  });

  it('scoring: 2 strong upgrades', () => {
    const s = scoreFitnessHealth('nutrition and training notes');
    expect(s.isFitnessHealth).toBe(true);
  });
});
