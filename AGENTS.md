# AGENTS.md — Operating Guide for AI Coding Agents

This file is the entry point for any AI coding agent (Codex, Claude Code,
Gemini, or other) working on DavidOS. Read it fully before changing code.
It is vendor-neutral and version-controlled; it supersedes
`docs/handoff.md` (now a pointer here).

**AI tool and model routing.** Before selecting a model, assigning
implementation, beginning review, or releasing work, read
[docs/AI_TOOL_ROUTING.md](docs/AI_TOOL_ROUTING.md) — the authoritative
model-role, independence, quota-fallback, and two-gate execution policy
for every AI tool and model working on DavidOS. It outranks conversational
memory, prior handoffs, and any temporary chat-session instruction;
package prompts may narrow it but may not weaken it without David's
explicit approval.

Read in this order before acting: this file, `docs/AI_TOOL_ROUTING.md`,
`docs/CURRENT_STATE.md`, `docs/OPEN_LOOPS.md`, the active package brief
or handoff, then any doc directly relevant to the task.

## 1. What DavidOS is — and is not

DavidOS is a **private, local-first, mobile-first personal command center**:
a PWA (React 18 + TypeScript + Vite 5, HashRouter, localStorage) that routes
messy life/work requests to specialist agents, generates continuity-aware
AI-ready prompts, and enforces a safety/approval model. It is deployed to
GitHub Pages on every push to `main`.

Its domains include (not limited to): Operation David / Health & Fitness,
health-data ingestion, Work & Career, Dating Wingman (planned), Personal
Admin, Daily Logs, Home & Dogs, Cooking & Meal Prep, documents/structured
exports, and agent workflows/future integrations.

**It is NOT** a fitness app, a notes app, or a chatbot. Health & Fitness is
one workflow category inside a multi-workflow command center. **Never
redesign DavidOS into a single-purpose application**, and never replace the
current architecture merely because another implementation is possible. If a
change would make one domain dominate the navigation, data model, or naming,
stop and reconsider scope.

Product definition: [docs/product-spec.md](docs/product-spec.md).
Point-in-time status: [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md).

## 2. Hard rules (protected behaviors)

1. **PRIVACY — most important.** This repo and the deployed bundle are
   PUBLIC. Never put personal data — real names beyond the "David"
   branding, locations, health facts, employer specifics, family/pet
   names, metrics — into `seed/`, `src/`, `docs/`, `public/`, tests,
   scripts, or commit messages. Personal values travel ONLY in the
   gitignored `personal/` folder and the user's backup JSON, imported
   per-device via Settings → Import. `src/data/healthProfileSeed.ts` must
   stay generic (bracket placeholders). Generic detection keywords (e.g.
   injury-term regexes) are fine; asserted personal facts are not.
2. **Honesty.** Integrations are stubs that SAY they are stubs. Never
   simulate that an external action happened. Risky commands with no
   executable route must visibly no-op ("Nothing was sent or changed")
   and audit as such.
3. **Safety model.** `read_only`/`draft_only` proceed; `local_write`
   proceeds with a visible notice; `external_write` and above require
   explicit ApprovalGate approval; financial/medical/legal actions are
   blocked outright (gate renders no Approve button). Full policy:
   [docs/security-and-approval-model.md](docs/security-and-approval-model.md).
