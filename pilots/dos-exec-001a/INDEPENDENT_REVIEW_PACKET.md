# DOS-EXEC-001A Gate 1 Correction Round 1 — Independent Rereview Packet

> **Review target:** One fictional, synthetic-only, local bakery pilot.
> Starwhisk Bakehouse is not real. No evidence in this package should be
> interpreted as a real customer, business, market, price, metric, quote,
> address, contact, or commercial result.

## Review stage and authority

- Gate 1 focused correction rereview only.
- Review is read-only.
- Gate 2 remains unauthorized.
- Do not edit, push, create a pull request, merge, deploy, publish,
  contact, purchase, connect a provider, or use credentials.
- A self-review by the builder does not satisfy the repository's
  independence requirement.

## Exact review target

**Repository:** `C:\dev\davidos-worktrees\dos-exec-001a`

**Branch:** `feat/dos-exec-001a-synthetic-bakery-pilot`

**Base SHA:** `497fab9abb06df86e20ef1e9fe4585d7c7274ab9`

**Original candidate / required parent:**
`bc8dc3fcc617b8651ef2de9d02f7aa943dbef4f1`

**Corrected candidate ref:** annotated tag
`dos-exec-001a-gate1-correction-1-candidate`

Resolve and record the exact candidate SHA before review:

```powershell
Set-Location 'C:\dev\davidos-worktrees\dos-exec-001a'
git rev-parse 'dos-exec-001a-gate1-correction-1-candidate^{}'
git rev-parse 'dos-exec-001a-gate1-correction-1-candidate^'
git status --short --branch
```

The corrected candidate must be exactly one commit whose parent is the
original candidate above. The candidate SHA cannot be embedded inside
the commit that it identifies without changing that SHA. The peeled
annotated tag is the authoritative in-repository candidate selector; the
correction handoff reports its immutable SHA and verified bundle hash.

## Objective

Determine whether the single correction commit fixes the two blocking
hero/evidence findings, keeps the original candidate history intact,
addresses the authorized related findings, preserves the exact
cumulative allowlist, and introduces no scope expansion or new defect.
The broader package should be reconsidered only where the correction
changes its evidence or quality.

## Files to inspect

1. `pilots/dos-exec-001a/WORK_LOG.md`
2. `pilots/dos-exec-001a/README.md`
3. `pilots/dos-exec-001a/BUSINESS_PACKAGE.md`
4. `pilots/dos-exec-001a/WEBSITE_BRIEF.md`
5. `pilots/dos-exec-001a/OUTREACH_AND_PROPOSAL.md`
6. `pilots/dos-exec-001a/VALIDATION_REPORT.md`
7. `pilots/dos-exec-001a/FINAL_APPROVAL.md`
8. `pilots/dos-exec-001a/INDEPENDENT_REVIEW_PACKET.md`
9. `pilots/dos-exec-001a/validate.mjs`
10. `pilots/dos-exec-001a/site/index.html`
11. `pilots/dos-exec-001a/site/styles.css`
12. `pilots/dos-exec-001a/site/script.js`
13. `pilots/dos-exec-001a/site/assets/logo.svg`
14. `pilots/dos-exec-001a/evidence/desktop.png`
15. `pilots/dos-exec-001a/evidence/mobile.png`

No file outside this allowlist should differ from the base.

The correction commit need not touch every allowlisted file. Its exact
delta must remain a subset of this cumulative 15-file allowlist.

## Directly verifiable 20-category deliverable map

| # | Required output category | Primary evidence |
|---:|---|---|
| 1 | Executive summary | `README.md` |
| 2 | Fictional bakery profile | `BUSINESS_PACKAGE.md` |
| 3 | Synthetic evidence record | `BUSINESS_PACKAGE.md` |
| 4 | Opportunity analysis | `BUSINESS_PACKAGE.md` |
| 5 | Weakness and improvement assessment | `BUSINESS_PACKAGE.md` |
| 6 | Recommended service offer | `BUSINESS_PACKAGE.md` |
| 7 | Resale-product ideas | `BUSINESS_PACKAGE.md` |
| 8 | Website strategy | `WEBSITE_BRIEF.md` |
| 9 | Working local website | `site/index.html`, `site/styles.css`, `site/script.js`, `site/assets/logo.svg` |
| 10 | Website copy | `WEBSITE_BRIEF.md`, `site/index.html` |
| 11 | Branding and imagery plan | `WEBSITE_BRIEF.md`, `site/assets/logo.svg` |
| 12 | Accessibility validation | `VALIDATION_REPORT.md`, `validate.mjs` |
| 13 | Responsiveness validation | `VALIDATION_REPORT.md`, `validate.mjs`, `evidence/*.png` |
| 14 | Technical validation | `VALIDATION_REPORT.md`, `validate.mjs` |
| 15 | Draft outreach email | `OUTREACH_AND_PROPOSAL.md` |
| 16 | Call or meeting talking points | `OUTREACH_AND_PROPOSAL.md` |
| 17 | Proposal outline | `OUTREACH_AND_PROPOSAL.md` |
| 18 | Assumptions and limitations | `BUSINESS_PACKAGE.md` |
| 19 | Final local approval summary | `FINAL_APPROVAL.md` |
| 20 | Exact local preview instructions | `README.md` |

