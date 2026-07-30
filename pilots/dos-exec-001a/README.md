# DOS-EXEC-001A — Synthetic Bakery Pilot

> **Fictional, synthetic, and local-only.** Starwhisk Bakehouse is not a
> real bakery. Every business detail, observation, metric, quote, price,
> address, contact detail, and commercial assumption in this package was
> invented for this pilot. Nothing here records research about a real
> business or authorizes outreach, publication, deployment, or spending.

## Executive summary

This package turns one rough fictional opportunity—“a neighborhood
bakery needs a clearer digital path from curiosity to preorder and
celebration inquiry”—into a complete, usable local business package.

The result is deliberately larger than its implementation:

- one synthetic prospect diagnosis with traceable evidence;
- one tightly scoped service offer;
- five bakery-specific resale-product ideas;
- one responsive, bakery-specific static website with a useful local
  preorder estimator;
- validation and screenshot evidence at mobile and desktop sizes;
- draft-only outreach, meeting talking points, and a proposal outline;
- one approval summary and independent-review packet.

It is not a generalized execution system. There is no DavidOS runtime
integration, agent framework, provider call, API, credential, backend,
database, external asset, tracking, payment, form submission, or
deployment configuration.

## Package map

| File | Purpose |
|---|---|
| [BUSINESS_PACKAGE.md](BUSINESS_PACKAGE.md) | Fictional profile, synthetic evidence, opportunity analysis, weakness assessment, recommended offer, resale products, assumptions, and limitations |
| [WEBSITE_BRIEF.md](WEBSITE_BRIEF.md) | Site strategy, copy system, information architecture, brand direction, and imagery plan |
| [site/index.html](site/index.html) | Working responsive static website prototype |
| [OUTREACH_AND_PROPOSAL.md](OUTREACH_AND_PROPOSAL.md) | Draft-only outreach email, call talking points, and proposal outline |
| [VALIDATION_REPORT.md](VALIDATION_REPORT.md) | Accessibility, responsiveness, technical, content, and scope validation |
| [FINAL_APPROVAL.md](FINAL_APPROVAL.md) | Final local approval summary and user-value scorecard |
| [INDEPENDENT_REVIEW_PACKET.md](INDEPENDENT_REVIEW_PACKET.md) | Read-only review instructions, evidence map, and verdict criteria |
| [WORK_LOG.md](WORK_LOG.md) | Preflight, allowlist, work notes, command outcomes, and package boundaries |

## Original command and required-output traceability

The Gate 1 authorization's rough command was:

> Create the smallest working proof that turns one rough fictional
> bakery opportunity into a complete local business package containing:
>
> - Synthetic prospect analysis
> - Recommended service offer
> - Plausible resale-product ideas
> - Working responsive static website prototype
> - Validation results
> - Draft outreach
> - Proposal outline
> - Final local approval summary
>
> This package must prove user value. It must not build a generalized
> execution platform.

The executive summary above states the resulting path and boundary.
Every required output is located by exact artifact and heading below;
“all required categories” is not used as a substitute for traceability.

| # | Required output | Exact artifact and section |
|---:|---|---|
| 1 | Executive summary | `README.md` → `Executive summary` |
| 2 | Fictional bakery profile | `BUSINESS_PACKAGE.md` → `Fictional bakery profile` |
| 3 | Synthetic evidence record | `BUSINESS_PACKAGE.md` → `Synthetic evidence record` |
| 4 | Opportunity analysis | `BUSINESS_PACKAGE.md` → `Opportunity analysis` |
| 5 | Weakness and improvement assessment | `BUSINESS_PACKAGE.md` → `Weakness and improvement assessment` |
| 6 | Recommended service offer | `BUSINESS_PACKAGE.md` → `Recommended service offer` |
| 7 | Resale-product ideas | `BUSINESS_PACKAGE.md` → `Resale-product ideas` |
| 8 | Website strategy | `WEBSITE_BRIEF.md` → `Website strategy` |
| 9 | Working responsive static website | `site/index.html` → complete semantic document; `site/styles.css` → responsive presentation; `site/script.js` → local estimator; `site/assets/logo.svg` → local mark |
| 10 | Website copy | `WEBSITE_BRIEF.md` → `Website copy`; implemented in `site/index.html` |
| 11 | Branding and imagery plan | `WEBSITE_BRIEF.md` → `Branding and imagery plan` |
| 12 | Accessibility validation | `VALIDATION_REPORT.md` → `Accessibility validation` |
| 13 | Responsiveness validation | `VALIDATION_REPORT.md` → `Responsiveness validation`; captures in `evidence/` |
| 14 | Technical validation | `VALIDATION_REPORT.md` → `Technical validation` |
| 15 | Draft outreach email | `OUTREACH_AND_PROPOSAL.md` → `Draft outreach email` |
| 16 | Call or meeting talking points | `OUTREACH_AND_PROPOSAL.md` → `Call or meeting talking points` |
| 17 | Proposal outline | `OUTREACH_AND_PROPOSAL.md` → `Proposal outline` |
| 18 | Assumptions and limitations | `BUSINESS_PACKAGE.md` → `Assumptions and limitations` |
| 19 | Final approval summary | `FINAL_APPROVAL.md` → complete document, especially `Package result` and `User-value scorecard` |
| 20 | Clear local preview instructions | `README.md` → `Local preview instructions` |

The additional Round 2 decision aids are in
`BUSINESS_PACKAGE.md` → `Monday-morning action list`, `Do-nothing
alternative`, `Manual measurement plan`, and `Re-verification map before
real use`; objection handling and the revision policy are in
`OUTREACH_AND_PROPOSAL.md`.

## Local preview instructions

Prerequisites: the existing repository dependencies must already be
installed. No new package or global tool is required.

```powershell
Set-Location 'C:\dev\davidos-worktrees\dos-exec-001a'
& 'C:\dev\davidos\node_modules\.bin\vite.cmd' 'pilots/dos-exec-001a/site' --host 127.0.0.1 --port 4175
```

Then open `http://127.0.0.1:4175/` in a browser. Stop the local server
with `Ctrl+C`.

The page also works when `site/index.html` is opened directly from disk,
but the local server is preferred because it matches the automated
preview checks.

## Local package validation

```powershell
Set-Location 'C:\dev\davidos-worktrees\dos-exec-001a'
node pilots/dos-exec-001a/validate.mjs --final
```

This checks the required files, synthetic labeling, same-page links,
local assets, basic semantic/accessibility hooks, absence of network or
browser-storage code, reserved fictional contact details, credential-like
material, exact allowlist, and final file count.

## What this proves

The pilot shows that a small, deterministic local workflow can produce a
coherent prospect-to-proposal result without building a platform around
it. The website is a credible adaptation starting point; the commercial
case remains a synthetic hypothesis that would require separate real
research and authorization before real use.

## Gate boundary

Gate 1 ends at a local candidate, evidence, review packet, and verified
Git bundle. Gate 2 remains unauthorized. Do not push, open a pull
request, merge, deploy, publish, contact anyone, use a provider, spend
money, or adapt the fictional claims into real claims without a separate
authorization and real-business validation.
