# Decisions & Assumptions

Append-only log of decisions, assumptions, and deviations. Add a dated
section when you make a judgment call; never rewrite existing entries.
(Renamed from `assumptions.md` in the 2026-07-12 agent-readiness sprint.)

Initial-build decisions, made without blocking questions per the build brief:

## Location & environment
1. **Repo lives at `C:\dev\davidos`, not `G:\My Drive`.** Google Drive's virtual
   filesystem breaks `node_modules` (symlinks, file locking, speed) — same reason
   MacroPilot lives in `C:\dev`. Drive remains the *future sync target* (v0.3), which
   the spec already called for. Never `npm install` inside a Drive-synced folder.
2. **Node.js LTS was installed via winget** during the build — it was not present
   on the machine.

## Stack
3. **Vite + React + TypeScript** (not Next.js). Nothing here needs SSR, API routes,
   or a server. Vite gives a static, portable bundle that works as a PWA, on any
   static host, and later inside Capacitor. React 18 + Vite 5 chosen for maximum
   compatibility and stability.
4. **HashRouter** instead of BrowserRouter — the app works from any static file
   server (or Capacitor) with zero rewrite config.
5. **localStorage, not IndexedDB**, for v1 state. All vault data is small text
   (well under the ~5MB limit). The storage layer is isolated in
   `src/lib/storage/localStore.ts` so swapping to IndexedDB or Drive sync later
   touches one file.
6. **Hand-written service worker** instead of vite-plugin-pwa/Workbox — ~40 lines
   covers app-shell offline caching; no extra dependency tree.

## Product decisions
7. **Agents and workflows are static JSON specs** in `/seed` and are not editable
   inside the app in v1. They are data, not code, so ChatGPT/Codex/Gemini can read
   and extend them. Projects, prompts, context, loops, and reminders ARE editable.
8. **The router is rule-based keyword scoring.** Confidence is heuristic and capped
   at 0.9 — a keyword router should never claim certainty. AI-backed routing comes
   with the AI provider integration (v0.6).
9. **Workflow runs generate prompts/templates locally.** No AI API is called. The
   output is designed to be copied into ChatGPT/Claude/Gemini manually until v0.6.
10. **"Reminders" are local placeholders** (free-text due dates, no notifications).
    Real scheduling arrives with Calendar integration (v0.4).
11. **Prompt versioning is light**: saving an edited prompt keeps the previous body
    (up to 10 versions). No diffing.
12. **The AI provider adapter is one adapter with a provider parameter** rather than
    four near-identical adapters for ChatGPT/Claude/Codex/Gemini.
13. **Seed context is moderate** per the brief: name, area, work domain, fitness
    constraints, dog names. Anything sensitive is a `[PLACEHOLDER]` in the
    private context item.
14. **High-risk actions (financial/medical/legal) are not just gated — they are
    unapprovable in v1.** The ApprovalGate renders them with no Approve button.
15. **Audit log is capped at 300 entries** to keep localStorage small.
16. **Deleting projects/prompts/handoffs asks for a browser confirm** — that counts
    as the "clear UI notice" for local writes; no separate gate needed since the
    data never leaves the device and Export/Backup exists.

## v0.2 continuity build (2026-07-08)

- **Health Profile seeding vs. public repo:** the calibration spec asked to seed
  David's real recomp values into the app. That conflicts with the repo being
  public, so the shipped seed (`src/data/healthProfileSeed.ts`) is a generic
  starter with bracket placeholders; real values travel in the gitignored
  personal backup JSON and are imported per device. Bracket-placeholder values
  are never inserted into generated prompts.
- **Unsaved-changes guard:** react-router v6 (non-data router) has no stable
  navigation blocker, so the Health Profile editor uses a sticky "unsaved
  changes" banner plus a `beforeunload` guard instead of intercepting in-app
  navigation.
- **Slash-command router intentionally bypasses risk gating** (`/brief` etc. are
  known-safe navigations); free-text commands are always risk-classified.
- **Handoffs are append-only** in this version; `status`/`correctsHandoffId`
  exist in the model and retrieval logic but have no edit/correction UI yet.

## v0.3 Drive sync foundation (2026-07-08)

- **Google Drive auth uses the browser token model, not Authorization Code +
  PKCE.** DavidOS is a static PWA with no backend token-exchange endpoint.
  Google's current browser guidance requires short-lived access tokens for
  frontend-only Drive calls. Tokens are kept in memory only and requested through
  user gestures.
