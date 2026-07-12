import { describe, expect, it } from 'vitest';
import universalAgent from '../../../seed/agents/universal-operations.json';
import universalWorkflow from '../../../seed/workflows/universal-operations-review.json';
import {
  COMMANDS,
  matchCommand,
  resolveDomainRouteCommand,
  resolveDomainWorkflowRoute,
  workflowTargetToParams,
} from '../commands';
import { AGENTS, validateAgentRegistry } from '../agents/agentRegistry';
import {
  WORKFLOWS,
  getWorkflow,
  resolveWorkflowOutputStyle,
  validateWorkflowRegistry,
  workflowsForAgent,
} from '../workflows/workflowRegistry';
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

const commandStyle = (slash: string): string | null => {
  const match = matchCommand(slash);
  if (!match) return null;
  return workflowTargetToParams(match.command.target, match.args)?.get('style') ?? null;
};

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
    expect(workflowTargetToParams(matchCommand('/ops-review')?.command.target ?? '')?.get('wf')).toBe('universal-operations-review');
    expect(workflowTargetToParams(matchCommand('/capture inbox item')?.command.target ?? '', 'inbox item')?.get('input')).toBe('inbox item');
    expect(workflowTargetToParams(matchCommand('/waiting')?.command.target ?? '')?.get('wf')).toBe('universal-operations-review');
    expect(workflowTargetToParams(matchCommand('/autonomous')?.command.target ?? '')?.get('wf')).toBe('universal-operations-review');
    expect(matchCommand('/route fitness')?.command.target).toBe('domain-route');
    expect(COMMANDS.some((command) => command.slash === '/ops-review')).toBe(true);
  });

  it('selects the promised universal operations output styles', () => {
    expect(commandStyle('/ops-review')).toBe('Operations brief');
    expect(commandStyle('/waiting')).toBe('Waiting-on-user view');
    expect(commandStyle('/autonomous')).toBe('Autonomous work view');
    expect(commandStyle('/capture')).toBe('Capture processing view');
  });

  it('falls back safely for invalid style query parameters', () => {
    const wf = getWorkflow('universal-operations-review')!;
    expect(resolveWorkflowOutputStyle(wf, 'Not a real style')).toBe('Operations brief');
    expect(resolveWorkflowOutputStyle(wf, 'Waiting-on-user view')).toBe('Waiting-on-user view');
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

  it('plans successful route commands as one accurate audit event', () => {
    const resolution = resolveDomainRouteCommand('fitness');
    expect(resolution.actionTaken).toBe(true);
    expect(resolution.route?.workflowId).toBe('fitness-handoff');
    expect(resolution.auditCommand).toBe('/route fitness');
    expect(resolution.resultSummary).toContain('Fitness -> fitness-handoff');
    expect(resolution.usesClarificationUx).toBe(false);
  });

  it('plans unknown route commands as one no-op audit event using clarification UX', () => {
    const resolution = resolveDomainRouteCommand('unknown domain');
    expect(resolution.actionTaken).toBe(false);
    expect(resolution.route).toBeNull();
    expect(resolution.auditCommand).toBe('/route unknown domain');
    expect(resolution.routeInput).toBe('unknown domain');
    expect(resolution.usesClarificationUx).toBe(true);
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

  it('classifies approval-required actions as waiting on user', () => {
    const result = runUniversalOperationsReview({
      actions: [
        action({ id: 'approval', title: 'Needs explicit approval', approvalRequired: true, priority: 'P1' }),
        action({ id: 'ready', title: 'Ready action', priority: 'P2' }),
      ],
    });

    expect(result.waitingOnUser.map((item) => item.id)).toContain('approval');
    expect(result.blockedAutonomous.map((item) => item.id)).not.toContain('approval');
    expect(result.nextAction?.id).toBe('ready');
  });

  it('classifies external write risks as waiting on user', () => {
    const result = runUniversalOperationsReview({
      actions: [
        action({ id: 'external', title: 'External write', risk: 'external_write' }),
        action({ id: 'sensitive', title: 'Sensitive external write', risk: 'sensitive_external_write' }),
      ],
    });

    expect(result.waitingOnUser.map((item) => item.id)).toEqual(['external', 'sensitive']);
    expect(result.blockedAutonomous).toHaveLength(0);
  });

  it('keeps high-risk actions blocked and out of waiting-on-user', () => {
    const result = runUniversalOperationsReview({
      actions: [
        action({ id: 'high', title: 'High risk', risk: 'high_risk', approvalRequired: true }),
      ],
    });

    expect(result.waitingOnUser.map((item) => item.id)).not.toContain('high');
    expect(result.blockedAutonomous.map((item) => item.id)).toEqual(['high']);
    expect(result.nextAction).toBeNull();
  });

  it('never returns the same item in waiting-on-user and blocked autonomous lists', () => {
    const result = runUniversalOperationsReview({
      actions: [
        action({ id: 'external', title: 'External write', risk: 'external_write' }),
        action({ id: 'blocked', title: 'Blocked', status: 'blocked', blockedBy: 'source alias unavailable' }),
        action({ id: 'high', title: 'High risk', risk: 'high_risk' }),
      ],
    });
    const waitingIds = new Set(result.waitingOnUser.map((item) => item.id));
    const overlap = result.blockedAutonomous.filter((item) => waitingIds.has(item.id));
    expect(overlap).toHaveLength(0);
  });

  it('treats waiting queue membership as authoritative for open records', () => {
    const result = runUniversalOperationsReview({
      waitingOnUserQueue: [
        action({ id: 'waiting-open', title: 'Open waiting queue item', status: 'Open' }),
      ],
    });

    expect(result.waitingOnUser.map((item) => item.id)).toEqual(['waiting-open']);
    expect(result.nextAction).toBeNull();
  });

  it('excludes completed waiting queue records', () => {
    const result = runUniversalOperationsReview({
      waitingOnUserQueue: [
        action({ id: 'waiting-done', title: 'Completed waiting queue item', status: 'completed' }),
      ],
    });

    expect(result.waitingOnUser).toHaveLength(0);
    expect(result.blockedAutonomous).toHaveLength(0);
    expect(result.nextAction).toBeNull();
  });

  it('lets waiting queue records override duplicate action records', () => {
    const result = runUniversalOperationsReview({
      actions: [
        action({ id: 'duplicate', title: 'Ready duplicate action', status: 'open', priority: 'P1' }),
      ],
      waitingOnUserQueue: [
        action({ id: 'duplicate', title: 'Waiting queue duplicate', status: 'Open', priority: 'P2', blockedBy: 'user decision' }),
      ],
    });
    const waitingItem = result.waitingOnUser.find((item) => item.id === 'duplicate');

    expect(waitingItem?.title).toBe('Waiting queue duplicate');
    expect(waitingItem?.priority).toBe('P2');
    expect(result.blockedAutonomous.map((item) => item.id)).not.toContain('duplicate');
    expect(result.nextAction).toBeNull();
  });
});
