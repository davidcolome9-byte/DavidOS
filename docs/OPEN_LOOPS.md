# Open Loops — Prioritized Backlog

The single authoritative backlog. Every item: stable ID, domain, kind
(defect / maintenance / environmental / future capability), problem,
evidence, priority (P1 highest), dependencies, approach, acceptance
criteria, validation, complexity (S/M/L), whether David's approval is
needed, and a status marker:

- **Verified** — reproduced/confirmed by audit evidence in code
- **Inferred** — probable, not fully reproduced
- **Blocked** — waiting on something
- **Requires David** — product/privacy decision needed before work
- **Ready** — a coding agent can start without further clarification
- **Resolved** — implemented, merged to `main`, and deployed; kept for
  history in the "Resolved & deployed" section at the bottom
- **Obsolete** — kept for history

**Last full reconciliation: 2026-07-19**, verified item-by-item against
`main` @ `7077dac7a9e50f84e39b0f58bf7665b358a1e577` (PR #16, Modal Focus
Management — the live deployed release). Items fixed in the
2026-07-12 stabilization sprint are not listed; see git history
and docs/DECISIONS.md.

---

## P1 — data safety & core promises

*(No open items)*


## P2 — correctness & robustness

### OL-008 · GIS script injects on Settings mount without user action
- **Domain:** integrations/privacy · **Kind:** defect (privacy-posture) ·
  **Status:** Verified + Ready
- **Problem:** when `VITE_GOOGLE_CLIENT_ID` is set, opening Settings
  loads a Google script with no user gesture (no data sent, but
  contrary to the "user gesture first" posture).
- **Evidence (re-verified 2026-07-17):** `src/components/Settings.tsx:61-83`
  (`loadGoogleIdentityServices()` in a mount effect keyed on
  `driveConfigured`).
- **Approach:** lazy-load GIS inside `connectDrive()` on first click;
  the "auth ready" badge becomes "loads on connect".
- **Acceptance:** no accounts.google.com request until Connect clicked.
- **Validation:** smoke test asserting no such network request on
  Settings load; `npm run verify:full`.
- **Complexity:** S · **Approval:** no

### OL-009 · "Forget session" doesn't revoke the Google token
- **Domain:** integrations · **Kind:** defect · **Status:** Verified + Ready
- **Problem:** the token is dropped from memory but stays valid at
  Google until expiry (≤1h); the audit entry implies more than happened.
- **Evidence (re-verified 2026-07-17):** `src/components/Settings.tsx:195`
  (`forgetDriveSession`); `oauth2.revoke` declared but never called
  (`src/lib/integrations/googleDriveClient.ts:39`).
- **Approach:** call `revoke` best-effort, then clear; audit both
  outcomes honestly.
- **Complexity:** S · **Approval:** no

### OL-010 · drive.file scope can create duplicate "DavidOS" folder trees
- **Domain:** integrations · **Kind:** environmental limitation (Drive
  API semantics) · **Status:** Inferred
- **Problem:** manually-created Drive folders are invisible to the app's
  scope, so exports may create a parallel DavidOS/06_Exports tree; Drive
  allows same-name siblings.
- **Evidence:** `googleDriveClient.ts` (findChildByName /
  ensureDriveFolderPath); standard drive.file semantics.
- **Approach:** document the behavior in Settings help text; optionally
  order query results (`orderBy: 'createdTime'`) for determinism. Do NOT
  widen the OAuth scope for this.
- **Complexity:** S · **Approval:** no (scope widening would need YES)

### OL-013 · Router duplicates agent names/default workflows from seed
- **Domain:** dead code/drift risk · **Kind:** maintenance ·
  **Status:** Verified + Ready
- **Evidence (re-verified 2026-07-17):** `src/lib/router/intentRouter.ts:6-22`
  hardcodes `AGENT_NAMES`/`DEFAULT_WORKFLOW` that `agentRegistry`
  already exposes (both maps re-exported at the bottom of the file);
  renaming an agent would desync routing copy.
