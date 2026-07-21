# Security & Approval Model

## Threat model
Single-user, local-first app. The realistic risks are not "hackers breaking in" —
they are:

1. **Self-inflicted data leaks** — pasting sensitive personal/work content into an
   external AI tool or a future integration.
2. **Backup exposure** — exported JSON contains every vault; the file is the app.
3. **Device loss/theft** — localStorage is unencrypted; anyone with the unlocked
   device/browser profile can read it.
4. **Future integration abuse** — an automated action (email, calendar, publish)
   firing without the user meaning it.
5. **Work confidentiality** — member/customer data or internal policy ending up in
   prompts, vaults, or synced files.

## Sensitive data categories
- Personal: health/medical details, relationship details, location specifics
- Work: member/customer data, internal policy, investigation details
- Financial: accounts, amounts, transactions
- Credentials: API keys, OAuth tokens, passwords

Rule: these live only in `[PLACEHOLDER]` form in seeds and code. Real values may
exist only in local runtime data, entered deliberately by the user — and even then
the private context item warns against pasting it outward.

## Action risk levels & rules
| Level | Examples | Rule |
|---|---|---|
| Read-only | View dashboard, list prompts | Proceeds |
| Draft-only | Generate a handoff/prompt locally | Proceeds |
| Local write | Save project/prompt/handoff, import backup | Proceeds with clear UI notice ("Local only" / confirm) |
| External write | Calendar event, Drive write, GitHub commit, send prompt to AI API | **Explicit approval required** (ApprovalGate) |
| Sensitive external write | Send Gmail, delete event, publish content | **Explicit approval + review required** |
| High-risk | Purchases, money transfer, medical/legal actions | **Blocked in v1 — gate renders no Approve button** |

Hard rules, enforced in code (`approvalRules.ts`) and by construction (no external
code paths exist in v1):
- No Gmail sends, calendar edits, file deletion, purchases, financial actions, or
  external publishing without explicit approval — ever.
- Stubs never simulate success. Every stub returns `ok: false` with a message
  saying no external call was made.
- The UI labels draft-only and local-only outputs explicitly.

## Approval gate
`src/components/ApprovalGate.tsx` — modal that names the action, shows its risk
badge and description, and requires an explicit Approve/Deny. Every decision is
audit-logged (`approved` / `denied`). Settings → Integrations exercises the real
gate flow against stubs today so the pattern is proven before anything real lands.

## Audit logging
Every routed command, workflow run, local write, and approval decision is recorded:
timestamp, command, agent, workflow, action type, approval status, result summary.
Local-only, capped at 300 entries, user-clearable.

## Secrets management
- No secrets exist in v1. None are needed.
- `.env.example` documents future variables; real `.env` is gitignored.
- Never commit API keys. Never bake keys into the PWA bundle (a bundle is public
  by definition). Future options: paste-at-runtime keys or a tiny user-owned proxy.

## OAuth (future)
- Static PWA/browser flows use Google Identity Services with short-lived access
  tokens only; no client secret, refresh token, or long-lived token in the app.
- Narrowest scopes: `drive.file` (only files the app created), `gmail.readonly` +
  `gmail.compose` (drafts, not sends) first, `calendar.events` read-first.
- Tokens stored locally, revocable from the Google account page; document this in
  the UI when it lands.

## Backup / export cautions
- The export JSON contains all vaults including private context. Treat it like a
  password file. The UI says so at export time.
- Import checks the envelope and top-level structure, runs deep per-item
  field/enum validation, and rejects backups with a newer schema version
  than the app understands, before replacing state (OL-005/OL-006,
  resolved).

## Google Drive sync cautions (v0.3)
- Sync only the DavidOS folder; `drive.file` scope caps blast radius.
- `Sensitive_Private_PLACEHOLDER.md` syncs as placeholders unless the user
  explicitly opts the real content in.
- Deletions propagate only after approval; see google-drive-sync-plan.md.

## Gmail / Calendar cautions (v0.4–0.5)
- Read and draft only by default. Sending is a separate, always-gated action.
- Calendar deletes are sensitive-external-write: gate + review.

## Work confidentiality
- The work agent's templates instruct: placeholders instead of member data, no
  fabricated policy, assumptions marked.
- Work materials generated here are drafts for the user to verify against real
  policy — the app never claims policy authority.
