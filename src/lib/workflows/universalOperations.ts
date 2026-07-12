import type { RiskLevel } from '../types';
import { isBlockedInV1, requiresApproval } from '../safety/approvalRules';

export type UniversalPriority = 'P1' | 'P2' | 'P3' | 'P4';

export interface UniversalWorkflowRecord {
  id: string;
  name: string;
  domain: string;
  purpose?: string;
  primaryIntake?: string;
  authoritativeSourceRef?: string;
  triggerPhrases?: string[];
  defaultOwner?: string;
  approvalBoundary?: string;
  stage?: string;
  status?: string;
  cadence?: string;
  lastReviewedAt?: string;
  nextBuildStep?: string;
}

export interface UniversalProjectRecord {
  id: string;
  name: string;
  workflowId?: string;
  domain: string;
  outcome?: string;
  owner?: string;
  priority?: UniversalPriority;
  status?: string;
  startedAt?: string;
  targetDate?: string;
  nextAction?: string;
  blockedBy?: string;
  updatedAt?: string;
  completionEvidenceRef?: string;
}

export interface UniversalActionRecord {
  id: string;
  title: string;
  workflowId?: string;
  projectId?: string;
  domain: string;
  priority?: UniversalPriority;
  urgency?: number;
  importance?: number;
  owner?: string;
  status?: string;
  blockedBy?: string;
  dueDate?: string;
  nextReviewAt?: string;
  sourceRef?: string;
  createdAt?: string;
  completedAt?: string;
  evidenceRef?: string;
  notes?: string;
  risk?: RiskLevel;
  approvalRequired?: boolean;
}

export interface UniversalDecisionRecord {
  id: string;
  decidedAt?: string;
  decision: string;
  context?: string;
  options?: string[];
  chosenApproach?: string;
  reason?: string;
  scope?: string;
  owner?: string;
  approval?: string;
  evidenceRef?: string;
  supersedes?: string;
  status?: string;
}

export interface UniversalSourceRecord {
  id: string;
  domain: string;
  name: string;
  role?: string;
  authorityLevel?: string;
  readCondition?: string;
  conflictRule?: string;
  owner?: string;
  sensitivity?: string;
  status?: string;
  verifiedAt?: string;
  reviewAt?: string;
  externalRef?: string;
}

export interface UniversalOperationsInput {
  inboxItems?: string[];
  workflows?: UniversalWorkflowRecord[];
  projects?: UniversalProjectRecord[];
  actions?: UniversalActionRecord[];
  waitingOnUserQueue?: UniversalActionRecord[];
  decisions?: UniversalDecisionRecord[];
  sources?: UniversalSourceRecord[];
  currentDate?: string;
  timezone?: string;
}

export interface ApprovalBoundaryResult {
  actionId: string;
  allowedWithoutApproval: boolean;
  requiresExplicitApproval: boolean;
  blocked: boolean;
  reason: string;
}

export interface DomainRouteResult {
  domain: string;
  workflowId: string;
  workflowName: string;
  reason: string;
}

export interface UniversalOperationsReview {
  posture: 'normal' | 'ready' | 'attention' | 'blocked';
  openP1Items: UniversalActionRecord[];
  waitingOnUser: UniversalActionRecord[];
  blockedAutonomous: UniversalActionRecord[];
  topThreePriorities: UniversalActionRecord[];
  nextAction: UniversalActionRecord | null;
  routedDomains: DomainRouteResult[];
  approvalBoundaries: ApprovalBoundaryResult[];
}

const PRIORITY_RANK: Record<UniversalPriority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
const DONE_STATUSES = new Set(['done', 'complete', 'completed', 'cancelled', 'canceled', 'dropped', 'resolved', 'finished', 'closed']);
const WAITING_STATUSES = new Set(['waiting', 'waiting on user', 'needs user', 'needs decision', 'needs approval']);
const BLOCKED_STATUSES = new Set(['blocked', 'stalled']);

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isDone(action: UniversalActionRecord): boolean {
  return DONE_STATUSES.has(normalize(action.status)) || Boolean(action.completedAt);
}

function priorityRank(action: UniversalActionRecord): number {
  return action.priority ? PRIORITY_RANK[action.priority] : 99;
}

function dueRank(action: UniversalActionRecord): number {
  if (!action.dueDate) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(action.dueDate);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function actionSort(a: UniversalActionRecord, b: UniversalActionRecord): number {
  return (
    priorityRank(a) - priorityRank(b) ||
    (b.importance ?? 0) - (a.importance ?? 0) ||
    (b.urgency ?? 0) - (a.urgency ?? 0) ||
    dueRank(a) - dueRank(b) ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id)
  );
}

