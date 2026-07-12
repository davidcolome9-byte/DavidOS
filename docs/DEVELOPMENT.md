# Development

Environment, commands, and testing for DavidOS. For step-by-step task
recipes see [CODEX_RUNBOOK.md](CODEX_RUNBOOK.md); for failure modes see
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Requirements

- **Node.js >= 20** (CI and GitHub Pages deploy use 20; David's machine
  runs 24 — code must work on both). `package.json` `engines` enforces
  the floor.
- npm (ships with Node). No yarn/pnpm — the lockfile is npm's.
- Windows note: the repo must live on a real disk (e.g. `C:\dev\davidos`),
  **never inside a Google Drive-synced folder** — Drive's virtual
  filesystem breaks node_modules.

## Setup

```bash
git clone https://github.com/davidcolome9-byte/DavidOS.git c:/dev/davidos
cd c:/dev/davidos
npm run setup                      # npm ci — deterministic install
npx playwright install chromium    # one-time, only if running smoke tests
npm run doctor                     # verifies the environment
```

No `.env` is needed — v1 has no secrets (see `.env.example` for future
variables).

## Commands

| Command | What it does |
|---|---|
| `npm run setup` | `npm ci` — clean install from the lockfile |
| `npm run dev` | Vite dev server → http://localhost:5173 |
| `npm run doctor` | Environment diagnosis: Node/npm versions, install state, seed validity, port availability, Drive-path check |
| `npm run lint` | ESLint over src/ and scripts/ |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit suite (`src/lib/__tests__/`) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:smoke` | Playwright browser smoke tests (builds first; chromium required) |
| `npm run validate:seed` | Validates every seed JSON file against required fields |
| `npm run build` | `tsc --noEmit` + `vite build` + stamp sw version |
| `npm run preview` | Serve `dist/` → http://localhost:4173 |
| `npm run verify` | lint + typecheck + unit tests + seed validation + build — the definition-of-done gate |
| `npm run verify:full` | `verify` + browser smoke tests |
| `npm run icons` | Regenerate PWA icons (rarely needed; committed) |

CI (`.github/workflows/ci.yml`) runs `verify` + smoke tests on every push
and PR; deploy (`deploy.yml`) builds and publishes `main` to GitHub Pages.

## Testing guide

- Unit tests live in `src/lib/__tests__/*.test.ts` (Vitest, node env).
  All pure logic (router, safety, storage, continuity, extraction,
  health, macros) is covered there — extend the sibling test file when
  you touch a module.
- Browser smoke tests live in `tests/smoke/*.spec.ts` (Playwright,
  chromium). They cover app boot, navigation, persistence round-trip,
  and recovery from malformed stored state. Keep them fast and few —
  they are a safety net, not a UI spec.
- Test data must be invented and personal-data-free (AGENTS.md §2.1).

## Local persistence during development

Live state is localStorage key `davidos-state-v1` (per origin — the dev
server, preview server, and deployed app each have separate state).

Clean reset options:
1. In-app: Settings → Reset to seed (type RESET; preserves Health
   Profile by default).
2. DevTools: Application → Local Storage → delete `davidos-state-v1`.
3. Nuclear: clear site data (also unregisters the service worker).

## Seed / fixture data

`seed/` ships generic starter data (bracket placeholders). To produce a
personal starter backup locally, `scripts/seed-to-backup.mjs` writes into
the gitignored `personal/` folder — its output must never be committed.

## Deploying

Push to `main` → GitHub Actions builds and deploys Pages. There is no
manual deploy step. `scripts/stamp-sw-version.mjs` stamps a unique cache
version into `dist/sw.js` on every build; without it installed PWAs never
update. Never remove the `__SW_VERSION__` placeholder from `public/sw.js`.
