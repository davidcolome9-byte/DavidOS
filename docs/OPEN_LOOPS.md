# Open Loops — Prioritized Backlog

The single authoritative backlog. Every item: stable ID, domain, problem,
evidence, priority (P1 highest), dependencies, approach, acceptance
criteria, validation, complexity (S/M/L), whether David's approval is
needed, and a status marker:

- **Verified** — reproduced/confirmed by audit evidence in code
- **Inferred** — probable, not fully reproduced
- **Blocked** — waiting on something
- **Requires David** — product/privacy decision needed before work
- **Ready** — a coding agent can start without further clarification
- **Obsolete** — kept for history

Items fixed in the 2026-07-12 stabilization sprint are not listed; see
git history (`fb76122`) and docs/DECISIONS.md.

---

## P1 — data safety & core promises

### OL-001 · Offline launch breaks after first install and after every deploy
- **Domain:** PWA/service worker · **Status:** Verified + Ready
- **Problem:** `public/sw.js` precaches only `./` + manifest at install;
  its activate handler deletes ALL old caches. (a) On first visit the
  hashed JS/CSS were fetched before the SW controlled the page → never
  cached → offline launch white-screens until a second online visit.
  (b) After a deploy, the new SW's activate deletes the old cache that
  held the current assets → offline white-screen until the next online
  reload.
- **Evidence:** `public/sw.js:14-28` (precache list + cache deletion),
  `src/app/main.tsx:14-20` (registration on window load).
- **Approach:** at install, fetch and cache the current page's asset
  URLs (parse `dist/index.html` asset links, or inject an asset manifest
  at build time next to the sw version stamp); only delete old caches
  after the new cache is fully populated.
- **Acceptance:** with the preview server stopped (offline), a
  previously-visited app launches; after a redeploy + one online load,
  offline launch still works. Playwright can simulate via
  `context.setOffline(true)`.
- **Validation:** `npm run verify:full` + a new offline smoke test +
  manual check on the installed Android PWA.
- **Complexity:** M · **Approval:** no (bug fix of an existing promise)

### OL-002 · Unsaved Health Profile edits are destroyed by in-app navigation
- **Domain:** Health Profile UX · **Status:** Verified + Ready
- **Problem:** the `beforeunload` guard only covers tab close; tapping a
  bottom-nav tab unmounts the editor and silently drops the draft.
- **Evidence:** `src/components/HealthProfile.tsx:47,57-65`; decision
  log notes react-router v6 non-data-router has no stable blocker
  (docs/DECISIONS.md "Unsaved-changes guard").
- **Approach:** migrate `HashRouter` → `createHashRouter` (data router)
  and use `useBlocker` for dirty state; alternatively persist the draft
  to localStorage keyed `davidos-health-draft` and restore on mount
  (smaller, no router change — preferred first step).
- **Acceptance:** edit a field, navigate to Home, come back → the edit
  is still there (or a confirm dialog intervened).
- **Validation:** `npm run verify:full` + new smoke test.
- **Complexity:** M · **Approval:** no

### OL-003 · Artifacts and handoffs grow without bound → quota exhaustion
- **Domain:** persistence · **Status:** Verified + Requires David
- **Problem:** every full prompt saved as an artifact is multi-KB;
  nothing caps `artifacts`/`handoffs`. A heavy user eventually hits the
  ~5MB localStorage quota. (The failure is now VISIBLE via the persist
  warning banner, but still inevitable.)
- **Evidence:** `src/components/WorkflowRunner.tsx:176` (uncapped
  prepend), only `auditLog` is capped (`src/lib/audit/auditLog.ts:4`).
- **Approach:** David must choose a retention policy (e.g. keep last N
  artifacts, or prompt-to-export-then-prune). Retention must never
  destructively delete without explicit user action. A storage-usage
  meter in Settings → Data is approvable now.
- **Acceptance:** storage usage visible; chosen policy enforced with
  user-visible pruning, never silent deletion.
- **Validation:** unit tests for the cap logic; `npm run verify`.
- **Complexity:** M · **Approval:** YES (retention policy)

