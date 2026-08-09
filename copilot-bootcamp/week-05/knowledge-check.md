# Week 5 Knowledge Check: Agent Builder

Five questions. Answer from memory first, then check yourself. Takes about five minutes.

---

**Question 1**

Which one line job description describes a well scoped agent?

A. Helps the team with fraud questions
B. Reviews a draft intake note against the intake standard and reports what is missing or vague
C. Assists contact center agents with claims, policy lookups, and drafting summaries
D. Supports fraud operations

---

**Question 2**

You write a guardrail saying the agent must never discuss claim timelines, then point it at an entire SharePoint site that includes the claim handling standard. What is the likely result?

A. The guardrail holds, since instructions outrank sources
B. The agent answers timeline questions anyway, because a wide source quietly overrides a narrow instruction
C. The agent refuses all questions
D. The agent asks the user for permission first

---

**Question 3**

Your agent is built for card fraud intake. Someone feeds it an ACH claim. What should a well specified agent do?

A. Apply the card checklist, since the items are broadly similar
B. Refuse to respond at all
C. Say the standard does not cover this claim type, identify which requirements do not apply, and continue with what does
D. Answer from general knowledge about ACH disputes

---

**Question 4**

You run three tests on your new agent and all three pass. What is the most likely explanation?

A. The agent is well built and ready to share
B. You tested the same in scope task three different ways
C. The knowledge source is too narrow
D. The starter prompts need work

---

**Question 5**

Why do starter prompts matter more than they appear to?

A. They improve the accuracy of the underlying instructions
B. They are required by the platform
C. Most users click one instead of typing, so they define what the agent actually gets used for
D. They make the agent load faster

---
---

## Answer key

**1. B.** Reviews a draft intake note and reports what is missing or vague.

A and D are topics, not jobs. C contains two "ands" and describes three agents wearing one name. B names a specific input, a specific standard, and a specific output, which means you can tell whether it worked. If you cannot tell whether an agent worked, you cannot improve it.

**2. B.** The agent answers timeline questions anyway.

This is the most practical trap of the week. Guardrails written in instructions are not enforced boundaries, they are strong suggestions. When the knowledge source contains material the guardrail prohibits discussing, the material tends to win, especially when a user asks directly. Narrowing the source is the actual control. Point agents at named documents, not at sites.

**3. C.** Say the standard does not cover it, then continue with what applies.

Option A is what an untested agent does, and in the exercise it produces real harm: it asks about card possession on an ACH claim while missing that the member gave a code to a caller. Option B is over correction, since some requirements still apply and the agent can still help. The behavior in C only happens if you wrote an instruction for it, which is why out of scope handling belongs in every spec.

**4. B.** You tested the same task three ways.

A first build essentially always has at least one out of scope behavior it should not have. If nothing failed, the tests were variations of "check this note." Real tests go next door to the job and into material the sources do not cover. You would rather find the hole than have a colleague find it while a member is waiting.

**5. C.** Most users click a starter instead of typing.

This is a design decision disguised as decoration. If your starters advertise something the guardrails block, users will ask for it and get refused, and they will conclude the agent is broken. If your starters steer toward what the agent does well, usage concentrates there. You can change what an agent gets used for without touching a single instruction, just by rewriting the starters.

---

## If you missed two or more

Question 2 is the one to reread. The instinct that a strongly worded instruction will hold back a wide knowledge source is intuitive and wrong, and it is the assumption most likely to cause a problem with something you build after this boot camp ends.
