import { describe, expect, it } from 'vitest';
import { computeStyleSync } from '../workflows/styleSync';
import { resolveLogsTab, isLogsTab } from '../workflows/logsTabs';
import { getWorkflow } from '../workflows/workflowRegistry';

const handoff = getWorkflow('fitness-handoff')!;
const weekly = getWorkflow('weekly-review')!;
const defaultStyle = handoff.outputStyles[0];
const otherStyle = handoff.outputStyles[1];

describe('computeStyleSync (Phase 1G)', () => {
  it('switching workflows syncs to the new workflow default and invalidates', () => {
    const d = computeStyleSync({
      wf: weekly, requestedStyle: null,
      currentWorkflowId: 'fitness-handoff', currentStyle: otherStyle,
      lastStyleParam: null,
    });
    expect(d.workflowChanged).toBe(true);
    expect(d.nextStyle).toBe(weekly.outputStyles[0]);
    expect(d.shouldSetStyle).toBe(true);
    expect(d.shouldInvalidate).toBe(true);
  });

  it('switching workflows cannot retain an invalid previous style', () => {
    // otherStyle belongs to the handoff, not to weekly-review.
    const d = computeStyleSync({
      wf: weekly, requestedStyle: otherStyle,
      currentWorkflowId: 'fitness-handoff', currentStyle: otherStyle,
      lastStyleParam: otherStyle,
    });
    expect(weekly.outputStyles).not.toContain(otherStyle);
    expect(d.nextStyle).toBe(weekly.outputStyles[0]); // fell back to default
  });

  it('a present style param that differs is applied', () => {
    const d = computeStyleSync({
      wf: handoff, requestedStyle: otherStyle,
      currentWorkflowId: 'fitness-handoff', currentStyle: defaultStyle,
      lastStyleParam: null,
    });
    expect(d.shouldSetStyle).toBe(true);
    expect(d.nextStyle).toBe(otherStyle);
  });

  it('a present style param equal to the current style is a no-op', () => {
    const d = computeStyleSync({
      wf: handoff, requestedStyle: otherStyle,
      currentWorkflowId: 'fitness-handoff', currentStyle: otherStyle,
      lastStyleParam: otherStyle,
    });
    expect(d.shouldSetStyle).toBe(false);
    expect(d.shouldInvalidate).toBe(false);
  });

  it('removing the style param restores the workflow default', () => {
    const d = computeStyleSync({
      wf: handoff, requestedStyle: null,
      currentWorkflowId: 'fitness-handoff', currentStyle: otherStyle,
      lastStyleParam: otherStyle, // it was present before → now removed
    });
    expect(d.shouldSetStyle).toBe(true);
    expect(d.nextStyle).toBe(defaultStyle);
  });

  it('no style param on a same-workflow input navigation does not reset a manual pick', () => {
    // style was never in the URL (lastStyleParam null), so a manual local pick
    // (currentStyle=otherStyle) is preserved — not overwritten.
    const d = computeStyleSync({
      wf: handoff, requestedStyle: null,
      currentWorkflowId: 'fitness-handoff', currentStyle: otherStyle,
      lastStyleParam: null,
    });
    expect(d.shouldSetStyle).toBe(false);
    expect(d.shouldInvalidate).toBe(false);
  });
});

describe('resolveLogsTab (Phase 1G)', () => {
  it('accepts each valid tab', () => {
    for (const t of ['audit', 'handoffs', 'artifacts'] as const) {
      expect(resolveLogsTab(t)).toBe(t);
      expect(isLogsTab(t)).toBe(true);
    }
  });
  it('falls back to audit for missing/invalid values', () => {
    expect(resolveLogsTab(null)).toBe('audit');
    expect(resolveLogsTab(undefined)).toBe('audit');
    expect(resolveLogsTab('nope')).toBe('audit');
    expect(isLogsTab('nope')).toBe(false);
  });
});
