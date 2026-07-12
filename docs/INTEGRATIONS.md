# Integrations

DavidOS is local-first: in the current version NO integration performs
real external actions except the explicitly-gated Google Drive backup
export foundation. Everything else is a typed, disabled stub.

## The stub contract (protected behavior)

Every adapter in `src/lib/integrations/` exports:

1. An `IntegrationAdapter` descriptor — capabilities, required
   credentials, risk level, method list (each with its own risk and
   `implemented: false`), future notes.
2. Stub methods returning `{ ok: false, message }` that clearly say no
   external call was made. **Stubs never simulate success.**

When implementing a stub for real:
- Keep the same method signatures.
- Route every write through `requiresApproval()` + ApprovalGate.
- Audit-log every call.
- Update the adapter's `implemented` flags and this doc.
- Never bake credentials into the bundle (see
  docs/security-and-approval-model.md → Secrets management).

## Current adapters

| Adapter | File | Status |
|---|---|---|
| Google Drive | `googleDriveAdapter.stub.ts` + `googleDriveClient.ts`, `googleDrivePaths.ts` | Backup-export foundation implemented (see below); rest stubbed |
| Google Calendar | `googleCalendarAdapter.stub.ts` | Stub (v0.4) |
| Gmail | `gmailAdapter.stub.ts` | Stub (v0.5) |
| AI providers | `aiProviderAdapter.stub.ts` | Stub with typed request/response contract; `sendProviderRequest()` is the v0.6 integration point and currently throws honestly |
| GitHub | `githubAdapter.stub.ts` | Stub (unscheduled) |
| Local files | `localFilesAdapter.stub.ts` | Stub (unscheduled) |

## Google Drive backup export foundation (shipped on main)

- Auth: Google Identity Services **browser token model** (not
  Authorization Code + PKCE — a static PWA has no token-exchange
  backend; decision logged in docs/DECISIONS.md). Short-lived access
  tokens, in-memory only, requested via user gesture. Scope:
  `drive.file` (only files the app created).
- Capability: create `DavidOS/06_Exports/Backups` folders and upload a
  timestamped backup JSON after ApprovalGate confirmation.
- Client ID comes from `VITE_GOOGLE_CLIENT_ID` (see `.env.example`);
  there is no client secret anywhere in the app, ever.
- Two-way vault sync and conflict review are NOT implemented — the plan
  is docs/google-drive-sync-plan.md and stays authoritative for v0.3.

## Roadmap gating (do not skip ahead)

v0.3 Drive sync → v0.4 Calendar read/draft → v0.5 Gmail read/draft
(drafts never auto-send) → v0.6 AI provider APIs (keys paste-at-runtime
or personal proxy, never bundled) → v0.7 Capacitor Android wrapper.
Details: docs/roadmap.md. Each integration ships read-only/draft-first,
with every write behind ApprovalGate.
