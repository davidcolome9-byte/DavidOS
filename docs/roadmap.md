# Roadmap

## v0.1 — Local command center (this build) ✅
- Mobile-first PWA installable on Android, offline-capable
- 7 agents (cards + specs), workflow runner with local template generation
- Rule-based intent router, slash commands, command palette
- Context / Project / Prompt vaults, seeded and editable
- Planning: daily brief, weekly review, local reminders, open loops
- Risk classifier, approval gates, audit log
- Export/import JSON, integration stubs

## v0.2 — Continuity & Health Profile (shipped) ✅
What actually shipped as v0.2 (the originally planned "polish & routing
depth" scope was deferred — those items now live in docs/OPEN_LOOPS.md):
- Continuity-aware Workflow Runner: prior-handoff retrieval, metric
  extraction with confidence, date parsing, prompt fingerprints, typed
  full-prompt artifacts
- Global Health & Fitness Profile with import/reset safety
- Risk gating surfaced in the palette; honest no-ops
- 5-tab nav + More menu; type-RESET-to-confirm reset
- Deterministic macro target snapshot in fitness prompts

## v0.3 — Google Drive sync (foundation shipped ✅, rest pending)
- ✅ Google Identity Services browser authorization, `drive.file` scope
- ✅ Folder bootstrap + gated manual backup export to 06_Exports/Backups
- Manual "Sync now" for vaults
- Conflict UI per google-drive-sync-plan.md

## v0.4 — Calendar read/draft
- Google Calendar read-only: today/week views feed the daily brief
- Draft events from planning outputs; every create/edit gated

## v0.5 — Gmail read/draft
- Search/read threads; draft replies (never auto-send)
- sendReply permanently behind approval + review

## v0.6 — AI provider APIs
- aiProviderAdapter goes live: send generated prompts to ChatGPT/Claude/Gemini
- Response comparison view; prompt critique loop
- Keys via paste-at-runtime or personal proxy — never bundled

## v0.7 — Android packaging
- Capacitor wrapper (or reassess native) for notifications, share-target,
  reliable background behavior
- Share-to-DavidOS: send text/screenshots from any app into the workflow runner
