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

## Persistence — the state journal (DOS-STAB-001A)

Canonical AppState is persisted as an **immutable generation journal**, not
as one mutable key. `src/lib/storage/stateJournal.ts` owns the format;
`src/lib/storage/journalPersistence.ts` owns the per-tab controller.
localStorage offers no native multi-key transaction, so durability comes
from immutable generations + verified alternating heads + one exclusive
lock + boot reconciliation — not from an atomic multi-key write.

### Keys and records

| Key | Contents |
|---|---|
| `davidos-state-generation-v1-<id>` | one complete serialized AppState generation, written once and never mutated |
| `davidos-state-head-v1-a` / `-b` | the two fixed alternating head slots (metadata only) |
| `davidos-state-v1` | the LEGACY single-key blob — migration input and read fallback only; never written by the journal |

Generation ids are internally generated (`crypto.randomUUID()`, with a
time+random fallback) and constrained to `/^[a-z0-9-]{8,80}$/`. Nothing
user-entered ever reaches a key name.

A head record (`JournalHead`) carries ONLY control metadata — no AppState
and no user-entered data:

```ts
{ journalVersion: 1, sequence, generationId, previousGenerationId,
  transactionId, generationHash, generationLength,
  previousGenerationHash, previousGenerationLength }
```

`sequence` increases monotonically; `generationHash` is the SHA-256 of the
serialized generation; the `previous*` triple is present-or-all-null and is
what makes single-step fallback possible.

### Boot authority selection (`selectJournalAuthority`)

1. Read BOTH head slots and structurally validate each (`parseHead`):
   version, id grammar, hash grammar, safe-integer sequence ≥ 1, and
   present-or-all-null consistency of the `previous*` triple.
2. For each valid head, verify the referenced generation actually exists AND
   its length and SHA-256 match the head, AND it parses as a state object.
3. Prefer the highest `sequence` among hash-verified candidates.
4. If a head's own generation fails verification, fall back to that head's
   verified `previousGenerationId` (at `sequence - 1`) — so an invalid HIGHER
   head never wins over a valid lower one.
5. Any unparseable head, or any head whose generation fails verification,
   sets `reconciliationNeeded`.

An **orphan generation** — present in storage but referenced by no valid head
— is never selectable: selection starts from heads, never from key
enumeration. Authority is never chosen by timestamp or mere presence; a
generation becomes active only via a verified hash match from a valid head.

### Commit protocol (`commitJournalState`)

Serialization happens first (outside the lock); everything else runs inside
one exclusive Web Lock named `davidos-app-state-journal-v1`:

1. Acquire the exclusive lock (see cross-tab coordination below).
2. Re-read current authority INSIDE the lock.
3. `reconciliationNeeded` → refuse (`reconciliation_required`).
4. Committed generation ≠ caller's `expectedGeneration` → refuse
   (`stale_authority`) BEFORE anything is written.
5. Write a NEW generation key (refusing if that key somehow already exists).
6. Read the generation back and compare byte-for-byte.
7. Compute `sequence = max(current, both heads) + 1` and write the head slot
   at `(sequence - 1) % 2` — the slot that is NOT the current authority.
8. Read the head back and compare byte-for-byte.
9. Re-run selection and confirm it now yields exactly this generation and
   sequence. Only then is the commit reported successful.
10. Only after a verified success may the caller update active React state.

Properties this does and does not give:

- Committed generations are **never overwritten in place**; the previous
  committed generation stays readable for the whole transaction.
- There is **no destructive rollback path**, deliberately. A failed write is
  simply an unreferenced candidate, which can never become active.
- Failures at steps 3–6 are **safe failures**: the head never moved, so the
  previously committed generation is still authority.
- Failures at steps 7–9 are **uncertain**: the head write may or may not have
  landed. Persistence is suppressed for the session and boot reconciliation
  resolves it. The app does NOT claim stored data is unchanged.
- Cleanup (`safeCleanup`) runs only AFTER a verified head advancement, keeps
  the current, previous, and every head-referenced generation, and is bounded
  to 256 scanned keys. Cleanup failure only leaves extra generations behind
  (reported as `cleanupFailed`); it can never invalidate a verified commit.

**Capacity cost (honest limitation).** Because a commit writes a whole new
generation beside the current one, and the previous generation is retained,
the effective storage ceiling for canonical state is roughly HALF the
localStorage quota. A state large enough to reach the warning/critical
storage level can no longer be committed at all: the commit fails safely,
saving is suppressed, and the app shows the "Saving to this device is
failing" banner. Nothing is deleted or lost, export and recovery stay
available — but pruning also needs a commit, so the in-app recovery path is
narrowed at that level. Tracked as OPEN_LOOPS OL-032 (needs David's decision;
deliberately not addressed inside DOS-STAB-001A).

