# Week 4: Copilot as Writing Coach

**One hour. Print this or keep it open in a second window.**

## The idea in one sentence

The same facts have to be written three different ways for three different readers, and the hard part is deciding what to leave out.

## What you learn today

- How to write one set of facts for a supervisor, a case file, and a member
- Why confidence language is a factual claim and not a style choice
- How to catch an assertion your source does not support
- Why editing your own draft beats generating a new one
- How to write something a colleague can pick up cold in six months

## What you practice today

You get a synthetic fraud case file for a made up credit union. Nothing in it is real. From that one file you will produce:

1. A supervisor summary, under 100 words
2. An internal case note a colleague could use cold
3. A member facing letter, under 200 words

Then you will hunt your own outputs for claims the file does not support.

## Three readers, three jobs

| Document | Reader asks |
|---|---|
| Supervisor summary | Do I need to do anything |
| Case note | Can I pick this up cold |
| Member letter | What happened to my money |

Same facts. Different order, different length, different vocabulary, and very different decisions about what to omit.

## Confidence language is a factual claim

Read these two sentences carefully.

> "We were unable to substantiate that the transactions were unauthorized."

> "We determined the transactions were authorized by you."

Those are not two ways of saying the same thing. The first says the evidence did not support the claim. The second says the member filed a false claim. Copilot will write either one with the same smooth confidence, and it tends to drift toward the second because it is a cleaner sentence.

Before you submit anything, search your own text for these words:

**determined, confirmed, established, verified, proved, found that**

Each one asserts something about what you know. Check the source for each.

## Editing beats generating

Most people default to generation. Generation is the flashy use. Editing is the valuable one.

**Generation prompt:**
```
Write a member letter explaining the denial.
```

**Editing prompt:**
```
Here is my draft. Cut it to 150 words. Do not change any factual statement.
Separately, list anything I claimed that the case file does not support.
```

The second one keeps your judgment in the document and uses the model for what it is genuinely good at: compression and consistency checking. The list of unsupported claims is the real product. The shorter draft is a bonus.

## The prompt scaffold for this week

```
Goal: [which of the three documents you are producing]
Context: [who reads it, what they need to decide, what they must not be told]
Source: use only the case file below. If it does not establish something,
do not assert it.
Shape: [word limit, structure, tone]

Do not state or imply any finding the case file does not contain.

[paste case file]
```

The "do not state or imply" line is the one doing the work.

## What you submit

Post one reply in the Week 4 thread by end of day Friday containing:

1. All three documents
2. One assertion you caught in your own draft that the case file did not support, and how you fixed it
3. One sentence on something you deliberately left out of the member letter and why

Item 2 is required. If you did not catch anything, look again. There is at least one in almost every first draft.

## What good looks like

A supervisor summary that opens with what needs a decision. A case note where facts and conclusions are visibly separate. A member letter under 200 words that a member could read twice, once fast and once angry, without finding something to fight about. An omission note that names a specific thing and a specific reason.

## What weak looks like

Three documents that are the same document at three lengths. A member letter containing internal reasoning about fraud patterns. Any sentence that says "we determined" about something the file never determined.

## Ground rules

- The case file is fabricated. Do not substitute real case details.
- Nothing you produce here goes to any real member.
- Every word that leaves the building has a human owner. Not the tool.

## Time budget

| Segment | Minutes |
|---|---|
| Framing | 5 |
| Teaching | 10 |
| Demo | 10 |
| Hands on | 20 |
| Read aloud | 10 |
| Close | 5 |

## One habit to take with you

Read anything member facing out loud before you send it. Members read letters out loud to their spouse. Text that survives being spoken is text that survives being forwarded.
