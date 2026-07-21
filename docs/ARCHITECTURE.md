# DavidOS Architecture

## Overview
Local-first single-page app. No backend. All state lives on-device; all "AI"
is local template generation. External systems exist as typed, disabled stubs
behind approval gates — with one live, gated exception: manual Google Drive
backup export (v0.3 foundation; see docs/INTEGRATIONS.md).

```
UI (React components)
  └─ app/AppErrorBoundary   top-level crash recovery surface (outside everything)
  └─ state/store.tsx        React context + journal-backed persistence
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
  handoffs, audit log, settings. Persisted on every change as a new immutable
  journal generation in localStorage, coalesced and serialized per tab and
  coordinated across tabs by one exclusive Web Lock.

## Routing system
`src/lib/router/`:
- `routeScoring.ts` — keyword tables per agent, weighted (phrases > words), returns
  ranked scores with matched terms.
- `intentRouter.ts` — turns scores into a `RouteResult`: target agent, confidence
  (heuristic, capped at 0.9), human-readable reasoning, suggested workflow, next action.

Slash commands (`src/lib/commands.ts`) are matched before routing: `/brief`,
`/fitness`, `/work`, etc. → navigation or workflow launch.

Universal Operations commands (`/ops-review`, `/waiting`, `/autonomous`,
`/capture`, and `/route <domain>`) use the same command framework. `/route`
resolves known domains to registered workflow ids deterministically and falls
back to the current clarification/routing UX when a domain is unknown.

## Agent & workflow registries
- `lib/agents/agentRegistry.ts` — loads the agent JSON specs, lookup by id.
- `lib/workflows/workflowRegistry.ts` — loads the workflow specs, lookup by id
  or agent.
- `lib/workflows/templateRenderer.ts` — fills `{{input}}`, `{{style}}`, `{{date}}`
  in a workflow's template. This is the whole "generation" engine in v1 — honest,
  local, no fake AI.

Registry modules validate stable ids, duplicate ids, and workflow-to-agent
references at startup while preserving the existing unknown-id lookup behavior.
`lib/workflows/universalOperations.ts` contains pure Universal Operations review
logic for cross-domain posture, waiting-on-user separation, autonomous blockers,
deterministic domain routing, approval boundaries, and one next action.

Universal Operations is a generic hub, not a replacement for specialized domain
workflows. Private long-term personal source material belongs in Google Drive or
another private store; public seed files contain only reusable schemas, generic
workflow instructions, and source aliases.

## Execution-agent registry (supervised execution, DOS-AGT-001A)

`lib/agents/executionAgentRegistry.ts` is a SEPARATE, fixed TS-data registry
(precedent: slash commands in `lib/commands.ts`) holding exactly one profile:
the **DavidOS Coding Coordinator** (`coding-coordinator`, its own
`ExecutionAgentId` type). Execution agents are local coordination profiles for
coding work David performs himself in an external service (Claude Code, Codex,
Gemini, Antigravity, or manual). They are deliberately NOT seed agents: they
are never routing targets, have no workflows, and never enter the `AgentId`
union (validate-seed's seed<->registry parity applies only to routed agents).

`lib/agents/executionRecords.ts` holds all pure domain logic for
`ExecutionRecord`s: restrictive authority construction (only real booleans on
recognized keys; everything else stays "not authorized"), readiness
(title/objective/scope/stopConditions each required separately), the lifecycle
state machine with transition normalization, terminal immutability
(completed/cancelled reject every later mutation), unknown-safe deep
validation (shared with import), and deterministic execution-packet rendering
(pure function; byte-identical re-renders; carries a fixed honesty notice that
DavidOS executed, sent, and mutated nothing). `lib/agents/executionAudit.ts`
builds allowlisted audit entries from closed inputs only: fixed event names,
closed status labels, and counts — never user-entered text OR record ids, in
any form. Stored records are deep-validated at boot by the same unknown-safe
validator import uses; anything it rejects routes through the standard
quarantine/recovery contract instead of reaching the UI.

The UI is one thin section on the existing Agents page
(`components/SupervisedExecutionSection.tsx`) — no new route, nav item,
dependency, provider path, or background job. DavidOS only records and copies;
the external service does the work under David's supervision.

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
Canonical AppState lives in an immutable **generation journal**, not a single
mutable key (DOS-STAB-001A). Full format, commit protocol, and failure model:
[DATA_MODEL.md → Persistence](DATA_MODEL.md#persistence--the-state-journal-dos-stab-001a).

- `lib/storage/stateJournal.ts` — the journal itself: immutable generation
  records, two alternating verified head slots, and the one exclusive Web
  Lock (`davidos-app-state-journal-v1`) under which every canonical write and
  the legacy migration run. Commits verify the generation AND the head by
  read-back before reporting success; there is deliberately no rollback path.
- `lib/storage/journalPersistence.ts` — one `JournalPersistenceController`
  per StoreProvider: serializes and coalesces this tab's queued saves,
  tracks committed authority, exposes the shared destructive commit boundary,
  and suppresses saving after an external head change or an uncertain
  outcome. Persistence health lives OUTSIDE AppState so recording it cannot
  recurse into another save.
- `lib/storage/localStore.ts` — journal-aware boot: selects verified
  authority, then runs the preservation / quarantine / normalization
  pipeline. Still the only file that knows the LEGACY key, which is now
  migration input and read-fallback only. Remains the swap point for
  IndexedDB or Drive sync.
- `lib/storage/bootValidation.ts` — deep per-record integrity and the
  allowlisted, counts-only damage vocabulary for warnings and logs.
- `lib/storage/exportImport.ts` — versioned JSON envelope
  (`{app: "davidos", schemaVersion, state}`); import validates the
  envelope and top-level structure (required arrays + settings), then
  repairs item-level damage via `normalizeState`. Deep per-field
  validation and a forward-schemaVersion guard are pending (OL-005,
  OL-006). Download helper for backups.

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