### Cross-tab coordination

All cooperating canonical-AppState persistence — StoreProvider autosave,
Import, Reset, Prune, and legacy migration — goes through the SAME exclusive
Web Lock. Web Locks coordinate cooperating tabs of THIS application; they do
not constrain unrelated scripts or hostile code that ignores the protocol.

- `JournalPersistenceController` (one per StoreProvider) serializes this
  tab's writes and **coalesces** queued state: only the newest pending state
  is kept, so an older queued state can never commit after a newer one.
- Each queued write re-reads its `expectedGeneration` from the controller's
  accepted authority, and the lock-held re-check rejects stale expectations,
  so out-of-order commits are refused rather than applied.
- A `storage` event is acted on ONLY for the two controlled head keys
  (`src/state/store.tsx`). A legacy-key write from an older tab therefore
  cannot displace valid journal authority.
- An external head change marks this tab stale: pending work is dropped,
  saving is suppressed, and the UI shows the reload prompt. No merge is
  attempted.
- **Web Locks unsupported** (`navigator.locks` absent) → `unsupported_lock`:
  the app runs in safe READ-ONLY persistence mode. There is no unlocked or
  legacy-key fallback write. Export and recovery stay available.

### Legacy migration (`migrateLegacyState`)

Runs under the same exclusive lock, at controller initialization:

- If valid journal authority already exists, migration is a no-op — the
  journal wins from then on.
- Otherwise the legacy `davidos-state-v1` bytes are re-read INSIDE the lock
  and, if they parse as a state object, committed as the first generation
  (sequence 1) through the identical verify-generation-then-verify-head path.
- The legacy bytes are **left byte-identical** — initial migration never
  deletes, overwrites, or rewrites them. They may remain on the device
  indefinitely; nothing in this package removes them.
- Interruption before a valid head lands leaves an orphan generation, which
  is unselectable, so the legacy key simply remains authoritative on the next
  boot and migration retries.
- Malformed legacy bytes are not migrated (`invalid_legacy_state`) and
  continue through the existing preservation/quarantine policy below.

### Transaction result model

`JournalCommitFailure`: `unsupported_lock`, `lock_request_failed`,
`lock_callback_failed`, `storage_unavailable`, `stale_authority`,
`candidate_write_failed`, `candidate_verification_failed`,
`head_write_failed`, `head_verification_failed`, `reconciliation_required`.

`DestructiveCommitResult` adds `external_change`, `preservation_failure`,
and `persistence_suppressed`, and classifies every failure as exactly one of:

- **`safe_failure`** — the head did not move; stored data is provably
  unchanged and active state is left alone.
- **`uncertain`** — `head_write_failed`, `head_verification_failed`, or
  `lock_callback_failed`. Active state is still left alone, but the app does
  NOT claim storage is unchanged; future saving is suppressed pending a
  reload and boot reconciliation.

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
- The prune commit is journal-backed: the complete pruned AppState —
  including its completion audit entry — is committed as ONE new
  generation through `commitDestructiveState()` (the shared destructive
  boundary Import and Reset also use) BEFORE the active React state is
  replaced or success is reported. A safe failure leaves both the
  committed journal authority and the in-memory state exactly as they
  were and reports a clear error; an uncertain outcome likewise leaves
  active state alone but does not claim stored data is unchanged, and
  pauses further saving. Pruning stays unavailable until persistence is
  healthy again. The store's autosave coalesces and skips redundant
  writes, so the persist-first commit never conflicts with it.
- At critical level, Layout shows an app-wide banner pointing to
  Settings → Data — protection BEFORE the persist-failure banner.
- Retention applies to `artifacts` only. `handoffs` are append-only
  canonical history and are never pruned; `auditLog` is already capped
  at 300 entries (`src/lib/audit/auditLog.ts`). Nothing is ever
  deleted automatically.

## Load & recovery states

`loadPersistedState()` first establishes journal authority
(`selectJournalAuthority`). A verified generation's bytes are used as the
boot blob; otherwise it falls back to the legacy key. **Either way the bytes
then pass through the exact same preservation / quarantine / normalization
pipeline** — journal authority does not skip validation. When selection
reported `reconciliationNeeded`, `canPersist` is forced false for the session
(saving paused; recovery and export stay available), and the returned
`committedGeneration` / `committedSequence` seed the persistence controller.
If authority cannot be established at all, boot yields defaults with saving
suppressed.