- **First live Drive slice is backup export only.** Manual JSON backup export can
  create `DavidOS/06_Exports/Backups` and upload a timestamped backup after
  ApprovalGate confirmation. Two-way vault sync and conflict review remain
  pending.

## Fitness macro intelligence (2026-07-08)

- **MacroPilot integration is concept-level, not app import.** MacroPilot is a
  separate Flutter app with food search, barcode scanning, expenditure
  estimation, trend weight, and check-ins. DavidOS should not absorb that whole
  product surface right now; it remains a command center and prompt engine.
- **Seamless first reuse:** add a deterministic macro target snapshot to fitness
  prompts. It parses current macro totals from the new entry and compares them
  against the private imported Health Profile targets, then gives correction
  cues for ChatGPT/Claude to reason from. This mirrors MacroPilot's useful
  target-vs-current dashboard behavior without adding a food database or barcode
  dependency.

## Agent-readiness stabilization sprint (2026-07-12)

- **Tooling devDependencies added** (eslint + typescript-eslint +
  eslint-plugin-react-hooks, @playwright/test) to give agents a
  deterministic `lint` / `verify` / smoke-test gate. Runtime dependencies
  are unchanged (still only react, react-dom, react-router-dom).
- **ESLint rule scoping:** `react-hooks/set-state-in-effect` is off — the
  URL-param→state sync effects in WorkflowRunner/Settings predate the
  rule and refactoring them is behavior risk for zero user gain.
  `no-useless-escape` is off for `fitnessExtraction.ts` only — its
  defensive `\-` escapes inside character classes are intentional;
  "fixing" them can silently create regex ranges.
- **`npm run verify` is the definition-of-done gate** (lint + unit tests
  + seed validation + build; build already includes `tsc --noEmit`).
  `verify:full` adds Playwright smoke tests. CI runs the same steps —
  local and CI verification are deliberately identical.
