# CLAUDE.md — Claude Code working guide for DavidOS

Claude Code companion to [AGENTS.md](AGENTS.md). AGENTS.md is the
vendor-neutral, authoritative operating guide for every AI coding agent on
this repo; this file adds the orientation Claude Code specifically needs
(repo map, mental model, command surface, conventions, failure modes).

**This file never outranks AGENTS.md or the docs it points to.** If
anything here disagrees with AGENTS.md, `docs/AI_TOOL_ROUTING.md`, or
running code, those win and this file is the thing to fix.

## 0. Read this before touching anything

Required reading order for any DavidOS task (from
[docs/AI_TOOL_ROUTING.md](docs/AI_TOOL_ROUTING.md) §2):

1. [AGENTS.md](AGENTS.md) — hard rules, approval boundaries, definition of done
2. [docs/AI_TOOL_ROUTING.md](docs/AI_TOOL_ROUTING.md) — model roles, independence,
   two-gate execution, authorization boundaries
3. [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) — dated snapshot of what actually
   exists and what is currently authorized
4. [docs/OPEN_LOOPS.md](docs/OPEN_LOOPS.md) — the single prioritized backlog
5. The active package brief or handoff
6. Whatever architecture / data-model / security / integration doc your task touches

No conversation summary, model memory, or old handoff outranks these tracked
files. **A backlog item marked Ready is not authorization to start work** — only
an explicitly authorized package is.

## 1. What DavidOS is (and is not)

A **private, local-first, mobile-first personal command center**: a PWA
(React 18 + TypeScript + Vite 5, HashRouter, localStorage) that routes messy
life/work requests to specialist agents, builds continuity-aware AI-ready
prompts locally, and enforces a risk/approval model. Deployed to GitHub Pages
on every push to `main`.

- **No backend, no accounts, no API keys, no real AI calls.** "Generation" is
  local template rendering (`{{input}}`, `{{style}}`, `{{date}}`); the output is
  a prompt a human pastes into ChatGPT/Claude/etc.
- **Not a fitness app, not a notes app, not a chatbot.** Health & Fitness is one
  workflow category among many. Never let one domain colonize the router, store,
  types, or navigation.
- Runtime dependencies are exactly `react`, `react-dom`, `react-router-dom`.
  Adding a fourth needs David's approval plus a `docs/DECISIONS.md` entry.

## 2. Non-negotiables (short form of AGENTS.md §2)

1. **Privacy first — the repo and the deployed bundle are PUBLIC.** No real
   names beyond the "David" branding, locations, health facts, employer
   specifics, family/pet names, or metrics anywhere in `seed/`, `src/`, `docs/`,
   `public/`, tests, scripts, or commit messages. Use bracket placeholders
   (`[YOUR_LOCATION]`). Real values live only in the gitignored `personal/`
   folder and David's backup JSON. `npm run validate:privacy` enforces the
   mechanical part of this; it is a floor, not a substitute for judgment.
