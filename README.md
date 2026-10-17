# DavidOS

## Preserved app candidate for cloud development (2026-10-17)

This branch preserves the previously uncommitted app work from
`C:/dev/davidos-completion-20260919`, based on `cdf3cbb`. It is a historical
candidate, separate from the current dependency-maintenance branch and public
`main`. No histories were merged and this upload does not approve a release.

Use Node.js 24 and install this branch's own lockfile with `npm ci`. Do not
reuse another checkout's `node_modules`: the original worktree has a junction
to the primary checkout, whose upgraded test dependencies are incompatible
with this historical baseline. That shared local environment produced 33
window.confirm test failures. Verify using an isolated locked installation.

Development/build/test commands are `npm run dev`, `npm run build` and
`npm run verify`. Browser checks use `npx --no-install playwright install
chromium --with-deps` on Linux, followed by `npm run test:smoke`.
No environment variables, API keys, database or PC service are required for
synthetic source/build checks. Personal state and backups remain outside Git.
This repository is public; keep private and employer material excluded.
Use a feature branch because pushes to `main` deploy the existing Pages site.

Create a private Codex Cloud environment and verify this exact branch and full
commit SHA in a fresh task after preparing and publishing the setup. Local
checks do not prove cloud access or owner acceptance.

Personal agentic command center. A mobile-first, local-first PWA that routes life
and work tasks into structured workflows: daily command, Operation David fitness,
work/fraud/cyber projects, prompt vault, planning, dogs/home admin, and content
assets — with explicit safety gates before anything would ever leave the device.

**Stack:** Vite + React + TypeScript. No backend, no accounts, no API keys.
(Next.js was considered and rejected: nothing here needs SSR or server routes, and
a static Vite bundle is more portable — PWA today, Capacitor wrapper later. See
`docs/DECISIONS.md`.)

## Program portfolio

The active program portfolio is exactly:

1. **DavidOS**
2. **Operation David / Health & Fitness**
3. **Social Assistant / Dating Assistant**

Agent names and workflow domains inside DavidOS — including
Work/Fraud/Cyber, Dogs/Home/Life Admin, Content/Side-Income, Calendar,
Cooking, and Dating Wingman — are product routing categories, not
additional active projects. The retired “Investing” label is historical
only and is not a finance or investing project.

> **AI coding agents:** start with [AGENTS.md](AGENTS.md) — rules,
> architecture map, commands, and definition of done — which itself
> points to [docs/AI_TOOL_ROUTING.md](docs/AI_TOOL_ROUTING.md), the
> authoritative AI model/tool routing policy. The docs index and backlog
> live in `docs/`.

## Run it

```bash
cd C:\dev\davidos
npm install        # first time only
npm run dev        # dev server → http://localhost:5173
```

Production build + preview:

```bash
npm run build      # type-checks, then bundles to dist/
npm run preview    # serves dist/ → http://localhost:4173
npm test           # vitest unit suite (router, safety, storage, continuity,
                   # health, macros, extraction, dates, hash, drive paths)
npm run verify     # lint + tests + seed validation + build — the full gate
npm run doctor     # diagnose environment problems
```

Full command list: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Install on Android (PWA)

1. Serve the production build somewhere your phone can reach:
   - Same Wi-Fi: `npm run preview -- --host`, then open `http://<PC-ip>:4173` in
     Chrome on the phone; **or**
   - Any static host (Netlify/Cloudflare Pages/GitHub Pages): upload `dist/`.
     PWA install requires HTTPS (localhost is exempt).
2. In Chrome: menu (⋮) → **Add to Home screen** → **Install**.
3. DavidOS opens standalone and keeps all data on the device. App-shell
   offline support is fully reliable: offline launch, offline reload, and
   offline navigation work after install and after every deploy (OL-001
   resolved — see `docs/OPEN_LOOPS.md`).

## Current features

- **Home / OS Status** — priorities, suggested next move, quick actions, agent
  launcher, open loops, recent activity
- **Command palette** — free text routed to the right agent with confidence +
  reasoning; slash commands (`/brief`, `/fitness`, `/work`, `/weekly`, `/os route`, …)
- **8 agents** — Universal Operations (cross-domain hub), Daily Command,
  Operation David Fitness, Work/Fraud/Cyber, Prompt Vault,
  Calendar/Planning, Dogs/Home/Life Admin, Content/Side-Income