- **Approach:** derive `AGENT_NAMES`/`DEFAULT_WORKFLOW` from the
  registry; intentRouter tests already cover behavior.
- **Complexity:** S · **Approval:** no

### OL-014 · scripts/seed-to-backup.mjs re-implements default state
- **Domain:** dead code/duplication · **Kind:** maintenance ·
  **Status:** Verified + Ready
- **Evidence:** duplicates `parseFrontmatter`, four context items, and
  seed lists from `src/data/` (audit §2.1); omits newer AppState keys.
  Script still present and unrewritten at `f01a822`.
- **Approach:** rewrite the script to import the built app's
  `buildDefaultState` via a small vite-node/tsx invocation, or generate
  from a shared JSON manifest. Keep output in `personal/` only.
- **Complexity:** M · **Approval:** no

### OL-026 · Gravl workflow does not use prior handoff history yet
- **Domain:** workflow runner / continuity · **Kind:** future capability
  (truthfully deferred) · **Status:** Deferred (DOS-WF-001 correction,
  2026-07-14)
- **Problem:** the Gravl Workout Review builder (`gravlPrompt.ts`) assembles
  its prompt from the current request + workout only; unlike the continuity
  engine it does NOT retrieve prior saved handoffs. Earlier UI copy implied
  "expanded history"; that claim was removed (the Runner now says history is
  deferred, `priorCount` stays 0 — re-verified at `f01a822`,
  `src/lib/workflows/gravlPrompt.ts:178` — and the workflow assumptions
  state it).
- **Approach (when picked up):** feed Gravl through the same prior-handoff
  retrieval the continuity engine uses (fitness window), or a Gravl-specific
  retrieval, and only then restore any "uses prior history" language. Keep the
  Gravl-safe profile whitelist and privacy posture intact.
- **Acceptance:** Gravl prompts include prior fitness handoffs with truthful
  `priorCount`/`includedHandoffIds`; UI history claims match reality.
- **Complexity:** M · **Approval:** no (truthful deferral; enabling history is
  a bounded enhancement)

## P3 — polish, a11y, hardening

### OL-016 · No top safe-area inset (notched devices, standalone PWA)
- **Kind:** defect (mobile polish) · **Status:** Verified + Ready
- **Evidence (re-verified 2026-07-17):** `index.html` `viewport-fit=cover`
  with no `env(safe-area-inset-top)` on `.app-header`
  (`src/styles/index.css`); bottom inset IS handled (index.css:54,87).
- **Complexity:** S · **Approval:** no

### OL-017 · Bottom nav shows no active tab on More sub-pages
- **Kind:** defect (UX polish) · **Status:** Verified + Ready
- **Evidence (re-verified 2026-07-17):** `Layout.tsx` uses plain NavLink
  `isActive` only; on /agents /prompts /context /planning /health
  /settings nothing highlights.
- **Approach:** mark More active when the route is any of its children.
- **Complexity:** S · **Approval:** no

### OL-018 · /settings#data deep link never scrolls to the Data card
- **Kind:** defect (UX polish) · **Status:** Verified + Ready
- **Evidence (re-verified 2026-07-17):** `MoreMenu.tsx:43` still links
  `/settings#data` under HashRouter; no scroll handling in
  `Settings.tsx` (`id="data"`).
- **Approach:** small `useEffect` scroll-into-view on location state or
  query param instead of a second hash.
- **Complexity:** S · **Approval:** no

### OL-019 · Missing empty states (ProjectVault, ContextVault)
- **Kind:** defect (UX polish) · **Status:** Verified + Ready
- **Evidence (re-verified 2026-07-17):** zero projects leaves a bare
  card; `ContextVault.tsx` has no create action so an empty import
  yields a permanently empty page.
- **Approach:** friendly empty copy + (for Context) a "New context item"
  action — Context items are user-editable data by design.
