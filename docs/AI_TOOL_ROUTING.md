# DavidOS AI Tool Routing Doctrine

**Version:** 1.0\
**Effective date:** 2026-07-21\
**Canonical repository path:** `docs/AI_TOOL_ROUTING.md`\
**Owner:** David\
**Change authority:** David approval required for any material routing change

**Document layers.** Sections 1–3 and 5–12 and 14–17 are the STABLE
DOCTRINE — role concepts, independence rules, quota-fallback policy,
gates, stop conditions, and templates that persist across model
generations and should rarely change. Sections 4 and 13 are the CURRENT
MAPPING — the specific model/tool bound to each stable role today — and
are expected to change far more often as models are released, retired,
or reassigned. **Current mapping reviewed: 2026-07-21.** Reviewing this
document means re-confirming section 4/13 bindings still make sense;
sections 1–3/5–12/14–17 do not need to change on every review.

---

## 1. Purpose

This document is the authoritative operating policy for choosing and assigning AI models and coding tools across DavidOS.

Its goals are to:

- prevent tool-role drift between conversations and coding sessions;
- use each model where it provides the most value;
- preserve scarce model quota for the work that truly needs it;
- maintain independent review;
- prevent one model from implementing, approving, merging, and closing its own work without external challenge;
- keep Program Control, implementation, review, release, and documentation responsibilities clearly separated;
- provide a stable fallback order when a preferred model is unavailable.

Individual package prompts may narrow a role, but they must not weaken the safeguards here without David’s explicit approval.

---

## 2. Mandatory access rule

Before any AI starts DavidOS work, it must read, in this order:

1. `AGENTS.md`
2. `docs/AI_TOOL_ROUTING.md`
3. `docs/CURRENT_STATE.md`
4. `docs/OPEN_LOOPS.md`
5. the active package brief or handoff
6. relevant architecture, data-model, security, integration, or troubleshooting documents

No conversation summary, model memory, or old handoff outranks these current tracked files.

Every coding prompt should begin with:

> Before acting, read AGENTS.md, docs/AI_TOOL_ROUTING.md, docs/CURRENT_STATE.md, docs/OPEN_LOOPS.md, and the active package brief. Treat the repository files as authoritative over conversational memory. Stop and report any contradiction before changing code.

---

## 3. Source-of-truth order

For model selection and package execution, use this authority order:

1. David’s latest explicit instruction
2. This file: `docs/AI_TOOL_ROUTING.md`
3. `AGENTS.md`
4. The current package authorization and stop conditions
5. `docs/CURRENT_STATE.md`
6. `docs/OPEN_LOOPS.md`
7. Version-controlled architecture and decision records
8. A current, verified handoff
9. Conversation memory and historical chat context

When two sources conflict, use the safer and more restrictive interpretation, stop if the conflict affects authorization or data safety, and surface the contradiction to Program Control.

---

## 4. Core operating roles

*Current mapping reviewed: 2026-07-21. Role concepts (Program Control,
primary builder, escalation, independent reviewer, arbitrator, mechanical
support) are stable; the specific model bound to each is the dated
mapping below.*

### 4.1 Program Control

**Default tool/model:** ChatGPT using GPT-5.6 Thinking

**Responsibilities:**

- reconstruct current project state;
- choose the next package;
- define scope, exclusions, gates, and stop conditions;
- route work to the correct coding and review tools;
- evaluate implementation and review reports;
- decide whether a package is ready for David’s authorization;
- maintain continuity between rooms and tools;
- produce exact PowerShell navigation and launch commands;
- prevent unauthorized merge, deployment, deletion, or scope expansion.

**Program Control does not normally:**

- serve as the primary local repository editor;
- substitute planning confidence for executed test evidence;
- authorize a merge on David’s behalf;
- treat a model’s self-report as proof without checking evidence.

### 4.2 Default implementation model

**Default tool/model:** Claude Code using Sonnet 5 High

**Use for:**

- governance and documentation packages;
- normal feature development;
- bounded refactors;
- test additions and regression repairs;
- UI and accessibility corrections;
- Git staging, commit, push, PR creation, CI monitoring, deployment, and closeout when explicitly authorized;
- correction passes arising from independent review.

**Restrictions:**

- Sonnet must not independently provide the final approval for its own implementation.
- It must stop for failed validation, unexpected repository state, security concerns, or authorization boundaries.
- It must not broaden a narrow package merely because related improvements are visible.