function mergeActionQueues(
  actions: UniversalActionRecord[],
  waitingOnUserQueue: UniversalActionRecord[],
): UniversalActionRecord[] {
  const byId = new Map<string, UniversalActionRecord>();
  for (const action of actions) {
    if (!isDone(action) && !byId.has(action.id)) byId.set(action.id, action);
  }
  for (const waitingAction of waitingOnUserQueue) {
    if (isDone(waitingAction)) {
      byId.delete(waitingAction.id);
      continue;
    }
    const existing = byId.get(waitingAction.id);
    byId.set(waitingAction.id, {
      ...(existing ?? waitingAction),
      ...waitingAction,
      status: 'waiting_on_user',
    });
  }
  return [...byId.values()];
}

export function approvalBoundaryForAction(action: UniversalActionRecord): ApprovalBoundaryResult {
  const risk = action.risk ?? 'read_only';
  if (isBlockedInV1(risk)) {
    return {
      actionId: action.id,
      allowedWithoutApproval: false,
      requiresExplicitApproval: true,
      blocked: true,
      reason: 'High-risk actions are blocked in v1.',
    };
  }
  if (action.approvalRequired || requiresApproval(risk)) {
    return {
      actionId: action.id,
      allowedWithoutApproval: false,
      requiresExplicitApproval: true,
      blocked: false,
      reason: 'Explicit user approval is required before execution.',
    };
  }
  return {
    actionId: action.id,
    allowedWithoutApproval: true,
    requiresExplicitApproval: false,
    blocked: false,
    reason: 'Allowed under read-only, draft-only, or local-write boundaries.',
  };
}

export function isWaitingOnUser(action: UniversalActionRecord): boolean {
  const status = normalize(action.status);
  const blocker = normalize(action.blockedBy);
  const boundary = approvalBoundaryForAction(action);
  if (boundary.blocked) return false;
  return (
    action.approvalRequired === true ||
    boundary.requiresExplicitApproval ||
    WAITING_STATUSES.has(status) ||
    blocker.includes('user') ||
    blocker.includes('approval') ||
    blocker.includes('decision')
  );
}

export function isAutonomousBlocked(action: UniversalActionRecord): boolean {
  if (isDone(action) || isWaitingOnUser(action)) return false;
  const status = normalize(action.status);
  const boundary = approvalBoundaryForAction(action);
  return BLOCKED_STATUSES.has(status) || Boolean(action.blockedBy) || !boundary.allowedWithoutApproval;
}

export function routeDomainToWorkflow(
  domain: string,
  workflows: UniversalWorkflowRecord[],
): DomainRouteResult | null {
  const normalizedDomain = normalize(domain);
  if (!normalizedDomain) return null;

  const matches = workflows
    .filter((workflow) => {
      const terms = [workflow.domain, workflow.id, workflow.name, ...(workflow.triggerPhrases ?? [])];
      return terms.some((term) => normalize(term) === normalizedDomain);
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const match = matches[0];
  if (!match) return null;
  return {
    domain,
    workflowId: match.id,
    workflowName: match.name,
    reason: `Matched ${domain} to registered workflow ${match.id}.`,
  };
}

export function runUniversalOperationsReview(input: UniversalOperationsInput): UniversalOperationsReview {
  const activeActions = mergeActionQueues(input.actions ?? [], input.waitingOnUserQueue ?? []);

  const waitingOnUser = activeActions.filter(isWaitingOnUser).sort(actionSort);
  const blockedAutonomous = activeActions.filter(isAutonomousBlocked).sort(actionSort);
  const approvalBoundaries = activeActions
    .map(approvalBoundaryForAction)
    .filter((boundary) => !boundary.allowedWithoutApproval);
  const openP1Items = activeActions.filter((action) => action.priority === 'P1').sort(actionSort);
  const readyActions = activeActions
    .filter((action) => !isWaitingOnUser(action) && !isAutonomousBlocked(action))
    .sort(actionSort);
  const topThreePriorities = [...activeActions].sort(actionSort).slice(0, 3);
  const routedDomains = [...new Set(activeActions.map((action) => action.domain))]
    .map((domain) => routeDomainToWorkflow(domain, input.workflows ?? []))
    .filter((route): route is DomainRouteResult => Boolean(route));

  let posture: UniversalOperationsReview['posture'] = 'normal';
  if (blockedAutonomous.length > 0) posture = 'blocked';
  else if (openP1Items.length > 0 || waitingOnUser.length > 0) posture = 'attention';
  else if (readyActions.length > 0) posture = 'ready';

  return {
    posture,
    openP1Items,
    waitingOnUser,
    blockedAutonomous,
    topThreePriorities,
    nextAction: readyActions[0] ?? null,
    routedDomains,
    approvalBoundaries,
  };
}