- **Complexity:** S · **Approval:** no

### OL-020 · Unassociated form labels in vault editors
- **Kind:** defect (a11y) · **Status:** Verified + Ready
- **Evidence (re-verified 2026-07-17):** the required Name/Title fields
  gained `htmlFor` associations with the OL-012 vault fix (`524bdb9`),
  but the remaining labels are still unassociated:
  `ProjectVault.tsx:95-105` (Status/Area/Next action/Notes),
  `PromptVault.tsx:123-139` (Category/Tags/Agent/Prompt body),
  `ContextVault.tsx` textarea unlabeled. HealthProfile/WorkflowRunner
  show the correct in-repo pattern.
- **Complexity:** S · **Approval:** no

### OL-021 · tsconfig hardening
- **Kind:** maintenance · **Status:** Inferred + Ready
- **Evidence (re-verified 2026-07-17):** `tsconfig.json` still lacks
  `noUncheckedIndexedAccess` and `forceConsistentCasingInFileNames`;
  `intentRouter.ts` trusts `scores[0]`/`scores[1]`.
- **Approach:** enable flags one at a time; fix fallout; keep diffs
  mechanical.
- **Complexity:** M · **Approval:** no

### OL-022 · npm audit reports vulnerabilities in the dev toolchain
- **Kind:** environmental (dev-toolchain only) · **Status:** Inferred
- **Evidence:** `npm install` (2026-07-12) reported 5 vulnerabilities
  (3 moderate, 1 high, 1 critical) — dev dependencies only (vite 5.x
  line; no runtime deps affected).
- **Approach:** `npm audit` for specifics; evaluate Vite 5→6/7 upgrade
  as its own task (build-config review, Node floor, plugin compat). Do
  NOT `npm audit fix --force` blindly.
- **Complexity:** M · **Approval:** YES if it forces a major toolchain
  upgrade

### OL-028 · Planning and profile reveal panels lose keyboard focus and cannot be keyboard-scrolled
- **Domain:** accessibility · **Kind:** defect / hardening ·
  **Status:** Verified + Ready
- **Problem:** in the Workflow Runner, activating "Show Inserted Planning
  State Text" (`PlanningContextDisclosure.tsx`) or the equivalent Health
  Profile reveal control unmounts the trigger button and replaces it with
  a `<pre>` block with no focus management — keyboard/screen-reader focus
  falls back to `<body>`, losing the user's place immediately after the
  single most privacy-relevant action on the page. The revealed `<pre>`
  can also overflow (`max-height` + internal scroll) with no `tabindex`,
  so a keyboard-only user cannot scroll it.
