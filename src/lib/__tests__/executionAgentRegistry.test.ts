import { describe, expect, it } from 'vitest';
import {
  CODING_COORDINATOR,
  EXECUTION_AGENTS,
  getExecutionAgent,
  validateExecutionAgentRegistry,
  type ExecutionAgentProfile,
} from '../agents/executionAgentRegistry';
import { AGENTS } from '../agents/agentRegistry';

function profile(overrides: Partial<ExecutionAgentProfile> = {}): ExecutionAgentProfile {
  return {
    id: 'coding-coordinator',
    name: 'DavidOS Coding Coordinator',
    icon: 'X',
    purpose: 'p',
    supervisionStatement: 's',
    allowedServices: ['claude_code'],
    neverDoes: ['nothing external'],
    ...overrides,
  };
}

describe('execution agent registry (DOS-AGT-001A)', () => {
  it('contains exactly one fixed profile with the approved id and name', () => {
    expect(EXECUTION_AGENTS).toHaveLength(1);
    expect(EXECUTION_AGENTS[0].id).toBe('coding-coordinator');
    expect(EXECUTION_AGENTS[0].name).toBe('DavidOS Coding Coordinator');
    expect(getExecutionAgent('coding-coordinator')).toBe(CODING_COORDINATOR);
    expect(getExecutionAgent('nope')).toBeUndefined();
  });

  it('stays completely separate from the domain-agent registry', () => {
    // The execution agent must never appear among routed domain agents.
    expect(AGENTS.some((a) => (a.id as string) === 'coding-coordinator')).toBe(false);
    // And the domain registry is untouched at its known size.
    expect(AGENTS).toHaveLength(8);
  });

  it('allowed services are valid, unique, and include all approved services', () => {
    expect([...CODING_COORDINATOR.allowedServices].sort()).toEqual(
      ['antigravity', 'claude_code', 'codex', 'gemini', 'manual'],
    );
  });

  it('profile and nested arrays cannot be mutated by consumers', () => {
    expect(Object.isFrozen(CODING_COORDINATOR)).toBe(true);
    expect(Object.isFrozen(CODING_COORDINATOR.allowedServices)).toBe(true);
    expect(Object.isFrozen(CODING_COORDINATOR.neverDoes)).toBe(true);
    expect(() => {
      (CODING_COORDINATOR.allowedServices as unknown as string[]).push('manual');
    }).toThrow();
    expect(() => {
      (CODING_COORDINATOR.neverDoes as unknown as string[]).pop();
    }).toThrow();
    expect(() => {
      (CODING_COORDINATOR as unknown as Record<string, unknown>).name = 'hacked';
    }).toThrow();
    expect(() => {
      (EXECUTION_AGENTS as unknown as ExecutionAgentProfile[]).push(profile());
    }).toThrow();
  });

  it('rejects violations of the one-profile contract', () => {
    expect(() => validateExecutionAgentRegistry([])).toThrow(/exactly one/);
    expect(() => validateExecutionAgentRegistry([profile(), profile({ id: 'other-agent' as never })])).toThrow(/exactly one/);
  });

  it('rejects a syntactically valid but different profile id (exact identity)', () => {
    expect(() =>
      validateExecutionAgentRegistry([profile({ id: 'other-agent' as never })]),
    ).toThrow(/coding-coordinator/);
  });

  it('rejects malformed ids, missing strings, and bad services', () => {
    expect(() => validateExecutionAgentRegistry([profile({ id: 'Bad Id' as never })])).toThrow(/malformed id/);
    expect(() => validateExecutionAgentRegistry([profile({ name: '  ' })])).toThrow(/missing required field "name"/);
    expect(() => validateExecutionAgentRegistry([profile({ supervisionStatement: '' })])).toThrow(/supervisionStatement/);
    expect(() => validateExecutionAgentRegistry([profile({ allowedServices: [] })])).toThrow(/at least one service/);
    expect(() =>
      validateExecutionAgentRegistry([profile({ allowedServices: ['bogus' as never] })]),
    ).toThrow(/unknown service/);
    expect(() =>
      validateExecutionAgentRegistry([profile({ allowedServices: ['codex', 'codex'] })]),
    ).toThrow(/twice/);
    expect(() => validateExecutionAgentRegistry([profile({ neverDoes: [] })])).toThrow(/boundaries/);
    expect(() => validateExecutionAgentRegistry([profile({ neverDoes: ['ok', '  '] })])).toThrow(/boundaries/);
  });

  it('the supervision statement states DavidOS sends and executes nothing', () => {
    expect(CODING_COORDINATOR.supervisionStatement).toContain('never sends or executes anything');
  });
});
