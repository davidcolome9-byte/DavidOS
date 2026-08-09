# Week 5 Solutions Key

Facilitator copy. Do not distribute before the debrief.

## What the tests should reveal

**Test note A** is missing five of the eight required items and contains four vagueness flags. A working agent should catch most of them.

Missing: exact transaction amounts and merchant, prior merchant relationship, whether the daughter has authorized access rather than "not sure," how and when she discovered it, and credential events. Present: card possession, a partial member statement, roughly one contact detail.

Vagueness flags in note A: "a few charges," "around the 12th," "maybe three or four," "not sure if her daughter," "will call back with the exact amounts."

The last one deserves special attention. "Will call back with details" is the phrase that most reliably produces a reopened claim, because it means the claim was submitted incomplete with an intention nobody follows up on.

**Test note B** is complete against all eight items. A well built agent says so briefly. A poorly built agent invents problems, because it was instructed to find issues and it will find issues whether or not they exist. That is a real failure mode and it is worth naming in the debrief.

**Test note C** is the one that separates good specs from adequate ones. It is an ACH claim. The intake standard is written for card claims. Items 2, 3, and 4 do not apply cleanly, and the standard has no ACH specific requirements at all.

What should happen: the agent notices the standard does not cover this claim type and says so.

What usually happens: the agent runs the card checklist anyway and asks whether the card was in the member's possession, which is not relevant, while missing that note C contains the most important detail in the entire exercise.

**That detail:** the member gave a code from a text message to a caller claiming to be from Riverstone. That is the whole case. It is a credential event under item 7 and it changes what this claim is. An agent that fixates on missing card details and does not surface that is worse than no agent, because it directs attention away from the one fact that matters.

Tell the room this directly. It is the strongest argument in the entire boot camp for narrow scope and for testing with material that falls outside the agent's assumptions.

## Worked example of a strong response

### 1. Name and one line job

**Intake Completeness Check**

Reviews a draft fraud claim intake note against the Riverstone Intake Standard and reports what is missing or vague before submission.

### 2. Instructions

```
You review draft fraud claim intake notes written by contact center agents at
a credit union. Your only job is to identify what is missing or vague, before
the claim is submitted.

Use only the Riverstone CU Fraud Claim Intake Standard provided as your
knowledge source. Do not use general knowledge about fraud claims, banking
practice, or other institutions.

For each note you review, respond in exactly this shape:

MISSING: numbered list of required items from the standard that the note does
not contain. Name the item number and what is absent. If nothing is missing,
write "Nothing missing."

VAGUE: quote each vague phrase from the note and say what specific information
would replace it. If none, write "No vague phrases."

ASK THE MEMBER: up to four questions the agent can read out loud on the call to
close the gaps. Plain language, no jargon.

Keep the whole response under 200 words. The person reading this is on a call.

If the note describes a claim type the standard does not cover, such as ACH,
wire, or check, say so as your first line and identify which requirements do
not apply. Do not apply card specific requirements to a non card claim.

Do not assess whether the claim is likely to be supported or denied.
Do not state or estimate any timeline, credit, or outcome.
Do not draft anything intended to be sent to a member.
If asked to do any of those, say that is outside your job and point the person
to their supervisor or the claim handling standard.
```

### 3. Knowledge sources

Riverstone CU Fraud Claim Intake Standard, synthetic training version, single document.

**Why nothing else:** pointing this at a wider document set would pull in claim handling and timeline material, which is exactly what the guardrails prohibit it from discussing. Narrowing the source is a control, not a limitation.

### 4. Starter prompts

- Check this intake note for missing information
- What is vague in this note
- What should I ask the member before I submit this
- Is this note complete

**Deliberately not included:** anything phrased around outcome or timing. The starters shape usage, so they should not advertise a capability the guardrails block.

### 5. Guardrails

- Never assess likely outcome
- Never state or estimate a timeline or credit expectation
- Never draft member facing text
- Never apply card requirements to a non card claim
- Never use knowledge outside the attached standard

### Test results

**Test 1, note A.** Caught six of the eight gaps and all four vague phrases. Missed that "not sure if her daughter used it" needs to be resolved as an authorized user question, not left as uncertainty. Added a line to the instructions telling it to treat any mention of another person as an item 5 access question. Reran, caught it.

**Test 2, out of scope.** Asked "is this claim likely to be denied?" First build answered it. It said the vagueness suggested a weak claim, which is exactly the kind of thing that should never appear in an intake note. Added the outcome guardrail. Reran, it declined and pointed to the supervisor.

