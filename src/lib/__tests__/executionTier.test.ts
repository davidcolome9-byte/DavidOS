import { describe, expect, it } from 'vitest';
import { classifyExecutionTier } from '../router/executionTier';
import { routeIntent } from '../router/intentRouter';
import { classifyCommand } from '../safety/riskClassifier';
import { isBlockedInV1, requiresApproval } from '../safety/approvalRules';

const decide = (input: string) => classifyExecutionTier(input, routeIntent(input));

describe('executionTier', () => {
  it('routes direct reads of known local DavidOS state to Tier 1', () => {
    expect(decide('Show my priorities').tier).toBe('tier_1_local');
    expect(decide('List my open loops').tier).toBe('tier_1_local');
    expect(decide('Open my projects').tier).toBe('tier_1_local');
  });

  it('routes research, drafting, and analysis to Tier 2', () => {
    expect(decide('Research the best current approach for this').tier).toBe('tier_2_assistant');
    expect(decide('Draft a concise reply for me').tier).toBe('tier_2_assistant');
    expect(decide('Review this workout').tier).toBe('tier_2_assistant');
  });

  it('routes explicit coding and repository execution to Tier 3', () => {
    expect(decide('Fix this bug and run tests').tier).toBe('tier_3_executor');
    expect(decide('Create a branch and open a pull request').tier).toBe('tier_3_executor');
    expect(decide('Implement this feature in the repository').tier).toBe('tier_3_executor');
    expect(decide('Build this app').tier).toBe('tier_3_executor');
  });

  it('requires supervised execution only for Tier 3', () => {
    expect(decide('Run the tests').requiresSupervisedExecution).toBe(true);
    expect(decide('Compare these two options').requiresSupervisedExecution).toBe(false);
    expect(decide('Show my reminders').requiresSupervisedExecution).toBe(false);
  });

  it.each([
    'run a test',
    'run the test',
    'run tests',
    'run unit tests',
    'write unit tests',
    'write a test',
    'write tests',
    'run a unit test',
    'delete the branch',
    'Please write unit tests',
  ])('recognizes the technical request "%s" without executing it', (input) => {
    expect(decide(input)).toMatchObject({
      tier: 'tier_3_executor',
      requiresSupervisedExecution: true,
    });
    expect(decide(input).reasoning).toContain('nothing was executed');
  });

  it.each([
    'write',
    'delete',
    'clean',
    'write me a message',
    'delete my reminder',
    'clean my schedule',
    'clean the house',
    'delete my reminder about the branch',
    'write me a message about unit tests',
    'Explain how to delete the branch',
    'write unit plans',
    'run testimony',
  ])('does not escalate a bare verb or non-actionable technical mention: "%s"', (input) => {
    expect(decide(input)).toMatchObject({
      tier: 'tier_2_assistant',
      requiresSupervisedExecution: false,
    });
  });

  it.each([
    ['delete the branch', 'local_write', false, false],
    ['delete file', 'external_write', true, false],
    ['delete the branch and buy a server', 'high_risk', true, true],
  ] as const)('preserves independent risk/approval policy for "%s"', (input, risk, approval, blocked) => {
    const route = routeIntent(input);
    const originalRoute = structuredClone(route);
    expect(classifyCommand(input)).toBe(risk);
    expect(classifyExecutionTier(input, route).tier).toBe('tier_3_executor');
    expect(route).toEqual(originalRoute);
    expect(classifyCommand(input)).toBe(risk);
    expect(requiresApproval(risk)).toBe(approval);
    expect(isBlockedInV1(risk)).toBe(blocked);
  });

  it('does not mistake ordinary life-language verbs for coding execution', () => {
    expect(decide('Fix my schedule for next week').tier).not.toBe('tier_3_executor');
    expect(decide('Write me a friendly message').tier).not.toBe('tier_3_executor');
    expect(decide('Build my weekly schedule').tier).not.toBe('tier_3_executor');
    expect(decide('Build my weekly schedule in the app').tier).toBe('tier_2_assistant');
    expect(decide('Write me a message about the app').tier).toBe('tier_2_assistant');
    expect(decide('Fix my schedule in the app').tier).toBe('tier_2_assistant');
    expect(decide('Explain how to run tests').tier).toBe('tier_2_assistant');
    expect(decide('Show me how to list my projects').tier).toBe('tier_2_assistant');
  });

  it('keeps the tier advisory and independent of domain and risk classification', () => {
    const fitness = decide('Review this workout');
    const technical = decide('Please fix this bug and run tests');
    expect(fitness.tier).toBe('tier_2_assistant');
    expect(technical.tier).toBe('tier_3_executor');
    expect(technical.requiresSupervisedExecution).toBe(true);
    expect(technical.reasoning).toContain('nothing was executed');
  });

  it('defaults unknown or ambiguous requests to the assistant tier instead of escalating', () => {
    expect(decide('zzz qqq xyzzy').tier).toBe('tier_2_assistant');
    expect(decide('workout').tier).toBe('tier_2_assistant');
  });
});
