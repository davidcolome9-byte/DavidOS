# Codex Runbook

Step-by-step recipes for a coding agent starting cold on this repo.
Prerequisite reading: [../AGENTS.md](../AGENTS.md) (rules), then the doc
relevant to your task.

## 0. Session start checklist

1. `npm run doctor` — fix environment problems before coding.
2. `git status` — if the tree is dirty, STOP and ask/record; don't build
   on unexplained changes.
3. `npm run verify` — establish a green baseline. If it's red before you
   touched anything, fixing that IS your first task.
4. Read `docs/OPEN_LOOPS.md` for priorities and `docs/CURRENT_STATE.md`
   for what exists.

## 1. Picking work

- Items marked **Ready** in OPEN_LOOPS.md need no further approval.
- Items marked **Requires David** must not be started — leave questions
  in the item's notes.
- Never invent scope: no new domains, nav restructures, or dependencies
  without an OPEN_LOOPS entry approved by David.

## 2. Recipe: fix a bug

1. Reproduce it — a failing unit test in `src/lib/__tests__/` if the
   logic is pure, or a Playwright smoke assertion if it's UI-level.
2. Smallest sound fix in the module that owns the behavior (logic lives
   in `src/lib/`, not components).
3. `npm run verify`.
4. Update docs if behavior changed; append to `docs/DECISIONS.md` if you
   made a judgment call.
5. Commit: what + why. Never personal data.

## 3. Recipe: add an agent

1. `seed/agents/<name>.json` — copy an existing spec's shape.
2. Add its id to `AgentId` in `src/lib/types.ts`.
3. Import it in `src/lib/agents/agentRegistry.ts`.
4. Keywords in `src/lib/router/routeScoring.ts`; default workflow in
   `src/lib/router/intentRouter.ts`.
5. Add at least one workflow (next recipe).
6. `npm run verify` — registry tests catch wiring mistakes.

## 4. Recipe: add a workflow

1. `seed/workflows/<name>.json` — template with `{{input}}`, `{{style}}`,
   `{{date}}`; set `category`, `historyProfile`, `outputMode` explicitly.
2. Import in `src/lib/workflows/workflowRegistry.ts`.
3. Optional slash command in `src/lib/commands.ts`.
4. `npm run verify`.

## 5. Recipe: change the data model

1. Add fields as OPTIONAL in `src/lib/types.ts` (required fields need
   David's approval — see AGENTS.md §3).
2. Backfill in `normalizeState()` (`src/lib/storage/localStore.ts`).
3. Add a migration test: old-shaped state (without your field) must load
   without crashing and get the backfill.
4. If export/import validation should know the field, remember older
   backups won't have it — validation must not require it.
5. Update `docs/DATA_MODEL.md`. `npm run verify`.

## 6. Recipe: work toward v0.3+ integrations

Read `docs/INTEGRATIONS.md` + `docs/google-drive-sync-plan.md` first.
Every external write goes through `requiresApproval()` + ApprovalGate and
the audit log; nothing fires without a user gesture; stubs stay honest.
Off-device data flow is an approval-boundary item — confirm with David
before shipping anything that transmits.

## 7. Before every commit

- [ ] `npm run verify` green (verify:full if UI changed)
- [ ] `git diff` reviewed — no personal data, no secrets, no stray files
- [ ] Docs updated (CURRENT_STATE date/counts, DECISIONS entry if a call
      was made, OPEN_LOOPS item closed/updated)
- [ ] Commit message says what + why

## 8. When you're unsure

Prefer the more restrictive reading of any rule; record the ambiguity in
`docs/OPEN_LOOPS.md` (**Requires David**) and continue with safe work.
Do not resolve contradictions silently (AGENTS.md §11).
