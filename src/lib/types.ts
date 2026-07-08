// Core entity types for DavidOS.
// Single source of truth — every module imports from here.

export type AgentId =
  | 'daily_command'
  | 'fitness'
  | 'work_project'
  | 'prompt_vault'
  | 'calendar_planning'
  | 'dogs_home_life_admin'
  | 'content_asset';

export type RouteTarget = AgentId | 'unknown';

/** Risk classification for any action the system takes. */
export type RiskLevel =
  | 'read_only'
  | 'draft_only'
  | 'local_write'
  | 'external_write'
  | 'sensitive_external_write'
  | 'high_risk';

export type ApprovalStatus = 'not_required' | 'approved' | 'denied' | 'blocked';

export interface Agent {
  id: AgentId;
  name: string;
  icon: string;
  purpose: string;
  handles: string[];
  inputs: string[];
  outputs: string[];
  approval: string[];
  exampleCommands: string[];
  defaultWorkflow: string;
}

export interface Workflow {
  id: string;
  agentId: AgentId;
  name: string;
  description: string;
  inputHint: string;
  outputStyles: string[];
  risk: RiskLevel;
  assumptions: string[];
  nextAction: string;
  /** Template with {{input}}, {{style}}, {{date}} placeholders. */
  template: string;
}

export interface Command {
  slash: string;
  label: string;
  description: string;
  /** 'nav:/path' navigates, 'wf:workflow-id' opens the workflow runner. */
  target: string;
}

export type ProjectStatus = 'active' | 'paused' | 'done';

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  area: string;
  nextAction: string;
  notes: string;
  relatedPrompts: string[];
  relatedWorkflows: string[];
  updatedAt: string;
}

export type ContextKind = 'stable' | 'priorities' | 'private' | 'workflow' | 'session';

export interface ContextItem {
  id: string;
  title: string;
  kind: ContextKind;
  body: string;
  updatedAt: string;
}

export interface PromptVersion {
  body: string;
  savedAt: string;
}

export interface Prompt {
  id: string;
  title: string;
  body: string;
  category: string;
  tags: string[];
  agentId?: AgentId;
  favorite: boolean;
  versions: PromptVersion[];
  updatedAt: string;
}

export interface Priority {
  id: string;
  label: string;
  rank: number;
}

export interface OpenLoop {
  id: string;
  label: string;
  status: 'open' | 'done';
  createdAt: string;
}

export interface Reminder {
  id: string;
  label: string;
  due: string;
  done: boolean;
}

export interface Handoff {
  id: string;
  agentId: AgentId;
  workflowId: string;
  workflowName: string;
  inputSummary: string;
  outputStyle: string;
  output: string;
  risk: RiskLevel;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  command: string;
  agentId?: AgentId;
  workflowId?: string;
  actionType: RiskLevel;
  approvalStatus: ApprovalStatus;
  resultSummary: string;
}

export interface RouteResult {
  target: RouteTarget;
  confidence: number;
  reasoning: string;
  matched: string[];
  suggestedWorkflowId?: string;
  nextAction: string;
}

export interface IntegrationMethod {
  name: string;
  description: string;
  risk: RiskLevel;
  implemented: boolean;
}

export interface IntegrationAdapter {
  id: string;
  name: string;
  capabilities: string[];
  requiredCredentials: string[];
  riskLevel: RiskLevel;
  enabled: boolean;
  methods: IntegrationMethod[];
  futureNotes: string;
}

export interface AppSettings {
  theme: 'dark' | 'light';
}

export interface AppState {
  schemaVersion: number;
  priorities: Priority[];
  openLoops: OpenLoop[];
  reminders: Reminder[];
  projects: Project[];
  prompts: Prompt[];
  contextItems: ContextItem[];
  handoffs: Handoff[];
  auditLog: AuditLogEntry[];
  settings: AppSettings;
}

/** Small unique id — good enough for a single-user local app. */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function nowIso(): string {
  return new Date().toISOString();
}