### OL-004 · Two open tabs silently clobber each other (last-write-wins)
- **Domain:** persistence · **Status:** Verified + Ready
- **Problem:** each tab loads state once at mount and persists the whole
  state on every change; a stale background tab's next change overwrites
  everything a fresh tab saved.
- **Evidence:** `src/state/store.tsx:20-24`; no `storage` event
  listener anywhere.
- **Approach:** listen for the `storage` event; when another tab wrote,
  show a blocking "State changed in another tab — reload" banner (no
  silent merge, mirroring the Drive conflict philosophy).
- **Acceptance:** tab A saves; tab B (stale) attempts a change → B warns
  and reloads instead of clobbering.
- **Validation:** Playwright multi-page test; `npm run verify:full`.
- **Complexity:** M · **Approval:** no

## P2 — correctness & robustness

### OL-005 · Import validates shapes only after repair; deep field validation missing
- **Domain:** import/export · **Status:** Verified + Ready
- **Problem:** `normalizeState` now repairs junk types (sprint fix), but
  a well-formed-looking backup with wrong field TYPES inside items
  (e.g. `priority.rank: "high"`) still imports and degrades rendering.
- **Evidence:** `src/lib/storage/exportImport.ts` REQUIRED_ARRAYS only;
  persistence audit F3 (2026-07-12).
- **Approach:** small per-entity validators (id: string, required
  strings, enums) invoked in `parseImport`, rejecting with a readable
  message naming the bad item; keep normalizeState as the last-resort
  repair for boot.
- **Acceptance:** importing a fixture with a bad-typed item fails with a
  precise error; valid old backups still import (existing tests stay
  green).
- **Validation:** extend `exportImport.test.ts`; `npm run verify`.
- **Complexity:** M · **Approval:** no

### OL-006 · No forward-schemaVersion guard on import or load
- **Domain:** import/export · **Status:** Verified + Ready
- **Problem:** a backup with `schemaVersion: 2` (from a future app
  version) imports silently into an app that only understands 1.
- **Evidence:** `exportImport.ts` checks `typeof === 'number'` only;
  persistence audit F2.
- **Approach:** export a `CURRENT_SCHEMA_VERSION` constant; import
  rejects newer versions with "this backup came from a newer DavidOS".
- **Acceptance:** importing schemaVersion 2 fails readably; 1 imports.
- **Validation:** unit test; `npm run verify`.
- **Complexity:** S · **Approval:** no

### OL-007 · Handoff correction/edit UI
- **Domain:** continuity · **Status:** Verified (gap) + Ready
- **Problem:** `status`/`correctsHandoffId` exist in the model and
  retrieval respects them, but there is no UI to mark a correction —
  the sanctioned mechanism (human corrections outrank prior entries;
  see SOURCE_OF_TRUTH.md) is unreachable.
- **Evidence:** `src/lib/types.ts:148-166`, retrieval in
  `src/lib/workflows/continuity.ts`; docs/DECISIONS.md v0.2 notes.
- **Approach:** on a saved handoff (Logs → Handoffs), "Correct this
  entry" → new handoff prefilled, saved with `status: 'correction'` +
  `correctsHandoffId`; original auto-marked `superseded`.
- **Acceptance:** corrected entries replace originals in prompt history
  (already covered by continuity tests); UI flow smoke-tested.
- **Validation:** `npm run verify:full`.
- **Complexity:** M · **Approval:** no

### OL-008 · GIS script injects on Settings mount without user action
- **Domain:** integrations/privacy · **Status:** Verified + Ready
- **Problem:** when `VITE_GOOGLE_CLIENT_ID` is set, opening Settings
  loads a Google script with no user gesture (no data sent, but
  contrary to the "user gesture first" posture).
- **Evidence:** `src/components/Settings.tsx:56-78`.
- **Approach:** lazy-load GIS inside `connectDrive()` on first click;
  the "auth ready" badge becomes "loads on connect".
- **Acceptance:** no accounts.google.com request until Connect clicked.
- **Validation:** smoke test asserting no such network request on
  Settings load; `npm run verify:full`.
- **Complexity:** S · **Approval:** no

### OL-009 · "Forget session" doesn't revoke the Google token
- **Domain:** integrations · **Status:** Verified + Ready
- **Problem:** the token is dropped from memory but stays valid at
  Google until expiry (≤1h); the audit entry implies more than happened.
