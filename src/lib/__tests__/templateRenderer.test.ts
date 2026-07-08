import { describe, expect, it } from 'vitest';
import { renderTemplate, summarizeInput } from '../workflows/templateRenderer';
import { WORKFLOWS, getWorkflow } from '../workflows/workflowRegistry';
import { AGENTS } from '../agents/agentRegistry';

describe('templateRenderer', () => {
  it('fills input, style, and date placeholders', () => {
    const wf = getWorkflow('fitness-handoff')!;
    const out = renderTemplate(wf, 'bench 3x8 @ 60kg', 'Claude handoff');
    expect(out).toContain('bench 3x8 @ 60kg');
    expect(out).toContain('Claude handoff');
    expect(out).not.toContain('{{input}}');
    expect(out).not.toContain('{{style}}');
    expect(out).not.toContain('{{date}}');
  });

  it('handles empty input gracefully', () => {
    const wf = getWorkflow('daily-brief')!;
    expect(renderTemplate(wf, '   ', 'Command brief')).toContain('(no input provided)');
  });

  it('summarizes long input for audit entries', () => {
    const long = 'word '.repeat(50);
    const summary = summarizeInput(long);
    expect(summary.length).toBeLessThanOrEqual(90);
    expect(summary.endsWith('…')).toBe(true);
  });
});

describe('registries', () => {
  it('every agent has at least one workflow, and its default exists', () => {
    for (const agent of AGENTS) {
      const workflows = WORKFLOWS.filter((w) => w.agentId === agent.id);
      expect(workflows.length, `agent ${agent.id} has no workflows`).toBeGreaterThan(0);
      expect(getWorkflow(agent.defaultWorkflow), `default workflow of ${agent.id}`).toBeDefined();
    }
  });

  it('every workflow belongs to a real agent', () => {
    const agentIds = new Set(AGENTS.map((a) => a.id));
    for (const wf of WORKFLOWS) {
      expect(agentIds.has(wf.agentId), `workflow ${wf.id} → ${wf.agentId}`).toBe(true);
    }
  });
});