- **Evidence (found 2026-07-19, independent Fable acceptance review of
  DOS-WF-002A, PR #18):** `src/components/PlanningContextDisclosure.tsx`
  reveal button/`<pre class="output">` swap; the pre-existing Health
  Profile inline reveal in `src/components/WorkflowRunner.tsx` shares the
  identical pattern (DOS-WF-002A reused it rather than introducing a new
  one, so the finding applies to both). Not a DOS-WF-002A regression in
  behavior — it is the same reveal pattern the Health Profile disclosure
  already had; DOS-WF-002A's contribution is a second surface using it.
- **Approach:** keep the reveal control mounted as a Show/Hide toggle
  instead of unmounting it, or move focus safely onto the revealed panel
  (`tabIndex={-1}` + `.focus()`) when it appears; give the revealed
  `<pre>` a `tabIndex` so it is keyboard-scrollable. Cover both the
  Planning Context and Health Profile reveal paths with the same fix.
  Reuse existing React and accessibility patterns already in this
  codebase (e.g. `useModalFocus`'s focus-restoration approach) — no new
  dependency or component framework.
- **Acceptance:** after reveal, keyboard focus lands somewhere
  meaningful (the toggle or the panel itself), never `<body>`; a
  keyboard-only user can scroll overflowed revealed output; both reveal
  paths behave identically.
- **Complexity:** S · **Approval:** no

### OL-029 · Near-quota smoke seeding self-triggers stale-tab guard
- **Domain:** test reliability / storage safeguards · **Kind:**
  maintenance / environmental · **Status:** Verified + Ready
- **Problem:** `tests/smoke/storageRetention.spec.ts`'s "near-quota state
  raises the app-wide protection banner and Settings warning" test can
  fail in some environments: its `seedArtifacts` helper writes directly
  to `localStorage` via `page.evaluate` and reloads, which can self-
  trigger the app's genuine cross-tab `storage`-event guard
  (`src/state/store.tsx`, `StaleTabDialog.tsx`) — the test's own tab ends
  up treated as stale, blocking the prune-dialog interaction the test is
  trying to exercise.
- **Evidence (found 2026-07-19, DOS-WF-002A Gate 2 non-regression
  investigation):** reproduced 4/4 attempts on merged `main`
  (`49c71caa7ad8af95afad3adc09893a0388810745`) and 1/1 on the
  pre-DOS-WF-002A base (`4fefa3ce4ad25918234a00d2430575da5e5bd4db`) in an
  independent local sandbox — identical failure line, identical disabled
  prune-button state, identical active `⚠️ Updated in another tab` dialog
  on both revisions; `tests/smoke/storageRetention.spec.ts`,
  `src/state/store.tsx`, and `src/components/StaleTabDialog.tsx` are
  byte-identical across both revisions, ruling out a DOS-WF-002A
  regression. Did not reproduce on GitHub Actions (`ci.yml` run
  `29701986395`, `deploy.yml` run `29701986418`, both green, both running
  the full Playwright suite on a clean-provisioned runner) — sandbox/
  environment-timing-sensitive, not a general failure.
- **Approach:** evaluate the smallest existing-mechanism correction —
  seed state before the app's storage-event listener mounts, or isolate
  the harness's write so it cannot be mistaken for a second tab (e.g. an
  explicit test-only marker the store already trusts, or seeding before
  first mount rather than via a raw `localStorage.setItem` + reload).
  Do not build a new test framework, browser harness, storage subsystem,
  or stale-tab mechanism.
- **Acceptance:** the near-quota test passes reliably across environments
  without weakening its assertions or increasing its timeout; product
  storage protection (OL-003) and stale-tab protection (OL-004) are
  unchanged.
- **Complexity:** S · **Approval:** no

## Roadmap-scale items (product decisions)

### OL-030 · DOS-AGT-001A Supervised Coding Coordinator — candidate + deferred follow-ups
- **Kind:** future capability (first operational execution agent) ·
  **Status:** Blocked (local candidate on
  `feat/dos-agt-001a-supervised-coding-agent`, awaiting independent review
  and David's merge decision — NOT merged, NOT deployed)
- **Shipped in the candidate:** separate execution-agent registry
  (`coding-coordinator`, own `ExecutionAgentId` — domain agents untouched);
  `AppState.executionRecords` with lifecycle
  draft/ready/in_progress/blocked/awaiting_approval/completed/cancelled;
  three separate draft fields (objective, scope, stopConditions);
  restrictive all-false authority defaults (code/tests/docs/push/PR/merge);
  deterministic execution packet with honesty notice; optional deeply
  validated import; allowlist-only audit metadata; mobile-first Supervised
  execution section on the Agents page. DavidOS executes and sends nothing.
- **Correction pass applied:** the first independent Codex candidate review
  ("changes required before push") was addressed in full on the same
  branch — deep boot validation + recovery for stored records, id-free
  allowlisted audit entries, outcome/authority/timestamp invariants,
  accessible inline cancel focus, and mobile long-content hardening — see
  docs/DECISIONS.md 2026-07-19 (correction pass). Awaiting the final
  independent review and David's merge decision.
- **Deliberately deferred (future loops, need David):** record↔project
  linking; packet history as typed artifacts; additional execution profiles;
  any actual execution automation (v0.6-class decision, see OL-025).
- **Evidence:** docs/DECISIONS.md 2026-07-19 DOS-AGT-001A entries;
  `src/lib/agents/executionRecords.ts`, unit/component/Playwright suites.

### OL-023 · v0.2 deferred polish bundle
- **Kind:** future capability · **Status:** Requires David (pick what
  still matters) · Router weight tuning, multi-intent detection, "did
  you mean", audit-log filters/search, handoff→project linking, swipe
  actions, install-prompt UX, editable priorities on Home.
  **Evidence:** docs/roadmap.md history.

### OL-024 · v0.3 Google Drive sync (beyond backup export)
- **Kind:** future capability · **Status:** Requires David + Blocked on
  product go-ahead · Manual "Sync now", two-way vault sync, conflict UI
  per docs/google-drive-sync-plan.md. Every write approval-gated. This
  is an off-device data flow: approval boundary per AGENTS.md §3.

### OL-025 · Future architectural boundaries (planning artifacts — NOT implemented)
- **Kind:** future capability · **Status:** Requires David (proposed
  only — do not implement without explicit instruction):
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

---

## Resolved & deployed (closed 2026-07-19 reconciliation)

Each item below was independently re-verified as implemented on `main`
@ `7077dac7a9e50f84e39b0f58bf7665b358a1e577` and live on GitHub Pages. Kept for history; do not reopen
without new evidence.

### OL-015 · Modals lack focus management (aria-modal without the behavior) — RESOLVED
- **Resolved by:** PR #16 (merged 2026-07-19, merge SHA `7077dac7a9e50f84e39b0f58bf7665b358a1e577`), recording feature candidate SHA `393839908a9cc9f8bc8a60aa9241b387615fdecb`, Pages run ID `29667970651`, and deployed SHA `7077dac7a9e50f84e39b0f58bf7665b358a1e577`.
- **Current behavior:** A shared `useModalFocus` hook now covers all six dialog surfaces (Settings import-conflict, Settings reset-confirmation, StorageManager pruning, Settings Health Profile draft-conflict, ApprovalGate, StaleTabDialog): safe initial focus, Tab/Shift+Tab containment, Escape mapped only to each surface's existing safe cancel/deny action, connected-opener focus restoration, and reference-counted body-scroll locking for stacked modals. ApprovalGate's Escape always resolves to Deny/Close, never Approve.
- **Independent review:** Verdict B. APPROVED WITH NON-BLOCKING OBSERVATIONS (reviewer: GPT-5.6 Sol, High). Non-blocking: (1) the shared focusable selector does not yet filter every hidden/inert/CSS-invisible candidate — future hardening, no current surface affected; (2) reviewer's environment could not re-query remote GitHub metadata — non-blocking, confirmed independently via local refs and deployed-site behavior.
- **Tests:** 562/562 unit/component tests (44 files, up from 538/538), 94/94 Playwright tests (up from 93/93) — `src/components/__tests__/useModalFocus.test.tsx` (13), `src/components/__tests__/approvalGate.test.tsx` (6), `src/components/__tests__/settingsModalFocus.test.tsx` (5), `tests/smoke/modalKeyboard.spec.ts` (1).
- **Limitations preserved:** This is a narrow focus-management fix, not a broad accessibility completion pass — no native `<dialog>` conversion, portals, generalized inert framework, backdrop-dismissal change, or Command Palette redesign was introduced; OL-016 through OL-020 remain open a11y/polish items.
- **Documentation closeout status:** resolved. The documentation entry
  recording this resolution was closed by PR #17
  (`docs/ol-015-modal-focus-management-closeout`, merged 2026-07-19,
  merge SHA `4fefa3ce4ad25918234a00d2430575da5e5bd4db`).

### OL-003 · Artifacts and handoffs grow without bound → quota exhaustion — RESOLVED
- **Resolved by:** PR #14 (merged 2026-07-18, squash merge/deployed SHA `a341b5cbe0cab88eed8d8ce43e604b04b6ce999c`), recording approved feature SHA `19e303b107c3540639a1a04809b5bd270290dd01`, Pages run `29656188235`, and deployment ID `5504316437`.
- **Current behavior:** Measurements are pure and destructive-free. Destiny of saved prompt artifacts is controlled by explicit guarded prune dialog (keep newest N), which computes prune delta first, durably commits the pruned state before updating in-memory state (transactional commit), and disables pruning if storage is locked or failing. App-wide warning banner at critical levels. Handoffs remain append-only canonical history and are never pruned.
- **Limitations Preserved:** Storage readings are browser-dependent estimates; recovery blobs are measured but not pruned; retention count remains user-controlled; handoffs are append-only; full modal focus trapping is tracked under OL-015.
- **Tests:** `src/lib/__tests__/storageUsage.test.ts` (14 unit), `src/components/__tests__/storageRetention.test.tsx` (13 integration), `tests/smoke/storageRetention.spec.ts` (5 Playwright).

### OL-027 · Import can destroy an unsaved Health Profile draft without a committed import — RESOLVED
- **Resolved by:** PR #12 (merged 2026-07-18, squash merge/deployed SHA `789fe4d7fd2ad7cbfa5448a4efa10cd8c212128f`), recording feature SHA `bfa5512d1fad96af6c4bfd56de852f131cdb387e` and Pages run `29651209208`.
- **Current behavior:** Unsaved Health Profile draft is preserved until the backup import has been successfully written to persistent storage. Discard/Cancel warning modal manages focus properly, Dismiss/Escape is supported, invalid or future backups are safely rejected before state mutation.
- **Tests:** `src/lib/__tests__/importCommit.test.ts`, `src/components/__tests__/importDraftProtection.test.tsx`, `tests/smoke/healthDraftImport.spec.ts`.

### OL-002 · Unsaved Health Profile edits destroyed by in-app navigation — RESOLVED
- **Resolved by:** PR #5 (merged 2026-07-16, merge commit `183c505`),
  commits `e3455a8` (draft persistence), `10ea22a`/`bedc40d` (draft
  protection during import and storage failure).
- **Current behavior:** drafts persist to localStorage
  (`src/lib/health/profileDraft.ts`, key `davidos-health-draft-v1`) and
  are restored on mount with a visible draft banner
  (`HealthProfile.tsx`, `health-draft-banner`); a valid import never
  silently wipes an in-progress draft (Settings draft-conflict dialog).
- **Tests:** `src/lib/__tests__/profileDraft.test.ts`,
  `tests/smoke/healthDraft.spec.ts`.

### OL-004 · Two open tabs silently clobber each other — RESOLVED
- **Resolved by:** PR #5, commit `227c2ca` (stale-tab clobber
  prevention); dialog focus behavior hardened in PR #6 (`74f3351`).
- **Current behavior:** `src/state/store.tsx` listens for the `storage`
  event; when another tab writes newer state, the stale tab shows a
  blocking "state changed in another tab" dialog instead of clobbering
  (no silent merge, mirroring the Drive conflict philosophy).
- **Tests:** `src/state/__tests__/store.test.tsx`,
  `tests/smoke/crossTab.spec.ts`, `tests/smoke/staleDialog.spec.ts`.

### OL-005 · Deep per-item import validation missing — RESOLVED
- **Resolved by:** PR #5, commits `e8fe06b`, `95a24ed` (nested
  validation), `332f380` (handoff relationship invariants at import).
