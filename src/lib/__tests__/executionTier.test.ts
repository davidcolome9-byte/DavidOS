import { describe, expect, it } from 'vitest';
import { classifyExecutionTier } from '../router/executionTier';
import { routeIntent } from '../router/intentRouter';

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