- **Evidence:** `src/components/Settings.tsx:166-176`; `oauth2.revoke`
  declared but never called (`googleDriveClient.ts:33`).
- **Approach:** call `revoke` best-effort, then clear; audit both
  outcomes honestly.
- **Complexity:** S · **Approval:** no

### OL-010 · drive.file scope can create duplicate "DavidOS" folder trees
- **Domain:** integrations · **Status:** Inferred
- **Problem:** manually-created Drive folders are invisible to the app's
  scope, so exports may create a parallel DavidOS/06_Exports tree; Drive
  allows same-name siblings.
- **Evidence:** `googleDriveClient.ts:156-204` (findChildByName /
  ensureDriveFolderPath); standard drive.file semantics.
- **Approach:** document the behavior in Settings help text; optionally
  order query results (`orderBy: 'createdTime'`) for determinism. Do NOT
  widen the OAuth scope for this.
- **Complexity:** S · **Approval:** no (scope widening would need YES)

### OL-011 · Generated prompt goes stale with no indicator after input edits
- **Domain:** workflow runner · **Status:** RESOLVED (DOS-WF-001, 2026-07-14)
- **Evidence:** `src/components/WorkflowRunner.tsx:253-258` vs `352-353`
  (audit 2026-07-12): editing the input after Generate leaves Copy
  buttons serving the old prompt while Save handoff uses the new text.
- **Resolution:** the Runner now captures a config key at build time
  (`buildPromptConfigKey` over input, workflow, output config, and the
  included Health Profile fingerprint) and compares it to the live values.
  A stale result shows "Prompt out of date. Rebuild to update." and
  disables Copy/Save/follow-up actions. Also covers OL-012's Runner cases.
- **Complexity:** S · **Approval:** no

### OL-012 · Silent no-op primary buttons
- **Domain:** UX · **Status:** Partially resolved (DOS-WF-001, 2026-07-14)
- **Evidence:** empty-name saves in `WorkflowRunner.tsx:125`,
  `ProjectVault.tsx:91`, `PromptVault.tsx:130` do nothing silently.
- **Resolution (Runner only):** Build Prompt is disabled with a visible
  "Enter a request…" hint when the request is empty, and every Copy/Save/
  follow-up action is disabled while a built result is invalid or stale.
  `ProjectVault` and `PromptVault` empty-name saves are still open.
- **Approach (remaining):** disable the button or flash the missing-field
  message in the vault editors.
- **Complexity:** S · **Approval:** no

### OL-013 · Router duplicates agent names/default workflows from seed
- **Domain:** dead code/drift risk · **Status:** Verified + Ready
- **Evidence:** `src/lib/router/intentRouter.ts:4-22` hardcodes what
  `agentRegistry` already exposes; renaming an agent would desync
  routing copy.
- **Approach:** derive `AGENT_NAMES`/`DEFAULT_WORKFLOW` from the
  registry; intentRouter tests already cover behavior.
- **Complexity:** S · **Approval:** no

### OL-014 · scripts/seed-to-backup.mjs re-implements default state
- **Domain:** dead code/duplication · **Status:** Verified + Ready
- **Evidence:** duplicates `parseFrontmatter`, four context items, and
  seed lists from `src/data/` (audit §2.1); omits newer AppState keys.
- **Approach:** rewrite the script to import the built app's
  `buildDefaultState` via a small vite-node/tsx invocation, or generate
  from a shared JSON manifest. Keep output in `personal/` only.
- **Complexity:** M · **Approval:** no

## P3 — polish, a11y, hardening

### OL-015 · Modals lack focus management (aria-modal without the behavior)
- **Status:** Verified + Ready · **Evidence:**
  `ApprovalGate.tsx:25-47`, `Settings.tsx` reset + conflict modals: no
  initial focus, no trap, no Escape, background tabbable.
- **Approach:** shared `useModalFocus` hook (focus first control, trap
  Tab, Escape = cancel, `aria-labelledby` the title). ApprovalGate
  Escape must map to Deny, never Approve.
- **Complexity:** M · **Approval:** no

