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
- Persist on every state change (`src/state/store.tsx` effect).
- Persist failures (quota, unavailable) log to console and the app keeps
  running in-memory.
- Corrupt/unparseable stored JSON → `loadPersistedState()` returns null →
  fresh default state (no crash, but silent data loss; see OPEN_LOOPS).

## Migration: normalizeState()

`normalizeState()` in `localStore.ts` backfills fields added after a
user's state was first written. Rules:

- Arrays added later (`handoffs`, `artifacts`, `auditLog`) → `?? []`.
- `healthProfile`: `undefined` → seed generic profile; explicit `null`
  (user deletion) → respected, never re-seeded.
- **Every new AppState field must get a backfill here** (and a test in
  `src/lib/__tests__/`), or old devices and old backups will crash.

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
- `artifacts`/`healthProfile` are intentionally NOT required — older
  backups predate them and are backfilled.
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
