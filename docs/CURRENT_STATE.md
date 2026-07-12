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
  offline app-shell caching and reliable update flow (stamped sw version).
- **7 agents / 7 workflows** as portable JSON specs in `seed/`, rendered
  as cards, launched via palette, buttons, or slash commands.
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

## Verification status (2026-07-12)

- Unit tests: 12 files, 81 tests, all passing (`npm test`).
- Typecheck + production build: passing (`npm run build`).
- Deployed and installed as PWA on David's Android phone.

## Known gaps / in progress

The authoritative list with priorities lives in
[docs/OPEN_LOOPS.md](docs/OPEN_LOOPS.md). Headlines:

- Handoff correction/edit UI (model fields exist; retrieval respects
  them; no UI yet).
- v0.3 Drive sync beyond backup export (plan:
  docs/google-drive-sync-plan.md).
- Dating Wingman, Cooking & Meal Prep, and Daily Log surfaces exist as
  domains in David's life system but have no dedicated agents yet —
  they currently route to the closest existing agent.
- No linter/CI until the agent-readiness sprint lands them.

## Environment facts (David's machine)

- Windows 11, repo at `C:\dev\davidos` (NOT in Google Drive — Drive's
  virtual FS breaks node_modules).
- Node.js 24 (winget, machine PATH), npm 11; CI/deploy pins Node 20 —
  code must stay compatible with both (`engines` >= 20).
- gh CLI authenticated as `davidcolome9-byte`.
