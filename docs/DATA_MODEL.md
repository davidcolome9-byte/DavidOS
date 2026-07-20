# Data Model

All entity types are defined in `src/lib/types.ts` — the single source of
truth. This doc explains how they fit together and how persistence,
migration, and import/export behave. Update it whenever `AppState` or the
storage layer changes.

## AppState (the persisted root)

```
AppState {
  schemaVersion: number          // currently 1
  priorities:    Priority[]      // ranked labels for Home
  openLoops:     OpenLoop[]      // open/done loops
  reminders:     Reminder[]      // local placeholders, free-text due dates
  projects:      Project[]
  prompts:       Prompt[]        // with light versioning (<=10 versions)
  contextItems:  ContextItem[]   // stable/priorities/private/workflow/session
  handoffs:      Handoff[]       // CANONICAL continuity history (append-only)
  artifacts:     WorkflowArtifact[]  // full prompts etc., typed, separate
  executionRecords: ExecutionRecord[] // supervised execution records (DOS-AGT-001A)
  healthProfile: HealthFitnessProfile | null  // null = user deleted it
  auditLog:      AuditLogEntry[] // capped at 300, newest first
  settings:      AppSettings     // { theme }
}
```

Static specs (Agent, Workflow, Command) are NOT part of AppState — they
load from `seed/` via registries at build time.

## Persistence

- Key: `davidos-state-v1` in `localStorage`
  (`src/lib/storage/localStore.ts` is the ONLY file that knows this).
- Persist on every state change (`src/state/store.tsx` effect), UNLESS
  boot-time recovery suppressed persistence for the session (below).
- Persist failures (quota, unavailable) return `false` from
  `persistState()` and surface as a visible warning banner.

## Storage usage & retention (OL-003)

`src/lib/storage/storageUsage.ts` (pure) measures the serialized state
per collection plus DavidOS's other keys (recovery blobs, health draft)
against a ~5MB quota ESTIMATE (browser localStorage quotas are
UTF-16-unit based and vendor-specific; the UI labels every size as an
estimate). Levels: warning ≥70%, critical ≥90%.

- Settings → Data → Storage (`src/components/StorageManager.tsx`)
  shows the meter/breakdown and hosts the ONLY destructive retention
  action: "Prune saved prompts…" — keep the newest N artifacts, exact
  delete count and freed size shown first, "Export backup first"
  offered inside the dialog, `PRUNE` typed to confirm, open/cancel/
  complete/failed all audited. Disabled whenever persistence is
  suppressed (boot recovery, stale tab) OR already failing
  (`persistFailed`).
- The prune commit is transactional: the complete pruned AppState is
  written durably through `persistState()` (the canonical persistence
  boundary, same as `commitImport`) BEFORE the active React state is
  replaced or success is reported — mirroring the import-commit
  pattern. A failed write leaves both the stored blob and the
  in-memory state exactly as they were, reports a clear error, and
  pruning stays unavailable until persistence is healthy again. The
  store's persistence effect skips redundant writes, so the persist-
  first write never conflicts with it.
- At critical level, Layout shows an app-wide banner pointing to
  Settings → Data — protection BEFORE the persist-failure banner.
- Retention applies to `artifacts` only. `handoffs` are append-only
  canonical history and are never pruned; `auditLog` is already capped
  at 300 entries (`src/lib/audit/auditLog.ts`). Nothing is ever
  deleted automatically.

## Load & recovery states

`loadPersistedState()` classifies stored state (`inspectStructure`) and
returns `{ state, recovery }`. `recovery.canPersist === false` means
StoreProvider suppresses ALL automatic persistence for the session — a
later user edit cannot overwrite the stored blob either. "Preserved"
always means: the exact raw blob was written to a UNIQUE key
(`davidos-state-v1-recovery-<timestamp>`, collision-suffixed so earlier
recovery records are never overwritten) AND read back byte-identical.

| State | Raw preserved? | Auto-persist? | User sees | On preservation failure |
|---|---|---|---|---|
| **1. Valid current** | not needed | yes | nothing | n/a |
| **2. Valid older (additive migration)** — fields are absent, none damaged; `normalizeState` only backfills | not needed (nothing lost) | yes | nothing (console info) | n/a |
| **3. Parseable but lossy-repairable** — a present value would be dropped/replaced (wrong-typed collection, array-valued `settings`/`healthProfile`, non-object items, invalid theme) | yes, confirmed BEFORE repair may persist | only if preservation confirmed | banner naming the damaged fields and the recovery key | repaired copy stays in-memory only; persistence suppressed; banner says saving is paused |
| **4. Unreadable** (unparseable JSON, empty-string blob, non-object root, missing `schemaVersion`) | yes, confirmed | defaults persist only if preservation confirmed | banner: original preserved (with key), app started fresh | boot with in-memory defaults; persistence suppressed; banner says saving is paused |