2. **Honesty.** Integrations are stubs that say they are stubs and return
   `{ok: false, message}`. Never simulate that an external action happened. A
   risky command with no executable route must visibly no-op ("Nothing was sent
   or changed") and audit as such.
3. **Safety model.** `read_only`/`draft_only` proceed; `local_write` proceeds
   with a visible notice; `external_write` and above require ApprovalGate
   approval; financial/medical/legal are blocked outright (the gate renders no
   Approve button). See
   [docs/security-and-approval-model.md](docs/security-and-approval-model.md).
4. **Local-first.** Offline launch, reload, and routing are delivered
   requirements, not nice-to-haves.
5. **Canonical history stays clean.** Saved handoffs store the cleaned current
   entry only; full generated prompts are separate `WorkflowArtifact`s.
6. **Source-of-truth data is never overwritten** — see
   [docs/SOURCE_OF_TRUTH.md](docs/SOURCE_OF_TRUTH.md).
7. **Don't overengineer.** Simple readable code, pure functions in `src/lib/`,
   minimal dependencies.

## 3. Authorization: the two gates

From [docs/AI_TOOL_ROUTING.md](docs/AI_TOOL_ROUTING.md) §8–9. This matters more
here than in most repos, because Claude Code can push and open PRs.

- **Gate 1** (when authorized): implement, test, self-correct, collect evidence,
  commit, push, open a PR, run CI, pre-merge audit. **Gate 1 stops before
  merge.**
- **Gate 2** begins only after David explicitly authorizes merge: merge,
  post-merge CI, deployment, live verification, closeout.
- **Only David may authorize** merge, deployment, destructive repo cleanup,
  branch/worktree deletion, new runtime dependencies, material schema changes,
  storage-layer replacement, new off-device data flows, wider OAuth scopes,
  credential storage, autonomous execution, changes to the safety/approval
  model, or closing a *Requires David* decision. Authorization is never inferred
  from enthusiasm, silence, a roadmap entry, or a prior unrelated approval.
- **Stop and report** on: wrong repo/branch/base/candidate SHA, unexpected
  modified or untracked files, failing tests or CI, failed privacy validation,
  merge conflicts, data-safety uncertainty, or authorization ambiguity.
- **Independence.** A Claude implementation is normally reviewed by a different
  model family (Gemini Pro or Codex). Self-review can improve a candidate but
  does not satisfy the review gate — don't claim it does.

## 4. Repository map

```
DavidOS/
  AGENTS.md              vendor-neutral agent operating guide (authoritative)
  CLAUDE.md              this file — Claude Code companion
  README.md              human quickstart
  docs/                  operating docs (index in §11 below)
  seed/                  portable authored DATA (not code): agents, workflows,
                         projects, prompts, context — plus seed/AGENTS.md rules
  src/
    app/                 App.tsx (routes/shell), main.tsx, AppErrorBoundary.tsx
    components/          UI screens — thin; logic belongs in lib/
      __tests__/         component/DOM tests (// @vitest-environment happy-dom)
    state/store.tsx      React context store: {state, update(fn), audit(entry), …}
    data/                seedLoader, defaultState, generic healthProfileSeed
    lib/
      types.ts           EVERY entity type + uid()/nowIso() — single source of truth
      router/            rule-based intent router (keyword scoring, no ML)
      safety/            riskClassifier + approvalRules
      storage/           state journal, journal persistence, localStore boot,
                         boot validation, export/import, import commit, reset
      workflows/         continuity engine, template renderer, registries,
                         fitness extraction, date parsing, workflow meta
      agents/            agent registry + execution-agent registry/records/audit
      health/            profile prompt, validation, draft, macro analysis
      integrations/      typed stubs (*.stub.ts) + Google Drive client foundation
      audit/             audit log + redaction
      utils/hash.ts      sync pure-JS SHA-256 (deliberate — do not swap)
      __tests__/         unit tests for lib modules
  tests/smoke/           Playwright specs against the production build
  public/                manifest, icons, sw.js (keep __SW_VERSION__ /
                         __SW_PRECACHE__ placeholders)
  scripts/               Node ESM .mjs: doctor, validators, sw stamping, icons,
                         seed→personal backup
  pilots/                self-contained synthetic pilot packages (e.g.
                         dos-exec-001a) — local artifacts, not shipped product
  .github/workflows/     ci.yml (verify + smoke), deploy.yml (gate → Pages)
  personal/              GITIGNORED — David's real data. Never commit, never read
                         into code, never overwrite.
```

## 5. Architecture in ten bullets

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/DATA_MODEL.md](docs/DATA_MODEL.md).

1. **State.** One `AppState` object in `state/store.tsx` (React context). All
   mutations go through `update(fn)`; every meaningful action also appends an
   `AuditLogEntry` via `audit(entry)`.
2. **Persistence is a journal, not a key.** `lib/storage/stateJournal.ts` writes
   immutable generation records plus two alternating verified head slots, all
   under one exclusive Web Lock. Commits verify generation *and* head by
   read-back; there is deliberately no rollback path.
3. **Per-tab controller.** `lib/storage/journalPersistence.ts` serializes and
   coalesces this tab's saves, tracks committed authority, and suppresses saving
   after an external head change or an uncertain outcome. Persistence health
   lives *outside* `AppState` so recording it cannot recurse into another save.
4. **Boot.** `lib/storage/localStore.ts` selects verified authority, then runs
   preservation → quarantine → normalization. It is the only file that knows the
   legacy single key (migration input and read fallback only), and the swap point
   for IndexedDB or Drive sync.
5. **Routing.** `lib/router/routeScoring.ts` scores weighted keywords per agent;
   `intentRouter.ts` turns scores into a `RouteResult` (agent, heuristic
   confidence capped at 0.9, human-readable reasoning, suggested workflow).
   Slash commands in `lib/commands.ts` are matched *before* routing.
6. **Registries.** `agentRegistry.ts` and `workflowRegistry.ts` import the JSON
   specs from `seed/` at build time and validate ids/duplicates/cross-references
   at startup. Adding a JSON file without registering it is a no-op that
   `npm run validate:seed` will catch.
7. **Continuity engine.** `lib/workflows/continuity.ts` retrieves prior handoffs
   (3 default / 7 fitness, overfetch ×2, status filter, correction dedupe) and
   assembles the prompt: New Entry → Personal Targets → Macro Target Snapshot →
   Prior Context → Analysis Instructions, with SHA-256 fingerprints.
