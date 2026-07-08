# Google Drive Sync Plan (v0.3)

Google Drive is the long-term source of truth for DavidOS. v1 does not touch
Drive at all — this document is the contract for when it does.

## Why Drive
- Already the user's storage hub (`G:\My Drive` on desktop)
- Human-readable markdown/JSON files — editable by hand, by Claude Code, by Codex
- Survives device loss; versioned by Drive itself

## Drive folder structure
```
DavidOS/
  00_START_HERE/
    OS_Status.md
    Command_Menu.md
    Current_Priorities.md
  01_Context/
    User_Profile.md
    Preferences.md
    Constraints.md
    Sensitive_Private_PLACEHOLDER.md
  02_Agents/
    Daily_Command.md
    Operation_David_Fitness.md
    Work_Fraud_Cyber.md
    Prompt_Vault.md
    Calendar_Planning.md
    Dogs_Home_Life_Admin.md
    Content_Asset_Builder.md
  03_Workflows/
    Daily_Brief.md
    Fitness_Handoff.md
    Work_Teachback.md
    Prompt_Improvement.md
    Weekly_Review.md
    Life_Admin_Checklist.md
    Content_Asset_Planner.md
  04_Projects/
    DavidOS_Build.md
    Operation_David.md
    Work_Projects.md
    Prompt_Vault.md
    Weekly_Planning.md
    Content_Assets.md
  05_Logs/
    Audit_Log.md
    Decisions.md
    Open_Loops.md
  06_Exports/
    Backups/
    Handoffs/
```

## What syncs
| App data | Drive location | Direction |
|---|---|---|
| Context items | 01_Context/*.md | Two-way |
| Agent specs | 02_Agents/*.md | Drive → app (specs are authored, not app-edited) |
| Workflow specs | 03_Workflows/*.md | Drive → app |
| Projects | 04_Projects/*.md | Two-way |
| Prompts | 03_Workflows or a 07_Prompts folder (decide at build) | Two-way |
| Open loops, audit log | 05_Logs/*.md | App → Drive (append) |
| JSON backups | 06_Exports/Backups/ | App → Drive |
| Saved handoffs | 06_Exports/Handoffs/ | App → Drive |

Priorities/reminders ride inside `Current_Priorities.md` and `Open_Loops.md`.

## Sync model
- Manual "Sync now" button first; background sync only after that proves stable.
- Each file carries a `lastSynced` timestamp + content hash in local metadata.
- App uses Drive `modifiedTime` + hash comparison to detect changes on each side.

## Conflict resolution
1. Changed on one side only → that side wins, silently.
2. Changed on both sides → **no silent merge.** The app shows both versions and
   the user picks (keep local / keep Drive / keep both with a `-conflict` copy).
3. Deleted on Drive but edited locally → treated as a conflict, never auto-delete.
4. Audit log and backups are append-only — no conflicts possible by design.

## Sensitive data handling
- `Sensitive_Private_PLACEHOLDER.md` syncs with placeholders only, unless the user
  flips an explicit per-file "sync real content" setting (default off, warned).
- Sync respects the risk model: initial folder creation and every file write is an
  external write → approval-gated (first sync approves the batch, per-file list shown).
- Backups pushed to Drive get a reminder that the JSON contains everything.

## OAuth notes
- Authorization Code + PKCE, `drive.file` scope only (app-created files only).
- Client ID via `VITE_GOOGLE_CLIENT_ID`; no client secret anywhere in the app.
- Token revocation instructions surfaced in Settings when this ships.