Notes:
- An **absent key (`null`)** is a clean first run. An **existing empty
  string** is state 4, not a first run.
- A plain-object check (`isPlainObject`) governs object-valued fields —
  arrays and primitives are never treated as objects.
- Storage entirely unavailable → in-memory session, persistence
  suppressed, banner shown; nothing is overwritten.
- Console messages state exactly which of preserved / preservation-failed
  / repaired-in-memory / defaults-used happened.

## Migration: normalizeState()

`normalizeState()` in `localStore.ts` backfills absent fields and repairs
damaged ones (repair is only reachable after the recovery contract above).
Rules:

- Absent collections → `[]`; absent item-level lists (prompt `tags`/
  `versions`, project `related*`) → `[]`.
- `healthProfile`: `undefined` → seed generic profile; explicit `null`
  (user deletion) → respected, never re-seeded; non-plain-object →
  reseeded (classified lossy).
- **Every new AppState field must get a backfill here, a matching
  `inspectStructure` classification, and a test** — or old devices and
  old backups will crash or lose data silently.

There is no schemaVersion bump/downgrade machinery yet; additive optional
fields + normalizeState IS the migration strategy. Bumping schemaVersion
is reserved for a genuinely breaking change and needs David's approval.

## Export / import

`src/lib/storage/exportImport.ts`:

- Export envelope: `{ app: "davidos", exportedAt, schemaVersion, state }`.
- Import validates: JSON parses, envelope tag, `schemaVersion` is a
  number, required arrays present (`priorities, openLoops, reminders,
  projects, prompts, contextItems, handoffs, auditLog`), `settings`
  object present. Then runs `normalizeState`.
- `artifacts`/`executionRecords`/`healthProfile` are intentionally NOT
  required — older backups predate them and are backfilled. A PRESENT
  `executionRecords` collection is deeply validated (unknown-safe) and a
  malformed one rejects the import with value-free diagnostics.
- Settings → Import shows a Health-Profile conflict dialog rather than
  silently overwriting an existing profile.

## Continuity model (the core)

- A **Handoff** stores only the cleaned current entry (`content`) — never
  the full generated prompt. `entryDate`+`dateConfidence` come from
  conservative date parsing; `contentHash` is a SHA-256 fingerprint.
  `status`/`correctsHandoffId` support corrections (retrieval already
  respects them; edit UI pending).
- A **WorkflowArtifact** stores generated outputs (`full_prompt`,
  `current_handoff`, `ai_response`, `manual_note`) with fingerprints and
  metadata about which handoffs and profile fields were included.
- Retrieval (`src/lib/workflows/continuity.ts`): 3 prior handoffs for
  default workflows, 7 for fitness; overfetch ×2; filters superseded
  entries; dedupes corrections.

## Supervised execution records (DOS-AGT-001A)

An `ExecutionRecord` is a bounded, LOCAL-ONLY record of coding work performed
OUTSIDE DavidOS by an external service David operates himself (Claude Code,
Codex, Gemini, Antigravity, or manual). DavidOS never calls a provider,
executes commands, or mutates Git/GitHub for these records — it records,
validates, and renders a copyable packet, nothing more.

- **Three separate draft fields**: `objective` (what the session should
  accomplish), `scope` (the exact bounded repo area), `stopConditions` (when
  the external service must stop and return control). Never combined; each is
  independently required for readiness and rendered as its own packet section.
- **Authority** (`editCode/runTests/editDocs/push/openPullRequests/merge`)
  records what David authorized the EXTERNAL session to do. Every value
  defaults to false; construction copies only recognized keys carrying actual
  booleans (no wildcard grants). It grants DavidOS itself nothing.
- **Lifecycle**: draft → ready → in_progress → blocked/awaiting_approval →
  completed/cancelled. Enforced in `lib/agents/executionRecords.ts` (single
  source of truth), with transition normalization: resuming clears stale
  blocker/decision summaries; nonterminal records never carry `closedAt`;
  terminal transitions stamp it. `blocked` requires a blocker summary,
  `awaiting_approval` a decision summary; completion (only from in_progress)
  requires ≥1 valid evidence item and no pending approval gates (denied gates
  are resolved decisions and do not block). Completed/cancelled are terminal:
  every later edit, mutation helper, and transition is rejected.
