# seed/ — rules for this directory

Everything here is **portable authored data, not code**: agent specs,
workflow specs, starter projects/prompts/context. Any AI tool may read
these; the app loads them at build time via the registries in
`src/lib/agents/` and `src/lib/workflows/` and `src/data/seedLoader.ts`.

Directory-specific rules (in addition to /AGENTS.md):

1. **No personal data, ever.** This ships in a public repo and bundle.
   Sensitive values are bracket placeholders (`[YOUR_LOCATION]`,
   `[PRIVATE_HEALTH_DETAILS]`). Real values live only in the user's
   gitignored personal backup.
2. **Adding a JSON file is not enough** — it must be registered
   (see the checklists in docs/CODEX_RUNBOOK.md §3–4) and validated by
   `npm run validate:seed`.
3. **Workflow templates** use `{{input}}`, `{{style}}`, `{{date}}`
   placeholders only. Set `category`, `historyProfile`, and `outputMode`
   explicitly rather than relying on the keyword fallback.
4. **Don't repurpose specs across domains.** DavidOS is a multi-domain
   command center: a new life domain gets its own agent/workflow specs
   rather than overloading an existing one.
