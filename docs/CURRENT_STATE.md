# Current State — 2026-07-19

Dated snapshot. Update the date and contents whenever a feature lands or a
count changes. (History: see git log and docs/DECISIONS.md.) This file is
the single authoritative description of the deployed production state;
the single authoritative backlog is [docs/OPEN_LOOPS.md](OPEN_LOOPS.md).

`package.json` and `package-lock.json` were unchanged by DOS-WF-002A and
remain unchanged in this documentation-closeout candidate.

## DOS-AGT-001A candidate status (this branch)

This file is currently being edited on the local branch
`feat/dos-agt-001a-supervised-coding-agent` as part of the **DOS-AGT-001A
Supervised Coding Coordinator foundation candidate**. That candidate adds a
local-only supervised execution layer (separate execution-agent registry with
the single `coding-coordinator` profile, `AppState.executionRecords`,
deterministic execution packets, a mobile-first "Supervised execution"
section on the Agents page, allowlist-only audit metadata, and optional
deeply validated import) — see docs/DECISIONS.md 2026-07-19 (DOS-AGT-001A)
and docs/OPEN_LOOPS.md OL-030. DavidOS itself still calls no AI provider,
executes no commands, and mutates no Git/GitHub state; the new layer only
records and copies instructions for work David runs himself externally.

The candidate has additionally been through two targeted correction passes
from independent Codex candidate review:
1. Runtime correction pass (deep boot validation of stored execution
   records under the standard recovery/quarantine contract; audit entries
   reduced to fixed allowlisted metadata with no record ids; outcomeSummary
   restricted to completed records; exact six-key boolean authority shape;
   strict canonical millisecond-UTC ISO timestamps; accessible inline cancel
   confirmation with managed focus; mobile-safe wrapping of long user
   content) — see docs/DECISIONS.md 2026-07-19 (correction pass).