### 4.3 Frontier implementation escalation

**Default tool/model:** Claude Code using Fable 5

**Use only for:**

- persistence architecture;
- concurrency and race conditions;
- storage migrations;
- recovery systems;
- large schema transitions;
- difficult cross-cutting refactors;
- problems Sonnet attempted but could not safely resolve;
- technically difficult packages where failure could cause data loss or corruption.

**Do not use for:** ordinary documentation, routine UI polish, mechanical tests, branch inventory, simple backlog maintenance, or work Sonnet can safely complete.

**Escalation rule:** Fable is used only when Program Control explicitly classifies the task as high-risk architecture or when Sonnet returns a documented blocker requiring stronger reasoning.

**Independence rule:** A Fable implementation should be independently reviewed by Gemini Pro or Codex, not only by another Claude model.

### 4.4 Primary independent reviewer

**Default tool/model:** Antigravity using Gemini 3.1 Pro

**Use for:**

- read-only adversarial review;
- architecture challenge;
- documentation contradiction review;
- privacy and sensitive-data review;
- staged-diff or candidate-SHA review;
- independent re-running of verification and Playwright;
- assessing whether a Sonnet or Fable candidate is ready for commit or merge consideration.

**Restrictions:**

- Default review mode is strictly read-only.
- It must not create planning files, edit code, or “helpfully” fix findings during an independent review.
- It must distinguish blocking findings, non-blocking findings, known limitations, evidence gaps, and unverified claims.
- It must report the exact candidate SHA or state reviewed.
- Its repository-status wording must be checked against actual Git output.

### 4.5 Surgical code reviewer and arbitrator

**Default tool/model:** OpenAI Codex

**Use for:**

- narrow adversarial code review;
- disputed findings between Claude and Gemini;
- one-function or one-module correctness questions;
- concurrency interleavings;
- migration logic;
- staged-diff review;
- targeted debugging;
- final narrow review after a correction pass.

**Quota rule:**

- Above 25% available: normal bounded review packages are allowed.
- Between 10% and 25%: use only for targeted review or correction.
- Below 10%: reserve for one surgical, high-value question.
- Do not spend the final reserve on broad audits, formatting, or routine documentation.

### 4.6 Mechanical and low-risk support

**Default tool/model:** Antigravity using Gemini 3.5 Flash

**Use for:**

- file inventory;
- simple searches;
- repetitive formatting;
- mechanical documentation changes;
- low-risk test expectation updates;
- summaries;
- simple backlog cleanup;
- generating candidate lists for a stronger model to verify.

**Do not use as sole authority for:** storage architecture, migrations, destructive actions, security-sensitive integrations, import/reset/recovery logic, final release approval, or privacy-sensitive automation.

---

## 5. Task classification and routing matrix

| Task class | Primary tool/model | Independent review | Escalation |
|---|---|---|---|
| Program strategy, package design, decision support | GPT-5.6 Thinking | Gemini Pro or Codex when needed | Fable only for deep technical consultation |
| Documentation and governance | Sonnet 5 High | Gemini 3.1 Pro | Codex for disputed technical claims |
| Standard implementation | Sonnet 5 High | Gemini 3.1 Pro | Fable if Sonnet is blocked |
| High-risk storage, migration, recovery, concurrency | Fable 5 | Codex preferred, Gemini Pro acceptable | David decision if reviewers disagree |
| UI, accessibility, mobile polish | Sonnet 5 High | Gemini 3.1 Pro | Codex for code-specific disputes |
| Mechanical inventory or repetitive cleanup | Gemini 3.5 Flash or Sonnet | Sonnet or Gemini Pro spot-check | None |
| Privacy and security review | Gemini 3.1 Pro | Codex for code-level confirmation | Fable for complex correction |
| Test reliability and harness repair | Sonnet 5 High | Codex or Gemini 3.1 Pro | Fable only for complex environment interactions |
| Release execution after authorization | Sonnet 5 High | Program Control verifies report | Stop on any mismatch |
| Live acceptance | Sonnet or Gemini Pro in isolated synthetic context | Program Control reviews evidence | Never use David’s real browser data |
| Research outside the repository | GPT-5.6 Thinking | Primary sources required | Gemini Pro for second-source review |

---

## 6. Independence rules