Beyond the structural classification, boot runs **deep per-record integrity**
(`src/lib/storage/bootValidation.ts`) using the import validators:

- Malformed-but-parseable records (wrong primitive types, invalid enums or
  dates, broken nested items, duplicate ids) are **quarantined per record** —
  valid neighbours keep loading; one bad record never denies access to all
  state. Records are excluded, never "fixed": no replacement value is ever
  invented.
- An absent additively-backfilled field (prompt `tags`/`versions`, project
  `related*`) is a valid older shape, not corruption.
- A present-but-invalid Health Profile quarantines to `null`.
- Handoff relationship normalization counts as LOSSY when it would change
  what persists, so it too triggers preserve-then-repair.
- Warnings name **approved top-level collection categories and counts only**
  (allowlist in `bootValidation.ts`; anything else aggregates to the generic
  "AppState records" label). Field paths, array indices, record ids, values,
  raw data, and storage keys never appear in user-facing text or in console
  output — including the additive-migration log, which is collapsed through
  the same allowlist.

`inspectStructure` classifies stored state and
`loadPersistedState()` returns `{ state, recovery, committedGeneration,
committedSequence, journalReconciliationNeeded }`.
`recovery.canPersist === false` means
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
- `healthProfile`: `undefined` → seed generic profile (genuinely absent);
  explicit `null` (user deletion) → respected, never re-seeded; a PRESENT
  but malformed value (non-plain-object, or a plain object the deep
  validator rejects) → **quarantined to `null`**, never silently replaced
  by a seeded profile. Legitimate absence and malformed presence stay
  distinct. Classified lossy, so the preserve-then-repair contract runs
  first and the untouched original survives in the preserved raw blob.
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

## Destructive operations: Import, Reset, Prune (DOS-STAB-001A)

All three share one persist-first contract through
`commitDestructiveState(candidate, expectedGeneration)` on the store
(`src/state/store.tsx` → `JournalPersistenceController.commitDestructive`):

- Each builds its **complete final AppState candidate first**, including the
  completion audit entry. One logical operation therefore produces exactly
  ONE new generation and ONE head advancement — the committed state and its
  audit history can never disagree, and no second write is needed to record
  success.
- `expectedGeneration` comes from `getAuthority()`, a **synchronous** snapshot
  read through refs at the moment of commit. Import in particular re-reads it
  AFTER `file.text()`, after the replace confirmation, and after any
  Health-Profile or draft dialog — a pre-await closure must never authorize a
  commit. The journal then re-checks authority again inside the exclusive
  lock, so a tab that went stale mid-dialog is refused before any candidate
  generation is created.
- **Active React state is updated only after a verified head advancement.**
- A **failed** operation appends NO audit entry — that would itself be a state
  change and would trigger another persistence attempt. Persistence health
  lives outside AppState precisely so recording it can never recurse.
- A **safe failure** leaves active AppState deeply unchanged and says so.
- An **uncertain** outcome also leaves active AppState unchanged, but the
  message deliberately does NOT claim stored data is unchanged: it reports
  that the write could not be confirmed, that nothing was reported as
  deleted, and that saving is paused until reload.
- An unsaved Health-Profile draft is cleared only AFTER a verified success —
  for Import only when the user explicitly confirmed the discard, and the
  draft check is re-run at apply time so a draft created after the earlier
  gate re-raises the choice instead of being silently erased.

## Crash recovery boundary (DOS-STAB-001A)

`src/app/AppErrorBoundary.tsx` wraps the entire tree (outside StoreProvider,
router, and Layout), so a render crash lands on a recovery surface — reload,
plus byte-exact download of the primary blob and of any preserved recovery
copies — instead of a permanent blank page. It renders no stack traces, no
raw state, no storage keys, and no user content; its console line is fixed
text. Recovery enumeration is hard-bounded (≤1000 slots scanned, ≤20 copies
listed) and the primary and recovery probes are guarded independently, so
either can fail without hiding the other. Export filenames are fixed-format
(stem + timestamp + counter), never derived from storage keys, record ids, or
stored text.

**Honest limitations.** React error boundaries do NOT catch: module-evaluation
failures, `createRoot` failures, event-handler errors, or arbitrary
asynchronous errors — and anything thrown before the boundary mounts is
outside it. This is not a global browser-error capture system, and is not
being extended into one.

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
