# DavidOS — Agent Handoff Document

For any AI coding agent (Codex, ChatGPT, Claude Code, Gemini) continuing this
project. Read this fully before touching code.

## What this is

DavidOS is a personal agentic command center: a local-first, mobile-first PWA
(React 18 + TypeScript + Vite 5, HashRouter, localStorage) deployed to GitHub
Pages via `.github/workflows/deploy.yml` on every push to `main`. It routes
messy life/work requests to 7 agents, generates continuity-aware AI-ready
prompts, and enforces a safety/approval model. It is NOT a fitness app, notes
app, or chatbot — it is a multi-workflow command center; Health & Fitness is
one workflow category inside it.

Current version: **v0.3 foundation** (July 2026). 77 unit tests, 11 files, all passing.

## Hard rules — do not violate

1. **PRIVACY (most important):** This repo and the deployed bundle are PUBLIC.
   Never put personal data — real names beyond the "David" branding, locations,
   health facts, employer specifics, family/pet names, metrics — into `seed/`,
   `src/`, `docs/`, tests, or commit messages. Personal values travel ONLY in
   the gitignored `personal/` folder and the user's backup JSON, imported
   per-device via Settings → Import. The Health Profile seed
   (`src/data/healthProfileSeed.ts`) must stay generic (bracket placeholders).
   Generic detection keywords (e.g. injury-term regexes) are fine; asserted
   personal facts are not.
2. **Honesty:** Integrations are stubs that SAY they are stubs. Never simulate
   that an external action happened. Risky commands with no executable route
   must visibly no-op ("Nothing was sent or changed") and audit as such.
3. **Safety model:** read_only/draft_only proceed; local_write proceeds with
   visible notice; external_write and above require explicit ApprovalGate
   approval; financial/medical/legal actions are blocked outright in this
   version. No Gmail sends, calendar edits, file deletion, purchases, or
   publishing without explicit approval flows.
4. **Local-first:** No backend, no API keys in the repo (see `.env.example`),
   no OAuth until the roadmap phase that introduces it. The app must keep
   working offline.
5. **Canonical history stays clean:** saved handoffs store the cleaned current
   entry only — never full generated prompts (those are separate typed
   artifacts). Don't create recursive history bloat.
6. **Don't overengineer.** Simple readable code, pure utility functions for
   logic (testable), minimal dependencies (currently only react, react-dom,
   react-router-dom — keep it that way unless clearly justified).

## Build / run / test

```
npm install
npm run dev        # Vite dev server (localhost:5173)
npm run build      # tsc --noEmit && vite build && stamp sw version
npm test           # vitest (all logic utilities are covered)
```

Deploy = push to `main`; GitHub Actions builds and publishes to GitHub Pages.
`scripts/stamp-sw-version.mjs` stamps a unique cache version into `dist/sw.js`
every build — without it, installed PWAs never see updates. Never remove the
`__SW_VERSION__` placeholder from `public/sw.js`.

## Architecture map (key files)

- `src/lib/types.ts` — every entity type (single source of truth)
- `src/state/store.tsx` — React context store; `update(fn)` + `audit(entry)`
- `src/lib/storage/localStore.ts` — persistence + `normalizeState` migration
  (backfills fields added later; seeds Health Profile only when the key is
  `undefined`; respects explicit `null` = user deleted it)
- `src/lib/storage/exportImport.ts` — backup envelope, validation
- `src/lib/router/` — rule-based intent router (keyword scoring)
- `src/lib/safety/` — risk classifier (pattern-based) + approval rules
- `src/lib/workflows/continuity.ts` — THE core: prior-handoff retrieval
  (3 default / 7 fitness, overfetch ×2, status filter, correction dedupe),
  prompt assembly (New Entry → Personal Targets → Prior Context → Analysis
  Instructions), fingerprints
- `src/lib/workflows/fitnessExtraction.ts` — regex metric extraction with
  high/medium/low confidence; weak extraction triggers raw-excerpt fallback
- `src/lib/workflows/dateParsing.ts` — conservative date parsing w/ confidence
- `src/lib/workflows/workflowMeta.ts` — category/historyProfile/outputMode
  resolution (explicit metadata wins; weighted keyword fallback)
- `src/lib/health/` — profile prompt-block builder (+ hash metadata; bracket
  placeholders are filtered out) and soft validation / changed-field diffing
- `src/lib/utils/hash.ts` — sync pure-JS SHA-256 (don't swap for subtle.crypto;
  sync usage is deliberate)
- `src/components/WorkflowRunner.tsx` — Preview/Full Prompt modes, Copy Full
  vs Copy Current Only, Save handoff (canonical) vs Save Generated Artifact
- `src/components/HealthProfile.tsx` — profile editor (manual save, soft
  validation, audit logs field NAMES + hash, never values)
- `src/components/Settings.tsx` — export/import (Health-Profile conflict
  dialog), type-RESET-to-confirm reset (preserves profile by default), manual
  Google Drive backup export
- `src/lib/integrations/googleDriveClient.ts` — v0.3 foundation: Google
  Identity Services token flow, Drive folder creation, JSON backup upload
- `seed/` — agents/workflows/projects/prompts/context as portable JSON/MD specs
- `docs/assumptions.md` — decisions + deviations log; append when you make one

## State of the roadmap

Done: v0.1 (core command center) + v0.2 (nav restructure, surfaced risk
gating, reset/import safety, continuity engine, Health Profile, artifacts,
provider adapter contract) + v0.3 foundation (Drive browser auth contract and
approval-gated JSON backup export).

Next (in intended order):
- **v0.3 complete Google Drive sync** — plan already written in
  `docs/google-drive-sync-plan.md`; drive.file scope, browser token model, conflict
  rules. All writes behind ApprovalGate.
- **v0.4 Calendar read/draft**, **v0.5 Gmail read/draft** — read-only first,
  drafts never auto-send.
- **v0.6 live AI providers** — Claude first. Integration point already exists:
  `sendProviderRequest()` in `src/lib/integrations/aiProviderAdapter.stub.ts`
  (typed request/response; currently throws honestly). Key storage must never
  bake keys into the bundle.
- Smaller open items: handoff correction/edit UI (model fields `status` /
  `correctsHandoffId` already exist and retrieval already respects them),
  extraction alias tuning from real usage, manual workflow category override
  UI, landscape layout (explicitly low priority).

## Working conventions

- Phase-gated: after each coherent chunk, run `npm run build` and `npm test`,
  fix failures before continuing, and summarize what changed.
- Add/extend vitest coverage for any new pure logic.
- Keep components thin; put logic in `src/lib/` utilities.
- Update `docs/assumptions.md` when you deviate from a spec or make a
  judgment call.
- Commit messages: what + why; never include personal data.
