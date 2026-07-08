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

export type DateConfidence = 'explicit' | 'relative_resolved' | 'unknown';
export type HandoffStatus = 'active' | 'superseded' | 'correction';

/** How a workflow's generated prompt should instruct the downstream AI. */
export type WorkflowOutputMode =
  | 'clean_handoff_only'
  | 'handoff_with_continuity_notes'
  | 'analysis_recommendations'
  | 'dashboard_full_analysis'
  | 'custom';

export type WorkflowCategory = 'fitness_health' | 'work' | 'dating' | 'project' | 'general';

/** Controls history-window size and retrieval behavior. */
export type HistoryProfile = 'default' | 'fitness_health' | 'trend_analysis';

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
  // Structured metadata (Phase 7). Optional — a keyword fallback fills the gaps.
  category?: WorkflowCategory;
  historyProfile?: HistoryProfile;
  outputMode?: WorkflowOutputMode;
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

/**
 * A saved handoff is the CANONICAL record for continuity: it stores only the
 * cleaned current entry (`content`), never the full generated prompt. Handoffs
 * are append-only/immutable in v1; the status/correction fields exist so future
 * edit/correction flows work without a data migration.
 */
export interface Handoff {
  id: string;
  agentId: AgentId;
  workflowId: string;
  workflowName: string;
  inputSummary: string;
  outputStyle: string;
  /** Cleaned current entry only. This is what future runs pull as history. */
  content: string;
  risk: RiskLevel;
  createdAt: string;
  contentHash?: string;
  entryDate?: string;
  dateConfidence?: DateConfidence;
  status?: HandoffStatus;
  correctsHandoffId?: string;
  /** Legacy: pre-continuity saves stored the full output here. */
  output?: string;
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
  /** False when the system detected intent but performed no action (honest no-op). */
  actionTaken?: boolean;
}

// ---------- Generated artifacts (Phase 6) ----------

export type WorkflowArtifactType = 'full_prompt' | 'current_handoff' | 'ai_response' | 'manual_note';

export interface IncludedHandoffSnapshot {
  handoffId: string;
  sourceHandoffHash: string;
  entryDate?: string;
  savedAt: string;
  dateConfidence: DateConfidence;
  extractionSummary?: {
    highConfidenceFieldCount: number;
    mediumConfidenceFieldCount: number;
    lowConfidenceFieldCount: number;
    rawFallbackUsed: boolean;
    weakExtraction: boolean;
  };
}

export interface HealthProfilePromptMetadata {
  healthProfileIncluded: boolean;
  includedFieldPaths?: string[];
  promptSummaryCharCount?: number;
  freeformContextExcerptCharCount?: number;
  promptContextHash?: string;
  promptContextFingerprint?: string;
  promptContextCharacterCount?: number;
  profileLastUpdatedAt?: string;
}

export interface WorkflowArtifact {
  id: string;
  workflowId: string;
  artifactType: WorkflowArtifactType;
  createdAt: string;
  content: string;
  promptHash?: string;
  shortFingerprint?: string;
  characterCount?: number;
  priorHandoffCount?: number;
  historyStrategy?: string;
  includedHandoffIds?: string[];
  rawFallbackUsed?: boolean;
  sourceMode?: 'preview' | 'full_prompt' | 'current_only';
  includedHandoffSnapshots?: IncludedHandoffSnapshot[];
  healthProfilePromptMetadata?: HealthProfilePromptMetadata;
}

// ---------- Health & Fitness Profile (Phase 8) ----------

export type CoachingStyle = 'conservative' | 'moderate' | 'aggressive' | 'context_sensitive';

export interface HealthGoal {
  primaryGoal?: 'fat_loss' | 'recomposition' | 'muscle_gain' | 'maintenance' | 'performance' | 'general_health';
  goalNotes?: string;
  priorityNotes?: string;
  targetWeight?: number;
  targetBodyFatPercent?: number;
  targetWaist?: number;
  visualGoal?: string;
}

export interface HealthProfileSeedMetadata {
  isSeededProfile: boolean;
  sourceNote: string;
  sourcePriority: 'claude_gdrive' | 'fallback_handoff' | 'manual';
  lastVerifiedAt?: string;
  needsVerification: boolean;
  seededAt: string;
  userModifiedAt?: string;
}

export interface HealthFitnessProfile {
  id: string;
  createdAt: string;
  updatedAt: string;
  goals?: HealthGoal;
  nutritionTargets?: {
    calories?: number;
    proteinGrams?: number;
    carbGrams?: number;
    fatGrams?: number;
    fiberGrams?: number;
    waterMl?: number;
    notes?: string;
  };
  activityTargets?: { stepsPerDay?: number; cardioTarget?: string };
  recoveryTargets?: { sleepHours?: string; hrvBaseline?: string; restingHeartRateBaseline?: string };
  trainingPlan?: {
    weeklyFrequency?: string;
    split?: string;
    preferredStyle?: string;
    movementRestrictions?: string[];
    trainingRestrictions?: string[];
    currentTrainingNotes?: string;
    cautionNotes?: string[];
  };
  bodyMetrics?: {
    height?: string;
    currentWeight?: string;
    goalWeight?: string;
    waist?: string;
    bodyFatEstimate?: string;
  };
  medicalContext?: {
    injuryHistory?: string[];
    movementRestrictions?: string[];
    cautionNotes?: string[];
    deviceContext?: string[];
  };
  supplementsMedications?: { supplements?: string[]; medications?: string[]; notes?: string };
  analysisPreferences?: {
    coachingStyle?: CoachingStyle;
    outputDetail?: 'short' | 'standard' | 'deep';
    compareAgainstTargets?: boolean;
  };
  promptSummary?: string;
  freeformContext?: string;
  seedMetadata?: HealthProfileSeedMetadata;
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
  artifacts: WorkflowArtifact[];
  healthProfile: HealthFitnessProfile | null;
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