### OL-016 · No top safe-area inset (notched devices, standalone PWA)
- **Status:** Verified + Ready · **Evidence:** `index.html:5`
  `viewport-fit=cover` with no `env(safe-area-inset-top)` on
  `.app-header` (`index.css:51-60`); bottom inset IS handled.
- **Complexity:** S · **Approval:** no

### OL-017 · Bottom nav shows no active tab on More sub-pages
- **Status:** Verified + Ready · **Evidence:** `Layout.tsx:23-30`; on
  /agents /prompts /context /planning /health /settings nothing
  highlights.
- **Approach:** mark More active when the route is any of its children.
- **Complexity:** S · **Approval:** no

### OL-018 · /settings#data deep link never scrolls to the Data card
- **Status:** Verified + Ready · **Evidence:** `MoreMenu.tsx:43` under
  HashRouter; no scroll handling at `Settings.tsx` (`id="data"`).
- **Approach:** small `useEffect` scroll-into-view on location state or
  query param instead of a second hash.
- **Complexity:** S · **Approval:** no

### OL-019 · Missing empty states (ProjectVault, ContextVault)
- **Status:** Verified + Ready · **Evidence:** audit §20: zero projects
  leaves a bare card; ContextVault has no create action so an empty
  import yields a permanently empty page.
- **Approach:** friendly empty copy + (for Context) a "New context item"
  action — Context items are user-editable data by design.
- **Complexity:** S · **Approval:** no

### OL-020 · Unassociated form labels in vault editors
- **Status:** Verified + Ready · **Evidence:** `ProjectVault.tsx:76-89`,
  `PromptVault.tsx:106-125` (`<label class="field">` without htmlFor),
  `ContextVault.tsx:67` textarea unlabeled. HealthProfile/WorkflowRunner
  show the correct in-repo pattern.
- **Complexity:** S · **Approval:** no

### OL-021 · tsconfig hardening
- **Status:** Inferred + Ready · **Evidence:** audit §4: missing
  `noUncheckedIndexedAccess`, `forceConsistentCasingInFileNames`;
  `intentRouter.ts:42-43` trusts `scores[0]`/`scores[1]`.
- **Approach:** enable flags one at a time; fix fallout; keep diffs
  mechanical.
- **Complexity:** M · **Approval:** no

### OL-022 · npm audit reports vulnerabilities in the dev toolchain
- **Status:** Inferred · **Evidence:** `npm install` (2026-07-12)
  reported 5 vulnerabilities (3 moderate, 1 high, 1 critical) — dev
  dependencies only (vite 5.x line; no runtime deps affected).
- **Approach:** `npm audit` for specifics; evaluate Vite 5→6/7 upgrade
  as its own task (build-config review, Node floor, plugin compat). Do
  NOT `npm audit fix --force` blindly.
- **Complexity:** M · **Approval:** YES if it forces a major toolchain
  upgrade

## Roadmap-scale items (product decisions)

### OL-023 · v0.2 deferred polish bundle
- **Status:** Requires David (pick what still matters) · Router weight
  tuning, multi-intent detection, "did you mean", audit-log
  filters/search, handoff→project linking, swipe actions, install-prompt
  UX, editable priorities on Home. **Evidence:** docs/roadmap.md history.

### OL-024 · v0.3 Google Drive sync (beyond backup export)
- **Status:** Requires David + Blocked on product go-ahead ·
  Manual "Sync now", two-way vault sync, conflict UI per
  docs/google-drive-sync-plan.md. Every write approval-gated. This is
  an off-device data flow: approval boundary per AGENTS.md §3.

### OL-025 · Future architectural boundaries (planning artifacts — NOT implemented)
- **Status:** Requires David (proposed only — do not implement without
  explicit instruction):
  - Identity Vault / Credential Vault as separate storage boundaries
  - Backup encryption at rest
  - Retention/deletion automation (planning defaults must never trigger
    destructive deletion)
  - Health Connect ingestion (architecture provisional; research lives
    outside this repo)
  - Native Android packaging (Capacitor, v0.7)
  - Gmail (v0.5) / Calendar (v0.4) / AI providers (v0.6)
  These are recorded so no agent mistakes planning documents for shipped
  behavior. See docs/SOURCE_OF_TRUTH.md "System-wide data rules".
