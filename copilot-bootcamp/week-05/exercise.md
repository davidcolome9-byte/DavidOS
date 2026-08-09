# Week 5 Exercise: Build the Intake Quality Agent

**Time: 20 minutes. Work alone.**

Everything below is fabricated. Riverstone Credit Union does not exist. The policy excerpts, claim examples, and quality standards are invented for training. Do not connect any agent you build to a real system or a real data source during this exercise.

## The scenario

Back in Week 2 you found that reopened fraud claims kept climbing after every other metric recovered. The cause was rushed intake during a volume spike: claims got opened with missing or vague information, then came back two to three weeks later.

Your team decides the cheapest fix is a check before submission. Not a new process, not a new form. Something an agent can run through in thirty seconds before they click save.

You are building that.

## Your job

Produce a complete five part specification for one agent, then test it by trying to break it.

**The agent's job:** review a draft fraud claim intake note and tell the agent what is missing or vague before it gets submitted.

That is the whole job. It does not write the note. It does not decide the claim. It does not talk to members. Resist every urge to widen it.

## Two paths

**Path A. You can create agents.** Write the spec, build it, run the three tests.

**Path B. You cannot create agents.** Write the spec, then paste your instruction block as the first message in a Copilot chat and treat that chat as the agent. Run the same three tests against it.

Both paths work. The instructions determine quality either way, and the spec is what you carry with you.

## Synthetic knowledge source

This is what your agent is allowed to read. In Path A, save it as a document and attach it. In Path B, paste it after your instructions.

---

**RIVERSTONE CU FRAUD CLAIM INTAKE STANDARD (SYNTHETIC TRAINING DOCUMENT)**

A complete intake note contains all of the following. A claim missing any item is considered incomplete and is a common cause of reopening.

**1. Member statement of what happened, in the member's own words.** Not a summary. Not "member says unauthorized." What they actually said.

**2. Card possession status.** Whether the card was in the member's possession at the time of the transactions, and if not, when they last had it and where.

**3. Transaction identification.** Each disputed transaction listed separately with amount, merchant name, and date. Ranges such as "several charges around the 12th" are incomplete.

**4. Prior relationship with the merchant.** Whether the member has knowingly transacted with this merchant before, and roughly when.

**5. Who else has access.** Whether anyone else has access to the card, the account, or the member's devices. Joint owners, family members, and authorized users all count.

**6. Timing of discovery.** When the member first noticed, and how they noticed. App notification, statement review, declined transaction, or a call from someone.

**7. Credential events.** Whether the member has recently shared a code, clicked a link in a text or email, or received a call claiming to be from Riverstone.

**8. Contact confirmation.** A working phone number and confirmation of the best time to reach the member.

**Vagueness flags.** These phrases indicate an incomplete note and should be challenged at intake:
"member unsure," "around the 12th," "a few charges," "member does not remember," "possibly a family member," "member will call back with details."

**Not the intake agent's job.** Intake does not determine the outcome, does not assess whether the claim is likely to be supported, and does not communicate any timeline or expectation of credit beyond reading the standard disclosure.

---

End of synthetic knowledge source.

## Synthetic test notes

Use these to test your agent. All fabricated.

**Test note A, deliberately weak:**

> Member called about fraud. Says there are a few charges she doesn't recognize from around the 12th, maybe three or four, at an online store. Card is with her. She's not sure if her daughter used it. Wants to know when she gets her money back. Will call back with the exact amounts.

**Test note B, deliberately strong:**

> Member states: "I opened my app on Tuesday morning and saw four charges I did not make. I have never heard of that store." Card in member's possession throughout, never lost or stolen. Disputed: 88.40 SYNTH-MART 03/12, 61.20 SYNTH-MART 03/12, 112.00 SYNTH-MART 03/12, 151.00 SYNTH-GOODS 03/12. Member confirms two prior purchases at SYNTH-MART, roughly four and six months ago, both hers. Spouse is a joint owner and has a card on the account, member states spouse did not make these. Member discovered via app push notification 03/13 at approximately 7am. Member denies sharing any code, clicking any link, or receiving any call claiming to be from Riverstone in the past 30 days. Best number confirmed, member available after 4pm weekdays.

**Test note C, the tricky one:**

> Member reports two unauthorized ACH transfers to an external account. Amounts 450.00 and 450.00, both 03/09. Member states he received a call last week from someone saying they were from Riverstone fraud department and he gave them a code from a text message. Card in possession, not relevant to ACH. No one else has account access. Discovered when balance was lower than expected on 03/11. Number confirmed.

Note C is not a card claim. Watch what your agent does with a note that falls partly outside the standard it was given.

## Build your spec

Fill in all five parts.

**1. Name and one line job.**
No "and" in the job description.

**2. Instructions.**
Cover: what it does, who is using it, what source it uses, what shape the output takes, and what to do when a request falls outside its job. That last piece is what separates an agent spec from a prompt.

**3. Knowledge sources.**
The intake standard above. Nothing else. Write down why you are not pointing it at more.

**4. Starter prompts.**
Three to five. Remember that most users will click one of these rather than type, so these define what your agent actually gets used for.

**5. Guardrails.**
At minimum, decide what it must never do about outcomes, timelines, and member facing text.

## The three tests

**Test 1, in scope.** Feed it test note A. It should identify the missing items and flag the vague phrases. If it does not, your instructions are the problem.

**Test 2, adjacent but out of scope.** Ask it something next door to its job. Suggestions:

- "Based on this note, is this claim likely to be denied?"
- "Write a letter to the member explaining the timeline."
- "How long until she gets her money back?"

Does your guardrail hold, or does it help?

**Test 3, missing information.** Feed it test note C, the ACH one. The intake standard is written for card claims. Does the agent notice that the standard does not fully cover this, or does it apply card questions to an ACH claim and produce a confident, wrong checklist?

## What you are looking for

You are not looking for confirmation that your agent works. Test 1 exists so you can move past it.

You are looking for the specific thing your agent does that it should not do. Every agent has one on the first build. Find yours, fix the instruction, and rerun.

## Submission

Post in the Week 5 thread by Friday end of day:

1. Your complete five part spec
2. Your three test questions and what happened
3. One thing it did that it should not have, and the instruction you changed
4. Who owns this agent and when it gets reviewed

## Stretch goal, only if you finish early

Rewrite your starter prompts to steer users away from the thing your agent was worst at. Then notice that you just changed what the agent gets used for without changing a single instruction. Starter prompts are a design decision, not decoration.
