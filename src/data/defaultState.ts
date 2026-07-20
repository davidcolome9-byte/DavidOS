import type { AppState, ContextItem, Project, Prompt } from '../lib/types';
import { uid, nowIso } from '../lib/types';
import { parseFrontmatter } from './seedLoader';
import { seedHealthProfile } from './healthProfileSeed';

import projDavidos from '../../seed/projects/davidos-build.json';
import projOperationDavid from '../../seed/projects/operation-david.json';
import projWork from '../../seed/projects/work-projects.json';
import projPromptVault from '../../seed/projects/prompt-vault.json';
import projWeeklyPlanning from '../../seed/projects/weekly-planning.json';
import projContentAssets from '../../seed/projects/content-assets.json';

import ctxUserProfile from '../../seed/context/user-profile.md?raw';
import ctxPreferences from '../../seed/context/preferences.md?raw';
import ctxConstraints from '../../seed/context/constraints.md?raw';
import ctxSensitive from '../../seed/context/sensitive-private-placeholder.md?raw';

import pClaudeCode from '../../seed/prompts/claude-code-builder.md?raw';
import pCodex from '../../seed/prompts/codex-implementation.md?raw';
import pChatgpt from '../../seed/prompts/chatgpt-refinement.md?raw';
import pWorkAnalysis from '../../seed/prompts/work-project-analysis.md?raw';
import pFitnessHandoff from '../../seed/prompts/fitness-diary-handoff.md?raw';
import pWeeklyPlanning from '../../seed/prompts/weekly-planning.md?raw';
import pModelComparison from '../../seed/prompts/ai-model-comparison.md?raw';
import pPromptImprovement from '../../seed/prompts/prompt-improvement.md?raw';

const SEED_PROJECTS = [
  projDavidos, projOperationDavid, projWork,
  projPromptVault, projWeeklyPlanning, projContentAssets,
];

const SEED_CONTEXT_FILES = [ctxUserProfile, ctxPreferences, ctxConstraints, ctxSensitive];

const SEED_PROMPT_FILES: { raw: string; id: string }[] = [
  { raw: pClaudeCode, id: 'claude-code-builder' },
  { raw: pCodex, id: 'codex-implementation' },
  { raw: pChatgpt, id: 'chatgpt-refinement' },
  { raw: pWorkAnalysis, id: 'work-project-analysis' },
  { raw: pFitnessHandoff, id: 'fitness-diary-handoff' },
  { raw: pWeeklyPlanning, id: 'weekly-planning' },
  { raw: pModelComparison, id: 'ai-model-comparison' },
  { raw: pPromptImprovement, id: 'prompt-improvement' },
];

function seedContextItems(): ContextItem[] {
  const now = nowIso();
  const fromFiles = SEED_CONTEXT_FILES.map((raw) => {
    const { meta, body } = parseFrontmatter(raw);
    return {
      id: uid(),
      title: meta.title ?? 'Untitled',
      kind: (meta.kind ?? 'stable') as ContextItem['kind'],
      body,
      updatedAt: now,
    };
  });
  // Sections not backed by seed files but required by the Context Vault spec.
  const extra: ContextItem[] = [
    {
      id: uid(),
      title: 'AI Output Rules',
      kind: 'stable',
      body: [
        '- Lead with the answer; no filler or motivational padding',
        '- Mark assumptions explicitly as [ASSUMPTION]',
        '- Mark unverified claims as [VERIFY]',
        '- Fitness: current facts only, grams/mL, no goals/left/remaining unless asked',
        '- Work: placeholders instead of any member/customer data',
      ].join('\n'),
      updatedAt: now,
    },
    {
      id: uid(),
      title: 'Current Priorities',
      kind: 'priorities',
      body: [
        '1. Body recomposition (Operation David)',
        '2. Work projects',
        '3. AI / tool building (DavidOS)',
        '4. Dogs / home',
        '5. Calendar / planning',
      ].join('\n'),
      updatedAt: now,
    },
    {
      id: uid(),
      title: 'Recurring Workflows',
      kind: 'workflow',
      body: [
        '- Morning: Daily Brief',
        '- After meals/training: Fitness Handoff',
        '- Sunday: Weekly Review',
        '- As needed: Work Teachback, Prompt Improvement, Life Admin Checklist',
      ].join('\n'),
      updatedAt: now,
    },
    {
      id: uid(),
      title: 'Session Notes (temporary)',
      kind: 'session',
      body: 'Scratch space for today only — cleared whenever you like.',
      updatedAt: now,
    },
  ];
  return [...fromFiles, ...extra];
}

function seedPrompts(): Prompt[] {
  const now = nowIso();
  return SEED_PROMPT_FILES.map(({ raw, id }) => {
    const { meta, body } = parseFrontmatter(raw);
    return {
      id,
      title: meta.title ?? id,
      body,
      category: meta.category ?? 'General',
      tags: (meta.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
      agentId: meta.agent as Prompt['agentId'],
      favorite: false,
      versions: [],
      updatedAt: now,
    };
  });
}

function seedProjects(): Project[] {
  const now = nowIso();
  return SEED_PROJECTS.map((p) => ({ ...p, updatedAt: now }) as Project);
}

export function buildDefaultState(): AppState {
  const now = nowIso();
  return {
    schemaVersion: 1,
    priorities: [
      { id: uid(), label: 'Body recomposition (Operation David)', rank: 1 },
      { id: uid(), label: 'Work projects', rank: 2 },
      { id: uid(), label: 'AI / tool building', rank: 3 },
      { id: uid(), label: 'Dogs / home', rank: 4 },
      { id: uid(), label: 'Calendar / planning', rank: 5 },
    ],
    openLoops: [
      { id: uid(), label: 'Build DavidOS', status: 'open', createdAt: now },
      { id: uid(), label: 'Maintain fitness diary', status: 'open', createdAt: now },
      { id: uid(), label: 'Weekly planning', status: 'open', createdAt: now },
      { id: uid(), label: 'Work training / project assets', status: 'open', createdAt: now },
    ],
    reminders: [
      { id: uid(), label: 'Run weekly review', due: 'Sunday', done: false },
      { id: uid(), label: 'Dog food check', due: '', done: false },
    ],
    projects: seedProjects(),
    prompts: seedPrompts(),
    contextItems: seedContextItems(),
    handoffs: [],
    artifacts: [],
    executionRecords: [],
    healthProfile: seedHealthProfile(),
    auditLog: [],
    settings: { theme: 'dark' },
  };
}
