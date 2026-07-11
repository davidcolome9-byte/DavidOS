import { describe, expect, it } from 'vitest';
import universalAgent from '../../../seed/agents/universal-operations.json';
import universalWorkflow from '../../../seed/workflows/universal-operations-review.json';
import { COMMANDS, matchCommand, resolveDomainWorkflowRoute } from '../commands';
import { AGENTS, validateAgentRegistry } from '../agents/agentRegistry';
import { WORKFLOWS, getWorkflow, validateWorkflowRegistry, workflowsForAgent } from '../workflows/workflowRegistry';
import { requiresApproval } from '../safety/approvalRules';
import {
  approvalBoundaryForAction,
  routeDomainToWorkflow,
  runUniversalOperationsReview,
  type UniversalActionRecord,
  type UniversalWorkflowRecord,
} from '../workflows/universalOperations';
import type { Agent, Workflow } from '../types';

const action = (overrides: Partial<UniversalActionRecord>): UniversalActionRecord => ({
  id: 'action',
  title: 'Action',
  domain: 'Core',
  status: 'open',
  ...overrides,
});

const workflow = (overrides: Partial<UniversalWorkflowRecord>): UniversalWorkflowRecord => ({
  id: 'core-review',
  name: 'Core Review',
  domain: 'Core',
  ...overrides,
});

describe('universal operations registry wiring', () => {
  it('registers the universal operations agent and workflow through strict registries', () => {
    const agent = AGENTS.find((candidate) => candidate.id === 'universal-operations');
    const wf = getWorkflow('universal-operations-review');

    expect(agent?.defaultWorkflow).toBe('universal-operations-review');
    expect(wf?.agentId).toBe('universal-operations');
    expect(workflowsForAgent('universal-operations').map((item) => item.id)).toContain('universal-operations-review');
  });

  it('preserves unknown workflow id behavior', () => {
    expect(getWorkflow('missing-workflow')).toBeUndefined();
  });

  it('rejects malformed and duplicate agent ids', () => {
    const base = AGENTS[0];
    expect(() => validateAgentRegistry([{ ...base, id: 'Bad Id' } as unknown as Agent])).toThrow(/malformed id/);
    expect(() => validateAgentRegistry([base, { ...base }])).toThrow(/duplicate id/);
  });

  it('rejects malformed, duplicate, and unknown-agent workflow ids', () => {
    const base = WORKFLOWS[0];
    expect(() => validateWorkflowRegistry([{ ...base, id: 'Bad Id' } as Workflow])).toThrow(/malformed id/);
    expect(() => validateWorkflowRegistry([base, { ...base }])).toThrow(/duplicate id/);
    expect(() => validateWorkflowRegistry([{ ...base, agentId: 'missing_agent' } as unknown as Workflow])).toThrow(/unknown agent/);
  });

  it('keeps universal operations seed specs free of private locators and values', () => {
    const seedText = JSON.stringify([universalAgent, universalWorkflow]);
    expect(seedText).not.toMatch(/https?:\/\//);
    expect(seedText).not.toMatch(/docs\.google|drive\.google/i);
    expect(seedText).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(seedText).not.toMatch(/\$[0-9]/);
  });
});

describe('universal operations commands', () => {
  it('routes requested slash commands through the current command framework', () => {
    expect(matchCommand('/ops-review')?.command.target).toBe('wf:universal-operations-review');
    expect(matchCommand('/capture inbox item')?.command.target).toBe('wf:universal-operations-review');
    expect(matchCommand('/waiting')?.command.target).toBe('wf:universal-operations-review');
    expect(matchCommand('/autonomous')?.command.target).toBe('wf:universal-operations-review');
    expect(matchCommand('/route fitness')?.command.target).toBe('domain-route');
    expect(COMMANDS.some((command) => command.slash === '/ops-review')).toBe(true);
  });

  it('keeps unknown slash commands and domains out of registered routes', () => {
    expect(matchCommand('/does-not-exist')).toBeNull();
    expect(resolveDomainWorkflowRoute('unknown domain')).toBeNull();
  });

  it('deterministically routes known domains to registered workflows', () => {
    expect(resolveDomainWorkflowRoute('fitness')?.workflowId).toBe('fitness-handoff');
    expect(resolveDomainWorkflowRoute('ops')?.workflowId).toBe('universal-operations-review');
    expect(getWorkflow(resolveDomainWorkflowRoute('calendar')?.workflowId ?? '')).toBeDefined();
  });
});

describe('universal operations review behavior', () => {
  it('returns normal operations when there are no actions', () => {
    const result = runUniversalOperationsReview({});
    expect(result.posture).toBe('normal');
    expect(result.nextAction).toBeNull();
    expect(result.openP1Items).toHaveLength(0);
  });

  it('keeps waiting-on-user items separate from blocked autonomous items', () => {
    const result = runUniversalOperationsReview({
      actions: [
        action({ id: 'waiting', title: 'Needs decision', status: 'waiting_on_user', priority: 'P1' }),
        action({ id: 'blocked', title: 'Can run after source arrives', status: 'blocked', blockedBy: 'source alias unavailable', priority: 'P1' }),
      ],
    });

    expect(result.waitingOnUser.map((item) => item.id)).toEqual(['waiting']);
    expect(result.blockedAutonomous.map((item) => item.id)).toEqual(['blocked']);
    expect(result.openP1Items.map((item) => item.id)).toEqual(['blocked', 'waiting']);
  });

  it('chooses exactly one highest-leverage next action from ready work', () => {
    const result = runUniversalOperationsReview({
      actions: [
        action({ id: 'p2', title: 'Second', priority: 'P2', importance: 5 }),
        action({ id: 'p1', title: 'First', priority: 'P1', importance: 1 }),
        action({ id: 'waiting', title: 'Waiting', status: 'waiting_on_user', priority: 'P1' }),
      ],
    });

    expect(result.nextAction?.id).toBe('p1');
    expect(Array.isArray(result.nextAction)).toBe(false);
  });

  it('routes domains through registered workflow records deterministically', () => {
    const workflows = [
      workflow({ id: 'z-core', name: 'Later Core', domain: 'Core' }),
      workflow({ id: 'a-core', name: 'First Core', domain: 'Core' }),
    ];

    expect(routeDomainToWorkflow('Core', workflows)?.workflowId).toBe('a-core');
    expect(routeDomainToWorkflow('Unknown', workflows)).toBeNull();
  });

  it('honors approval boundaries for external and high-risk actions', () => {
    const external = approvalBoundaryForAction(action({ id: 'external', risk: 'external_write' }));
    const highRisk = approvalBoundaryForAction(action({ id: 'high', risk: 'high_risk' }));
    const draft = approvalBoundaryForAction(action({ id: 'draft', risk: 'draft_only' }));

    expect(requiresApproval('external_write')).toBe(true);
    expect(external.allowedWithoutApproval).toBe(false);
    expect(external.requiresExplicitApproval).toBe(true);
    expect(highRisk.blocked).toBe(true);
    expect(draft.allowedWithoutApproval).toBe(true);
  });
});