- **Workflow runner (continuity-aware, v0.2)** — messy input → output style →
  AI-ready prompt built from the current entry **plus prior saved handoffs**
  (3 for default workflows, 7 for Health & Fitness), with structured metric
  extraction, date parsing, confidence labeling, raw-excerpt fallbacks, and
  SHA-256 prompt fingerprints. Preview / Full Prompt views; Copy Full Prompt vs
  Copy Current Only; canonical handoff history stays clean of generated prompts;
  full prompts can be saved separately as typed artifacts
- **Health & Fitness Profile** — global, editable, local-only profile (targets,
  regimen, restrictions, recovery baselines) automatically inserted into
  fitness prompts with a per-run toggle. The public seed is a *generic* starter:
  real personal values live in your gitignored personal backup and are imported
  per device. Preserved through reset by default; never silently overwritten on
  import; audit logs record changed field names + fingerprints, never values
- **Context vault** — layered context (stable / priorities / workflow / session /
  private) with placeholder discipline for sensitive data
- **Project vault** and **Prompt vault** — CRUD, categories, tags, favorites,
  light prompt versioning
- **Planning** — daily brief + weekly review composed from live state, local
  reminders, open loop management
- **Safety** — 6-level risk classification surfaced directly in the command
  palette (risky unmatched commands show an honest "nothing was sent" no-op),
  ApprovalGate modal (high-risk actions are unapprovable in v1), full audit log
- **Data** — canonical state persisted as an immutable, hash-verified
  generation journal in localStorage (durable Import/Reset/Prune
  transactions; see `docs/DATA_MODEL.md`), JSON export/import
  (Health-Profile-aware conflict handling), type-`RESET`-to-confirm reset
  that preserves the Health Profile by default
- **Navigation** — 5-tab bottom bar (Home, Workflows, Projects, Logs, More) with
  grouped More menu: Build / Personal / System / Data

## Safety model (short version)

Read-only and draft-only actions proceed. Local writes proceed with a visible
notice. External writes require explicit approval. Sensitive external writes
require approval + review. Financial/medical/legal actions are blocked outright.
Integrations are **stubs that say so** — they never simulate success — with one
gated exception: manual Google Drive backup export (v0.3 foundation) is live
behind the ApprovalGate. Details: `docs/security-and-approval-model.md` and
`docs/INTEGRATIONS.md`. That shipped foundation is a product fact, not standing
authorization to connect a provider, use credentials, execute OAuth, or begin
additional integration work.

## Folder structure

```
davidos/
  docs/          product spec, architecture, security model, Drive sync plan,
                 roadmap, assumptions
  seed/          portable specs & seed data (agents, workflows, context,
                 projects, prompts) — readable by any AI tool
  src/
    app/         App + entry
    components/  UI (dashboard, palette, runner, vaults, planning, logs, settings)
    state/       store (React context + localStorage)
    data/        seed loading, default state
    lib/         types, router, safety, storage, agents, workflows,
                 integrations (stubs), audit
  public/        manifest, service worker, icons
  scripts/       build/verify utilities: sw version stamping, seed validation,
                 environment doctor, icon generator, seed→personal backup
  tests/smoke/   Playwright browser smoke tests (production build)
```

## Export / import

Settings → **Export backup (JSON)** downloads everything (treat the file as
sensitive — it contains all vaults). **Import backup** validates the envelope,
rejects backups from a newer DavidOS (forward schema-version guard), and runs
deep per-item field/enum validation with readable errors naming the bad item,
then replaces local state after confirmation.
**Reset to seed** restores the shipped defaults, preserving the Health Profile
exactly unless you explicitly delete it.

## Add a new agent / workflow

See the checklists at the bottom of `docs/ARCHITECTURE.md`. Short version: drop a
JSON spec into `seed/agents/` or `seed/workflows/`, register it in the matching
registry file, add router keywords, run `npm test` (registry tests catch wiring
mistakes automatically).

## Known limitations

- No real AI calls — workflows generate prompts to paste into ChatGPT/Claude/etc.
- Reminders are local placeholders: free-text due dates, no notifications
- Agents/workflows are not editable in-app (they're specs in `/seed`)
- localStorage is unencrypted and per-browser-profile; export backups regularly
- Rule-based router — decent, not clever; confidence is a heuristic
- Data does not sync between devices until Drive sync (v0.3)

## Roadmap

v0.2 polish → **v0.3 Google Drive sync** → v0.4 Calendar read/draft → v0.5 Gmail
read/draft → v0.6 AI provider APIs → v0.7 Capacitor Android wrapper.
This is possible sequencing only, not authorization for any package, provider,
credential, deployment, or automation work. Full detail: `docs/roadmap.md`.