- **package.json version bumped 0.1.0 → 0.2.0** to match the shipped
  v0.2 feature set; `engines: node >=20` documents the supported floor
  (CI pins 20; David's machine runs 24).

## Correction pass after independent review (2026-07-13)

- **Fail-safe storage recovery (DAV-001):** the loader now classifies
  stored state as valid / additively-migratable / lossy-repairable /
  unreadable. Lossy repair and unreadable paths preserve the EXACT raw
  blob under a unique `davidos-state-v1-recovery-<timestamp>` key and
  CONFIRM the write by reading it back before anything may replace the
  stored value. **Policy: if preservation fails, persistence is
  suppressed for the whole session** (banner explains; the stored copy
  is never overwritten) — chosen over persist-on-first-user-edit because
  any auto-persist would destroy the only copy.
- **Reset preserve semantics are exact (DAV-002):** `state.healthProfile`
  is carried through as-is; a deleted (null) profile stays deleted. The
  old `?? fresh.healthProfile` fallback silently recreated it.
- **happy-dom devDependency** added solely to run mounted StoreProvider
  recovery tests (per-file `@vitest-environment happy-dom`); runtime
  dependencies unchanged.
- **Privacy validator (DAV-003):** `validate:privacy` fails the build on
  personal location/IANA-home-timezone literals; genuinely synthetic
  examples require an exact file+literal ALLOWLIST entry in
  `scripts/validate-privacy.mjs`. The public GitHub handle is repo
  metadata, not private data.
- **CI triggers (DAV-004):** pull_request + push-to-main + dispatch
  (was: every push) so PRs get exactly one status; deploys run the full
  verify + smoke gate on the deployed SHA before uploading.
- **Test-count policy (DAV-005):** exact counts are stated only in
  docs/CURRENT_STATE.md; other docs point there.

## Second correction pass after delta review (2026-07-13)

- **Strict plain-object classification (DAV-001-A):** `isPlainObject`
  (rejects null/arrays/primitives) now governs every object-valued state
  position in BOTH `normalizeState` and `inspectStructure`; an
  array-valued `settings`/`healthProfile` or an array item inside a
  collection classifies as LOSSY (quarantine-before-repair), never as
  valid or merely missing. Item-level absent lists now count as additive
  migration rather than silent rewrites.
- **Empty-string storage (DAV-001-B):** only `raw === null` means "no
  stored state"; an existing empty string is an unreadable blob and goes
  through the recovery path (preserve → confirm → else suppress).
- **Privacy validator is GENERIC (DAV-003-A):** the previous validator
  embedded David-specific literals in Base64 and the tests rebuilt them
  from fragments — both removed entirely. The public validator now
  enforces generic public-repo rules (no concrete IANA home-timezone
  declarations; no private home-configuration fields with concrete
  values; placeholders required). An OPTIONAL private denylist can be
  supplied via `DAVIDOS_PRIVATE_DENYLIST` or the gitignored
  `personal/privacy-denylist.txt`; its absence never weakens the generic
  rules. Test fixtures use clearly synthetic non-David values.
- **Content-aware scanning (DAV-003-B):** the scan enumerates ALL
  git-tracked files (no extension allowlist), sniffs binary by content
  (NUL byte), and prints counts plus every non-obvious skip. Declared
  skips: package-lock.json (generated) and the privacy test fixture.
- **Cross-platform CLI entrypoints (DAV-004-A):** the hand-built
  `file:///` comparison never matched on Linux, so validator CLI bodies
  silently no-oped in CI. Both validators now use
  `pathToFileURL(resolve(argv[1])).href === import.meta.url`, are
  child-process-tested (success summaries AND nonzero failure paths),
  and `DAVIDOS_ROOT` exists as a test-only fixture override for the seed
  validator.
- **validate:docs hardening (DAV-005-A):** structured checks added for
  the DATA_MODEL "Load & recovery states" section, known-obsolete
  phrases, ci.yml pull_request trigger, and verify-before-upload
  ordering in deploy.yml.

## Final micro-correction pass (2026-07-13)

- **isPlainObject prototype policy (DAV-001-A-R1):** accepts ONLY records
  whose prototype is exactly `Object.prototype`. Date/Map/Set/RegExp/
  class instances AND null-prototype objects classify as lossy. Rationale:
  every legitimate record producer here (JSON.parse, object literals)
  yields `Object.prototype`; null-prototype objects never arise from
  valid flows, so the stricter policy loses nothing and rejects more
  corruption.
- **Workflow→agent validation uses DISCOVERED agents (DAV-007-R1):**
  `validate:seed` now requires every `workflow.agentId` to have an actual
  agent seed file (the TypeScript-union check remains as a separate
  compatibility check), so a dangling union entry can no longer hide a
  workflow pointing at a removed agent.

## DOS-WF-001 — Workflow reliability & Gravl review (2026-07-14)

- **Fitness routing is disambiguated at the WORKFLOW level, deterministically.**
  The agent-level keyword router still picks the fitness domain; a new
  `src/lib/router/fitnessRouting.ts` then resolves the specific workflow —
  `gravl-review` (review/optimize a Gravl workout) vs. `fitness-handoff`
  (clean/log/organize existing notes). No AI router. A genuine non-zero tie
  returns both options via `RouteResult.alternatives`; the palette renders
  two plain-language choices instead of silently picking one.
- **`workout` keyword weight raised 1→2** in `routeScoring.ts` so
  workout-related requests reliably reach the fitness domain before the
  fitness-workflow disambiguation runs (previously "today" could divert
  "clean up today's workout notes" to Daily Command). Minimal, in-scope
  tuning; existing router tests stay green.
- **The Gravl prompt is a dedicated builder, not the shared continuity
  engine.** `src/lib/workflows/gravlPrompt.ts` assembles one
  provider-neutral "Universal AI Prompt" (fixed sections: Role, Objective,
  David's Request, Available Gravl Workout Information, Relevant Health and
  Fitness Context, Current Phase and Constraints, Analysis Requirements,
  Required Output, Missing-Information Handling, Safety Boundaries). The
  Workflow Runner special-cases `gravl-review`; all other workflows still
  build through `buildPrompt` unchanged (compatibility preserved). The
  workflow's JSON `template` is a validator-satisfying fallback only.
- **Review vs. intake mode** is derived from whether workout text is pasted
  or the "I have Gravl screenshots" box is checked. Intake mode is a valid
  prompt, honestly labeled "No Gravl workout added. This prompt will ask
  for it." DavidOS never claims to read screenshots; both prompt and UI
  say to attach them in the AI app after copying.
- **Health Profile inclusion for Gravl excludes medications/supplements by
  default** via a new `excludeSupplementsMedications` option on
  `buildProfilePromptBlock`; the L4/L5 movement-safety summary is still
  included. Loaded at build time.
- **Validity + staleness are pure helpers** (`src/lib/workflows/promptValidity.ts`).
  A built result is invalid when the request is empty, the prompt contains
  `(no input provided)`, an unresolved `{{input|style|date}}` token, or an
  unresolved `[[placeholder]]`. Staleness compares a build-time config key
  (input, workflow id, output config, included-profile fingerprint, plus
  Gravl workout/screenshots) to the live values. Invalid or stale disables
  Copy Prompt, Save Prompt, Save to Workflow History, and Create Follow-Up
  Task. Build Prompt is blocked only when the request is empty.
- **Labels:** Generate → **Build Prompt**; the primary copy/save are
  **Copy Prompt** / **Save Prompt**; the handoff and open-loop actions are
  relabeled **Save to Workflow History** / **Create Follow-Up Task**. The
  provider-specific output-style dropdown is hidden for the Gravl workflow
  (single neutral "Universal AI Prompt" style).
- **Local-only save** reuses the existing `WorkflowArtifact` architecture,
  extended with optional `title` + `sourceInput` (additive, no migration).
  "Saved on this device only." Google Drive Prompt Vault remains deferred
  (OL-024); embedded AI execution and screenshot OCR remain out of scope.

## DOS-WF-001 — Correction pass after independent review (2026-07-14)

Appended (not rewritten) per the append-only rule; the original DOS-WF-001
entry above stands. These correct material findings from ChatGPT's review of
the DOS-WF-001 bundle. Implementation stays local; not deployed/merged/accepted.

- **Health Profile exclusion is honored (privacy).** The Gravl builder's
  Safety Boundaries section no longer hardcodes David's L4/L5 history or the
  axial-loading restriction. It now carries generic safety language only
  (respect reported pain/injuries/restrictions, flag likely-provoking
  exercises, escalate severe/neurological symptoms). The specific L4/L5 +
  axial-loading movement-safety summary appears ONLY when the approved Health
  Profile context is included and reports a back history/restriction — so a
  prompt built with the profile excluded contains no private medical facts.
  The existing UI privacy warning already fires exactly when profile text is
  inserted (`profileBlock` non-empty).
- **Gravl-safe profile whitelist.** `buildProfilePromptBlock` gains a
  `gravlSafe` option (an explicit field whitelist, not keyword redaction):
  goals, training plan + movement restrictions, generated movement-safety
  summary, recovery/readiness targets, relevant activity targets, and a
  limited set of body metrics (height, current/goal weight). It force-excludes
  structured medications/supplements AND drops the free-text `promptSummary`/
  `freeformContext` entirely — those could otherwise smuggle meds, TRT, or
  unrelated medical detail past a structured-field exclusion. Nutrition and
  non-whitelisted body metrics (waist, body-fat) are dropped for Gravl. A new
  field is inert for Gravl until deliberately whitelisted. Non-Gravl fitness
  behavior is unchanged (`gravlSafe` off ⇒ identical to before).
- **Routing requires workout context.** `fitnessRouting` now gates Gravl on a
  workout-context anchor (gravl, workout, exercise, training/workout plan or
  program, program review). Generic verbs (review, optimize, progression,
  improve) only add weight when an anchor is present — so "Review my meal
  plan / macros / nutrition / recovery progress" route to the Fitness Handoff,
  while "Review this workout", "Optimize this workout", "Is this workout safe
  for my back?" route to Gravl. Cleaning/logging/organizing still routes to the
  Handoff. A genuine non-zero tie (e.g. "log this workout") still offers both.
- **No false history claim.** The Gravl builder does not consume prior
  handoffs; history retrieval was NOT added. The Runner's history line is now
  Gravl-specific ("Prior saved handoffs are not pulled into this prompt yet —
  Gravl history integration is deferred"); `priorCount` stays 0 and
  `includedHandoffIds` empty; the workflow's assumptions state the deferral.
  Tracked as OL-026.
- **Defense-in-depth action guards.** A pure `evaluateActability` helper
  (built exists AND valid AND fresh AND config matches) backs both the
  button-disable state and every action handler. Copy/Save-Prompt/
  Save-to-History/Create-Follow-Up now re-check before any clipboard or local
  write and surface an explanatory message on refusal — disabled buttons are
  no longer the only guard.
- **Full-hash staleness.** The Runner's staleness config key uses the full
  `healthProfilePromptMetadata.promptContextHash`, not the shortened display
  fingerprint, so a truncated-fingerprint collision cannot mask a real change
  to the included profile context.
- **URL input hydration split from workflow/style sync.** Two effects: one
  owns workflow/style selection, a second is keyed on the exact `input` search
  param. Same-workflow input A→B, browser back/forward, and removing the input
  param now all update the textarea correctly; ordinary typing (which does not
  change the URL) is never overwritten; a URL-provided input change invalidates
  any built result. `pick()` carries the current request into the URL so
  switching workflows does not clear a typed request.