1. The primary builder must not be the sole final reviewer.
2. Use a different model family for independent review whenever practical.
3. A Claude implementation should normally be reviewed by Gemini Pro or Codex.
4. A Gemini implementation should normally be reviewed by Codex or Claude.
5. A Codex implementation should normally be reviewed by Gemini Pro or Claude.
6. Self-review may improve a candidate, but it does not satisfy the independent-review gate.
7. Reviewers operate read-only unless Program Control explicitly converts the session into a correction session.
8. The reviewer must inspect the exact candidate SHA, staged diff, or explicitly identified working-tree state.
9. “Tests passed” is not enough. The reviewer must state which tests ran, on which SHA or state, and what remains untested.
10. Model confidence never replaces repository evidence.

---

## 7. Usage-aware routing

Quota percentages are not directly comparable across products. Treat them as availability signals only.

### Healthy availability

- use the default routing matrix;
- do not waste frontier models on routine tasks;
- preserve at least one independent reviewer with sufficient quota.

### Reduced availability

- keep Program Control unchanged;
- move standard implementation from Sonnet to Gemini Pro only for bounded, low-to-medium-risk work;
- preserve independent review by assigning Codex or a different model family;
- do not use Flash for high-risk architecture.

### Critical reserve

- reserve the model for one surgical question;
- do not start a long package;
- do not ask it to repeat completed analysis;
- prepare a precise handoff before switching tools.

### Unavailable model

- choose the next safe model from this doctrine;
- do not silently downgrade a high-risk package;
- postpone the package rather than assigning it to an unsuitable model.

---

## 8. DavidOS two-gate execution model

### Gate 1

Gate 1 may include, when authorized:

- implementation;
- tests;
- internal correction;
- independent read-only review;
- evidence collection;
- artifact archive;
- commit;
- push;
- PR creation;
- CI;
- pre-merge audit.

Gate 1 must stop before merge unless David explicitly authorizes Gate 2.

### Gate 2

Gate 2 begins only after David explicitly authorizes merge.

It may include:

- merge;
- post-merge CI;
- deployment;
- isolated live verification;
- evidence archival;
- documentation closeout;
- closeout PR;
- final package closure.

### Mandatory stop conditions

Every tool must stop for:

- wrong repository, branch, worktree, base, or candidate SHA;
- unexpected modified or untracked files;
- failed tests or CI;
- failed privacy or security validation;
- merge conflicts;
- evidence that live production differs from the intended SHA;
- data-safety uncertainty;
- authorization ambiguity;
- a request to merge, deploy, delete, or broaden scope without authorization.

---

## 9. Authorization boundaries

Only David may authorize:

- merge;
- deployment when not already included in explicit Gate 2 authorization;
- destructive repository cleanup;
- branch or worktree deletion;
- new runtime dependencies;
- material schema changes;
- storage-layer replacement;
- new off-device data flows;
- wider OAuth permissions;
- credential storage;
- autonomous execution;
- changes to the safety or approval model;
- closure of a Requires-David product decision.

No model may infer authorization from enthusiasm, silence, or a prior unrelated approval.

---

## 10. Repository and terminal safety

Every coding instruction must include exact PowerShell commands to enter the correct directory and launch the service.

Before editing, the coding tool must verify:

```powershell
Get-Location
git status --short --branch
git branch --show-current
git rev-parse HEAD
git worktree list
git remote -v
```

For an existing package, it must compare the actual branch and SHA with the expected values in the package brief.

Never:

- run simultaneous writable agents against the same worktree;
- use force-push unless separately authorized;
- use destructive reset, clean, checkout, or branch deletion to “fix” an unexpected state;
- stage broad changes without first inventorying them;
- commit personal, temporary, local, report, coverage, screenshot, or model-settings files.

---

## 11. Review output standard

Every independent review must report:

1. exact repository;
2. exact branch;
3. exact candidate SHA or working-tree state;
4. files inspected;
5. tests independently run;
6. results and counts;
7. blocking findings;
8. non-blocking findings;
9. evidence gaps;
10. package verdict;
11. explicit statement that no edits were made.

Allowed verdicts:

- `READY FOR CANDIDATE COMMIT`
- `READY FOR PUSH AND PR`
- `READY FOR DAVID MERGE AUTHORIZATION`
- `APPROVE WITH NON-BLOCKING NOTES`
- `CHANGES REQUIRED`
- `NOT READY`
- `INSUFFICIENT EVIDENCE`