8. **Safety.** `riskClassifier.ts` classifies free text into six levels
   (first-match-wins from highest risk down); `approvalRules.ts` is the policy;
   `components/ApprovalGate.tsx` is the blocking modal.
9. **Supervised execution.** `lib/agents/executionAgentRegistry.ts` is a separate
   fixed TS-data registry holding one profile (`coding-coordinator`). Execution
   agents are *not* seed agents: never routing targets, no workflows, not in the
   `AgentId` union. `executionRecords.ts` holds the restrictive-authority
   construction, lifecycle state machine, terminal immutability, and deterministic
   packet rendering; `executionAudit.ts` emits allowlisted, counts-only entries —
   never user text or record ids.
10. **Integrations.** One `*.stub.ts` per adapter, each exporting an
    `IntegrationAdapter` descriptor plus stub methods returning `{ok: false}`.
    The one live, gated exception is manual Google Drive backup export
    ([docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)).

## 6. Commands

```
npm run setup       # npm ci — deterministic install (Node >= 20)
npm run dev         # Vite dev server → http://localhost:5173
npm run doctor      # environment diagnosis (Node/npm, install state, ports)
npm run lint        # ESLint (flat config)
npm run typecheck   # tsc --noEmit
npm test            # Vitest unit suite
npm run test:watch  # Vitest watch
npm run test:smoke  # build + Playwright (needs: npx playwright install chromium)
npm run validate:seed     # seed schema, duplicate ids, seed↔registry parity
npm run validate:privacy  # generic personal-data rules over all tracked text
npm run validate:docs     # JSON validity, md links, version sync, doc invariants
npm run build       # tsc --noEmit + vite build + stamp sw version
npm run preview     # serve dist/ → http://localhost:4173
npm run verify      # lint + tests + all validations + build — the DoD gate
npm run verify:full # verify + Playwright smoke
```