- **Current behavior:** `src/lib/storage/importValidation.ts` validates
  per-entity field types, enums, and handoff correction-chain
  invariants at import, rejecting with readable messages naming the bad
  item; `normalizeState` remains the last-resort boot repair.
- **Tests:** `src/lib/__tests__/importValidation.test.ts`, extended
  `exportImport.test.ts`.

### OL-006 · No forward-schemaVersion guard — RESOLVED
- **Resolved by:** PR #5, commit `e8fe06b`.
- **Current behavior:** `CURRENT_SCHEMA_VERSION` is exported from
  `localStore.ts`; `exportImport.ts` rejects backups whose
  `schemaVersion` is newer than the app understands with a readable
  "update DavidOS to import it" error (checked on both the envelope and
  the state).
- **Tests:** `exportImport.test.ts` / `importValidation.test.ts`.

### OL-007 · Handoff correction/edit UI — RESOLVED
- **Resolved by:** PR #5, commit `4cef65c` (reachable correction flow);
  `2d0730f` (correction relationships preserved during deletion).
- **Current behavior:** Logs → Handoffs offers "Correct this entry"
  (`src/components/AuditLog.tsx`): the correction saves with
  `status: 'correction'` + `correctsHandoffId` and the original is
  auto-marked `superseded`; continuity retrieval already honored these
  fields.