The verdict must match the actual stage of the package.

---

## 12. Fresh-room and handoff protocol

Create a fresh Program Control or coding instance when:

- a major package is fully closed;
- the conversation contains multiple completed packages and the active state becomes hard to distinguish;
- the model confuses current and historical SHAs, branches, or authorization;
- the working prompt or handoff becomes too large to verify reliably;
- a tool switch is required because of quota;
- a new package has materially different architecture or risk.

Every handoff must contain:

- current date;
- repository and worktree paths;
- current branch and SHA;
- stable `main` SHA;
- active package ID and objective;
- completed work;
- unresolved findings;
- test status;
- authorization already granted;
- actions explicitly not authorized;
- exact next step;
- model routing assignment under this doctrine.

A fresh room must read this doctrine before acting.

---

## 13. Current strategic routing

*Current mapping reviewed: 2026-07-21. This whole section is the DATED
package-level mapping (§4's note above applies here too) — expect it to
change every time the active package changes, independent of the stable
doctrine in the other sections.*

### Current program direction

Continue DavidOS development while prioritizing governance and stabilization over new integrations.

### Current next package

**DOS-GOV-002A — Authoritative State Reconciliation and OL-032 Decision Packet**

| Stage | Assigned tool/model |
|---|---|
| Program Control and package prompt | GPT-5.6 Thinking |
| Primary implementation | Claude Code, Sonnet 5 High |
| Independent read-only review | Antigravity, Gemini 3.1 Pro |
| Correction pass | Claude Code, Sonnet 5 High |
| Narrow re-review | Gemini 3.1 Pro |
| Commit, push, PR, CI, pre-merge report | Claude Code, Sonnet 5 High |
| Merge and release execution | Sonnet 5 High only after David authorization |
| Codex | Preserve for surgical disputes or post-reset review |
| Fable 5 | Preserve for DOS-STAB-002A or another high-risk architecture package |
| Gemini 3.5 Flash | Supporting inventory only |

### Next likely runtime package

**DOS-STAB-002A — Storage Capacity and Recovery Resilience**

Expected routing:

- Program Control: GPT-5.6 Thinking
- Primary implementation: Fable 5 or Sonnet 5 High, depending on the approved OL-032 design
- Independent review: Codex preferred
- Secondary adversarial review: Gemini 3.1 Pro
- Release execution: Sonnet 5 High after explicit authorization

---

## 14. Drift prevention

1. This file must be tracked in the repository.
2. `AGENTS.md` must link to it near the top and in its docs index.
3. Every package prompt must name this file as mandatory reading.
4. Google Drive may contain a pointer or mirror, but the repository version is authoritative.
5. Material changes require David approval, a dated decision entry, and correction of conflicting handoffs or pointers.
6. Review this file whenever a default model changes, quota structure materially changes, the two-gate process changes, autonomous execution is introduced, or a new coding environment joins the workflow.

---

## 15. Minimal AGENTS.md pointer

Add this near the top of `AGENTS.md`:

> **AI tool routing:** Before selecting a model, assigning implementation, or beginning review, read `docs/AI_TOOL_ROUTING.md`. It is the authoritative model-role, independence, quota, and gate-routing policy for DavidOS.

Add this to the docs index:

- `docs/AI_TOOL_ROUTING.md` — authoritative model selection, implementation/review separation, quota-aware routing, and two-gate execution policy

---

## 16. Package assignment record template

```text
PACKAGE:
RISK CLASS:
PROGRAM CONTROL:
PRIMARY BUILDER:
INDEPENDENT REVIEWER:
ESCALATION MODEL:
MECHANICAL SUPPORT:
GATE 1 AUTHORIZATION:
GATE 2 AUTHORIZATION:
STOP CONDITIONS:
QUOTA CONSTRAINTS:
EXPECTED REPOSITORY:
EXPECTED WORKTREE:
EXPECTED BRANCH:
EXPECTED BASE SHA:
EXPECTED CANDIDATE STATE:
```

---

## 17. Final rule

Use the cheapest and fastest model that can safely complete the work, but never downgrade independence, data safety, privacy, or authorization controls to save quota.

When uncertain:

- GPT-5.6 controls;
- Sonnet builds;
- Gemini Pro reviews;
- Codex arbitrates;
- Fable handles frontier architecture;
- Flash handles mechanical support;
- David authorizes irreversible actions.
