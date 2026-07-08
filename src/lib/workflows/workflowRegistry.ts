import type { AgentId, Workflow } from '../types';

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
export const WORKFLOWS: Workflow[] = [
  dailyBrief,
  fitnessHandoff,
  workTeachback,
  promptImprovement,
  weeklyReview,
  lifeAdminChecklist,
  contentAssetPlanner,
] as Workflow[];

export function getWorkflow(id: string): Workflow | undefined {
  return WORKFLOWS.find((w) => w.id === id);
}

export function workflowsForAgent(agentId: AgentId): Workflow[] {
  return WORKFLOWS.filter((w) => w.agentId === agentId);
}
