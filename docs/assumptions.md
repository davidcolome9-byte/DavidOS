# Assumptions

Decisions made during the initial build without blocking questions, per the build brief.

## Location & environment
1. **Repo lives at `C:\dev\davidos`, not `G:\My Drive`.** Google Drive's virtual
   filesystem breaks `node_modules` (symlinks, file locking, speed) — same reason
   MacroPilot lives in `C:\dev`. Drive remains the *future sync target* (v0.3), which
   the spec already called for. Never `npm install` inside a Drive-synced folder.
2. **Node.js LTS was installed via winget** during the build — it was not present
   on the machine.

## Stack
3. **Vite + React + TypeScript** (not Next.js). Nothing here needs SSR, API routes,
   or a server. Vite gives a static, portable bundle that works as a PWA, on any
   static host, and later inside Capacitor. React 18 + Vite 5 chosen for maximum
   compatibility and stability.
4. **HashRouter** instead of BrowserRouter — the app works from any static file
   server (or Capacitor) with zero rewrite config.
5. **localStorage, not IndexedDB**, for v1 state. All vault data is small text
   (well under the ~5MB limit). The storage layer is isolated in
   `src/lib/storage/localStore.ts` so swapping to IndexedDB or Drive sync later
   touches one file.
6. **Hand-written service worker** instead of vite-plugin-pwa/Workbox — ~40 lines
   covers app-shell offline caching; no extra dependency tree.

## Product decisions
7. **Agents and workflows are static JSON specs** in `/seed` and are not editable
   inside the app in v1. They are data, not code, so ChatGPT/Codex/Gemini can read
   and extend them. Projects, prompts, context, loops, and reminders ARE editable.
8. **The router is rule-based keyword scoring.** Confidence is heuristic and capped
   at 0.9 — a keyword router should never claim certainty. AI-backed routing comes
   with the AI provider integration (v0.6).
9. **Workflow runs generate prompts/templates locally.** No AI API is called. The
   output is designed to be copied into ChatGPT/Claude/Gemini manually until v0.6.
10. **"Reminders" are local placeholders** (free-text due dates, no notifications).
    Real scheduling arrives with Calendar integration (v0.4).
11. **Prompt versioning is light**: saving an edited prompt keeps the previous body
    (up to 10 versions). No diffing.
12. **The AI provider adapter is one adapter with a provider parameter** rather than
    four near-identical adapters for ChatGPT/Claude/Codex/Gemini.
13. **Seed context is moderate** per the brief: name, area, work domain, fitness
    constraints, dog names. Anything sensitive is a `[PLACEHOLDER]` in the
    private context item.
14. **High-risk actions (financial/medical/legal) are not just gated — they are
    unapprovable in v1.** The ApprovalGate renders them with no Approve button.
15. **Audit log is capped at 300 entries** to keep localStorage small.
16. **Deleting projects/prompts/handoffs asks for a browser confirm** — that counts
    as the "clear UI notice" for local writes; no separate gate needed since the
    data never leaves the device and Export/Backup exists.

## v0.2 continuity build (2026-07-08)

- **Health Profile seeding vs. public repo:** the calibration spec asked to seed
  David's real recomp values into the app. That conflicts with the repo being
  public, so the shipped seed (`src/data/healthProfileSeed.ts`) is a generic
  starter with bracket placeholders; real values travel in the gitignored
  personal backup JSON and are imported per device. Bracket-placeholder values
  are never inserted into generated prompts.
- **Unsaved-changes guard:** react-router v6 (non-data router) has no stable
  navigation blocker, so the Health Profile editor uses a sticky "unsaved
  changes" banner plus a `beforeunload` guard instead of intercepting in-app
  navigation.
- **Slash-command router intentionally bypasses risk gating** (`/brief` etc. are
  known-safe navigations); free-text commands are always risk-classified.
- **Handoffs are append-only** in this version; `status`/`correctsHandoffId`
  exist in the model and retrieval logic but have no edit/correction UI yet.

## v0.3 Drive sync foundation (2026-07-08)

- **Google Drive auth uses the browser token model, not Authorization Code +
  PKCE.** DavidOS is a static PWA with no backend token-exchange endpoint.
  Google's current browser guidance requires short-lived access tokens for
  frontend-only Drive calls. Tokens are kept in memory only and requested through
  user gestures.
- **First live Drive slice is backup export only.** Manual JSON backup export can
  create `DavidOS/06_Exports/Backups` and upload a timestamped backup after
  ApprovalGate confirmation. Two-way vault sync and conflict review remain
  pending.

## Fitness macro intelligence (2026-07-08)

- **MacroPilot integration is concept-level, not app import.** MacroPilot is a
  separate Flutter app with food search, barcode scanning, expenditure
  estimation, trend weight, and check-ins. DavidOS should not absorb that whole
  product surface right now; it remains a command center and prompt engine.
- **Seamless first reuse:** add a deterministic macro target snapshot to fitness
  prompts. It parses current macro totals from the new entry and compares them
  against the private imported Health Profile targets, then gives correction
  cues for ChatGPT/Claude to reason from. This mirrors MacroPilot's useful
  target-vs-current dashboard behavior without adding a food database or barcode
  dependency.
