# OL-032 — Storage Capacity Decision Packet

> **DECISION RECORDED 2026-07-22 — see [§7](#7-decision-recorded-2026-07-22).**
> David selected **Option 5** (the staged combination). **Stage 1 = Option 1**
> is implemented under DOS-STAB-002A. **Option 2 is rejected.** **Option 3** is
> a separate follow-on plan to be scoped after Stage 1 is independently
> reviewed. **Option 4** remains deferred and separately approval-bound.
> Sections 1–6 below are the ORIGINAL decision packet, retained verbatim as the
> pre-decision analysis snapshot that informed this choice; where they say "no
> option has been selected" / "Requires David," read them as the state BEFORE
> 2026-07-22, now superseded by §7. Two further phrasings in §1–§6 are likewise
> superseded and must not be read as current: (a) §1's "Nothing is lost or
> corrupted" is accurate only about *stored* data — the last successfully
> committed generation stays protected and readable, but changes made only in
> memory since that commit are unsaved and are lost if the app closes before
> another save succeeds; and (b) statements tying a commit failure to the
> warning/critical storage level — since DOS-STAB-002A Stage 1 those levels
> (≥35% / ≥45% of measured total-origin usage) are deliberately EARLY
> capacity-runway signals and reaching them does NOT itself mean a commit must
> fail. A commit fails only when there is no longer room for a second full
> generation alongside the current one (roughly half the origin quota, as §2
> describes).

**Status (pre-decision snapshot, superseded 2026-07-22 by §7):** Decision
packet only. At the time this packet was authored nothing in it was
implemented and no option below had been selected; OL-032 was **Requires
David** in [docs/OPEN_LOOPS.md](OPEN_LOOPS.md). That is a historical snapshot —
the decision has since been made (see §7).

**Package:** DOS-GOV-002A (documentation/governance only — this packet
does not change storage logic, schemas, or runtime behavior). The
implementation of the selected Stage 1 is a separate package (DOS-STAB-002A).

**Purpose:** lay out the verified current behavior, why it changed, what
remains safe today, and a reasoned comparison of the realistic options —
so David can make an informed, explicit product decision. This document
does not choose an option; implementing any option is a separate future
package requiring its own approval.

---

## 1. Verified current journal-capacity behavior

Canonical `AppState` is persisted as an immutable **generation journal**
(DOS-STAB-001A; full spec in
[docs/DATA_MODEL.md → Persistence](DATA_MODEL.md#persistence--the-state-journal-dos-stab-001a)),
not as one mutable key. Verified properties, current on `main` @
`d744e7d018d1c6c22ffcfdcf885cb568604f997c`:

- Every commit (autosave, Import, Reset, Prune) writes a **new**
  `davidos-state-generation-v1-<id>` key holding one complete serialized
  `AppState`. The previously committed generation is retained, never
  overwritten in place, for the whole transaction.
- Two alternating head slots (`davidos-state-head-v1-a`/`-b`) track
  control metadata only; a commit writes the slot that is not current
  authority, verifies it by read-back, then re-confirms selection.
- Cleanup (`safeCleanup`) runs only after a verified head advancement and
  keeps the current, previous, and every head-referenced generation — it
  deliberately never deletes down to a single copy.
- The legacy single key `davidos-state-v1` is retained byte-identical as
  migration input/read-fallback and is never deleted by the journal.

**Evidence (found 2026-07-20, DOS-STAB-001A Phase 2B browser acceptance,
confirmed in Chromium against the production build):**
`tests/smoke/storageRetention.spec.ts`'s near-quota case — a ~4.8M-char
state seeds and loads fine, the storage meter reads "nearly full," but no
new journal generation can be written; only the legacy key was present
afterward. The commit fails safely: persistence is suppressed and the app
shows the "Saving to this device is failing" banner. Nothing is lost or
corrupted.

## 2. Why the effective capacity is roughly HALF the previous single-key model

Before DOS-STAB-001A, a commit replaced one mutable key in place: the
"effective ceiling" for canonical state was close to the browser's whole
localStorage quota for that origin (a ~5MB ESTIMATE; browser quotas are
UTF-16-unit-based and vendor-specific).

The journal's durability model requires committing a state to leave room
for a **second complete copy** — the new generation — alongside the
generation it supersedes, because:

1. Committed generations are never overwritten in place (that is what
   makes single-step fallback and boot reconciliation possible).
2. The previous generation is retained until a verified head advancement,
   so a partially-applied write always has a recoverable predecessor.

localStorage offers no native multi-key transaction, so this durability
comes from redundancy (two copies alongside each other), not from
atomicity. A state large enough to occupy roughly half the origin's quota
can therefore no longer be committed at all — the write fails safely
before anything is corrupted, but no new generation can land.

This is a direct, quantifiable trade-off of the DOS-STAB-001A durability
model, not a regression or a bug: the alternative (a single mutable key)
had a higher ceiling but no recoverable predecessor and no protection
against a partially-applied write, which was the exact defect
DOS-STAB-001A was built to close.

## 3. What remains safe today (interim behavior, already shipped)

- **Nothing is deleted or silently repaired.** A commit that cannot fit
  fails safely; stored data is provably unchanged; the app does not
  claim anything was saved that wasn't.
- **An app-wide protection banner** (Layout, at critical storage level)
  always points to Settings → Data before the persist-failure banner
  becomes relevant.
- **Export and recovery downloads remain available** even when
  persistence is suppressed — a user is never locked out of getting
  their data off the device.
- **Boot reconciliation and the crash-recovery boundary are unaffected**
  by this capacity ceiling; they operate on whatever generations already
  exist.

## 4. Why pruning can also become unavailable near capacity

The only in-app destructive-retention action ("Prune saved prompts…",
OL-003) is itself journal-backed: `commitDestructiveState()` builds the
complete pruned `AppState` (including its completion audit entry) and
commits it as ONE new generation before active state is replaced. Because
pruning is a commit like any other, it needs the same "room for a second
copy" that ordinary saves need. At or beyond the point where an ordinary
save starts failing, a prune commit needs to write a *smaller* candidate
generation than the current one — but the write still requires enough
free quota for that candidate to exist ALONGSIDE the current (over-quota)
generation during the transaction, so pruning can be blocked in exactly
the state it would otherwise be most useful for. This was already
understood in principle for OL-003 (hard quota exhaustion blocks pruning
too — the recovery path is export + reset); DOS-STAB-001A does not
introduce the behavior, it moves the threshold where it starts to
roughly HALF the previous state size.

## 5. Options

Each option is evaluated on: user impact, data-safety implications,
architectural cost, migration risk, browser compatibility, recovery
consequences, test requirements, reversibility, and whether it weakens a
current guarantee.

### Option 1 — Earlier warning and critical thresholds only

Lower the existing `storageUsage.ts` warning (≥70%) / critical (≥90%)
thresholds so users are told meaningfully earlier that they are
approaching the journal's effective (roughly halved) ceiling, without
changing any commit or retention logic.

- **User impact:** low — same UI, earlier and more accurate warnings.
- **Data-safety implications:** none — no change to what is committed,
  retained, or deleted.
- **Architectural cost:** very low — a threshold constant and copy
  change in an already-pure module (`storageUsage.ts`).
- **Migration risk:** none — no schema or persisted-format change.
- **Browser compatibility:** unaffected — thresholds are pure
  arithmetic over an existing size estimate.
- **Recovery consequences:** none — recovery/export paths unchanged.
- **Test requirements:** update existing threshold unit tests
  (`storageUsage.test.ts`) and the smoke assertions that reference the
  literal percentages.
- **Reversibility:** fully reversible (constants only).
- **Weakens a current guarantee?** No.
- **Trade-off:** does not raise the actual ceiling or make pruning more
  available near it — it only gives the user more runway to act (export,
  prune, or reduce state) before hitting the wall.

### Option 2 — Retire the previous generation once a head has advanced and been re-verified

After a commit's head advancement is verified (not merely written), free
the OLDER of the two previous generations more aggressively than today's
`safeCleanup` (which already keeps current + previous + every
head-referenced generation) — i.e., narrow retention further, keeping
only the bare minimum needed for the NEXT single-step fallback rather
than the current conservative set.

- **User impact:** low directly, but narrows the safety margin during
  the exact window (mid-transaction) the extra copy exists to protect.
- **Data-safety implications:** **weakens single-step fallback.** The
  entire reason a predecessor generation is retained is to guarantee a
  hash-verified, never-overwritten fallback exists if a subsequent write
  is interrupted or partially applied. Retiring it sooner narrows that
  window.
- **Architectural cost:** moderate — changes the cleanup contract
  (`safeCleanup`) and the boot-reconciliation assumptions that currently
  rely on the previous generation staying present through the whole
  transaction.
- **Migration risk:** low (no schema change) but behavior-risk is real —
  this is the one option that touches the actual durability invariant
  DOS-STAB-001A was built around.
- **Browser compatibility:** unaffected.
- **Recovery consequences:** a failure occurring in the narrowed window
  would have no recoverable predecessor — the exact defect class
  DOS-STAB-001A closed.
- **Test requirements:** would need new adversarial tests proving the
  narrowed window is still safe under every interruption point currently
  covered by `stateJournal.test.ts`/`journalPersistence.test.ts`.
- **Reversibility:** reversible in code, but any data lost during a
  narrowed-safety-window failure is not.
- **Weakens a current guarantee?** **Yes — this option is the only one
  that directly weakens the single-step fallback guarantee.** It should
  be treated as the least preferred option unless paired with a rigorous
  new safety argument.

### Option 3 — Carefully designed emergency prune-only recovery path

Add a narrow recovery path that permits a Prune commit specifically when
ordinary commits are failing due to capacity, sized and gated so the
prune candidate is small enough to fit even when a full-size commit
would not (e.g., a more aggressive default keep-count in the emergency
path, or a two-phase prune that trims in smaller batches).

- **User impact:** potentially high positive — gives users a way to
  recover in-app without falling back to export + reset.
- **Data-safety implications:** requires a careful safety argument
  (explicitly called for in the existing OL-032 problem statement): the
  emergency path must still go through the same persist-first,
  verified-head-advancement contract, or it reintroduces exactly the
  unsafe partial-write risk DOS-STAB-001A removed.
- **Architectural cost:** moderate-to-high — a new, distinct commit path
  with its own sizing logic, plus new UI states (an already-failing
  device offering a *different* prune button than the healthy one).
- **Migration risk:** low (no schema change), but process risk is
  meaningful — this is new destructive-transaction logic, which is
  explicitly excluded from this package's scope (see AGENTS.md §3:
  rewriting the storage layer needs David's approval).
- **Browser compatibility:** unaffected.
- **Recovery consequences:** if designed correctly, strictly improves
  recovery (an additional safe path); if designed incorrectly, could
  reintroduce partial-write risk.
- **Test requirements:** substantial — needs its own adversarial
  interruption-point test suite mirroring `stateJournal.test.ts`'s
  existing rigor, plus smoke coverage for the near-quota UI state.
- **Reversibility:** the code path is removable; a wrongly-designed
  version deployed and later found unsafe would need a corrective
  package before removal.
- **Weakens a current guarantee?** Not necessarily, but it is the
  highest-complexity option and carries the largest risk of *accidentally*
  weakening a guarantee if the safety argument is incomplete.

### Option 4 — Move canonical AppState to IndexedDB

Replace localStorage as the canonical AppState store with IndexedDB,
which offers a much larger practical quota (typically hundreds of MB to
GB-scale, origin- and browser-dependent) and native atomic transactions,
potentially removing the "room for a second copy" constraint entirely or
pushing it far out of practical reach.

- **User impact:** low if migration is transparent; a one-time migration
  step is needed for every existing device.
- **Data-safety implications:** potentially the strongest long-term
  option — IndexedDB transactions are atomic, which could simplify or
  replace parts of the current journal/lock design — but only if the
  migration itself is as rigorously verified as DOS-STAB-001A's own
  legacy-migration path (byte-exact preservation, verified read-back,
  no data loss on interruption).
- **Architectural cost:** **high.** This is a full storage-layer
  replacement (explicitly an approval-boundary item per AGENTS.md §3 —
  "Rewriting the storage layer or replacing localStorage" requires
  David's sign-off before starting). `docs/DECISIONS.md` (item 5, initial
  build decisions) already documents `localStore.ts` as "isolated... so
  swapping to IndexedDB or Drive sync later touches one file" — that
  isolation exists, but the swap itself is still a large, separate
  package, not a small option alongside the other four here.
- **Migration risk:** the highest of the five options — every existing
  device's stored journal/legacy state must migrate correctly, and a
  botched migration on a real device is unrecoverable without the
  existing preserve-then-repair contract being re-verified against the
  new store.
- **Browser compatibility:** IndexedDB is broadly supported in all
  target browsers, but private/incognito modes, Safari's historically
  stricter storage eviction policies, and some embedded WebViews have
  had inconsistent IndexedDB behavior — this needs explicit compatibility
  verification before being relied on as a hard quota fix.
- **Recovery consequences:** could be improved substantially (atomic
  transactions natively), but the crash-recovery boundary
  (`AppErrorBoundary`) and export/import paths must be re-verified end
  to end against the new store.
- **Test requirements:** the largest of the five — effectively a new
  `DATA_MODEL.md` persistence section, a new migration test suite, and a
  full re-run of every existing journal/persistence/recovery test against
  the new backend.
- **Reversibility:** low once shipped and devices have migrated — this is
  the least reversible option.
- **Weakens a current guarantee?** Not inherently — if done correctly it
  could strengthen guarantees — but it is a major undertaking that must
  not be started without its own dedicated, approved package.

### Option 5 — A staged combination

Ship the low-risk, low-cost options first, and treat the higher-cost
options as later, separately-approved work:

1. **Now (if approved):** Option 1 (earlier thresholds) — near-zero risk,
   immediate user-facing improvement in warning lead time.
2. **Next (if approved, separately scoped):** Option 3 (emergency
   prune-only path), built with the same rigor as the existing journal
   commit protocol, with its own adversarial test suite.
3. **Later (only as its own fully-scoped, approved package):** Option 4
   (IndexedDB) if the roadmap calls for it independent of this specific
   capacity concern (e.g., driven by future feature needs for larger
   stored history).
4. **Not recommended at any stage:** Option 2 alone, since it trades away
   the specific guarantee DOS-STAB-001A was built to add without
   sufficient corresponding benefit — it would only be reasonable as a
   tightly-scoped, separately-justified hardening step paired with new
   adversarial safety tests, not as a capacity fix in its own right.

- **User impact:** best of the group — visible improvement soon, larger
  structural fix only when separately justified and resourced.
- **Data-safety implications:** each stage inherits the safety profile of
  its constituent option; sequencing avoids taking on Option 4's
  migration risk merely to solve what Option 1 can address today.
- **Architectural cost:** spread over time rather than incurred at once.
- **Migration risk:** deferred until (and unless) Option 4 is separately
  approved.
- **Browser compatibility:** Option 1 has none; Option 3 has none beyond
  existing journal compatibility; Option 4's compatibility work is
  deferred to its own package.
- **Recovery consequences:** improves incrementally; never regresses.
- **Test requirements:** incremental, matched to each stage's own scope.
- **Reversibility:** each stage remains independently reversible until
  Option 4 (if ever reached) is shipped.
- **Weakens a current guarantee?** No stage in this sequence, as
  described, weakens a current guarantee on its own.

## 6. Reasoned recommendation (not a decision)

Given the comparison above, immediate value with the lowest risk comes
from **Option 1** (earlier, more honest warning thresholds) shipped on
its own, with **Option 3** (a carefully safety-argued emergency
prune-only path) as the natural next step if David wants an in-app
recovery option beyond export + reset before committing to a larger
storage-layer change. **Option 4** (IndexedDB) is the strongest long-term
answer to the underlying quota ceiling but is architecturally large
enough that it should be scoped, approved, and executed as its own
package rather than folded into a capacity-threshold decision. **Option
2** is the option most likely to trade away a guarantee this codebase
just finished hardening, and is not recommended except as a narrowly
scoped, separately safety-argued follow-on to Option 3, if at all.

**This was a recommendation, not a decision, when authored.** At that time
OL-032 remained marked **Requires David** in docs/OPEN_LOOPS.md and no option
above had been selected, scheduled, or implemented by this package
(DOS-GOV-002A), which is documentation/governance only. **That state is
superseded: David has since made the decision — see §7 below.**

## 7. Decision (recorded 2026-07-22)

David has made the product decision this packet was written to inform.
Sections 1–6 are retained unchanged as the pre-decision analysis that
supported it.

- **Selected: Option 5 — the staged combination.** The capacity concern is
  addressed by sequencing the low-risk work now and deferring the larger,
  higher-risk work to separately-approved packages.
- **Stage 1 = Option 1 only** (earlier, more accurate warning thresholds).
  Implemented under **DOS-STAB-002A** on branch
  `feat/dos-stab-002a-stage1-storage-thresholds` — at the time of this record
  not yet merged, deployed, or independently reviewed. Stage 1 changes only the
  threshold constants, moves the measurement to estimated total same-origin
  usage, and updates the directly-related user-facing copy and tests. It does
  NOT raise the actual ceiling and does NOT add emergency pruning.
- **Option 2 — rejected.** It is the only option that directly weakens the
  single-step-fallback guarantee DOS-STAB-001A was built to add, and it is not
  adopted at any stage.
- **Option 3 — separate follow-on plan.** The carefully safety-argued
  emergency prune-only recovery path is NOT part of Stage 1. It is to be scoped
  as its own package, with its own adversarial test suite, only after Stage 1
  has been independently reviewed.
- **Option 4 — deferred, separately approval-bound.** Moving canonical state to
  IndexedDB remains a large, separate storage-layer package that requires its
  own explicit David approval before it can begin (AGENTS.md §3); it is not
  scheduled by this decision.

This section records the decision; it does not itself implement anything.
OL-032 stays **open** in docs/OPEN_LOOPS.md for the tracking of the Option 3
and Option 4 follow-on directions, but it no longer awaits David's product
decision — that decision is the Option 5 selection recorded here.
