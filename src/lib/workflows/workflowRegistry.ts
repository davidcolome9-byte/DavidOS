import type { AgentId, Workflow } from '../types';
import { AGENTS } from '../agents/agentRegistry';

import universalOperationsReview from '../../../seed/workflows/universal-operations-review.json';
import dailyBrief from '../../../seed/workflows/daily-brief.json';
import fitnessHandoff from '../../../seed/workflows/fitness-handoff.json';
import workTeachback from '../../../seed/workflows/work-teachback.json';
import promptImprovement from '../../../seed/workflows/prompt-improvement.json';
import weeklyReview from '../../../seed/workflows/weekly-review.json';
import lifeAdminChecklist from '../../../seed/workflows/life-admin-checklist.json';
import contentAssetPlanner from '../../../seed/workflows/content-asset-planner.json';

/**
 * Workflows are JSON specs in /seed/workflows — same idea as agents:
 * portable definitions any AI tool can consume.
 */
const WORKFLOW_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

export function validateWorkflowRegistry(workflows: Workflow[], agents = AGENTS): Workflow[] {
  const seen = new Set<string>();
  const agentIds = new Set(agents.map((agent) => agent.id));
  for (const workflow of workflows) {
    if (!WORKFLOW_ID_PATTERN.test(workflow.id)) {
      throw new Error(`Workflow registry contains malformed id: ${workflow.id}`);
    }
    if (seen.has(workflow.id)) {
      throw new Error(`Workflow registry contains duplicate id: ${workflow.id}`);
    }
    if (!agentIds.has(workflow.agentId)) {
      throw new Error(`Workflow registry references unknown agent: ${workflow.id} -> ${workflow.agentId}`);
    }
    seen.add(workflow.id);
  }
  return workflows;
}

export const WORKFLOWS: Workflow[] = validateWorkflowRegistry([
  universalOperationsReview,
  dailyBrief,
  fitnessHandoff,
  workTeachback,
  promptImprovement,
  weeklyReview,
  lifeAdminChecklist,
  contentAssetPlanner,
] as Workflow[]);

export function getWorkflow(id: string): Workflow | undefined {
  return WORKFLOWS.find((w) => w.id === id);
}

export function workflowsForAgent(agentId: AgentId): Workflow[] {
  return WORKFLOWS.filter((w) => w.agentId === agentId);
}
