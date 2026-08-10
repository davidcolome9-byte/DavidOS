# Microsoft 365 Copilot Boot Camp: Six Week Syllabus

**Audience:** digital department and contact center staff at a credit union, including people who touch fraud claims, QA review, reporting, and internal communications.

**Format:** six weekly sessions, 60 minutes each, hands on. Participants type. They do not watch.

**Cohort size:** 12 to 16 works well. Above 20, split into two cohorts or plan a two part showcase in Week 6.

**Prerequisites:** none. No Excel skills required, no prior AI experience required, no technical background required.

## The arc

Each week builds on the one before it. Somebody who attends only Week 5 will build a bad agent, because agent quality is prompt quality and prompt quality is Week 3.

| Week | Role | Core skill |
|---|---|---|
| 1 | Researcher | Find and verify |
| 2 | Analyst | Interpret and check |
| 3 | Prompt Coach | Diagnose and repair |
| 4 | Writing Coach | Write for a reader |
| 5 | Agent Builder | Package and test |
| 6 | Capstone | Prove and share |

## The through line

Weeks 1 and 2 build the verification habit, which is the thing that keeps this safe in a regulated environment. Week 3 gives people the framework that makes everything else repeatable. Week 4 raises the stakes to documents that carry real weight. Week 5 turns individual skill into something the team can use. Week 6 turns all of it into evidence.

One synthetic narrative runs through all six weeks. Riverstone Credit Union is a fictional institution with fabricated policies, metrics, claims, and people. A problem discovered in Week 2, rising reopened claims caused by rushed intake, is the same problem the Week 5 agent is built to solve. This continuity is deliberate. It gives people a reason to come back and it demonstrates that the tool is useful across a workflow rather than in isolated tasks.

## Week 1: Copilot as Researcher

**The question:** how do I find something fast without getting burned by an answer that sounds right?

Participants learn the difference between Copilot answering from work content and from general knowledge, why permissions carry over so it cannot see what they cannot see, and how to read a citation trail.

The exercise gives them four conflicting internal documents about debit card fraud claim timelines and asks for a briefing an agent could use during a live call. The documents disagree in three places and one is out of date, which is what real policy stacks look like.

**Pattern taught:** ask, shape, verify.
**Key move:** the "if something is not stated in the text, say not stated" instruction.
**Submission:** final prompt, final briefing, two sentences on what changed between attempts.

## Week 2: Copilot as Analyst

**The question:** how do I go from a table of numbers to something worth saying?

Participants learn to separate calculation from interpretation, because those carry different risk. Copilot is unreliable at arithmetic and genuinely strong at generating explanations. The session makes that distinction concrete, including catching a wrong figure live.

The exercise gives eight weeks of synthetic contact center metrics, eight weeks of fraud claim counts, and an events list. Week 6 in the data looks terrible. Three separate causes are hiding in it, and any submission offering one explanation is wrong regardless of how good it sounds.

**Pattern taught:** numbers get verified, stories get generated.
**Key move:** three ranked competing explanations plus the evidence that separates them.
**Submission:** prompt, three findings, one recommendation, one number verified by hand.

## Week 3: Copilot as Prompt Coach

**The question:** why did my prompt fail, and how do I fix somebody else's?

This is the midpoint and the session that makes the rest work. Everything reduces to four elements: goal, context, source, shape. When a prompt fails, usually exactly one is missing, and it is usually shape.

Participants get five weak prompts drawn from realistic contact center, QA, reporting, fraud, and internal comms situations. They rewrite three, then hand them to a partner who runs them cold with no explanation. A prompt that only works for its author is not a reusable prompt.

**Pattern taught:** diagnose, do not rewrite.
**Key move:** the partner test.
**Submission:** three rewrites, the missing element in each original, one prompt for the team library.

## Week 4: Copilot as Writing Coach

**The question:** how do I write the same facts for three different readers without asserting something I cannot support?

