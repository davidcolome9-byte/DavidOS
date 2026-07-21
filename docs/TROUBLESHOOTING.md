# Troubleshooting

Known failure modes and their fixes. Run `npm run doctor` first — it
detects most of these automatically.

## Environment

**`node` or `npm` not found (fresh Windows shell).** Node 24 was
installed via winget into the MACHINE PATH; an already-open shell may
have a stale PATH. Open a new terminal, or refresh:
`$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`

**`npm ci` fails with EBADPLATFORM/symlink/EPERM errors.** You are
probably inside a Google Drive-synced folder. The repo must live on a
real disk (`C:\dev\davidos`). Never `npm install` under `G:\My Drive`.

**`npm ci` says lockfile out of sync.** Someone edited `package.json`
without updating the lockfile. Run `npm install` once, verify the diff
is only the intended package, commit both files.

**Node version errors.** Requires Node >= 20 (`engines`). CI uses 20;
don't use APIs newer than Node 20.

## Dev server / preview

**Port 5173 or 4173 already in use.** Another Vite instance is running.
`Get-NetTCPConnection -LocalPort 5173 | Select OwningProcess` then stop
it, or pass `--port`.

**Blank page on GitHub Pages but works locally.** `vite.config.ts` must
keep `base: './'` — the app is served from a subpath
(`/DavidOS/`). Absolute asset paths break it.

## PWA / service worker

**Installed PWA never shows new versions.** The build must end with
`scripts/stamp-sw-version.mjs` replacing `__SW_VERSION__` (deterministic
build identity) and `__SW_PRECACHE__` (asset manifest derived from
`dist/`) in `dist/sw.js`. If someone removed the placeholders from
`public/sw.js` or the stamp step from `npm run build`, updates silently
stop. Restore both; users then need one full close/reopen of the app.

**How offline updates work (candidate model, DOS-FND-001).** The worker
precaches the complete app shell at install and verifies every asset
landed before the new version may activate; superseded DavidOS caches
are deleted only after that verification. A failed or partial deploy
rejects the candidate install and the previous version keeps launching
offline — no storage clearing or unregistering needed. Offline launch is
only possible after at least one completed online visit; a first-ever
visit while offline cannot work (no service worker exists yet).

**Stale content while developing.** DevTools → Application → Service
Workers → "Update on reload", or unregister the worker.

## Data / state

**Where state actually lives.** Canonical AppState is stored as immutable
journal generations (`davidos-state-generation-v1-<id>`) selected by two
alternating head records (`davidos-state-head-v1-a` / `-b`). The older
single key `davidos-state-v1` is migration input and read fallback only;
it is left byte-identical by migration and may still be present on a
device long after the journal took over. See docs/DATA_MODEL.md →
"Persistence".

**"Saving is paused" and the app otherwise works.** Expected protective
behavior, not data loss. Causes: boot preservation failed; journal
authority needs reconciliation (a damaged head or an unverifiable
generation); another tab advanced the head, making this tab stale; a
commit ended with an UNCONFIRMED outcome; or `navigator.locks` is
unsupported, which puts the app in safe read-only persistence mode.
Export and recovery downloads stay available in every case. Reload to
re-establish authority. Note the deliberate honesty distinction: after an
unconfirmed outcome the app says the write could not be confirmed — it
does NOT claim stored data is unchanged.

**App boots to seed data unexpectedly, or shows a "Data recovery
notice" banner.** The stored state was unreadable or damaged. The exact
original blob is preserved under a
unique `davidos-state-v1-recovery-<timestamp>` key (the banner names
it) — inspect it via DevTools → Application → Local Storage and
re-import your latest backup via Settings → Import. If the banner says
"Saving is paused", preservation itself failed (storage full): nothing
was overwritten, but changes stay in memory only — export a backup,
free storage, then reload. Details: docs/DATA_MODEL.md → "Load &
recovery states".

**Import rejects a backup.** The validator names the missing piece
(envelope tag, schemaVersion, required array, settings). Backups are
versioned JSON — inspect in any editor. Older backups lacking
`artifacts`/`healthProfile` are fine (backfilled).

**Health Profile vanished after an import/reset.** By design import
shows a conflict dialog and reset preserves the profile unless told
otherwise; if the profile is gone, re-import the personal backup. An
explicitly deleted profile (`null`) is never auto-reseeded.

**Two tabs/devices fighting.** Persistence is last-write-wins per
origin. Keep one tab open; cross-device sync arrives with v0.3.

## Tests / verification

**`npm run test:smoke` fails to launch a browser.** One-time setup:
`npx playwright install chromium`.

**Vitest passes locally but CI fails.** Check Node 20 compatibility and
that no test depends on machine-local files (`personal/`, `G:\`).

**Git shows CRLF warnings on Windows.** Harmless (`core.autocrlf`);
don't "fix" line endings in unrelated files — it bloats diffs.

## Recovery / clean reset

1. `git status` / `git stash` to protect uncommitted work.
2. `Remove-Item -Recurse -Force node_modules; npm run setup`
3. Clear site data in the browser (state + service worker).
4. `npm run verify` — green means the environment is healthy.