`npm run verify` is what CI runs, so local green should equal CI green.
Details: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md); failure modes:
[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## 7. What the validators actually enforce

These fail builds in ways that are easy to misread, so know them before you edit:

- **`validate:docs`** — every tracked JSON parses; every relative markdown link
  target exists (so a typo'd link in *any* `.md`, including this one, fails the
  build); `package.json` version matches both version fields in
  `package-lock.json`; every `npm run <script>` mentioned in AGENTS.md,
  README.md, or docs/DEVELOPMENT.md exists; `docs/DATA_MODEL.md` still has the
  `## Load & recovery states` section that `localStore.ts` points at; a list of
  known-obsolete phrases stays out of the operating docs; `ci.yml` still triggers
  on `pull_request` and `deploy.yml` still runs `npm run verify` *before*
  uploading the Pages artifact; and `docs/AI_TOOL_ROUTING.md` exists, is linked
  from AGENTS.md twice (top + docs index), and still contains its doctrine
  markers.
- **`validate:privacy`** — scans every tracked non-binary file for generic
  personal-data patterns: concrete IANA timezone identifiers, private
  home-configuration fields with concrete values, and personal medical assertions.
  An optional private denylist can be supplied out-of-repo; its absence never
  weakens the generic rules.
- **`validate:seed`** — required fields, known/duplicate ids, and seed↔registry
  parity in both directions (routed agents only; execution agents are excluded by
  design).

## 8. Conventions

- **TypeScript strict**, plus `noUnusedLocals`/`noUnusedParameters`. No `any`
  unless unavoidable and commented.
- **Components stay thin.** Anything testable belongs in `src/lib/` as a pure
  function. If you find yourself writing branching logic in a `.tsx`, move it.
- **Types live in `src/lib/types.ts`** — import from there, don't redeclare.
  IDs via `uid()`, timestamps via `nowIso()`, both from that file.
- **New `AppState` fields must be optional or backfilled** in `normalizeState()`
  (`src/lib/storage/localStore.ts`). A required field with no backfill breaks
  every existing device and every existing backup — this is the single most
  damaging mistake available in this codebase.
- **Import validation must tolerate older backups** — an added field cannot
  become a requirement for previously exported data.
- **Audit entries are allowlisted and counts-only** where the code says so. Never
  widen an audit payload to include user-entered text, record ids, or profile
  values; log field *names* and hashes instead.
- **`src/lib/utils/hash.ts` stays synchronous pure JS.** Prompt fingerprints are
  computed in render paths; `crypto.subtle` is async and would break them.
- **`public/sw.js` keeps its `__SW_VERSION__` and `__SW_PRECACHE__`
  placeholders**, and `npm run build` keeps its stamping step. Remove either and
  installed PWAs stop updating, permanently.
- **Comments explain constraints, not narration.** Match the density and tone of
  the file you're in — this codebase comments the *why* of non-obvious
  constraints heavily and the obvious not at all.
- **Commit messages: what + why, never personal data.**

## 9. Testing

- Unit tests: `src/**/__tests__/*.test.ts{,x}` (Vitest). Default environment is
  `node`; DOM tests opt in per file with a `// @vitest-environment happy-dom`
  first line. Vitest only picks up `src/**/*.test.{ts,tsx}`.
- Browser smoke tests: `tests/smoke/*.spec.ts` (Playwright, chromium, 375×812
  viewport) run against the **production build** served by `vite preview` on port
  4174 — `npm run test:smoke` builds first. Keep them few and fast; they are a
  safety net, not a UI spec.
- Any new pure logic gets a sibling unit test. Any bug fix gets a regression test
  where practical. Any schema/migration change gets a test proving old-shaped
  state and old backups still load.
- Test data must be invented and personal-data-free.
- No assertion-free or snapshot-only tests to inflate counts.

## 10. Definition of done

1. `npm run verify` passes locally (`npm run verify:full` before merging
   UI-affecting changes). CI runs the same gate on every PR and on `main`, and
   `deploy.yml` re-runs the full gate on the exact SHA before publishing Pages.
2. Behavior or architecture changes are reflected in the relevant doc
   (ARCHITECTURE, DATA_MODEL, INTEGRATIONS, or CURRENT_STATE — update its date
   and any counts), and judgment calls are appended to `docs/DECISIONS.md`
   (append-only, dated, never rewritten).
3. `git diff` reviewed — no personal data, no secrets, no stray files.
4. The hard rules still hold.
5. `docs/OPEN_LOOPS.md` updated if the change completes or unblocks an item.
6. Stop at the gate you were authorized for. Push and PR only within Gate 1;
   merge and deploy only with explicit Gate 2 authorization.

## 11. Common mistakes

- Adding a required `AppState` field without a `normalizeState` backfill.
- Putting real personal values in `seed/`, `src/data/healthProfileSeed.ts`,
  fixtures, or tests. Bracket placeholders only.
- Dropping the `__SW_VERSION__`/`__SW_PRECACHE__` placeholders or the stamp step.
- Saving full generated prompts into handoff history (bloat + recursion).
- Making a stub pretend to succeed, or firing a network call without a user
  gesture plus ApprovalGate.
- Swapping `utils/hash.ts` for `crypto.subtle`.
- Adding a seed JSON file without registering it in the matching registry.
- Treating a **Ready** backlog item, a roadmap entry, or a shipped integration
  foundation as authorization to start work.
- Treating DavidOS as a fitness app and leaking fitness concepts into the generic
  router, store, or nav.
- Running `npm install` inside a Google Drive-synced folder (David's machine
  keeps the repo on a real disk for exactly this reason).

## 12. Where to look

| Question | File |
|---|---|
| Rules for any AI agent here | [AGENTS.md](AGENTS.md) |
| Which model does what; gates and authorization | [docs/AI_TOOL_ROUTING.md](docs/AI_TOOL_ROUTING.md) |
| How the pieces fit | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| `AppState`, persistence, migration, recovery | [docs/DATA_MODEL.md](docs/DATA_MODEL.md) |
| Which copy of a thing is authoritative | [docs/SOURCE_OF_TRUTH.md](docs/SOURCE_OF_TRUTH.md) |
| What currently exists / is authorized (dated) | [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) |
| Backlog | [docs/OPEN_LOOPS.md](docs/OPEN_LOOPS.md) |
| Why something was done this way | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Environment, commands, testing | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Step-by-step task recipes | [docs/CODEX_RUNBOOK.md](docs/CODEX_RUNBOOK.md) |
| Known failure modes | [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |
| Risk levels and gates | [docs/security-and-approval-model.md](docs/security-and-approval-model.md) |
| Stub contract and Drive status | [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) |
| Product scope; sequencing | [docs/product-spec.md](docs/product-spec.md), [docs/roadmap.md](docs/roadmap.md) |
| Rules for authored seed data | [seed/AGENTS.md](seed/AGENTS.md) |

## 13. When sources disagree

1. Trust running code and passing tests over any document.
2. Fix the stale document in the same change and note the correction in
   `docs/DECISIONS.md`.
3. If the contradiction touches a hard rule or an approval boundary, do **not**
   resolve it silently: record it in `docs/OPEN_LOOPS.md` as **Requires David**
   and take the more restrictive reading meanwhile.
