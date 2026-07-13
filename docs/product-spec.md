# DavidOS Product Spec

## Vision
A personal AI operating layer — a command center that routes life and work tasks
into structured, repeatable workflows with explicit safety gates. Not a notes app,
not a chatbot, not a demo: a router + vault + launchpad that any AI tool can plug
into via portable specs.

## Target user
One user — the owner of this instance. Works in a risk/security field, runs a
body recomposition program (Operation David), has dogs, and is a heavy AI-tool
user (ChatGPT, Claude, Claude Code, Codex, Gemini). Uses the app primarily on
Android, on the go. Personal specifics live in on-device context, not in this repo.

## Core workflows (v1)
| Workflow | Agent | What it produces |
|---|---|---|
| Daily Brief | Daily Command | Command brief: top 3, next action, risks |
| Fitness Handoff | Operation David Fitness | Clean diary handoff — current facts only |
| Work Teachback | Work / Fraud / Cyber | Coworker-ready teachback / job aid / summary |
| Prompt Improvement | Prompt Vault | Critiqued + improved prompt per model |
| Weekly Review | Calendar / Planning | Week review, loop triage, next-week top 3 |
| Life Admin Checklist | Dogs / Home / Life Admin | Ordered, batched checklist |
| Content Asset Planner | Content / Side-Income | Asset outline + launch checklist |

## MVP scope (v0.1 — this build)
- Mobile-first PWA, installable on Android, offline-capable
- 7 agents with cards (purpose, handles, inputs, outputs, approval, examples)
- Workflow runner: input → output style → generated AI-ready prompt → copy/save
- Rule-based intent router with confidence + reasoning
- Command palette: buttons, free text, slash commands
- Context / Project / Prompt vaults (editable, seeded)
- Planning: daily brief, weekly review, local reminders, open loops
- Safety: 6-level risk classification, approval gates, audit log
- Export/import JSON backups
- Integration adapters: designed, stubbed, disabled

## Non-goals (v1)
- No real AI API calls, OAuth, or external writes of any kind
  *(amended: the v0.3 foundation added exactly one gated external write —
  manual Google Drive backup export behind the ApprovalGate; see
  docs/INTEGRATIONS.md)*
- No multi-user, no cloud backend, no accounts
- No notifications/alarms
- No native Android build (PWA first; Capacitor later)
- Not a general notes app — everything is structured

## Future roadmap
See [roadmap.md](roadmap.md). Headline: Drive sync (v0.3) → Calendar read (v0.4)
→ Gmail read/draft (v0.5) → AI provider APIs (v0.6) → Capacitor wrapper (v0.7).
