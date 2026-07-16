# Current State — 2026-07-15

Dated snapshot. Update the date and contents whenever a feature lands or a
count changes. (History: see git log and docs/DECISIONS.md.)

## Version

**v0.2 + Drive backup export foundation + macro target snapshot**, on
`main` @ GitHub `davidcolome9-byte/DavidOS`, auto-deployed to GitHub Pages
(https://davidcolome9-byte.github.io/DavidOS/) on every push to `main`.

## What works today

- **Command center shell**: 5-tab bottom nav (Home, Workflows, Projects,
  Logs, More) + grouped More menu; dark/light theme; installable PWA with
  a reliable update flow (stamped sw version). App-shell offline caching
  exists but offline launch can fail right after a deploy or on a
  first-ever visit — OL-001 is the authoritative description; do not
  claim full offline reliability until it is fixed.
- **8 agents / 9 workflows** as portable JSON specs in `seed/` (7 domain
  agents + the Universal Operations coordination hub, merged from main
  during this sprint), rendered as cards, launched via palette, buttons,
  or slash commands. The Gravl Workout Review & Optimization workflow
  (`gravl-review`, DOS-WF-001) is the newest.
- **Rule-based intent router** with confidence (capped 0.9), reasoning,
  and matched-term display; slash commands bypass routing. Fitness intent
  is now resolved deterministically to a specific workflow — Gravl review/
  optimize vs. the cleaning/logging Fitness Handoff — instead of
  collapsing every workout request into the handoff; a genuine tie offers
  two plain-language choices rather than silently picking one.
- **Continuity-aware Workflow Runner**: prior-handoff retrieval (3
  default / 7 fitness), regex metric extraction with confidence labels,
  conservative date parsing, raw-excerpt fallback on weak extraction,
  SHA-256 prompt fingerprints, Preview vs Full Prompt. Actions are now
  labeled **Build Prompt / Copy Prompt / Save Prompt** (secondary: Save to
  Workflow History, Create Follow-Up Task). A built prompt is tracked for
  **validity** (empty request, `(no input provided)`, unresolved
  `{{tokens}}`/`[[placeholders]]`) and **staleness** (input, workflow,
  output config, or included Health Profile context changed); Copy/Save/
  follow-up actions are disabled while a result is invalid or stale, and
  switching workflows clears the old result immediately. Build Prompt is
  blocked only when the request is empty.
- **Gravl Workout Review & Optimization** (`gravl-review`): builds one
  provider-neutral Universal AI Prompt (no AI call here). Review mode when
  a workout is pasted or screenshots are flagged; intake mode otherwise
  (honestly labeled "No Gravl workout added. This prompt will ask for
  it."). Screenshots are never read by DavidOS — the prompt and UI tell
  David to attach them in his AI app after copying. Includes only relevant
  Health Profile context with the generated movement-safety summary preserved
  (generic wording; no hardcoded personal spinal-level fact in tracked source
  or the production bundle) and medications/supplements excluded by default.
  Saved prompts are
  local-device-only artifacts (title, workflow id, original input, built
  prompt, included-context metadata, creation time).
- **Macro Target Snapshot** (newest): deterministic target-vs-current
  macro comparison appended to fitness prompts when the entry contains
  nutrition totals and the profile has targets.
- **Health & Fitness Profile**: global local-only editor, soft
  validation, per-run prompt toggle, preserved through reset, import
  conflict dialog, audit logs field names + hashes only.
- **Vaults**: context (5 kinds), projects, prompts (versioned, tagged).
- **Planning**: daily brief, weekly review, reminders, open loops.
- **Safety**: 6-level risk classifier surfaced in the palette, honest
  no-ops for risky unmatched commands, ApprovalGate (high-risk renders no
  Approve button), audit log capped at 300.
- **Data**: localStorage persistence with a fail-safe recovery contract
  (damaged state is classified, the exact original is quarantined and
  confirmed before any lossy repair may persist, and saving is paused
  rather than ever overwriting the only stored copy — see
  docs/DATA_MODEL.md → "Load & recovery states"); JSON export/import
  with envelope + partial top-level structural validation (deep
  per-item validation is OL-005, forward-schema guard OL-006);
  type-RESET-to-confirm reset preserving the Health Profile exactly
  (an explicitly deleted profile stays deleted).
- **Google Drive backup export foundation**: token-model auth scaffold +
  Drive client for folder bootstrap and backup upload, ApprovalGate-gated
  (see docs/INTEGRATIONS.md for exact status).

## Verification status (2026-07-15, post-DOS-WF-001 deployment)

Exact counts live here ONLY (other docs reference this file):

- Unit tests: 23 files, 233 tests, all passing (`npm test`).
- Browser smoke tests: 25 passing (`npm run test:smoke`, Playwright
  chromium, production build; phone + laptop viewports).
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
- Deployed to GitHub Pages and accepted through phone + laptop QA on the
  current `main` (DOS-WF-001 included), and installed as a PWA on David's
  Android phone.

### DOS-WF-001 (2026-07-14) — merged, deployed, and accepted

- Merged to `main` via PR #3 and deployed to GitHub Pages. The authoritative
  deployed commit is `35cc9655a11fbc78f27caca5297330a023679026`. Accepted
  through phone + laptop QA; cleanup is complete.
- **Correction pass (2026-07-14)** applied ChatGPT-review findings:
  Gravl builder carries generic safety language only (no hardcoded
  spinal-level fact — private movement-safety detail appears solely via the
  included, whitelisted Health Profile context); a Gravl-safe profile field whitelist
  drops meds/supplements, `promptSummary`, `freeformContext`, and nutrition;
  Gravl routing requires workout context (generic "review …" no longer
  hijacks meal/macro/nutrition/recovery requests); the false "expanded
  history" claim is removed (Gravl history deferred, OL-026); action handlers
  re-check validity/staleness before any write (defense-in-depth); staleness
  keys on the full profile-context hash; and URL input hydration is split from
  workflow/style sync. See docs/DECISIONS.md correction entry.
- **Local-only save**: saved prompts persist to this browser/device's
  localStorage only. No Google Drive sync.
- **Deferred / excluded on purpose**: Google Drive Prompt Vault deferred
  (OL-024); embedded AI execution excluded (DavidOS is a prompt builder,
  not an AI service); screenshot upload/OCR excluded.

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

- Service-worker offline gaps after deploys (OL-001, highest priority).
- Handoff correction/edit UI (OL-007; model fields exist, retrieval
  respects them, no UI yet).
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
