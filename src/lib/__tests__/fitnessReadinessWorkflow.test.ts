import { describe, expect, it } from 'vitest';
import { getWorkflow, WORKFLOWS, resolveWorkflowOutputStyle, validateWorkflowRegistry } from '../workflows/workflowRegistry';
import { AGENTS } from '../agents/agentRegistry';

/**
 * Registry + schema locks for the fitness-readiness workflow. The seed JSON is
 * the source of truth; these tests assert it is registered, well-formed, points
 * at a real agent, and offers exactly one honest output style.
 */
describe('fitness-readiness workflow definition + registry', () => {
  const wf = getWorkflow('fitness-readiness');

  it('is registered exactly once', () => {
    expect(wf).toBeDefined();
    expect(WORKFLOWS.filter((w) => w.id === 'fitness-readiness')).toHaveLength(1);
  });

  it('has the required canonical fields', () => {
    expect(wf?.id).toBe('fitness-readiness');
    expect(wf?.agentId).toBe('fitness');
    expect(wf?.name).toBe('Training Readiness & Recovery');
    expect(wf?.category).toBe('fitness_health');
    expect(wf?.historyProfile).toBe('fitness_health');
    expect(wf?.outputMode).toBe('custom');
    expect(wf?.risk).toBe('draft_only');
  });

  it('references a real agent and passes registry validation', () => {
    expect(AGENTS.some((a) => a.id === wf?.agentId)).toBe(true);
    expect(() => validateWorkflowRegistry(WORKFLOWS)).not.toThrow();
  });

  it('offers exactly one Universal AI Prompt output style (no unnecessary variants)', () => {
    expect(wf?.outputStyles).toEqual(['Universal AI Prompt']);
    expect(resolveWorkflowOutputStyle(wf!, 'nonexistent')).toBe('Universal AI Prompt');
    expect(resolveWorkflowOutputStyle(wf!, null)).toBe('Universal AI Prompt');
  });

  it('describes the conservative six-way readiness decision without selecting a diagnosis', () => {
    const text = `${wf?.description} ${wf?.assumptions.join(' ')}`.toLowerCase();
    // The decision options are represented, and the safety contract is stated.
    expect(text).toContain('train as planned');
    expect(text).toContain('rest');
    expect(text).toContain('urgent');
    expect(text).toContain('decision support');
    // It must state the honesty boundary explicitly.
    expect(text).toContain('does not diagnose');
    expect(text).toContain('not a medical device');
  });

  it('template uses only whitelisted placeholders (validator contract)', () => {
    const placeholders = (String(wf?.template).match(/\{\{\s*([a-zA-Z]+)\s*\}\}/g) ?? []).map((p) => p.replace(/[{} ]/g, ''));
    for (const p of placeholders) expect(['input', 'style', 'date']).toContain(p);
  });
});
