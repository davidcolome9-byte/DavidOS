# Roadmap

## v0.1 — Local command center (this build) ✅
- Mobile-first PWA installable on Android, offline-capable
- 7 agents (cards + specs), workflow runner with local template generation
- Rule-based intent router, slash commands, command palette
- Context / Project / Prompt vaults, seeded and editable
- Planning: daily brief, weekly review, local reminders, open loops
- Risk classifier, approval gates, audit log
- Export/import JSON, integration stubs

## v0.2 — Polish & routing depth
- Better router: weights tuned from real usage, multi-intent detection,
  "did you mean" alternatives
- Richer workflow outputs: per-style templates, chained workflows
- Audit log filters/search; handoff → project linking
- Mobile polish: swipe actions, larger empty states, install prompt UX
- Editable priorities on Home

## v0.3 — Google Drive sync
- OAuth PKCE, `drive.file` scope
- Folder bootstrap + manual "Sync now"
- Conflict UI per google-drive-sync-plan.md
- Backups auto-pushed to 06_Exports/Backups (gated)

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
