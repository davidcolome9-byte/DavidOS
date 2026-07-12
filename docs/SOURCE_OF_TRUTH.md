# Source of Truth

Where each kind of data lives, which copy is authoritative, and what must
never be overwritten. When two sources conflict, the one higher in its
list wins; fix the stale copy, never the authoritative one.

## App behavior and structure

| Data | Authoritative source | Notes |
|---|---|---|
| Entity shapes | `src/lib/types.ts` | Every module imports from here |
| Agent specs | `seed/agents/*.json` | Authored data; app never edits them |
| Workflow specs | `seed/workflows/*.json` | Same |
| Starter projects/prompts/context | `seed/projects`, `seed/prompts`, `seed/context` | Loaded into default state; user copies then diverge |
| Generic health seed | `src/data/healthProfileSeed.ts` | MUST stay bracket-placeholder generic (public repo) |
| Decisions history | `docs/DECISIONS.md` | Append-only |
| Backlog | `docs/OPEN_LOOPS.md` | The only backlog file |

## Personal data (never in this repo)

The repo and deployed bundle are public. Personal values exist only in:

1. **The user's personal backup JSON** — a normal DavidOS export envelope
   carrying the real Health & Fitness Profile, projects, context, etc.
   Local copy: `personal/davidos-personal-backup.json` (gitignored).
   Cloud copy: in David's Google Drive (see `personal/README.md` on
   David's machine for exact private paths — that file is gitignored on
   purpose). Imported per-device via Settings → Import.
2. **localStorage on each device** — live state under key
   `davidos-state-v1`. Agents never hand-edit it; the app owns it.
3. **David's Google Drive "Source Of Truth" folder** — life-domain
   documents (health logs, work, home, cooking, etc.). DavidOS will sync
   with Drive in v0.3; until then Drive files are read/updated by David
   and his AI assistants directly, never by this codebase.

### Protection rules (do not break)

- `personal/` is gitignored. Never commit it, never weaken `.gitignore`,
  never copy its contents into tracked files or test fixtures.
- The personal backup JSON is DAVID'S data. Code and agents may read its
  *shape* (it is a standard export envelope) but must never regenerate,
  "fix", or overwrite it. If it looks wrong, flag it in OPEN_LOOPS.md as
  **Requires David**.
- The seeded Health Profile logic in `normalizeState()` distinguishes
  `undefined` (state predates profiles → seed a generic one) from `null`
  (user deleted it → respect that). Preserve this distinction.
- Import must never silently overwrite an existing Health Profile —
  Settings.tsx shows a conflict dialog. Keep it.
- Reset-to-seed preserves the Health Profile by default and requires
  typing RESET. Keep both behaviors.
- Saved handoffs are append-only canonical history; the model's
  `status`/`correctsHandoffId` fields are the sanctioned correction
  mechanism (UI still pending).

## Fixtures and tests

Test data must be invented, clearly fake, and personal-data-free
(see `AGENTS.md` §2.1). Never derive fixtures from `personal/` or from
real exports.

## Documentation

Docs describe; code defines. On conflict: trust code + passing tests,
fix the doc in the same change, and log the correction in
`docs/DECISIONS.md` (see `AGENTS.md` §11).