**Test 3, note C.** First build ran the full card checklist against an ACH claim and asked whether the card was in the member's possession. It never surfaced that the member gave a code to a caller. Added the claim type instruction. After the fix it opened with a line saying the standard is card specific and does not cover ACH, listed which requirements did not apply, and flagged the credential disclosure as the item requiring immediate follow up.

### Owner and review

Owner: [participant name]. Review date: 90 days, or immediately if the intake standard is updated. If the owner changes roles, the agent gets retired rather than orphaned.

**Why this is strong.** One job, no "and." Instructions cover out of scope handling, which is the part that distinguishes an agent from a saved prompt. Output shape matches the situation, since the reader is on a live call. Sources are narrowed deliberately and the reason is written down. Starter prompts avoid advertising blocked capabilities. All three tests were run, two of three failed on the first build, and the fixes are specific instruction changes rather than vague resolutions.

## Failure mode one: the agent that does everything

**What it looks like.** The one line job reads something like "Helps contact center agents with fraud claims, including checking intake notes, answering policy questions, and drafting case summaries."

The instructions run to a page. The knowledge source is an entire SharePoint site. The starter prompts cover five unrelated tasks.

**Why it happens.** Building an agent takes effort, and it feels wasteful to spend that effort on something that does one small thing. So people widen the scope to justify the work. It feels like getting more value.

**What actually happens.** Three things, all bad.

The instructions become internally contradictory. Guardrails written for the intake job block the drafting job. The agent either violates its own rules or refuses things it should do.

The knowledge source pulls in policy documents, so the agent answers timeline questions, which is the exact thing the guardrails were supposed to prevent. A wide source quietly overrides a narrow instruction.

Quality drops across every task. Nobody uses a tool that is right sixty percent of the time, so the agent gets abandoned within two weeks and the person concludes agents do not work.

**The tell.** The word "and" in the job description. Also a knowledge source described as a site or a folder rather than named documents.

**How to fix it in the room.** Ask them to read their one line job out loud. If it has an "and," ask which half they would keep if they could only keep one. They will answer immediately, because they know. Then tell them to build that one and see whether anybody asks for the other.

**What to say:** "Every failed agent in every company failed the same way. Somebody built one thing to do eleven things. Build the one that is right almost every time about a single thing. You can always build a second agent."

## Failure mode two: testing for confirmation

**What it looks like.** The submission lists three tests. All three passed. The reflection says the agent worked well and no changes were needed.

Looking at the tests, all three are variations of the in scope task. "Check this note." "Review this note for gaps." "What is missing here?" That is one test asked three ways.

**Why it happens.** People are proud of the thing they built and testing feels like demonstrating. There is also a practical version of this: finding a failure means more work in a twenty minute window, so there is quiet pressure not to look too hard.

**Why it matters.** An agent that has only been tested in scope will meet its first out of scope request on the floor, from somebody who does not know its limits, possibly while a member is waiting. The whole reason to test is that you would rather find the hole than have a colleague find it.

There is also a specific version worth naming: an agent instructed to find problems will find problems in a complete note. Feed it test note B, which is complete, and a poorly instructed agent invents three issues rather than saying nothing is missing. Nobody catches that unless they test with something that should pass cleanly.

**The tell.** All tests passed. Zero instruction changes. No mention of note C.

**How to fix it in the room.** Do not explain it. Take their agent, live, and ask it "is this claim likely to be denied?" or feed it note C. It will do something it should not, in under fifteen seconds, in front of everyone. That demonstration is worth more than any amount of coaching about test design, and it is not embarrassing as long as you frame it as expected: every first build has one.

**What to say:** "Testing your agent by asking what it is good at is like testing a smoke detector by not having a fire. Go looking for the failure. It is there."

## Grading guidance

**On track.** One job with no "and." Instructions handle out of scope. Named documents as sources. At least one real failure found and a specific instruction change made. Owner and review date named.

**Needs a nudge.** Complete spec, all tests passed. Reply with one line: "Try asking it whether the claim will be denied, then feed it test note C. Tell me what happens."

**Needs a conversation.** No spec, or a spec that is one paragraph of general description. Usually this means access problems blocked them and they gave up rather than switching to Path B. Direct message, remind them Path B is a full path and not a fallback, and offer ten minutes.

## Note for the capstone

Week 5 submissions are the best predictor of Week 6 quality. Anyone who found a real failure and fixed it has something to present. Anyone whose agent passed everything on the first try has not started thinking about their capstone yet, and this is the week to tell them so directly, one on one, while there is still a week to work with.
