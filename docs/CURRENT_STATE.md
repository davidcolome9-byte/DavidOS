# Current State — 2026-07-12

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
- **8 agents / 8 workflows** as portable JSON specs in `seed/` (7 domain
  agents + the Universal Operations coordination hub, merged from main
  during this sprint), rendered as cards, launched via palette, buttons,
  or slash commands.
- **Rule-based intent router** with confidence (capped 0.9), reasoning,
  and matched-term display; slash commands bypass routing.
- **Continuity-aware Workflow Runner**: prior-handoff retrieval (3
  default / 7 fitness), regex metric extraction with confidence labels,
  conservative date parsing, raw-excerpt fallback on weak extraction,
  SHA-256 prompt fingerprints, Preview vs Full Prompt, Copy Full vs Copy
  Current Only, Save handoff (canonical) vs Save Generated Artifact.
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
- **Data**: localStorage persistence with normalizeState migration,
  JSON export/import with strict envelope validation,
  type-RESET-to-confirm reset preserving the Health Profile.
- **Google Drive backup export foundation**: token-model auth scaffold +
  Drive client for folder bootstrap and backup upload, ApprovalGate-gated
  (see docs/INTEGRATIONS.md for exact status).

## Verification status (2026-07-13, post-correction-pass)

Exact counts live here ONLY (other docs reference this file):

- Unit tests: 18 files, 148 tests, all passing (`npm test`).
- Browser smoke tests: 8 passing (`npm run test:smoke`, Playwright
  chromium, mobile viewport, production build).
- Lint, seed validation (ids + registry parity), privacy validation,
  docs/metadata consistency, typecheck + production build: all passing
  (`npm run verify`).
- CI (`.github/workflows/ci.yml`) runs the identical gate on every pull
  request and on pushes to main; Pages deploys (`deploy.yml`) run the
  same full gate — including smoke tests — on the deployed SHA before
  publishing.
- Deployed and installed as PWA on David's Android phone (pre-sprint
  build; next push to main redeploys).

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
