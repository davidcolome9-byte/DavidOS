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
  `buildProfilePromptBlock`; the generated movement-safety summary is still
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
  Safety Boundaries section no longer hardcodes the saved personal
  back-history detail or the axial-loading restriction. It now carries generic
  safety language only (respect reported pain/injuries/restrictions, flag
  likely-provoking exercises, escalate severe/neurological symptoms). The
  generated movement-safety summary appears ONLY when the approved Health
  Profile context is included and reports a back-history/restriction — so a
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

## DOS-GOV-001 — Public main state reconciliation (2026-07-15)

Documentation, privacy-cleanup, and privacy-validator maintenance only. No
workflow, routing, UI, schema, or offline behavior was changed; Git history was
not rewritten; nothing was pushed, merged, or deployed by this package; the
preserved offline branch `fix/dos-fnd-001-reliable-offline-launch` was not
touched.

- **Deployment reality reconciled.** DOS-WF-001 was merged to `main` (PR #3,
  commit `35cc9655a11fbc78f27caca5297330a023679026`), deployed to GitHub Pages,
  and accepted via phone + laptop QA; cleanup is complete. The earlier
  `docs/CURRENT_STATE.md` "local implementation, not yet deployed / no push /
  no PR / pending review" wording was stale and is corrected to record the
  deployed state and the authoritative deployed commit. Historical DECISIONS
  entries that described the earlier local-only point in time are left standing
  (append-only) — only the *current-state* doc was reconciled.
- **Current-tree personal-health wording generalized.** The hardcoded
  movement-safety string in `src/lib/health/profilePrompt.ts` no longer embeds a
  specific spinal level; it now reads "reported back-safety context" while
  preserving the same functional guidance (avoid axial loading; caution on back/
  leg/nerve-like/radiating symptoms). The `l4|l5|laminectomy|herniat` detection
  keywords (which match the user's own imported profile text, not a hardcoded
  fact) are unchanged, so runtime behavior is identical. Related code comments
  and the current-state doc were generalized to match. The production bundle no
  longer contains the specific spinal-level fact.
- **DECISIONS.md privacy redaction (append-only exception, deliberate).** Two
  earlier entries in THIS log contained a specific spinal-level notation and a
  possessive personal-health phrase. Per an explicit maintainer decision for
  DOS-GOV-001, the *specific personal medical wording* was redacted in place
  (generalized to non-identifying wording) because personal medical facts must
  not remain in the public tracked tree; every entry's date, decision,
  rationale, and all non-sensitive content were preserved. Privacy takes
  precedence over byte-for-byte append-only preservation here, while the log's
  historical meaning and audit trail remain intact. This is the only case in
  which an existing entry's text was altered rather than appended.
