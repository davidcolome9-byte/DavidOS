# DavidOS AI Tool Routing Doctrine

**Version:** 1.1\
**Effective date:** 2026-07-21 (current mapping and execution header adopted 2026-10-02)\
**Canonical repository path:** `docs/AI_TOOL_ROUTING.md`\
**Owner:** David\
**Change authority:** David approval required for any material routing change

**Document layers.** Sections 1–3, 6–12, 14–16 and the execution-header
rule in §2 are the STABLE DOCTRINE — role concepts, independence rules,
quota-fallback policy, gates, stop conditions, and templates that persist
across model generations and should rarely change. Sections 4, 5, 13 and
the closing list in §17 are the CURRENT MAPPING — the specific model/tool
bound to each stable role today — and are expected to change far more
often as models are released, retired, or reassigned. **Current role
mapping (§4, §5, §17) reviewed: 2026-10-02. Current model bindings in
§13 reviewed: 2026-10-02; its package-level program state was last
reviewed 2026-07-26 and is unchanged by that review.** The mapping
sections carry their own dates and are reviewed independently, so
reviewing this document means re-confirming whichever bindings the change
affects, not necessarily all of them. The stable sections do not need to
change on any review. Model names that appear in the repository's
historical records (DECISIONS, CURRENT_STATE, OPEN_LOOPS, reviews,
handoffs) are evidence and stay as written; only this document's CURRENT
statements are updated when a mapping changes.

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

### Mandatory execution header

Every meaningful Codex or Claude Code execution packet must begin with
these five fields, in this order:

```text
PLATFORM:
[Codex / Claude Code]

MODEL:
[exact selectable model]

EFFORT / INTELLIGENCE:
[exact selectable level]

WHY:
[one concise task-specific reason]

ESCALATE ONLY IF:
[observable condition justifying stronger routing]
```

The values come from the CURRENT mapping in §4.7. `ESCALATE ONLY IF` names an
observable condition (a documented blocker, a failed validation, conflicting
evidence), not a preference for more capability. The §16 package assignment
record is a different artifact and is not a substitute for this header; a
package prompt carries both.

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

*Current mapping reviewed: 2026-10-02 (owner-adopted). Role concepts
(Program Control, primary builder, escalation, independent reviewer,
arbitrator, mechanical support) are stable; the specific model bound to
each is the dated mapping below. Exact model and effort values for Codex
and Claude Code are in §4.7.*

### 4.1 Program Control

**Default tool/model:** ChatGPT (Program Control / Work room). The
2026-10-02 policy does not pin a ChatGPT model; use the current selectable
ChatGPT option suited to the work (§7 rule 8). The earlier "GPT-5.6
Thinking" binding is no longer asserted as current. David has not yet
approved a replacement ChatGPT binding (evidence gap, see §4.7).

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

**Default tool/model:** Claude Code using Sonnet 5.5 (High for normal
multi-file implementation; Medium for small safe edits, documentation, and
simple tests — see §4.7). Codex implementation uses GPT-6 Sol or GPT-6
Astra at the effort in §4.7.

**Use for:**

- governance and documentation packages;
- normal feature development;
- bounded refactors;
- test additions and regression repairs;
- UI and accessibility corrections;
- Git staging, commit, push, PR creation, CI monitoring, deployment, and closeout when explicitly authorized;
- correction passes arising from independent review.

**Restrictions:**

- The implementing model must not independently provide the final approval for its own implementation.
- It must stop for failed validation, unexpected repository state, security concerns, or authorization boundaries.
- It must not broaden a narrow package merely because related improvements are visible.

### 4.3 Frontier implementation escalation

**Default tool/model:** Claude Code using Opus 5.5 / High (Opus 5.5 / Extra only if High is genuinely insufficient). Codex equivalent for major architecture: GPT-6 Astra / Extra High. Fable 5.1 only when the toughest available Claude capability genuinely warrants its usage-credit cost. All values: §4.7.

**Use only for:**

- persistence architecture;
- concurrency and race conditions;
- storage migrations;
- recovery systems;
- large schema transitions;
- difficult cross-cutting refactors;
- problems the default implementation model attempted but could not safely resolve;
- technically difficult packages where failure could cause data loss or corruption.

**Do not use for:** ordinary documentation, routine UI polish, mechanical tests, branch inventory, simple backlog maintenance, or work the default implementation model can safely complete.

**Escalation rule:** Escalate only when Program Control explicitly classifies the task as high-risk architecture or when the default implementation model returns a documented blocker requiring stronger reasoning. Diagnose the failure before escalating (§7 rule 7).

**Independence rule:** A frontier Claude implementation should be independently reviewed by Codex (§4.4), not only by another Claude model.

### 4.4 Primary independent reviewer