2. Final regression-coverage strengthening pass (Codex verdict: "sound with
   small required fixes", no runtime defect found) — an explicit
   draft→ready outcomeSummary-cleanup test plus a full non-completed
   transition matrix asserting own-property removal; non-vacuous Playwright
   assertions proving the actual long hostile values render, stay
   contained, and never overlap nearby controls; a real-browser test
   confirming native Enter/Space keyboard activation of the inline cancel
   controls — see docs/DECISIONS.md 2026-07-19 (final regression pass).

**This candidate is NOT merged, NOT independently re-reviewed since the
final regression pass, NOT deployed.** Everything
below this section continues to describe the deployed production state at
PR #18 (`49c71ca`) and deliberately does not count this branch's changes.
Candidate-local verification at the time of writing: full unit suite and the
full Playwright smoke suite (including the new `supervisedExecution.spec.ts`)
pass locally; `package.json`/`package-lock.json` are unchanged by this
candidate. Final counts and release evidence will be recorded at closeout,
after independent review, merge, CI, and deploy.

## Version

**v0.2 + Planning Context Unification release (PR #18, DOS-WF-002A)**, on
`main` @ `49c71caa7ad8af95afad3adc09893a0388810745` (merge commit of PR #18,
"feat: unify planning context across brief workflows"; product head
`73d1306f0c571a84d33f0b06059110f589dc7fcd`; merged 2026-07-19) @ GitHub
`davidcolome9-byte/DavidOS`, auto-deployed to GitHub Pages
(https://davidcolome9-byte.github.io/DavidOS/) on every push to `main`.

Merge-SHA CI (`ci.yml` run `29701986395`) succeeded. The `deploy.yml` run
for `49c71ca` (run ID `29701986418`) succeeded on 2026-07-19 — the full
verify + Playwright smoke gate (98 tests, real `playwright install chromium
--with-deps` on a clean GitHub-hosted runner) runs on the deployed SHA
before publishing, and only completes the deploy step after that gate
passes. Pages artifact: ID `8446730578`, digest
`sha256:505e6e7dbe848d13ad758f806d9da95157a10652649843782310efbf04573d37`
(GitHub API artifact metadata independently re-queried and confirmed to
match against `head_sha` `49c71caa7ad8af95afad3adc09893a0388810745`).

**Release-acceptance evidence for this package used a substitution, not
interactive live-site testing from this session.** This Claude Code session
runs behind an outbound-HTTPS egress policy that rejects the GitHub Pages
host (`davidcolome9-byte.github.io`) and the Pages-artifact blob host alike
at the CONNECT layer — confirmed by two direct attempts, not assumed. That
means production reachability and deployed-artifact content were **not**
independently inspected from this session; only the GitHub API metadata
above (artifact existence, digest, head SHA) was. Acceptance instead rests
on: exact-SHA CI and deploy-gate success (both of which run the full
Playwright suite against a properly provisioned browser before anything
is published), deployment-artifact provenance confirmed via the GitHub
API, and an independent Fable acceptance review of the identical product
head (see "DOS-WF-002A Fable acceptance" below). Any direct confirmation
of live-site reachability or rendered content is Program Control's own,
performed outside this session — it is not claimed here as something this
Claude session did.

Prior release: v0.2 + Modal Focus Management (PR #16, merge
`7077dac7a9e50f84e39b0f58bf7665b358a1e577`, merged 2026-07-19; independent
review the same day) — see "Release history" below.

## What works today

- **Command center shell**: 5-tab bottom nav (Home, Workflows, Projects,
  Logs, More) + grouped More menu; dark/light theme; installable PWA with
  an atomic, all-or-nothing app-shell offline caching manifest (stamped sw
  version derived at build time from real dist/ output). Offline launch,
  offline reload, history navigation, and offline intent routing are fully
  reliable and verified (OL-001 resolved).
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
- **Planning** (unified planning context, PR #18 / DOS-WF-002A): daily
  brief, weekly review, reminders, open loops. The Planning-page local (no
  AI call) generation and the Workflow Runner AI-prompt path for both Daily
  Brief and Weekly Review now share one canonical, privacy-bounded
  planning-context source (`src/lib/planning/planningContext.ts`) — an
  approved-fields allowlist (priority label+rank, open-loop label, reminder
  label+due, project name/status/nextAction) with no field for project
  notes/area, Context Vault, Health Profile, audit content, artifact
  content, or handoff content/summaries to pass through. The Workflow
  Runner adds a default-on "Include planning state" toggle, a
  `PlanningContextDisclosure` showing counts + a short fingerprint with an
  exact-inserted-text reveal and the explicit exclusion list, and permits
  zero-note prompt building for these two workflows only (a locked
  placeholder — never the generic "no input provided" marker — fills New
  Entry when nothing is typed). Built prompts go stale (Copy/Save/
  follow-up disabled) when planning state or the inclusion toggle changes,
  reusing the existing full-hash config-key staleness pattern. Local
  no-AI generation is now labeled "Generate locally (no AI)" vs. "Build AI
  prompt (Workflow Runner)" on the Planning page. `OpenLoop.closedAt` is
  now stamped on close and cleared on reopen (stamp-only in this package;
  not yet read anywhere — reserved for future weekly closed-loop
  reporting, still deferred).
- **Safety**: 6-level risk classifier surfaced in the palette, honest
  no-ops for risky unmatched commands, ApprovalGate (high-risk renders no
  Approve button), audit log capped at 300.
- **Modal focus management** (shared `useModalFocus` hook, PR #16,
  OL-015 resolved): all six dialog surfaces (Settings import-conflict,
  Settings reset-confirmation, StorageManager pruning, Settings Health
  Profile draft-conflict, ApprovalGate, StaleTabDialog) now share one
  hook for safe initial focus, Tab/Shift+Tab containment, and
  connected-opener focus restoration. Escape is mapped only to each
  surface's existing safe cancel/deny action — never to a destructive or
  approving action; ApprovalGate's Escape always resolves to
  `onDecision(false)` (deny), matching its Deny/Close-only button set.
  Body-scroll locking now uses a reference count so stacked modals lock
  and unlock correctly. StaleTabDialog's persistent banner, `inert`
  handling, and write-suppression guard are unchanged by this work.
  Typed `RESET`/`PRUNE` confirmation guards are unchanged. No native
  `<dialog>` conversion, portals, generalized inert framework, or
  backdrop-dismissal change was introduced (deliberately out of scope).
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

## Verification status (2026-07-19, `main` @ `49c71caa7ad8af95afad3adc09893a0388810745`, post-PR #18)

Exact counts live here ONLY (other docs reference this file):

- Unit/component tests: 46 files, **606/606 tests**, all passing
  (`npm test`), up from the pre-DOS-WF-002A 562/562 baseline (new:
  `planningContextInclude.test.tsx`, plus additions to `continuity.test.ts`,
  `importValidation.test.ts`, `promptValidity.test.ts`, and the new
  `planningContext.test.ts`).
- Browser smoke tests: **98/98 passing on GitHub Actions** — both the
  merge-SHA CI run (`29701986395`) and the merge-SHA Pages deploy run
  (`29701986418`) completed successfully, and both run the full Playwright
  suite (`npx playwright install chromium --with-deps` then
  `npx playwright test`) as a blocking gate step on a clean, correctly
  provisioned runner. Up from the pre-DOS-WF-002A 94/94 baseline (new:
  `tests/smoke/planningUnification.spec.ts`, 4 tests). **Sandbox
  re-verification note:** an independent local re-run in a separate,
  resource-constrained sandbox environment (mismatched pre-installed
  Chromium revision, shared build artifacts) reproduced 97/98 — the one
  failure (`tests/smoke/storageRetention.spec.ts`, "near-quota state
  raises the app-wide protection banner and Settings warning") was
  investigated and classified **CONFIRMED PRE-EXISTING TEST/HARNESS
  INTERACTION**, not a DOS-WF-002A regression: it reproduced identically
  (same failure line, same disabled-button state, same active
  `⚠️ Updated in another tab` stale-tab-guard dialog) on both merged `main`
  and the pre-DOS-WF-002A base commit, with the test file, `store.tsx`
  stale-tab detection, and `StaleTabDialog.tsx` byte-identical across both
  revisions. The near-quota smoke setup's `seedArtifacts` helper writes
  directly to `localStorage` and reloads, which can self-trigger the
  app's genuine cross-tab `storage`-event guard under certain
  environment timing, blocking the test's own prune interaction. Product
  storage protection (OL-003) and stale-tab protection (OL-004) remain
  operational; this is a test-isolation/seeding-hardening item, tracked as
  OL-029 (see docs/OPEN_LOOPS.md). Not reproduced on GitHub's CI/deploy
  runners.
- **DOS-WF-002A Fable acceptance** (independent, read-only UI/UX/mobile/
  accessibility review of the exact product head `73d1306f0c...`):
  recommendation **APPROVE WITH NON-BLOCKING FOLLOW-UPS**. Reviewed at
  375×812, 812×375, 768×1024, and 1440×900 across all four unified
  planning surfaces (Planning-page Daily Brief/Weekly Review, Workflow
  Runner Daily Brief/Weekly Review), the inclusion toggle, exact-text
  reveal, privacy-exclusion disclosure, zero-note behavior, stale-prompt
  handling, disabled-action behavior, and keyboard/focus behavior. No
  blocking UI, privacy, staleness, mobile, or accessibility finding. Two
  non-blocking accessibility observations (reveal-panel focus loss on
  activation; revealed overflow output not keyboard-scrollable) tracked as
  OL-028 (see docs/OPEN_LOOPS.md) — same class of finding as OL-015's own
  future-hardening note, not a regression in the OL-015 focus-management
  work itself.
- **Production release-acceptance evidence substitution:** interactive
  live-site traversal was not performed from this Claude Code session — its
  outbound-HTTPS egress policy rejects both the GitHub Pages host and the
  Pages-artifact blob host at the CONNECT layer (confirmed by direct
  attempt, not assumed). Acceptance instead rests on exact-SHA CI and
  deploy-gate success (both of which run the full 98-test Playwright suite
  against a properly provisioned browser before anything publishes),
  GitHub API–confirmed deployment-artifact provenance (ID `8446730578`,
  digest `sha256:505e6e7dbe...4573d37`, matching `head_sha`
  `49c71caa...`), and the independent Fable acceptance review above. See
  "Version" section for the full distinction. Prior releases in this
  history (e.g. OL-003, OL-015 below) recorded interactive live-site
  verification; this package does not claim that for itself.
- Authoritative visible routing suite: **17/17** (PR #8 verification).
- Routing acceptance corpus (153 cases, read-only ground truth outside
  the repo; metric definitions locked in
  `src/lib/__tests__/routingMetrics.test.ts`):
  - Strict classification: **127/153**.
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
- Deployed to GitHub Pages: the `deploy.yml` run on `7077dac` (run ID
  29667970651, job 88141751291, deployment ID 5506816489) succeeded
  2026-07-19 (the deploy gate runs the full verify + smoke suite on the
  deployed SHA before publishing).
- OL-015 independent review: **Verdict B. APPROVED WITH NON-BLOCKING
  OBSERVATIONS** (reviewer: GPT-5.6 Sol, High; independent, read-only).
  Confirmed the shared `useModalFocus` hook and all six migrated
  surfaces, plus isolated deployed-browser acceptance (Reset dialog,
  ApprovalGate Deny/Escape-to-Deny, StaleTabDialog) with zero page/
  console errors. Two non-blocking observations: (1) the shared selector
  does not yet filter every hidden/inert/CSS-invisible candidate —
  future hardening, no current surface is affected; (2) the reviewer's
  environment blocked remote GitHub metadata re-query — non-blocking
  because local refs/trees and deployed-site behavior were independently
  confirmed. Artifact: `C:\dev\backups\ol_015_modal_focus_management_independent_review.md`
  (19,839 bytes, SHA-256: `765C977CEADA6DE24B7968C784534239D1F4A1645F753C8D9D54AC4BA85879F4`).
- Archived live-release report: `C:\dev\backups\DavidOS-OL-015-modal-focus-management-live-release-2026-07-19.md`
  (11,972 bytes, SHA-256: `4AE17DB59AB4BCF9A35F2264FE177E9EF858B7E77EE7D2ED6E159BC970C783B7`).
- Prior release (OL-003) live production acceptance: Verdict A. LIVE
  ACCEPTANCE PASSED, 40/40 focused criteria, 2026-07-18 — see the
  "Release history" entry for PR #14 below; unaffected by PR #16.
- Android Installed-PWA Status: Manual verification on a target Android PWA client via Path B (fresh install) succeeded, proving successful service-worker installation, offline launch, repeated offline launch, local data preservation, and offline routing. *Limitation:* Android Path B does not manually prove an in-place upgrade from a pre-PR #10 installation (Path A was not performed); in-place update capability is verified via automated Build A to Build B E2E tests.

## Release history (merged & deployed)

- **PR #18 — Planning Context Unification (DOS-WF-002A)** (merged
  2026-07-19, normal merge commit
  `49c71caa7ad8af95afad3adc09893a0388810745`; product head
  `73d1306f0c571a84d33f0b06059110f589dc7fcd`): one canonical,
  privacy-bounded planning-context source now backs Planning-page Daily
  Brief/Weekly Review and Workflow Runner Daily Brief/Weekly Review;
  default-on planning-state inclusion toggle with counts/fingerprint/
  exact-text disclosure and explicit exclusion list; zero-note prompt
  building for these two workflows; staleness on inclusion/state change;
  `OpenLoop.closedAt` stamping (unread, reserved). Merge-SHA CI (run
  `29701986395`) and Pages deploy (run `29701986418`) both succeeded, each
  running the full 98-test Playwright suite as a blocking gate. Fable
  independent review: APPROVE WITH NON-BLOCKING FOLLOW-UPS, no blocking
  findings. See "DOS-WF-002A: Planning Context Unification" in
  docs/DECISIONS.md for the technical decision record.
- **PR #16 — Modal Focus Management** (merged 2026-07-19, normal merge
  commit `7077dac7a9e50f84e39b0f58bf7665b358a1e577`; feature candidate
  `393839908a9cc9f8bc8a60aa9241b387615fdecb`): shared `useModalFocus`
  hook migrates all six dialog surfaces to safe initial focus, Tab/
  Shift+Tab containment, safe Escape mapping, connected-opener focus
  restoration, and reference-counted stacked-modal scroll locking;
  resolved OL-015.
- **PR #14 — Storage Protection & Retention** (merged 2026-07-18, squash
  `a341b5cbe0cab88eed8d8ce43e604b04b6ce999c`): implements explicit guarded prompt-artifact pruning (keep-newest-N) with export-first prompts; warning/critical storage-usage meters and warning banner; transactional persist-first commit for pruning; health-guarded pruning blocks; resolved OL-003.
- **PR #12 — Health Profile Import Draft Protection** (merged 2026-07-18, squash
  `789fe4d7fd2ad7cbfa5448a4efa10cd8c212128f`): commits imports atomically before clearing Health Profile draft; Cancel button focused by default in dialog; Esc key preservation; rejects malformed/future JSON imports; resolved OL-027.
- **PR #10 — Reliable Offline Launch** (merged 2026-07-17, squash
  `f9074dfa672b44381bc1212c0190807a28b4de34`): generates complete build-derived
  precached shell manifest; atomic SW updates with fallback on failed install;
  offline reload, navigation, and routing; namespaced cleanup; resolved OL-001.
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

## Repository state (branches & worktrees, 2026-07-19)

Stable production branch: `main` @ `49c71caa7ad8af95afad3adc09893a0388810745` (clean; local == origin).

Historical evidence branches — merged; tips preserved on purpose;
their worktrees under `C:\dev\davidos-worktrees\` are safe to remove
whenever David chooses (removal deliberately NOT performed by agents):

- `feat/dos-priority-functional-baseline` @ `d2ad940` (PR #5, merge commit `183c505`)
- `fix/dos-context-url-focus-followup` @ `74f3351` (PR #6)
- `fix/dos-routing-daily-use-trio` @ `024cbd5` (PR #7)
- `feat/dos-fitness-readiness-recovery` @ `d8e9a21` (PR #8)
- `fix/dos-fnd-001-atomic-offline-launch` @ `287445957c92d2c835f9b181024cb210d8145f4c` (PR #10)
- `fix/health-profile-import-draft-protection` @ `bfa5512d1fad96af6c4bfd56de852f131cdb387e` (PR #12)
- `fix/ol-003-storage-protection-retention` @ `19e303b107c3540639a1a04809b5bd270290dd01` (PR #14)
- `fix/ol-015-modal-focus-management` @ `393839908a9cc9f8bc8a60aa9241b387615fdecb` (PR #16, merge commit `7077dac7a9e50f84e39b0f58bf7665b358a1e577`)

Stale local draft branches — NOT merged, NOT reviewed, NOT deployed;
do not treat their contents as shipped:

- `fix/dos-fnd-001-reliable-offline-launch` @ `bc3620d` — earlier
  OL-001 candidate, unreviewed draft; superseded by
  `fix/dos-fnd-001-atomic-offline-launch` (DOS-FND-001).
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