Highest stakes week, lowest perceived difficulty. Copilot makes uncertain writing sound certain, and the gap between "insufficient evidence to support unauthorized use" and "we determined the transactions were authorized" is the difference between a routine outcome and a real problem.

The exercise gives one synthetic fraud case file and asks for a supervisor summary, an internal case note, and a member letter. The case file is deliberately incomplete, the claim outcome is partial, and first drafts routinely accuse the member of something the file never established.

**Pattern taught:** same facts, different reader, and confidence is a claim.
**Key move:** asking Copilot to list every claim in your draft the source does not support.
**Submission:** three documents, one unsupported assertion caught and fixed, one deliberate omission explained.

## Week 5: Copilot as Agent Builder

**The question:** how do I stop retyping the same prompt, and how do I package it so other people benefit?

An agent is a saved set of instructions with a name, one job, and a fixed list of sources. Setting that expectation honestly is the first thirty seconds of the session, because people expecting autonomy spend the hour disappointed.

Participants write a five part specification and build or simulate an intake completeness checker: it reviews a draft fraud claim note against a synthetic intake standard and reports what is missing before submission. Then they try to break it. Every first build has a hole.

Everyone runs the same exercise in the session by simulating the agent in a chat. Building it for real is homework for anyone whose account allows it, because the build teaches little and the instructions are the whole thing.

**Pattern taught:** narrow job, tight sources, explicit guardrails, break it before you share it.
**Key move:** testing with material that falls outside the agent's assumptions.
**Submission:** five part spec, three tests, one failure found and fixed, owner and review date.

## Week 6: Capstone and Showcase

**The question:** what do I actually have to show for six weeks?

Everybody presents. Five minutes each: the workflow in one sentence, the before number and where it came from, what changed shown on screen, the after number, and one thing that did not work.

Then an evidence card, due Friday, which is the real deliverable. Six months from now nobody remembers their numbers. The card is participants writing them down while they are still true.

**Pattern taught:** small and real beats large and vague.
**Key move:** attaching one surviving habit to a trigger already in the week.
**Submission:** evidence card, plus one named person each participant will show one thing to within two weeks.

## Materials

A README at the package root is the entry point. Every week has six files: facilitator guide, participant one pager, exercise, solutions key, knowledge check, and announcement. The shared folder holds this syllabus, a prompt library of 50 reusable prompts, a facilitation FAQ for handling resistance, an evidence tracker, and a manifest.

## Data rules

Stated with weight in Week 1, then restated at the point of use in every session where the material gets closer to live work: Week 4 before anyone drafts a member letter, Week 5 before anyone builds anything, Week 6 before anyone presents a workflow. Not a recitation every five minutes. One specific sentence attached to the specific thing about to be done. The rule that gets stated once is the rule people assume expired.

- All exercises use fabricated data for a fictional institution.
- No real member names, account numbers, card numbers, case IDs, or screenshots of live systems in any session.
- The synthetic policies contradict Regulation E in several places on purpose. Nobody carries a timeline, provisional credit rule, or member notice requirement out of these exercises into live work.
- Anything acted on gets its source checked by a human.
- Every word that leaves the building has a human owner. Not the tool.

## What this program does not cover

Say this out loud in Week 1 so nobody waits for it.

- Your organization's specific data handling and AI usage policies. Those come from compliance, not from this boot camp.
- Technical administration, licensing, and tenant configuration.
- Agents that take actions in other systems. Read only agents that help a person think are the right starting point and are where the early value is.
- Anything model specific that will change within a year. The frameworks here are about communication, not about product features.

## After the six weeks

Three things, all small, all easy to skip and worth not skipping.

**The prompt library stays open.** Contributions require testing on one other person first, because untested library prompts are how libraries die.

**Agents get owners and review dates.** An agent without a named owner becomes stale guidance nobody is responsible for. If the owner changes roles, the agent gets retired rather than orphaned.

**A 30 minute check in at 30 days and again at 90 days.** Optional attendance, one question: what is still in use. Schedule both before Week 6 ends or neither will happen.
