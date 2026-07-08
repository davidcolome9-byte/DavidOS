import { describe, expect, it } from 'vitest';
import { classifyCommand } from '../safety/riskClassifier';
import { requiresApproval, isBlockedInV1 } from '../safety/approvalRules';

describe('riskClassifier', () => {
  it('classifies email sending as sensitive external write', () => {
    expect(classifyCommand('Send email to my supervisor about the project')).toBe('sensitive_external_write');
    // Filler words must not defeat the classifier (found in stress testing).
    expect(classifyCommand('send this email to my supervisor about the fraud case')).toBe('sensitive_external_write');
    expect(classifyCommand('send an email to the vet')).toBe('sensitive_external_write');
    expect(classifyCommand('email this to my coworkers')).toBe('sensitive_external_write');
  });

  it('classifies calendar edits as external write', () => {
    expect(classifyCommand('Create event for the vet appointment Friday')).toBe('external_write');
  });

  it('classifies purchases as high risk', () => {
    expect(classifyCommand('Buy more dog food online')).toBe('high_risk');
  });

  it('classifies saving as local write', () => {
    expect(classifyCommand('Save this to my vault')).toBe('local_write');
  });

  it('classifies drafting as draft only', () => {
    expect(classifyCommand('Draft a teachback outline')).toBe('draft_only');
  });

  it('defaults to read only', () => {
    expect(classifyCommand('What is on my dashboard?')).toBe('read_only');
  });
});

describe('approvalRules', () => {
  it('requires approval for external and high-risk actions only', () => {
    expect(requiresApproval('read_only')).toBe(false);
    expect(requiresApproval('draft_only')).toBe(false);
    expect(requiresApproval('local_write')).toBe(false);
    expect(requiresApproval('external_write')).toBe(true);
    expect(requiresApproval('sensitive_external_write')).toBe(true);
    expect(requiresApproval('high_risk')).toBe(true);
  });

  it('blocks high-risk actions entirely in v1', () => {
    expect(isBlockedInV1('high_risk')).toBe(true);
    expect(isBlockedInV1('external_write')).toBe(false);
  });
});