## Independent commands

```powershell
Set-Location 'C:\dev\davidos-worktrees\dos-exec-001a'
git rev-list --parents -n 1 dos-exec-001a-gate1-correction-1-candidate
git diff --stat bc8dc3fcc617b8651ef2de9d02f7aa943dbef4f1..dos-exec-001a-gate1-correction-1-candidate
git diff --name-only bc8dc3fcc617b8651ef2de9d02f7aa943dbef4f1..dos-exec-001a-gate1-correction-1-candidate
git diff --check 497fab9abb06df86e20ef1e9fe4585d7c7274ab9..dos-exec-001a-gate1-correction-1-candidate
node pilots/dos-exec-001a/validate.mjs --browser
node pilots/dos-exec-001a/validate.mjs --final
npm run validate:docs
npm run validate:privacy
npm run verify
```

Preview separately:

```powershell
& 'C:\dev\davidos\node_modules\.bin\vite.cmd' 'pilots/dos-exec-001a/site' --host 127.0.0.1 --port 4175
```

Open `http://127.0.0.1:4175/` only in an isolated local browser context.
Do not navigate to a public host or use real browser data.

## Required review questions

### Ancestry and scope

- Is the corrected candidate exactly one child of
  `bc8dc3fcc617b8651ef2de9d02f7aa943dbef4f1` with no amended or
  rewritten original history?
- Is the correction delta a subset of the authorized 15 files, and is
  the cumulative base-to-candidate set still exactly those 15 files?
- Did the correction avoid dependencies, network/provider behavior,
  real data, generalized framework work, and any file outside scope?

### Blocking corrections

- At each of 320, 360, 375, 390, 414, 480, 540, 600, 620, 640, 768,
  800, 820, 900, 1024, and 1440 CSS pixels, is the hero product name and
  descriptor fully readable without oven-note overlap or truncation?
- Do `evidence/mobile.png` and `evidence/desktop.png` match the corrected
  candidate and the hashes recorded in `VALIDATION_REPORT.md`?
- Does the report explicitly withdraw/supersede the inaccurate original
  visual claim and state representative limitations honestly?

### Authorized related corrections

- Do the recorded normal-text contrast calculations meet WCAG AA?
- Are primary navigation targets measured at least 44 CSS pixels high?
- With JavaScript disabled, is the estimator visibly inactive and
  incapable of submitting, reloading, or adding a query string?
- Does `WORK_LOG.md` accurately limit `script.js` to the estimator?
- Is the 20-category requirement mapped directly above?
- Is the distinction between the `$58` menu cake and `$62` resale bundle
  clear?

### User value

- Is the diagnosis specific enough to inform a real future discovery?
- Is the offer clear enough to discuss?
- Are the resale ideas plausible but honestly bounded?
- Is the outreach draft direct, truthful, and usable?
- Is the website credible enough to adapt after fact verification?
- Is the outcome larger than the implementation machinery?

### Website quality

- Does the page feel bakery-specific rather than templated?
- Do local navigation, assets, FAQ, and estimator work?
- Is every authorized width free of horizontal overflow?
- Can a keyboard user reach and operate every primary interaction?
- Are focus, form labels, headings, landmarks, and status output sound?
- Does every synthetic price, quote, schedule, contact, and commercial
  assumption remain clearly framed?

### Scope and safety

- Did any real bakery identity or detail enter the package?
- Is there any secret, API, network request, storage, tracking, provider,
  message, checkout, payment, deployment, or publication behavior?
- Did any DavidOS runtime, dependency, workflow, configuration, or
  unrelated file change?
- Is the work still one package for one fictional bakery and one site?

### Evidence quality

- Do reported commands and counts match independent results?
- Do screenshots match the candidate?
- Are known limitations material and visible?
- Is any success claim based only on passing tests rather than user
  value?
- Do the full required command suite and screenshot byte-regeneration
  check pass independently?

## Expected review report

Report:

1. exact repository;
2. exact branch;
3. exact original-parent SHA;
4. exact peeled corrected-candidate SHA;
5. exact correction-delta and cumulative file lists;
6. files inspected;
7. commands independently run and outcomes;
8. hero results at every authorized width;
9. screenshot hash comparison and visual findings;
10. contrast, touch-target, no-JS, and documentation findings;
11. blocking findings;
12. non-blocking findings;
13. evidence gaps;
14. user-value reassessment;
15. one allowed stage-appropriate verdict;
16. explicit statement that no edits or live actions occurred.

Stage-appropriate verdicts are:

- `APPROVE WITH NON-BLOCKING NOTES`
- `CHANGES REQUIRED`
- `NOT READY`
- `INSUFFICIENT EVIDENCE`

This packet prepares review; it does not claim that independent review
has already occurred.
