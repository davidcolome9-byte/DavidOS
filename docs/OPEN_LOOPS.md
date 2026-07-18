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

**Last full reconciliation: 2026-07-17**, verified item-by-item against
`main` @ `f01a822ed063156bc418d4efaa8a135f7d42d0fd` (PR #8, Training
Readiness & Recovery — the live deployed release). Items fixed in the
2026-07-12 stabilization sprint are not listed; see git history
(`fb76122`) and docs/DECISIONS.md.

---

## P1 — data safety & core promises

### OL-003 · Artifacts and handoffs grow without bound → quota exhaustion
- **Domain:** persistence · **Kind:** defect (by-design gap awaiting a
  product decision) · **Status:** Verified + **Candidate implemented**
  on `fix/ol-003-storage-protection-retention` (base `c2d7dff`) —
  NOT merged, NOT deployed; stays open until reviewed, merged, and
  verified live.
- **Problem:** every full prompt saved as an artifact is multi-KB;
  nothing caps `artifacts`/`handoffs`. A heavy user eventually hits the
  ~5MB localStorage quota. (The failure is VISIBLE via the persist
  warning banner, but still inevitable.)
- **Evidence (re-verified 2026-07-17):** `src/components/WorkflowRunner.tsx:312`
  (uncapped prepend), only `auditLog` is capped
  (`src/lib/audit/auditLog.ts`).
- **Chosen policy (per David's 2026-07-18 OL-003 work order; details in
  docs/DECISIONS.md):** prompt-to-export-then-prune, explicit and
  guarded — never automatic. Storage-usage meter + threshold warnings
  in Settings → Data; app-wide banner at critical level; artifact-only
  prune (keep newest N, exact effect shown, export offered, type
  `PRUNE` to confirm, fully audited). Handoffs are append-only
  canonical history and are never pruned.
- **Candidate implementation:** `src/lib/storage/storageUsage.ts`
  (pure measurement + prune planning), `src/components/StorageManager.tsx`
  (meter + guarded prune dialog in Settings → Data), critical-level
  banner in `src/components/Layout.tsx`. No `AppState` schema change.
- **Acceptance:** storage usage visible; chosen policy enforced with
  user-visible pruning, never silent deletion.
- **Validation (candidate, this branch):**
  `src/lib/__tests__/storageUsage.test.ts` (14 unit),
  `src/components/__tests__/storageRetention.test.tsx` (6 integration),
  `tests/smoke/storageRetention.spec.ts` (5 Playwright);
  `npm run verify` green.
- **Complexity:** M · **Approval:** retention policy decided 2026-07-18
  (explicit guarded prune); merge/deploy approval still pending

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

### OL-015 · Modals lack focus management (aria-modal without the behavior)
- **Kind:** defect (a11y) · **Status:** Verified + Ready
- **Evidence (re-verified 2026-07-17):** `ApprovalGate.tsx`, `Settings.tsx`
  reset + conflict modals: no initial focus, no trap, no Escape,
  background tabbable; no shared focus hook exists in the repo. (The
  stale-state dialog got dedicated focus hardening in PR #6 — `74f3351` —
  but the shared-hook fix for the remaining modals is still open.)
- **Approach:** shared `useModalFocus` hook (focus first control, trap
  Tab, Escape = cancel, `aria-labelledby` the title). ApprovalGate
  Escape must map to Deny, never Approve.
- **Complexity:** M · **Approval:** no

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

## Roadmap-scale items (product decisions)

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

## Resolved & deployed (closed 2026-07-17 reconciliation)

Each item below was independently re-verified as implemented on `main`
@ `f01a822` and live on GitHub Pages. Kept for history; do not reopen
without new evidence.

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
