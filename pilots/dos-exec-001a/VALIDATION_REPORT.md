# DOS-EXEC-001A — Fictional Pilot Validation Report

> **Synthetic local artifact:** This report covers the fictional
> Starwhisk Bakehouse prototype only. It does not validate a real
> business, production system, live service, published site, customer
> claim, or commercial result.

**Candidate state:** Staged pre-commit local worktree, exact 15-file
allowlist

**Validation status:** **PASS — ready for local candidate commit and
independent review.**

## Validation scope

- exact changed-file allowlist;
- required output presence and synthetic labeling;
- local page load, assets, navigation, and interaction;
- representative mobile and desktop rendering;
- basic accessibility and keyboard behavior;
- credential, real-business, external URL, provider, dependency, and
  unauthorized-integration boundaries;
- repository-established validation and verification commands.

## Accessibility validation

**PASS for the bounded basic checks.**

- Exactly one `h1`; header, primary navigation, main, sections, and
  footer use semantic elements.
- “Skip to main content” is the first keyboard target at both tested
  viewports.
- Product and quantity controls have visible associated labels.
- Estimator result uses `role="status"` and
  `aria-live="polite"`.
- Both primary logo images load and use empty alternative text because
  adjacent visible text carries the brand identity.
- The primary navigation, estimator, and first native FAQ disclosure
  were independently operated in headless Chromium using keyboard or
  accessible-role locators.
- CSS contains visible `:focus-visible` treatment and a
  `prefers-reduced-motion` override.
- No essential action depends on hover, drag, or color alone.

This is basic accessibility validation, not a formal WCAG conformance
audit or assistive-technology certification.

## Responsiveness validation

**PASS at both representative viewport sizes:**

| Viewport | HTTP/page load | Horizontal overflow | Navigation | Estimator | FAQ | Screenshot |
|---|---|---:|---|---|---|---|
| 375×812 mobile | PASS | 0 px | PASS | PASS, `$36` result | PASS by keyboard | `evidence/mobile.png` |
| 1440×900 desktop | PASS | 0 px | PASS | PASS, `$36` result | PASS by keyboard | `evidence/desktop.png` |

Visual inspection confirmed that the mobile layout stacks product,
rhythm, estimator, story, FAQ, visit, and footer content coherently. The
desktop layout preserves the intended editorial splits and product-card
grid. Both screenshots reflect the tested local page after the
estimator interaction.

## Technical validation

| Command/check | Outcome |
|---|---|
| `node pilots/dos-exec-001a/validate.mjs --browser` | PASS — 13 authored files plus 31 browser assertions across two viewports; screenshots generated |
| `node pilots/dos-exec-001a/validate.mjs --final` | PASS — 13 authored + 2 generated files; exact allowlist and count |
| `git diff --cached --check` | PASS — no whitespace errors |
| `npm run validate:docs` | PASS — 28 JSON files, 56 relative links, version and 40 documented commands consistent |
| `npm run validate:privacy` | PASS — 258 tracked files considered, 251 text files scanned, no findings |
| `npm run verify` | PASS — ESLint; 59 Vitest files / 926 tests; seed, privacy, and docs validators; TypeScript; Vite production build; service-worker stamp |
| Local link/asset check | PASS — every same-page target and referenced local asset resolves |
| Local runtime check | PASS — zero console errors, page errors, failed requests, or non-local requests at both viewports |

The isolated worktree reused the canonical clean repository's existing
`node_modules` through a temporary local junction. No install ran and no
manifest, lockfile, runtime dependency, or package configuration changed.
The first full-verify attempt correctly failed before test execution
because the isolated worktree did not initially expose those existing
dependencies. A later lint attempt identified missing file-local global
declarations in the two new JavaScript files; those declarations were
added within the allowlist before the final passing run.

## Content and scope validation

**PASS.**

- Starwhisk Bakehouse is labeled fictional at package and website level.
- Every evidence table, metric, quote, price, schedule, address, contact
  detail, and commercial assumption is synthetic or fictional.
- Contact details use `.example`, the reserved fictional
  `555-0100–0199` range, and `Exampletown, ZZ 00000`.
- No real-business research, owner, customer, review, claim, or private
  data appears.
- Credential-pattern scanning found no key-like material.
- The site contains no external URL, font, asset, network request,
  browser storage, analytics, submission, checkout, payment, provider,
  backend, hosting, or deployment behavior.
- No DavidOS runtime, dependency, source, test, workflow,
  configuration, seed, or operating-document file changed.
- The final set is exactly 15 files: 13 authored package/site files and
  two generated screenshots.

## Evidence

Generated screenshots:

- `evidence/desktop.png`
- `evidence/mobile.png`

These will be local preview evidence only, not proof of deployment or
real-world performance.

The full-page images were inspected visually after generation and found
to be coherent, readable, bakery-specific, and consistent with the
synthetic-use disclosures.

## Limitations of validation

The checks remain representative rather than exhaustive. They cannot
establish formal accessibility conformance, device-wide
browser compatibility, production security, real customer usability,
business viability, legal compliance, or accuracy of facts that are
intentionally fictional.
