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
