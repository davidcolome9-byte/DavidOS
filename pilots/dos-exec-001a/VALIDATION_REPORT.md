# DOS-EXEC-001A — Fictional Pilot Validation Report

> **Synthetic local artifact:** This report covers the fictional
> Starwhisk Bakehouse prototype only. It does not validate a real
> business, production system, live service, published site, customer
> claim, or commercial result.

**Candidate state:** Gate 1 Correction Round 1 on original candidate
`bc8dc3fcc617b8651ef2de9d02f7aa943dbef4f1`, cumulative exact 15-file
allowlist

**Validation status:** **PASS — ready for a corrected local candidate
commit and focused independent rereview.**

## Correction history

The original candidate received an independent `CHANGES REQUIRED`
verdict and a 77/100 user-value assessment. The review found that the
decorative oven-note card overlapped or truncated the hero product name
and descriptor at intermediate and compact widths. It also found that
this report and `WORK_LOG.md` overstated the visual inspection result.

Correction Round 1 preserves the original commit and addresses that
record instead of rewriting it:

- the hero display cards enter normal document flow at 900 CSS pixels
  and below, so the oven note cannot cover the product name or
  descriptor;
- the browser check now measures occlusion and clipping at all 16
  authorized widths and two representative text-zoom cases;
- three small-label color pairs now meet WCAG AA normal-text contrast;
- primary navigation targets are measured at no less than 44 CSS
  pixels;
- the estimator is a non-submitting control group with an explicit,
  inactive no-JavaScript state;
- both screenshots were regenerated and independently rendered twice
  per run to require byte-identical output.

The original broad visual claim was inaccurate and is superseded by the
measured and visually inspected results below.

## Validation scope

- exact changed-file allowlist;
- required output presence and synthetic labeling;
- local page load, assets, navigation, and interaction;
- rendering at 16 exact widths plus representative text zoom;
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
- Every primary navigation link measured at least 44 CSS pixels high at
  every tested width.
- With JavaScript disabled, the inactive disclosure is visible, the
  calculate button does not change the result, and the URL is neither
  reloaded nor given a query string.

Calculated contrast ratios use WCAG relative-luminance math:

| Normal-text use | Foreground | Tested background | Ratio | Result |
|---|---|---|---:|---|
| `.eyebrow` on cream | `#9A3E25` | `#FFF9ED` | 6.48:1 | PASS |
| `.card-kicker` on paper | `#9A3E25` | `#FFFDF8` | 6.69:1 | PASS |
| `.product-type` on darkest card gradient endpoint | `#4D5B39` | `#E9CAD4` | 4.83:1 | PASS |
| visit `.eyebrow` on plum | `#F4B75E` | `#5B273D` | 6.54:1 | PASS |

This is basic accessibility validation, not a formal WCAG conformance
audit or assistive-technology certification.

## Responsiveness validation

**PASS at every authorized viewport width:**

| Widths (CSS px) | Page/assets | Horizontal overflow | Hero name/descriptor | Oven-note occlusion | Nav target |
|---|---|---:|---|---|---|
| 320, 360, 375, 390, 414, 480, 540, 600, 620, 640, 768, 800, 820, 900, 1024, 1440 | PASS | 0 px | visible and within main card | none | ≥44 px |

Text-zoom stress checks also passed at 375 CSS pixels / 125% and 800 CSS
pixels / 150%, including no horizontal overflow, no hero-card
occlusion, and no product-name or descriptor clipping.

The regenerated 375×812 mobile and 1440×900 desktop screenshots were
visually inspected after the correction. At 375, the hero card and oven
note are separate stacked elements with readable text and visible space
between them. At 1440, the intended side-by-side editorial layout and
offset note remain intact. These are representative full-page captures,
not proof for untested browsers, operating-system font substitutions,
localization, assistive technologies, or arbitrary zoom combinations.

## Technical validation

| Command/check | Outcome |
|---|---|
| `node pilots/dos-exec-001a/validate.mjs --browser` | PASS — 16 exact widths, two text-zoom cases, two interaction captures, no-JS behavior, touch targets, occlusion/clipping, and byte-identical screenshot regeneration |
| `node pilots/dos-exec-001a/validate.mjs --final` | PASS — 13 authored + 2 generated files; exact allowlist and count |
| `git diff --check` | PASS — no whitespace errors |
| `npm run validate:docs` | PASS — 28 JSON files, 56 relative links, version and 40 documented commands consistent |
| `npm run validate:privacy` | PASS — 258 tracked files considered, 251 text files scanned, no findings |
| `npm run verify` | PASS — ESLint; 59 Vitest files / 926 tests; seed, privacy, and docs validators; TypeScript; Vite production build; service-worker stamp |
| Local link/asset check | PASS — every same-page target and referenced local asset resolves |
| Local runtime check | PASS — zero console errors, page errors, failed requests, or non-local requests at all 16 widths |

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

- `evidence/desktop.png` — SHA-256
  `C759B1363E48576FD2BCF46F638DD91B815738304F57A8C3FDC8FA9553C67E89`
- `evidence/mobile.png` — SHA-256
  `BE285BDBED577835789C1A185E5FA09ADEAEDBE9758F3F89B527FB5B376CCEDF`

For each output, the browser validator saved one full-page capture and
immediately rendered the same state again in memory; the two PNG byte
sequences matched exactly. The hashes above identify the corrected
files. They are local preview evidence only, not proof of deployment,
production behavior, or real-world performance.

## Limitations of validation

The exact width sweep materially improves responsive evidence but
remains bounded to headless Chromium, system fonts available on this
machine, 125% and 150% text-zoom samples, and English synthetic copy.
The checks cannot establish formal accessibility conformance,
device-wide browser compatibility, production security, real customer
usability, business viability, legal compliance, or accuracy of facts
that are intentionally fictional.
