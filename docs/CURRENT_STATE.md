# Current State — 2026-07-17

Dated snapshot. Update the date and contents whenever a feature lands or a
count changes. (History: see git log and docs/DECISIONS.md.) This file is
the single authoritative description of the deployed production state;
the single authoritative backlog is [docs/OPEN_LOOPS.md](OPEN_LOOPS.md).

## Version

**v0.2 + Training Readiness & Recovery release (PR #8)**, on `main` @
`f01a822ed063156bc418d4efaa8a135f7d42d0fd` (squash merge of PR #8,
merged 2026-07-17) @ GitHub `davidcolome9-byte/DavidOS`, auto-deployed
to GitHub Pages (https://davidcolome9-byte.github.io/DavidOS/) on every
push to `main`. The `deploy.yml` run for `f01a822` succeeded on
2026-07-17 (full verify + smoke gate on the deployed SHA before
publishing), and the release passed post-merge live verification the
same day.

## What works today

- **Command center shell**: 5-tab bottom nav (Home, Workflows, Projects,
  Logs, More) + grouped More menu; dark/light theme; installable PWA with
  a reliable update flow (stamped sw version). App-shell offline caching
  exists but offline launch can fail right after a deploy or on a
  first-ever visit — OL-001 is the authoritative description; do not
  claim full offline reliability until it is fixed.
- **8 agents / 10 workflows** as portable JSON specs in `seed/` (7 domain
  agents + the Universal Operations coordination hub), rendered as cards,
  launched via palette, buttons, or slash commands. The registry:
  daily-brief, weekly-review, gravl-review, fitness-handoff,
  fitness-readiness, work-teachback, universal-operations-review,
  prompt-improvement, content-asset-planner, life-admin-checklist. The
  Training Readiness & Recovery workflow (`fitness-readiness`,
  DOS-FIT-READY, PR #8) is the newest.
- **Rule-based intent router** with confidence (capped 0.9), reasoning,
  and matched-term display; slash commands bypass routing. Fitness intent
  is resolved deterministically to a specific workflow — Gravl review/
  optimize vs. the cleaning/logging Fitness Handoff — instead of
  collapsing every workout request into the handoff; a genuine tie offers
  two plain-language choices rather than silently picking one. An
  illness/recovery signal plus a train/rest/deload/safety decision routes to
  Training Readiness & Recovery **before** Gravl or Fitness Handoff (correcting
  the unsafe "illness + safe to lift → Fitness Handoff" outcome); a bare
  symptom with no training decision is never routed.
- **Continuity-aware Workflow Runner**: prior-handoff retrieval (3
  default / 7 fitness), regex metric extraction with confidence labels,
  conservative date parsing, raw-excerpt fallback on weak extraction,
  SHA-256 prompt fingerprints, Preview vs Full Prompt. Actions are
  labeled **Build Prompt / Copy Prompt / Save Prompt** (secondary: Save to
  Workflow History, Create Follow-Up Task). A built prompt is tracked for
  **validity** (empty request, `(no input provided)`, unresolved
  `{{tokens}}`/`[[placeholders]]`) and **staleness** (input, workflow,
  output config, or included Health Profile context changed); Copy/Save/
  follow-up actions are disabled while a result is invalid or stale, and
  switching workflows clears the old result immediately. Build Prompt is
  blocked only when the request is empty. Gravl prompts do NOT yet use
  prior handoff history (truthfully deferred — OL-026).
- **Gravl Workout Review & Optimization** (`gravl-review`): builds one
  provider-neutral Universal AI Prompt (no AI call here). Review mode when
  a workout is pasted or screenshots are flagged; intake mode otherwise
  (honestly labeled "No Gravl workout added. This prompt will ask for
  it."). Screenshots are never read by DavidOS — the prompt and UI tell
  David to attach them in his AI app after copying. Includes only relevant
  Health Profile context with the generated movement-safety summary preserved
  (generic wording; no hardcoded personal spinal-level fact in tracked source
  or the production bundle) and medications/supplements excluded by default.
  Saved prompts are local-device-only artifacts (title, workflow id,
  original input, built prompt, included-context metadata, creation time).
- **Training Readiness & Recovery** (`fitness-readiness`, PR #8): builds one
  provider-neutral Universal AI Prompt (no AI call here) to help decide whether
  to train as planned, modify the session, do light recovery only, rest and
  reassess, seek non-emergency medical advice, or stop and seek urgent/emergency
  care. Decision support only — it never diagnoses, never prescribes
  medication or treatment, and never claims a wearable/HRV score makes
  training safe; wearable metrics are supporting context that can never
  override symptoms, and the informal "neck rule" is explicitly
  rejected as a sufficient test. Supplied red-flag facts (chest pain, radiating
  pain, trouble breathing, fainting/confusion, possible heart attack/stroke,
  severe dehydration, severe/worsening symptoms) force a prominent emergency-
  escalation directive at the top of the prompt; respiratory-illness signals add
  the "improving overall AND fever-free 24h without fever-reducing medication
  before resuming" guidance. Health Profile context uses a tighter readiness
  whitelist (recovery baselines, training-load basics, movement restrictions,
  safety summary; nutrition/body-metrics/medications/supplements/free-text —
  and unrelated employer/financial fields — excluded) and inclusion is
  disclosed in the UI and prompt. The page presents itself as decision
  support, not a medical device. Routing boundaries: illness/recovery plus
  a train/rest decision → fitness-readiness; ordinary workout review stays
  Gravl; food and workout-note cleanup stay Fitness Handoff.
- **Macro Target Snapshot**: deterministic target-vs-current
  macro comparison appended to fitness prompts when the entry contains
  nutrition totals and the profile has targets.
- **Health & Fitness Profile**: global local-only editor, soft
  validation, per-run prompt toggle, preserved through reset, import
  conflict dialog, audit logs field names + hashes only. Unsaved edits
  survive in-app navigation via a persisted draft with a visible banner
  (OL-002 resolved, PR #5), and a valid import never silently wipes an
  in-progress draft.
- **Vaults**: context (5 kinds), projects, prompts (versioned, tagged).
  Empty-name/title saves are visibly disabled with inline feedback
  (OL-012 resolved). Vault audit records are privacy-redacted (PR #5/#6).
- **Planning**: daily brief, weekly review, reminders, open loops.
- **Safety**: 6-level risk classifier surfaced in the palette, honest
  no-ops for risky unmatched commands, ApprovalGate (high-risk renders no
  Approve button), audit log capped at 300.
- **Continuity & correction history**: saved handoffs support an in-UI
  correction flow (Logs → Handoffs → "Correct this entry"; OL-007
  resolved, PR #5) — corrections outrank prior entries in prompt
  history, originals are marked superseded, and correction
  relationships survive deletion and import validation.
- **Cross-tab protection**: a stale background tab detects another
  tab's newer write via the `storage` event and blocks with a
  focus-managed "reload" dialog instead of clobbering (OL-004 resolved,
  PR #5; dialog a11y hardened in PR #6).
- **Data**: localStorage persistence with a fail-safe recovery contract
  (damaged state is classified, the exact original is quarantined and
  confirmed before any lossy repair may persist, and saving is paused
  rather than ever overwriting the only stored copy — see
  docs/DATA_MODEL.md → "Load & recovery states"); JSON export/import
  with envelope + deep per-item field/enum validation and handoff
  relationship invariants (OL-005 resolved, PR #5) and a
  forward-schemaVersion guard that rejects backups from a newer DavidOS
  (OL-006 resolved, PR #5); type-RESET-to-confirm reset preserving the
  Health Profile exactly (an explicitly deleted profile stays deleted).
- **Google Drive backup export foundation**: token-model auth scaffold +
  Drive client for folder bootstrap and backup upload, ApprovalGate-gated
  (see docs/INTEGRATIONS.md for exact status). Known gaps: GIS loads on
  Settings mount (OL-008), "Forget session" does not revoke the token
  (OL-009), duplicate-folder semantics (OL-010).
- **Direct AI execution: not supported by design.** DavidOS builds
  prompts; it never calls an AI provider (planned as v0.6, OL-025).
  **Native packaging: not built** (Capacitor wrapper planned, v0.7).

## Verification status (2026-07-17, `main` @ `f01a822`, post-PR #8)

Exact counts live here ONLY (other docs reference this file):

- Unit tests: 35 files, **464 tests**, all passing (`npm test`).
- Browser smoke tests: **72 passing** in 11 files (`npm run test:smoke`,
  Playwright chromium, production build; phone + laptop viewports).
- Authoritative visible routing suite: **17/17** (PR #8 verification).
- Routing acceptance corpus (153 cases, read-only ground truth outside
  the repo; metric definitions locked in
  `src/lib/__tests__/routingMetrics.test.ts`):
  - Strict classification: **127/153** (122→127 with PR #8).
  - Tuple conformance: **107/153** — a stricter diagnostic
    (classification AND domain set AND workflow); always ≤ the strict
    score and never to be reported as the strict score.
  - Operational acceptance: **146/153**.
- Workflow registry: **10 workflows** (`seed/workflows/`), 8 agents.
- Lint, seed validation (ids + registry parity), privacy validation
  (generic rules, content-aware scan of all tracked text files),
  docs/metadata consistency, typecheck + production build: all passing
  (`npm run verify`). The three validators run as real CLIs on Windows
  and Linux (cross-platform entrypoints, child-process-tested) and
  print visible success summaries in CI logs.
- CI (`.github/workflows/ci.yml`) runs the identical gate on every pull
  request and on pushes to main; Pages deploys (`deploy.yml`) run the
  same full gate — including smoke tests — on the deployed SHA before
  publishing.
- Deployed to GitHub Pages: the `deploy.yml` run on `f01a822` succeeded
  2026-07-17 (the deploy gate runs the full verify + smoke suite on the
  deployed SHA before publishing), and post-merge live verification of
  the deployed release passed the same day. Installed as a PWA on
  David's Android phone.

## Release history (merged & deployed)

- **PR #8 — Training Readiness & Recovery** (merged 2026-07-17, squash
  `f01a822`; feature-branch tip preserved at `d8e9a21`): the
  `fitness-readiness` workflow, readiness-safe profile whitelist,
  safety-first routing (R-3 corrected), corpus strict 122→127.
- **PR #7 — daily-use routing trio** (merged 2026-07-17, `d3fafff`):
  C-fit-2 / C-review-3 / C-wait-2 phrase registrations; corpus strict
  122/153 after this PR.
- **PR #6 — Context privacy, URL sync, stale-state a11y** (merged
  2026-07-17, `960d929`): ContextVault audit redaction, canonical
  workflow-style URL state, stale-dialog focus hardening.
- **PR #5 — priority functional baseline** (merged 2026-07-16,
  `183c505`): resolved OL-002 (health draft persistence), OL-004
  (cross-tab clobber guard), OL-005 (deep import validation), OL-006
  (forward-schema guard), OL-007 (handoff correction UI), the vault half
  of OL-012, plus audit-record privacy redaction.
- **PR #4 — DOS-GOV-001** (merged 2026-07-15): public-main governance
  and privacy-rule reconciliation.
- **PR #3 — DOS-WF-001** (merged 2026-07-14, `35cc965`): prompt
  validity/staleness tracking (OL-011), Runner half of OL-012, Gravl
  privacy corrections, honest Gravl-history deferral (OL-026).
- **PR #2 — agent readiness & stabilization sprint** (merged
  2026-07-13); **PR #1 — Universal Operations Core** (merged
  2026-07-12).

## Repository state (branches & worktrees, 2026-07-17)

Stable production branch: `main` @ `f01a822` (clean; local == origin).

Historical evidence branches — merged; tips preserved on purpose;
their worktrees under `C:\dev\davidos-worktrees\` are safe to remove
whenever David chooses (removal deliberately NOT performed by agents):

- `feat/dos-priority-functional-baseline` @ `d2ad940` (PR #5, merge
  commit `183c505`)
- `fix/dos-context-url-focus-followup` @ `74f3351` (PR #6)
- `fix/dos-routing-daily-use-trio` @ `024cbd5` (PR #7)
- `feat/dos-fitness-readiness-recovery` @ `d8e9a21` (PR #8; squash-merged,
  so the tip is not an ancestor of `main` — the content IS live)

Stale local draft branches — NOT merged, NOT reviewed, NOT deployed;
do not treat their contents as shipped:

- `fix/dos-fnd-001-reliable-offline-launch` @ `bc3620d` — earlier
  OL-001 candidate, unreviewed draft; superseded by
  `fix/dos-fnd-001-atomic-offline-launch` (DOS-FND-001), the current
  candidate resolution pending independent review and deployment.
- `fix/dos-wf-001r-a-word-boundary` @ `0ac1189` — word-boundary router
  experiment, unreviewed draft.
- `chore/agent-readiness-stabilization`,
  `fix/dos-gov-001-public-main-reconciliation`,
  `agent/universal-operations-core` (remote) — historical branches whose
  unique commits were superseded by the merged PR versions.

## Stabilization sprint highlights (2026-07-12)

- Agent operating layer added (AGENTS.md + docs/), deterministic
  commands (setup/doctor/lint/verify), CI, smoke tests.
- Data-safety repairs: import can no longer fabricate a placeholder
  Health Profile over the real one; malformed stored state is repaired
  instead of white-screening; unreadable blobs are quarantined; persist
  failures show a visible warning.

## Known gaps / in progress

The authoritative list with priorities lives in
[docs/OPEN_LOOPS.md](OPEN_LOOPS.md). Headlines:

- Service-worker offline gaps after deploys (OL-001, highest priority;
  a candidate resolution exists on
  `fix/dos-fnd-001-atomic-offline-launch` pending independent review —
  not merged or deployed, so production still has the defect).
- Artifact/handoff retention policy (OL-003, Requires David).
- v0.3 Drive sync beyond backup export (OL-024; plan:
  docs/google-drive-sync-plan.md).
- Dating Wingman, Cooking & Meal Prep, and Daily Log surfaces exist as
  domains in David's life system but have no dedicated agents yet —
  they currently route to the closest existing agent.

## Environment facts (David's machine)

- Windows 11, repo at `C:\dev\davidos` (NOT in Google Drive — Drive's
  virtual FS breaks node_modules).
- Node.js 24 (winget, machine PATH), npm 11; CI/deploy pins Node 20 —
  code must stay compatible with both (`engines` >= 20).
- gh CLI authenticated as `davidcolome9-byte`.
