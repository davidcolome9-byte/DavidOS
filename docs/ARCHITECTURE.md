# DavidOS Architecture

## Overview
Local-first single-page app. No backend. All state lives on-device; all "AI"
is local template generation. External systems exist as typed, disabled stubs
behind approval gates — with one live, gated exception: manual Google Drive
backup export (v0.3 foundation; see docs/INTEGRATIONS.md).

```
UI (React components)
  └─ state/store.tsx        React context + localStorage persistence
       ├─ data/defaultState  seeds initial state from /seed files
       └─ lib/…              pure logic modules (router, safety, audit, …)
```

## Data model
Every entity is defined in `src/lib/types.ts` (single source of truth):
Agent, Workflow, Command, Project, Prompt, ContextItem, Priority, OpenLoop,
Reminder, Handoff, WorkflowArtifact, HealthFitnessProfile, ApprovalStatus,
IntegrationAdapter, AuditLogEntry, RiskLevel, AppState. (`ApprovalRequest`
is UI-local in `src/components/ApprovalGate.tsx`.)

Two kinds of data:
- **Static specs** (agents, workflows): JSON/markdown in `/seed`, imported at
  build time via registries — portable, any AI tool can read them. Slash
  commands are TS data in `src/lib/commands.ts`.
- **Live state** (`AppState`): projects, prompts, context, loops, reminders,
  handoffs, audit log, settings. Persisted to localStorage on every change.

## Routing system
`src/lib/router/`:
- `routeScoring.ts` — keyword tables per agent, weighted (phrases > words), returns
  ranked scores with matched terms.
- `intentRouter.ts` — turns scores into a `RouteResult`: target agent, confidence
  (heuristic, capped at 0.9), human-readable reasoning, suggested workflow, next action.

Slash commands (`src/lib/commands.ts`) are matched before routing: `/brief`,
`/fitness`, `/work`, etc. → navigation or workflow launch.

## Agent & workflow registries
- `lib/agents/agentRegistry.ts` — loads the 7 agent JSON specs, lookup by id.
- `lib/workflows/workflowRegistry.ts` — loads the 7 workflow specs, lookup by id
  or agent.
- `lib/workflows/templateRenderer.ts` — fills `{{input}}`, `{{style}}`, `{{date}}`
  in a workflow's template. This is the whole "generation" engine in v1 — honest,
  local, no fake AI.

## Continuity engine (v0.2 — the core of the Workflow Runner)
- `lib/workflows/continuity.ts` — prior-handoff retrieval (3 default /
  7 fitness, overfetch ×2, status filter, correction dedupe) and prompt
  assembly: New Entry → Personal Targets → Macro Target Snapshot →
  Prior Context → Analysis Instructions; SHA-256 prompt fingerprints.
- `lib/workflows/fitnessExtraction.ts` — regex metric extraction with
  high/medium/low confidence; weak extraction triggers a raw-excerpt
  fallback so no data silently disappears.
- `lib/workflows/dateParsing.ts` — conservative date parsing with explicit
  confidence levels.
- `lib/workflows/workflowMeta.ts` — category / historyProfile / outputMode
  resolution (explicit spec metadata wins; weighted keyword fallback).
- `lib/utils/hash.ts` — sync pure-JS SHA-256. Sync usage is deliberate
  (fingerprints are computed in render paths); do not swap for
  crypto.subtle.

## Health & Fitness Profile
- `lib/health/profilePrompt.ts` — profile prompt block + hash metadata;
  bracket-placeholder values are filtered out of prompts.
- `lib/health/profileValidation.ts` — soft validation and changed-field
  diffing (audit logs field names + hash, never values).
- `lib/health/macroAnalysis.ts` — deterministic macro target snapshot:
  parses current totals from a fitness entry, compares against profile
  nutrition targets, emits correction cues.
- `data/healthProfileSeed.ts` — generic bracket-placeholder starter
  profile (public repo — real values only in the personal backup).

## Safety system
`src/lib/safety/`:
- `riskClassifier.ts` — classifies free text into six levels (read_only → high_risk),
  first-match-wins from highest risk down.
- `approvalRules.ts` — the policy: what proceeds, what needs a notice, what gates,
  what is blocked outright in v1.
- `components/ApprovalGate.tsx` — the blocking modal. High-risk requests render
  without an Approve button.

Full policy: [security-and-approval-model.md](security-and-approval-model.md).

## Audit
`lib/audit/auditLog.ts` — every routed command, workflow run, local write, and
approval decision appends an entry (timestamp, command, agent, workflow, action
type, approval status, result summary). Capped at 300 entries, newest first.

## Storage strategy
- `lib/storage/localStore.ts` — load/persist/clear against localStorage. The ONLY
  file that knows where state lives; swap point for IndexedDB or Drive sync.
- `lib/storage/exportImport.ts` — versioned JSON envelope
  (`{app: "davidos", schemaVersion, state}`), strict validation on import,
  download helper for backups.

## Integration adapter pattern
`lib/integrations/` — one file per adapter (`*.stub.ts`), each exporting:
1. An `IntegrationAdapter` descriptor: capabilities, required credentials, risk
   level, method list (each with its own risk + `implemented: false`), future notes.
2. Stub method functions that return `{ok: false, message}` — they never pretend
   an external action happened.

Real implementations must: keep the same method signatures, route every write
through `requiresApproval()` + ApprovalGate, and audit-log every call.

## Adding an agent (checklist)
1. `seed/agents/<name>.json` — the spec.
2. Add its id to `AgentId` in `types.ts`.
3. Import it in `agentRegistry.ts`.
4. Add keywords in `routeScoring.ts` + default workflow in `intentRouter.ts`.
5. Add at least one workflow (below).

## Adding a workflow (checklist)
1. `seed/workflows/<name>.json` — template with `{{input}}`/`{{style}}`/`{{date}}`.
2. Import it in `workflowRegistry.ts`.
3. Optionally add a slash command in `commands.ts`.
4. `npm test` — registry tests verify agent/workflow wiring automatically.