- **Privacy validator strengthened (narrowly).** `scripts/validate-privacy.mjs`
  gains two generic rules: (1) spinal-level (vertebral-pair) notation flagged
  ONLY when it sits beside a personal/profile-health context signal — a
  possessive (David's/my), or a movement-safety/health-profile/injury/history/
  surgery word within a short same-line window — so generic or technical spinal
  references (general anatomy docs, example notation, the lowercase `l4|l5`
  classifier tokens) keep passing and there is no global ban on the notation;
  (2) named or first-person possessive medical wording, requiring both the
  possessive and a concrete condition within two words. Generic health/
  accessibility terminology ("movement-safety context", "saved training
  restrictions", "respect the user's reported injuries") is deliberately left
  passing. The rules are documented with regexes rather than example literals so
  neither this log nor the validator source trips the strengthened scan;
  concrete synthetic examples live only in the declared-skip test fixture. The
  scan still covers all tracked text files.

## DOS-FIT-READY — Training Readiness & Recovery (2026-07-17)

- **New narrow workflow `fitness-readiness` (Training Readiness & Recovery).**
  A conservative, provider-neutral prompt builder that helps decide whether to
  train as planned, modify the session, do light recovery only, rest and
  reassess, seek non-emergency medical advice, or stop and seek urgent/emergency
  care. It is decision support, not a diagnosis, and is not a medical device.
  Seed spec: `seed/workflows/fitness-readiness.json` (fitness agent,
  `fitness_health` category/history, `custom` output mode, `draft_only` risk,
  single `Universal AI Prompt` output style). Registered through the existing
  workflow registry; count is now 8 agents / 10 workflows.
- **Dedicated deterministic builder, not the shared continuity engine.**
  `src/lib/workflows/fitnessReadinessPrompt.ts` assembles one Universal AI Prompt
  requiring seven sections: readiness decision, main reasons, optional session
  modification, recovery priorities, reassessment conditions, an explicit safety
  block, and an uncertainty statement. No AI is called; the JSON `template` is a
  validator-satisfying fallback only. The Workflow Runner special-cases
  `fitness-readiness` alongside `gravl-review`; all other workflows are unchanged.
- **Forced conservative red-flag handling.** Supplied red-flag facts (chest
  pain/pressure/tightness, pain radiating to arm/jaw/back, trouble breathing,
  fainting/near-fainting, confusion/new neurological symptoms, possible heart
  attack/stroke, severe dehydration or inability to keep fluids down, and any
  severe or rapidly worsening symptom) inject a prominent emergency-escalation
  directive at the TOP of the prompt. The standing escalation rule is present in
  every prompt even when nothing is detected. A normal wearable/HRV/resting-HR
  score is stated to never override symptoms. The "neck rule" is explicitly
  rejected as a sufficient safety test. Respiratory-illness signals add the
  "improving overall AND fever-free 24h without fever-reducing medication before
  resuming" guidance. The builder never diagnoses, never prescribes, and never
  promises certainty; it invents nothing and preserves the missing/unknown/
  unavailable/not-measured/zero/explicitly-denied distinctions.
- **Readiness-specific Health Profile whitelist.** `profilePrompt.ts` gains a
  `readinessSafe` option using a tighter allowlist than Gravl: recovery
  baselines (sleep, HRV baseline, resting-HR baseline), training-load basics
  (frequency, split, style), movement restrictions, current training notes, the
  primary goal, and the generated movement-safety summary only. Nutrition macros,
  body metrics, medications, supplements, and all free-text notes are excluded.
  `gravlSafe` and default behavior are unchanged. The UI and generated prompt
  both disclose whether Health Profile context was included.
- **Routing conversion with precedence and negative guards.** The readiness
  detector in `intentClassifier.ts` is converted from recognized-but-unsupported
  to a supported route for `fitness-readiness`. It fires only when a symptom /
  recovery / readiness-doubt signal co-occurs with a real training decision
  (train/rest/skip/deload/gym/lift/workout or a readiness-decision phrase);
  "deload"/"deload week" were added to the training-decision vocabulary. A bare
  symptom or metric with no training decision ("I feel sick", "HRV", "tired",
  "sore", "cold", "fever", "chest pain") stays unknown and is never routed.
  `detectIntents` drops the generic Gravl/Handoff fitness goal when a readiness
  call is present, so illness/recovery + a train/rest/safety decision routes to
  Fitness Readiness BEFORE Gravl or Fitness Handoff — correcting the unsafe/
  dishonest R-3 outcome (illness + "safe to lift" reaching Fitness Handoff).
  `intentRouter` honors an explicit fitness workflow (readiness, food logging)
  and defers to the Gravl-vs-Handoff resolver only for the generic fitness goal.
  Ordinary workout review/safety with no illness/recovery stays Gravl; work
  training precedence, nutrition/progress honesty, multi-domain detection, the
  17-case visible suite, and the three PR #7 corrections are unchanged.
- **Corpus effect (unchanged 153-case expectations).** Strict classification
  122→127 (EX-04, C-train-4, R-1, R-2 unsupported→supported; R-5 ambiguous→
  supported); R-3 stays strict-pass but its emitted workflow changed from the
  unsafe `fitness-handoff` to `fitness-readiness`. Tuple conformance (107) and
  operational acceptance (146) are unchanged. Exactly these six IDs changed; no
  unrelated case regressed. Two in-repo unit tests and one routing-metrics lock
  that pinned the pre-correction behavior were updated to the corrected routing.

## 2026-07-17 — Documentation-only project-state reconciliation

Docs-only pass (branch `docs/dos-project-state-reconciliation` from
`main` @ `f01a822`); no product behavior, code, tests, schemas, or
workflows changed.

- **OPEN_LOOPS reconciled against the deployed repo.** OL-002, OL-004,
  OL-005, OL-006, OL-007, OL-011, and OL-012 were independently
  re-verified as implemented and deployed (PR #3 and PR #5 lineage) and
  moved to a "Resolved & deployed" history section with commit/test
  citations. All remaining entries were re-verified as still open at
  `f01a822` and gained a **Kind** tag (defect / maintenance /
  environmental / future capability). OL-001's wording now records that
  `fix/dos-fnd-001-reliable-offline-launch` holds an unmerged,
  unreviewed draft fix — the loop stays open.
- **CURRENT_STATE updated to the PR #8 release.** Verification counts
  corrected from the stale 2026-07-15 snapshot (233 unit / 25 smoke) to
  the verified 2026-07-17 state: 464/464 unit tests (35 files), 72/72
  Playwright tests (11 files), 17/17 visible routing suite, corpus
  strict 127/153 vs tuple conformance 107/153 (kept explicitly
  separate) vs operational acceptance 146/153, 10 workflows / 8 agents.
  Added a release-history section (PRs #1–#8 with merge SHAs/dates) and
  a repository-state section distinguishing merged evidence branches
  (worktrees safe to remove, removal not performed) from stale
  unmerged drafts.
- **README import paragraph corrected** — deep per-item validation and
  the forward-schema guard shipped in PR #5; the "still pending
  OL-005/OL-006" claim was stale.
- **Authority boundaries restated:** docs/OPEN_LOOPS.md is the single
  backlog; docs/CURRENT_STATE.md is the single production-state
  snapshot and the only place exact counts live.

## 2026-07-18 — Health Profile Import Draft Protection (PR #12)

Squash-merge release (PR #12, commit `789fe4d7fd2ad7cbfa5448a4efa10cd8c212128f`) resolving OL-027.

- **Atomic Import Commit:** Implemented `commitImport` in `src/lib/storage/importCommit.ts` to coordinate state writing and draft clearing. The backup state is written to persistence first; only after a successful write is the unsaved Health Profile draft cleared from localStorage. If the write fails, the entire import is aborted to prevent draft loss without a committed import.
- **Enhanced Dialog Focus & Keyboard Accessibility:** The warning dialog manages focus correctly: the "Cancel" action is focused by default, focus is trapped within the modal, and the Escape key dismisses the dialog (preserving the draft).
- **Validation & Safety Guard:** Backup imports reject malformed or newer schema-version backups before any draft or state mutation.
- **Verification:** 100% automated test coverage in unit/integration tests (511 passing) and browser smoke tests (88 passing), along with live deployment and isolated automated browser tests.

## 2026-07-18 — OL-003 Storage Protection & Retention (PR #14)

Squash-merge release (PR #14, commit `a341b5cbe0cab88eed8d8ce43e604b04b6ce999c`), resolving OL-003. Approved feature SHA `19e303b107c3540639a1a04809b5bd270290dd01`, auto-deployed to GitHub Pages via run `29656188235` (deployment ID `5504316437`). Post-merge live verification passed 40/40 focused acceptance criteria. Archived live-release report: `C:\dev\backups\DavidOS-OL-003-storage-protection-retention-live-release-2026-07-18.md` (9,730 bytes, SHA-256: `587E13309E66AF7DDACA1C6E78B822499E04F4A601D7D00E3563E128E2B1E6C1`).

The retention-policy decision OL-003 was waiting on came from David's OL-003 work order: destructive storage operations must be explicit, guarded, user-visible actions — nothing is ever deleted automatically.

- **Retention scope: artifacts only.** Saved prompt artifacts are the
  unbounded multi-KB growth named in OL-003 and are re-generatable.
  Handoffs are append-only canonical history (docs/SOURCE_OF_TRUTH.md)
  and are NEVER pruned; the UI says so explicitly. Audit log was
  already capped (300 entries).
- **Guarded prune, reset-style.** Settings → Data → Storage gains a
  "Prune saved prompts…" dialog: user picks keep-newest-N (default 50),
  sees the exact delete count and freed size BEFORE anything happens,
  is offered "Export backup first (JSON)" in the dialog
  (prompt-to-export-then-prune), and must type `PRUNE` — the same
  type-to-confirm guard as Reset. Open/cancel/complete are all audited.
  Pruning is disabled whenever persistence is suppressed (recovery
  boot, stale tab) so an in-memory-only delete can never happen.
- **Storage usage meter.** `src/lib/storage/storageUsage.ts` (pure)
  measures the serialized state per collection plus recovery blobs and
  the health draft, against a ~5MB quota ESTIMATE (localStorage quotas
  are UTF-16-unit based and browser-specific; the UI labels sizes as
  estimates). Thresholds: warning ≥70%, critical ≥90%.
- **Proactive protection banner.** At critical level an app-wide banner
  (Layout) points to Settings → Data while an export can still be
  saved — before the existing persist-failure banner becomes relevant.
- **No schema change.** No new `AppState` fields; keep-count is a
  dialog input, not persisted policy. Old state and backups load
  unchanged; no `normalizeState` migration needed.

## 2026-07-18 — OL-003 correction: prune made persistence-atomic

Independent review of the OL-003 candidate found the prune commit
non-transactional: React state was replaced (and success reported)
before the deferred store effect attempted the durable write, and
`persistFailed` did not disable pruning. Correction (separate commit on
`fix/ol-003-storage-protection-retention`):

- **Persist-first commit.** `confirmPrune` now computes the pruned
  AppState without mutating anything, writes it durably via
  `persistState()` (the same canonical boundary `commitImport` uses),
  and only after a successful write replaces the active state, closes
  the dialog, audits completion, and reports success. localStorage
  writes are atomic per key, so a failed write leaves the stored
  original untouched; the in-memory state is not replaced either.
  A failure is audited (actionTaken false) and reported with a clear,
  value-free error. The store effect's redundant-write skip means the
  persist-first write introduces no second conflicting mechanism.
- **Health guard extended.** Pruning is disabled while persistence is
  suppressed (recovery boot, stale tab) OR already failing
  (`persistFailed`). After a failed prune write, the failure audit
  re-probes persistence through the normal store effect, so
  `persistFailed` truthfully reflects device health and keeps pruning
  unavailable until a write succeeds. Known trade-off: at hard quota
  exhaustion pruning is blocked too — the recovery path is export +
  reset, which is why the ≥90% banner warns before that point.
- **Dialog accessibility (local only):** Escape now cancels and Cancel
  receives initial focus. Full focus trapping remains OL-015; no
  modal-system rewrite.

## 2026-07-19 — OL-015 Modal Focus Management (PR #16)

Merge release (PR #16, "fix(a11y): establish OL-015 modal focus management",
merge commit `7077dac7a9e50f84e39b0f58bf7665b358a1e577`, feature candidate
`393839908a9cc9f8bc8a60aa9241b387615fdecb`), resolving OL-015.

- **One shared `useModalFocus` foundation.** A single hook plus an
  exported `MODAL_FOCUSABLE_SELECTOR` now backs all six dialog surfaces
  (Settings import-conflict, Settings reset-confirmation, StorageManager
  pruning, Settings Health Profile draft-conflict, ApprovalGate,
  StaleTabDialog), replacing per-component ad hoc focus handling with
  one tested implementation.
- **Safe preferred initial focus.** Each surface passes an
  `initialFocusRef` to the non-destructive/preservation-safe control
  (e.g. Cancel, "Keep current", "Cancel & keep my edits", Deny); when no
  ref is supplied the hook falls back to the focusable `tabIndex={-1}`
  dialog card itself. No surface defaults focus onto a destructive or
  approving control.
- **Tab and Shift+Tab containment.** Forward Tab wraps from the last
  focusable back to the first; Shift+Tab wraps from the first (or the
  focused dialog card) to the last. The focusable set excludes native
  `disabled` controls.
- **Escape mapped only to safe existing actions.** The hook calls only
  the caller-supplied safe callback (via a latest-callback ref) and
  contains no approve/import/reset/prune/persistence path of its own —
  each surface wires Escape to its own pre-existing cancel/deny handler
  (`cancelImportConflict`, `cancelReset`, `cancelPrune`,
  `cancelDraftConflict`).
- **ApprovalGate Escape always resolves to Deny or Close.** Escape calls
  `onDecision(false)` exclusively; no keyboard path reaches approval,
  and blocked high-risk requests still render no Approve button at all.
- **Connected-opener focus restoration.** The open effect captures
  `document.activeElement` (the real opener) before focus moves into the
  dialog; cleanup restores focus to it only if `opener.isConnected`,
  otherwise it safely no-ops rather than focusing a detached node.
  StaleTabDialog's pre-existing behavior of handing focus to its
  persistent "Show details" control after dismissal is preserved and
  supersedes generic restoration for that surface.
- **Counted body-scroll locking for stacked modals.** A module-level
  open-modal reference count stores/hides the original inline
  `overflow` on the first open and restores it only when the count
  returns to zero, so a modal opened on top of another does not
  prematurely unlock scrolling.
- **StaleTabDialog's inert, banner, and write-guard behavior is
  unchanged.** The persistent stale banner, the `externalChange` store
  flag, and write-suppression remain outside modal-visibility state;
  Layout's pre-existing `inert`/`aria-hidden` handling was not touched.
  Dismissing the dialog cannot clear staleness or authorize writes;
  reload remains the only path back to a writable state.
- **Deliberate exclusions.** No native `<dialog>` element conversion, no
  portals, no generalized inert/background framework, no backdrop-click
  dismissal behavior changes, no Command Palette redesign, and no
  OL-016 through OL-020 scope. These remain open, separate items.
- **PR #16 process deviation.** Unlike several prior OL packages in this
  history that used squash merges, PR #16 was merged via a normal merge
  commit (`7077dac`, parents `c21a6cd` and `3938399`). The merge tree is
  byte-equivalent to the single feature commit; this is a process note,
  not a behavioral difference.
- **Independent review's selector-hardening observation is future
  hardening only, not a blocker.** The reviewer noted
  `MODAL_FOCUSABLE_SELECTOR` excludes native `disabled` controls but does
  not yet filter every hidden/inert/CSS-invisible/otherwise-untabbable
  candidate. No current dialog surface contains such a control, and
  real-browser containment passed for all six surfaces; the observation
  is recorded here so a future surface with a conditional/hidden control
  adds a regression case and tightens the selector before shipping.

## 2026-07-19 — DOS-WF-002A: Planning Context Unification
- **One canonical planning-context source** (`src/lib/planning/planningContext.ts`:
  `buildPlanningContext(state, mode)`, `buildWeeklyReviewContext(state)`,
  `renderPlanningStateBlock(context)`) now backs all four surfaces: Planning-page
  Daily Brief, Planning-page Weekly Review, and both Workflow Runner
  equivalents. The Planning page's `composeDailyBrief`/`composeWeeklyReview`
  (`src/lib/planning.ts`) were refactored to source their priorities/open
  loops/reminders/projects from it instead of re-deriving the same filters,
  with output text unchanged.
- **Approved-fields allowlist, not a redaction denylist.** The context type
  only has room for priority label+rank, open-loop label, reminder
  label+due, and project name/status/nextAction — project notes/area,
  Context Vault, Health Profile, audit content, artifact content, and
  handoff content/summaries have no field to leak through, by construction,
  mirroring the existing Gravl/Readiness allowlist pattern in
  `profilePrompt.ts` rather than trying to filter them out after the fact.
- **`mode: 'planning' | 'weekly'` selects the project window**, matching
  the pre-existing behavioral difference between the two surfaces
  (`'planning'` → active projects only, as `composeDailyBrief` already did;
  `'weekly'` → active + paused/not-done, as `composeWeeklyReview` already
  did) rather than inventing a new selection rule.
- **`Workflow.stateContext?: 'planning' | 'weekly'`** is the only new
  workflow-definition field, set solely on `daily-brief` and
  `weekly-review` in seed data. The Workflow Runner inserts
  `## Current DavidOS State` between New Entry and Prior Context only when
  a workflow declares it — `buildPrompt()` itself just inserts whatever
  block it's given (same caller-gated contract `profileBlock` already
  uses); it does not re-derive which workflows qualify.
- **Zero-note building is exempted per-call (`allowEmptyRequest`), not by
  weakening the default.** `evaluatePromptValidity()` keeps requiring
  non-empty input unless the caller explicitly opts in; the Workflow
  Runner opts in only when `workflow.stateContext` is set. The empty-input
  New Entry placeholder is a workflow-specific locked string ("no
  additional notes for today/this week"), never the generic "no input
  provided" marker, so the existing honesty check still catches every
  other workflow's stale/empty state.
- **Staleness reuses the existing full-hash config-key pattern.**
  `buildPromptConfigKey` gained `includePlanningState` +
  `planningContextFingerprint` fields alongside the pre-existing Health
  Profile ones; the fingerprint is the block's full SHA-256 (not the
  shortened display fingerprint) for the same collision-avoidance reason
  documented on `profileFingerprint`.
- **`PlanningContextDisclosure.tsx` reuses existing UI primitives**
  (`.checkrow`, `<details>`/`<summary>`, `.chip`, `.output`, `.notice`) —
  no new CSS, matching the Health Profile inline disclosure's visual
  language but factored into its own component per the package spec.
- **Reverted an initial input-label change.** An early pass relabeled the
  Workflow Runner's request textarea for planning-context workflows
  ("Additional notes (optional)…"); this broke the pre-existing smoke test
  `workflow runner generates a local draft prompt`, which asserts the
  literal `Input — messy notes are fine` label for `daily-brief`. The
  label was reverted to unconditional; optionality is communicated via a
  muted helper line under the textarea instead, so no existing assertion
  needed to change.
- **`OpenLoop.closedAt` is stamp-only in this package** — set on close,
  cleared on reopen, validated as an optional ISO field on import. Per
  scope, it is deliberately NOT read anywhere yet (no weekly
  completed-loop reporting); it exists so a later package can build that
  reporting without a further data migration.
- **`Planning.tsx` action labels changed, entry points did not.** "Generate
  from current state" / "AI-prompt version" became "Generate locally (no
  AI)" / "Build AI prompt (Workflow Runner)" — same `onClick`/`to` targets,
  clearer about which path calls no AI.