- **Tests:** `continuity.test.ts` correction-chain coverage,
  `tests/smoke/handoffCorrection.spec.ts`.

### OL-011 · Generated prompt goes stale with no indicator — RESOLVED
- **Resolved by:** DOS-WF-001, PR #3 (merged 2026-07-14, `35cc965`).
- **Current behavior:** the Runner captures a config key at build time
  (`buildPromptConfigKey` over input, workflow, output config, and the
  included Health Profile fingerprint) and compares it to live values; a
  stale result shows "Prompt out of date. Rebuild to update." and
  disables Copy/Save/follow-up actions.
- **Tests:** `promptValidity.test.ts`.

### OL-012 · Silent no-op primary buttons — RESOLVED
- **Resolved by:** Runner portion in DOS-WF-001 / PR #3; remaining vault
  portion in PR #5, commit `524bdb9` (explicit invalid save actions).
- **Current behavior:** Build Prompt is disabled with a visible hint
  when the request is empty; ProjectVault/PromptVault Save buttons are
  disabled with inline required-field feedback while the name/title is
  empty (`ProjectVault.tsx:108`, `PromptVault.tsx:145`).
- **Tests:** `tests/smoke/vaultValidation.spec.ts`.

### OL-001 · Offline launch breaks after first install and after every deploy — RESOLVED
- **Resolved by:** PR #10 (merged 2026-07-17, merge commit `f9074dfa672b44381bc1212c0190807a28b4de34`).
- **Current behavior:** The service worker now precaches a complete, build-derived production application-shell manifest (HTML, hashed JS/CSS, manifest, required icons) at install time, verified atomic and all-or-nothing. Deletions of superseded caches are namespaced to the scope (`/DavidOS/`) and are deferred until activate. Failed candidate installs automatically preserve the prior working version. Offline launch, history navigation (reload, back, forward), and intent routing are fully functional under offline conditions. Non-precached missing assets fail naturally instead of receiving a fake index.html response.
- **Tests:** `src/lib/__tests__/serviceWorkerLifecycle.test.ts` (26 tests), `tests/smoke/offline.spec.ts` (8 tests), and live Pages deployment + manual Android PWA verification.
- **Verification Evidence:**
  - Squash-merge SHA: `f9074dfa672b44381bc1212c0190807a28b4de34`
  - GitHub Pages deployment run: `29624655811` (success)
  - 490/490 Unit tests passed, 80/80 Playwright tests passed.
  - Live online load, atomic service worker installation (scope `/DavidOS/`, build cache `a6e0c91ae5f4e9f56522`), and offline reload verification passed.
  - Android Path B (fresh install) offline verification passed on target device with repeated launches, local data preservation, and offline routing successful (no blank screens).
- **Limitation:** The Android fresh-install test did not manually verify an upgrade of a PWA that had been installed before PR #10. Automated Build A to Build B coverage verifies the update lifecycle.