4. **Local-first.** No backend, no accounts, no API keys in the repo or
   bundle (see `.env.example`). Offline operation is a design
   requirement and is fully delivered: the service worker precaches a
   complete, build-derived app-shell manifest, and offline launch,
   offline reload, and offline intent routing are reliable and verified
   (docs/OPEN_LOOPS.md OL-001, resolved by PR #10, re-verified since).
5. **Canonical history stays clean.** Saved handoffs store the cleaned
   current entry only — never full generated prompts (those are separate
   typed artifacts). No recursive history bloat.
6. **Source-of-truth data is never overwritten by code or agents.** See
   [docs/SOURCE_OF_TRUTH.md](docs/SOURCE_OF_TRUTH.md) for the hierarchy
   and the files/behaviors that must not be clobbered (e.g. the seeded
   Health Profile rules, the user's personal backup JSON).
7. **Don't overengineer.** Simple readable code; pure utility functions
   for logic (testable); minimal runtime dependencies (currently only
   react, react-dom, react-router-dom — keep it that way unless clearly
   justified in [docs/DECISIONS.md](docs/DECISIONS.md)).

## 3. Approval boundaries (what needs David's sign-off)

Proceed freely: bug fixes with tests, docs updates, test additions,
refactors that preserve behavior, items marked **Ready** in
[docs/OPEN_LOOPS.md](docs/OPEN_LOOPS.md).

Ask first (or leave as a proposal in OPEN_LOOPS.md):
- Any new runtime dependency.
- Schema changes to `AppState` beyond additive optional fields.
- Anything that sends data off-device (network calls, telemetry, OAuth).
- Changing the risk/approval policy or weakening a gate.
- Deleting user-facing features, renaming routes, or restructuring nav.
- Rewriting the storage layer or replacing localStorage.
- Anything touching `personal/` or the user's Drive files.

## 4. Architecture and directory map

Detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/DATA_MODEL.md](docs/DATA_MODEL.md).

```
davidos/
  AGENTS.md          ← you are here
  docs/              operating docs (see index below)
  seed/              portable JSON/MD specs: agents, workflows, projects,
                     prompts, context — data, not code; readable by any AI
  src/
    app/             App shell + entry
    components/      UI screens (thin; logic lives in lib/)
    state/store.tsx  React context store: update(fn) + audit(entry)
    data/            seed loading, default state, generic health seed
    lib/
      types.ts       every entity type — single source of truth
      router/        rule-based intent router (keyword scoring)
      safety/        risk classifier + approval rules
      storage/       localStore (persistence + normalizeState migration),
                     exportImport (backup envelope + validation)
      workflows/     continuity engine, fitness extraction, date parsing,
                     workflow meta, template renderer, registry
      health/        profile prompt builder, validation, macro analysis
      integrations/  typed stubs + Google Drive client foundation
      audit/         audit log helpers
      utils/hash.ts  sync pure-JS SHA-256 (deliberate — do not swap)
  public/            manifest, sw.js (keep __SW_VERSION__ placeholder)
  scripts/           build/verify utilities (Node ESM .mjs)
  personal/          GITIGNORED — David's real data; never commit, never
                     read into code, never overwrite casually
  .github/workflows/ deploy.yml (Pages) + ci.yml (verification)
```

Docs index:
- [docs/AI_TOOL_ROUTING.md](docs/AI_TOOL_ROUTING.md) — authoritative AI
  model/tool routing, independence, quota-fallback, and two-gate policy
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — AppState, persistence, migration
- [docs/SOURCE_OF_TRUTH.md](docs/SOURCE_OF_TRUTH.md) — what data is authoritative where
- [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) — dated snapshot of what works
- [docs/DECISIONS.md](docs/DECISIONS.md) — decision/assumption log (append-only)
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — stub contract + Drive status
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — environment, commands, testing
- [docs/CODEX_RUNBOOK.md](docs/CODEX_RUNBOOK.md) — step-by-step task recipes
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — known failure modes
- [docs/OPEN_LOOPS.md](docs/OPEN_LOOPS.md) — prioritized backlog
- [docs/roadmap.md](docs/roadmap.md), [docs/product-spec.md](docs/product-spec.md),
  [docs/security-and-approval-model.md](docs/security-and-approval-model.md),
  [docs/google-drive-sync-plan.md](docs/google-drive-sync-plan.md)

## 5. Source-of-truth hierarchy (short version)

1. `src/lib/types.ts` — app data shapes.
2. `seed/` — agent/workflow/prompt specs (authored data).
3. The user's personal backup JSON (gitignored/Drive) — personal values.
4. localStorage on each device — live state (never edited by agents).
5. Docs describe; code defines. On conflict, trust code, then fix the doc.

For AI model and coding-tool selection, role separation, and execution
gates — a separate axis from the data authority above —
[docs/AI_TOOL_ROUTING.md](docs/AI_TOOL_ROUTING.md) is authoritative over
conversational memory and prior chat-session instructions.

Full hierarchy + protected files: [docs/SOURCE_OF_TRUTH.md](docs/SOURCE_OF_TRUTH.md).

## 6. Commands

```
npm run setup       # npm ci — deterministic install
npm run dev         # Vite dev server → http://localhost:5173
npm run doctor      # environment diagnosis (Node version, deps, ports)
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # vitest unit tests
npm run test:smoke  # Playwright browser smoke tests (needs: npx playwright install chromium)
npm run validate:seed     # seed schema + duplicate ids + registry parity
npm run validate:privacy  # no personal location/timezone literals in the repo
npm run validate:docs     # JSON, md links, version sync, documented commands
npm run build       # typecheck + vite build + stamp sw version
npm run verify      # lint + unit tests + all validations + build
npm run verify:full # verify + browser smoke tests
```

Details and failure diagnostics: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## 7. Coding conventions

- TypeScript strict; no `any` unless unavoidable and commented.
- Components stay thin; logic goes in `src/lib/` as pure functions.
- Every entity type lives in `src/lib/types.ts`; import from there.
- New `AppState` fields must be optional-or-backfilled in
  `normalizeState()` (`src/lib/storage/localStore.ts`) so old persisted
  state and old backups never crash the app.
- IDs via `uid()`, timestamps via `nowIso()` from types.ts.
- No new runtime dependencies without an entry in docs/DECISIONS.md.
- Comments explain constraints, not narration.
- Commit messages: what + why; never personal data.

## 8. Testing requirements

- Any new pure logic gets vitest coverage in `src/lib/__tests__/`.
- Any bug fix gets a regression test where practical.
- Schema/migration changes get a `normalizeState`/import test proving old
  data still loads.
- Run `npm run verify` before declaring any task done; run
  `npm run verify:full` before merging UI-affecting changes.
- Don't write assertion-free or snapshot-only tests to inflate counts.

## 9. Definition of done

A change is done when:
1. `npm run verify` passes locally (CI runs the same).
2. Behavior/architecture changes are reflected in the relevant doc
   (ARCHITECTURE, DATA_MODEL, INTEGRATIONS, or CURRENT_STATE) and
   judgment calls are appended to docs/DECISIONS.md.
3. No personal data or secrets entered the diff (`git diff` reviewed).
4. The hard rules in §2 still hold.
5. OPEN_LOOPS.md is updated if the change completes or unblocks an item.

## 10. Common mistakes to avoid

- Adding a required (non-optional) field to `AppState` without a
  `normalizeState` backfill — breaks every existing device and backup.
- Putting real personal values in `seed/`, `src/data/healthProfileSeed.ts`,
  tests, or fixtures. Use bracket placeholders.
- Removing the `__SW_VERSION__` placeholder from `public/sw.js` or the
  stamp step from `npm run build` — installed PWAs stop updating forever.
- Saving full generated prompts into handoff history (bloat + recursion);
  prompts are `WorkflowArtifact`s, handoffs store the cleaned entry only.
- Making a stub "pretend" to succeed, or auto-firing a network call
  without a user gesture + ApprovalGate.
- Swapping `src/lib/utils/hash.ts` for `crypto.subtle` — sync usage is
  deliberate (prompt fingerprints are computed synchronously in render
  paths).
- `npm install` inside a Google Drive-synced folder — the Drive virtual
  filesystem corrupts node_modules. The repo lives at `C:\dev\davidos`
  on David's machine for exactly this reason.
- Treating DavidOS as a fitness app: fitness is one category; don't let
  its concepts leak into the generic router, store, or nav design.

## 11. Handling contradictions

If two sources disagree (docs vs code, doc vs doc, backlog vs reality):
1. Trust running code + passing tests over any document.
2. Fix the stale document in the same change, and note the correction in
   docs/DECISIONS.md.
3. If the contradiction involves a hard rule (§2) or an approval boundary
   (§3), do NOT resolve it silently — record it in docs/OPEN_LOOPS.md as
   **Requires David** and pick a safe interpretation (the more
   restrictive one) in the meantime.

## 12. Keeping documentation current

- `docs/CURRENT_STATE.md` is dated — update the date and contents when a
  feature lands or a count (tests, agents, workflows) changes.
- `docs/DECISIONS.md` is append-only: add dated entries, never rewrite
  history.
- `docs/OPEN_LOOPS.md` is the single backlog; close/annotate items there
  rather than creating parallel TODO files.
- README.md is the human quickstart; keep it consistent with AGENTS.md
  but don't duplicate agent-only detail into it.