**Default tool/model:** Codex Auto Review when appropriate; otherwise a separate Codex GPT-6 Astra / High review context. This is the owner-adopted review route for Claude-built work. The 2026-10-02 policy does not map a reviewer for a Codex-built candidate: the general independence requirement (§6) applies, and the reviewer is assigned separately under current authority. Antigravity/Gemini is not currently a designated reviewer: David has not approved a current Gemini mapping (§4.7), and earlier Gemini review records remain historical evidence.

**Use for:**

- read-only adversarial review;
- architecture challenge;
- documentation contradiction review;
- privacy and sensitive-data review;
- staged-diff or candidate-SHA review;
- independent re-running of verification and Playwright;
- assessing whether a Claude or Codex candidate is ready for commit or merge consideration.

**Restrictions:**

- Default review mode is strictly read-only.
- It must not create planning files, edit code, or “helpfully” fix findings during an independent review.
- It must distinguish blocking findings, non-blocking findings, known limitations, evidence gaps, and unverified claims.
- It must report the exact candidate SHA or state reviewed.
- Its repository-status wording must be checked against actual Git output.

### 4.5 Surgical code reviewer and arbitrator

**Default tool/model:** OpenAI Codex using GPT-6 Astra / High (GPT-6 Astra / Extra High for serious red-team review with conflicting evidence or high consequence; §4.7)

**Use for:**

- narrow adversarial code review;
- disputed findings between reviewers or between a builder and a reviewer;
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

**Default tool/model:** Claude Code using Haiku 4.5 / Medium for search, file lookup, and narrow inspection; Codex using GPT-6 Luna / Low for repository lookup, file discovery, and mechanical inspection. Small safe edits, documentation, and simple tests use Sonnet 5.5 / Medium (Claude Code) or GPTReserve / GPT-6 Sol / Medium (Codex). The former Gemini Flash binding is not currently mapped (§4.7). All values: §4.7.

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

### 4.7 Execution-platform routing (CURRENT, owner-adopted 2026-10-02)

This subsection is the current model and effort selection for Codex and
Claude Code. It does not expand authority: platform, model, and effort
choices never change what an AI may do (§9, §7 rule 9). Every meaningful
execution packet records its choice in the §2 header.

**Codex.** Selectable models: GPT-6 Astra, GPT-6 Sol, GPT-6 Luna,
GPTReserve, GPT-5.6 Sol, GPT-5.6 Terra, GPT-5.6 Luna, GPT-5.5, Codex Auto
Review. Intelligence levels: Low, Medium, High, Extra High, Max, Ultra.

| Task class | Model / level |
|---|---|
| Simple repository lookup, file discovery, mechanical inspection | GPT-6 Luna / Low |
| Straightforward low-risk implementation, documentation, or simple test | GPTReserve or GPT-6 Sol / Medium |
| Normal bounded coding | GPT-6 Sol / Medium |
| Meaningful multi-file implementation | GPT-6 Astra / High |
| Gameplay/system implementation | GPT-6 Astra / High |
| Repository-wide audit | GPT-6 Astra / High |
| Difficult debugging or performance diagnosis | GPT-6 Astra / High |
| Major architecture or broad refactor | GPT-6 Astra / Extra High |
| Serious red-team review with conflicting evidence or high consequence | GPT-6 Astra / Extra High |
| Independent code review | Prefer Codex Auto Review when appropriate; otherwise a separate GPT-6 Astra / High review context |

Max: only after High or Extra High proves insufficient, or an exceptional
reasoning burden is established. Ultra: only for exceptional unresolved
engineering problems after lower settings have failed or are demonstrably
insufficient. Older models (GPT-5.6 Sol/Terra/Luna, GPT-5.5): not used by
default; require a specific demonstrated advantage or fallback reason.

**Claude Code.** Selectable models: Opus 5.5, Sonnet 5.5, Fable 5.1, Haiku
4.5, and older Opus/Sonnet versions. Effort levels: Low, Medium, High,
Extra, Max, Ultracode.

| Task class | Model / level |
|---|---|
| Simple search, file lookup, narrow inspection | Haiku 4.5 / Medium |
| Small safe edit, documentation, simple test | Sonnet 5.5 / Medium |
| Normal multi-file implementation | Sonnet 5.5 / High |
| Repository audit, game-flow reconstruction | Sonnet 5.5 / High |
| Performance profiling, difficult debugging | Sonnet 5.5 / High |
| Substantial system implementation | Sonnet 5.5 / High |
| Complex architecture, major refactor | Opus 5.5 / High |
| Serious red-team audit, conflicting evidence, difficult adjudication | Opus 5.5 / High |
| High is genuinely insufficient | Opus 5.5 / Extra |