- **Persistence**: `normalizeState` backfills a missing legacy collection to
  `[]`. Present records are DEEP-validated at boot with the same unknown-safe
  domain validator used at import: any record it rejects (or a duplicate id)
  classifies the collection as `invalid` in `inspectStructure`, so the
  standard preserve-then-repair recovery contract runs (raw blob quarantined
  byte-identical before any lossy repair may persist; persistence suppressed
  if preservation fails) and the repaired state contains only fully valid
  records — malformed authority/lifecycle values are dropped, never repaired
  into authorization, and never reach the UI. Derived data (packet text,
  readiness results, available actions) is never persisted or exported —
  always re-derived from the record.
- **Import**: `executionRecords` is OPTIONAL (legacy backups predate it; NOT
  in REQUIRED_ARRAYS). When present it is deeply validated by the unknown-safe
  domain validator; malformed records reject the whole import with value-free,
  index-based messages, leaving current state unchanged.
- **Retention**: not prunable; small text records. Reset clears them like the
  other collections.
- **Audit privacy**: every NEWLY GENERATED execution audit entry is
  allowlist-only — fixed closed event names
  (`execution_record_created/_updated`, `execution_status_changed`,
  `execution_packet_copied`), closed status labels, counts, and the fixed
  `coding-coordinator` identifier. Record ids are excluded too (an imported
  id is user-controlled content), and ids are additionally constrained to
  the conservative `uid()` grammar (`/^[a-z0-9]{8,20}$/`) at every
  validation boundary. User-entered text (titles, objective/scope/stop
  conditions, model labels, evidence, gate labels, summaries, packet text)
  never reaches a new audit entry in any form, including hashes or
  fingerprints. Pre-existing audit entries in supported released/legacy
  states are preserved unchanged per the existing audit doctrine (the log
  is historical data; no rewriting migration exists or is claimed). The
  domain `AuditLogEntry.agentId` field is never used for execution events.

## Health & Fitness Profile

`HealthFitnessProfile` is a global, local-only profile (goals, nutrition
targets, training plan, medical context, preferences). The shipped seed
(`src/data/healthProfileSeed.ts`) is generic with bracket placeholders;
bracket-placeholder values are filtered out of generated prompts
(`src/lib/health/profilePrompt.ts`). Real values arrive only via personal
backup import. Audit entries record changed field NAMES and hashes, never
values.

## Risk & audit

- `RiskLevel`: read_only | draft_only | local_write | external_write |
  sensitive_external_write | high_risk.
- Every routed command, workflow run, local write, and approval decision
  appends an `AuditLogEntry`; cap 300.

## IDs and time

`uid()` (timestamp base36 + random) and `nowIso()` from types.ts.
Good enough for a single-user local app; don't import a UUID library.

## Backup & restore assessment (evidence-based, 2026-07-12)

Classification: **Verified** (working, with evidence) / **Partial** /
**Missing** / **Proposed** (future work, not implemented).

| Aspect | Status | Evidence |
|---|---|---|
| What is exported | **Verified** — the entire AppState (all vaults, handoffs, artifacts, audit log, settings, Health Profile) | `serializeState` wraps the full state; round-trip unit test |
| What is omitted | **Verified** — static seed specs (rebuilt from the bundle by design) and any `-recovery-*` quarantine records | `seed/` loads via registries, not state |
| Format & versioning | **Partial** — versioned envelope `{app, exportedAt, schemaVersion, state}`; no forward-version guard yet | OL-006 |
| Import validation | **Partial** — envelope + required arrays + settings verified; item-level types repaired by `normalizeState`, not validated | OL-005 |
| Invalid-import handling | **Verified** — readable errors, nothing applied on failure | `exportImport.test.ts` |
| Atomicity | **Partial** — single setState + single persist per tab; multi-tab last-write-wins remains | OL-004 |
| Existing-state preservation | **Verified** — confirm dialog before replace; Health Profile conflict dialog; pre-profile backups can no longer clobber the real profile | sprint fix `fb76122`, regression tests |
| Duplicate prevention | **Verified by design** — import replaces rather than merges, so duplicates are impossible (merge is future work) |
| Audit-state preservation | **Verified** (minor: an imported log >300 entries trims on next append, not at import) | `auditLog.ts:4` |
| Correction preservation | **Verified** — handoff `status`/`correctsHandoffId` round-trip inside `handoffs` |
| Sensitive-data exposure | **Partial** — export contains everything incl. Health Profile, plaintext; UI warns at export. Encryption at rest is **Proposed** (OL-025, requires David) |
| Device replacement | **Verified** — export on old device → import on new device restores all state (unit round-trip + persistence smoke test); Drive copy is a manual gated export |