Fable 5.1: only when the toughest available Claude capability genuinely
warrants its usage-credit cost. Max: only after lower levels prove
insufficient or an exceptional reasoning burden exists. Ultracode: only for
exceptional repository-wide engineering problems after normal approaches
have failed. Older models: not used by default without a specific
compatibility, behavioral, or fallback reason.

**Not mapped by the 2026-10-02 policy (evidence gaps).** The owner-supplied
policy establishes the Codex and Claude Code mappings above only. It does
not approve a current Gemini/Antigravity mapping, and it does not name a
current ChatGPT model for Program Control. Earlier bindings (Gemini 3.1 Pro,
Gemini 3.5 Flash, GPT-5.6 Thinking) are therefore not asserted as current
anywhere in this document, no replacement has been invented, and no newer
accepted mapping exists in repository evidence. Until David approves a
mapping for either, treat it as current-unknown: do not assign Gemini as the
designated reviewer or mechanical-support model, and do not pin a ChatGPT
model in a package record. Historical records that cite those models remain
evidence and are not modified.

---

## 5. Task classification and routing matrix

| Task class | Primary tool/model | Independent review | Escalation |
|---|---|---|---|
| Program strategy, package design, decision support | ChatGPT Program Control (model not pinned, §4.1) | Codex GPT-6 Astra / High or Claude Opus 5.5 / High when needed | Opus 5.5 / High for deep technical consultation |
| Documentation and governance | Claude Code Sonnet 5.5 (Medium for small edits, High for multi-file or consequential work) | Codex Auto Review or separate GPT-6 Astra / High | Codex GPT-6 Astra / High for disputed technical claims |
| Standard implementation | Claude Code Sonnet 5.5 / High, or Codex GPT-6 Sol / Medium (bounded) or GPT-6 Astra / High (multi-file) | Codex Auto Review or separate GPT-6 Astra / High for Claude-built work; for a Codex build, assigned separately (§4.4, §6) | Opus 5.5 / High if the default is blocked |
| High-risk storage, migration, recovery, concurrency | Claude Code Opus 5.5 / High (Codex GPT-6 Astra / Extra High for major architecture) | Codex preferred (Auto Review or separate GPT-6 Astra / High) | David decision if reviewers disagree |
| UI, accessibility, mobile polish | Claude Code Sonnet 5.5 / High | Codex Auto Review or separate GPT-6 Astra / High | Codex for code-specific disputes |
| Mechanical inventory or repetitive cleanup | Haiku 4.5 / Medium (Claude Code) or GPT-6 Luna / Low (Codex) | Sonnet 5.5 / Medium spot-check | None |
| Privacy and security review | Independent reviewer per §4.4 and §6; serious red-team classification (GPT-6 Astra / Extra High or Opus 5.5 / High per §4.7) when consequence is high | Codex for code-level confirmation | Opus 5.5 / High or GPT-6 Astra / Extra High for complex correction |
| Test reliability and harness repair | Claude Code Sonnet 5.5 / High | Codex Auto Review or separate GPT-6 Astra / High | Opus 5.5 / High only for complex environment interactions |
| Release execution after authorization | Claude Code Sonnet 5.5 (effort per §4.7 classification) | Program Control verifies report | Stop on any mismatch |
| Live acceptance | Claude Code Sonnet 5.5 in isolated synthetic context | Program Control reviews evidence | Never use David’s real browser data |
| Research outside the repository | ChatGPT Program Control (model not pinned, §4.1) | Primary sources required | Second-source review by a different model family |

Gemini/Antigravity has no current mapping and appears in no row (§4.7).

---

## 6. Independence rules

1. The primary builder must not be the sole final reviewer.
2. Use a different model family, or at least a separate review context, for independent review whenever practical.
3. The specific reviewer for a candidate is assigned under the current mapping (§4.4, §4.7) and current authority; this section fixes no pairing of a provider or model to a builder.
4. Self-review may improve a candidate, but it does not satisfy the independent-review gate.
5. Reviewers operate read-only unless Program Control explicitly converts the session into a correction session.
6. The reviewer must inspect the exact candidate SHA, staged diff, or explicitly identified working-tree state.
7. “Tests passed” is not enough. The reviewer must state which tests ran, on which SHA or state, and what remains untested.
8. Model confidence never replaces repository evidence.

---

## 7. Usage-aware routing

Quota percentages are not directly comparable across products. Treat them as availability signals only.

### Healthy availability

- use the default routing matrix;
- do not waste frontier models on routine tasks;
- preserve at least one independent reviewer with sufficient quota.

### Reduced availability

- keep Program Control unchanged;
- move standard implementation between Claude Code (Sonnet 5.5) and Codex (GPT-6 Sol / Astra) only for bounded, low-to-medium-risk work;
- preserve independent review by assigning Codex or a different model family;
- do not use low-cost tiers (Haiku 4.5, GPT-6 Luna, Low effort) for high-risk architecture.

### Critical reserve

- reserve the model for one surgical question;
- do not start a long package;
- do not ask it to repeat completed analysis;
- prepare a precise handoff before switching tools.

### Unavailable model

- choose the next safe model from this doctrine;
- do not silently downgrade a high-risk package;
- postpone the package rather than assigning it to an unsuitable model.

### General routing rules

1. Never default to maximum model strength or reasoning.
2. Use the cheapest configuration reasonably likely to complete the task reliably.
3. Escalate in measured steps.
4. Full audits normally warrant High, not automatically Max, Ultra, or Ultracode.
5. Multi-agent work must earn its coordination and quota cost.
6. Do not repeat completed work merely to consume quota.
7. Diagnose failures before escalating model strength.
8. Current UI/selectable options control when model names change.
9. Platform and model changes never expand authority.
10. Preserve repository, privacy, spending, credential, deployment, destructive-action, and approval boundaries regardless of routing.

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

*Current mapping reviewed: 2026-07-26. This whole section is the DATED
package-level mapping (§4's note above applies here too) — expect it to
change every time the active package changes, independent of the stable
doctrine in the other sections.*

### Current program direction

Continue DavidOS development while prioritizing stabilization and
governance over new integrations. The OL-032 storage-capacity direction
now has this recorded disposition:

- **Option 1 — implemented, released, and closed** through DOS-STAB-002A
  Stage 1.
- **Option 2 — rejected.**
- **Option 3 — architecture planning and independent review complete;
  bounded NO-GO for implementation under the current localStorage design
  and current safety constraints.**
- **Option 4 / IndexedDB — deferred and separately
  authorization-bound.**

The Option 3 no-go reflects a residual destructive false-positive risk in
diagnosing quota-shaped browser failures, not an implementation failure;
no Option 3 implementation occurred.

### Current active package

**No implementation package is active.**

DOS-GOV-003A — Program Baseline and Authorization Reconciliation is
**COMPLETE / MERGED / LOCALLY CONFIRMED** through PR #30. Its final
`main` SHA is
`2c4de769b5f3ea5144b5432c3f6cc519157ccbf8`. Its former Gate 1
authorization is closed and grants no continuing authority.

### Next required action

Program Control must select and David must explicitly authorize the next
bounded package. No backlog status, roadmap entry, prior package,
integration foundation, or automatic workflow activates that package.

### Program baseline carried by this package

- No implementation package is active.
- DOS-GOV-003A is complete, merged through PR #30 at
  `2c4de769b5f3ea5144b5432c3f6cc519157ccbf8`, locally confirmed, and
  closed. Its former authorization does not carry forward.
- No Option 3 work remains active.
- Export plus reset remains the supported emergency recovery guidance
  when a persist-first save cannot fit.
- Option 4 remains deferred and separately approval-bound.
- The next program package must be selected and explicitly authorized
  separately; it must not be inferred from OL-032.
- Portfolio authority follows the categorized pointer index in
  `docs/CURRENT_STATE.md`: DavidOS coordinates but does not absorb or
  duplicate the authoritative Truth of Handoff OS, specialist
  applications/workflows, engineering/control infrastructure, supporting
  services, experiments, or historical evidence. A taxonomy entry does
  not activate a package or grant implementation authority; product
  domains, agent names, seed projects, and roadmap headings do not by
  themselves create additional portfolio authorities.
- DOS-CTL-001A Phase 0 Revision 1 Correction Round 3 is complete,
  approved, Gate 1 closed, frozen, and synthetic-only. Real DavidOS
  execution and DOS-CTL Phase 1 are not authorized.
- A roadmap entry, `Ready` backlog marker, existing integration
  foundation, or auto-deploy workflow is never standing package
  authorization.
- Program Control: ChatGPT (model not pinned; §4.1)
- Independent review: separately assigned when a future package requires
  it
- Implementation: **not authorized**
- Push, pull request, merge, deployment, and live verification:
  **not authorized**

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

A Codex or Claude Code execution packet also begins with the five-field
execution header from §2; this record does not replace it.

---

## 17. Final rule

Use the cheapest and fastest model that can safely complete the work, but never downgrade independence, data safety, privacy, or authorization controls to save quota.

When uncertain:

- ChatGPT Program Control controls;
- Sonnet 5.5 (Claude Code) and the GPT-6 models (Codex) build, per §4.7;
- Codex Auto Review or a separate GPT-6 Astra / High context reviews Claude-built work, Codex arbitrates, and a Codex build's reviewer is assigned separately (§6);
- Opus 5.5 handles frontier architecture (Fable 5.1 only when its cost is warranted);
- Haiku 4.5 and GPT-6 Luna handle mechanical support;
- Gemini has no current mapping until David approves one;
- David authorizes irreversible actions.
