# Week 3 Exercise: Five Broken Prompts

**Time: 20 minutes. Work in pairs.**

Every scenario below is fabricated. Riverstone Credit Union does not exist. Do not substitute real cases, real members, or real internal documents.

## The scenario

Five people on a made up contact center team tried to use Copilot last week. All five got answers they did not use. All five concluded the tool was not that helpful.

You have their prompts and a short note about what they were actually trying to do. None of them are stupid prompts. They are the prompts a reasonable person writes on a Tuesday when they are busy, which is exactly why they are worth studying.

## Your job

Diagnose and repair. Then prove the repair works for somebody other than you.

## Step by step

**Minutes 0 to 8, alone.**

Pick three of the five prompts. For each one:

1. Name which of the four elements is missing. Goal, context, source, shape. Pick the primary one. Do not list all four.
2. Rewrite the prompt, adding the missing element and anything else genuinely required.
3. Run it. Keep the output.

**Minutes 8 to 16, swap.**

Send your three rewritten prompts to your partner with no explanation. No context, no "this is for a supervisor," nothing. Just the prompt text.

Your partner runs each one and tells you what they got.

**Minutes 16 to 20, fix.**

Repair based on what your partner actually received. If your partner's output was wrong for the intended purpose, your prompt is carrying context that only exists in your head. Move that context into the text.

## The five broken prompts

### Prompt 1. From an agent on the phone queue

**What they were trying to do:** get a short explanation they could read to a member who was asking why their provisional credit was reversed after the claim was denied.

**What they typed:**

```
explain provisional credit reversal
```

**What they got:** four paragraphs of general background about how provisional credit works in the banking industry. Accurate, useless on a live call.

---

### Prompt 2. From a QA reviewer

**What they were trying to do:** turn their notes from a call review into coaching feedback the agent would actually read and act on, without it sounding like a write up.

**What they typed:**

```
Write coaching feedback for this call review. The agent was polite but did
not verify the member properly and forgot to set expectations about timing.
Also they talked over the member twice.
```

**What they got:** a formal document with headers, a numbered improvement plan, and language about performance expectations. It reads like the first step of a disciplinary process. The reviewer did not send it.

---

### Prompt 3. From a team lead building a weekly report

**What they were trying to do:** summarize the week for their manager, who reads on a phone between meetings and wants to know only what changed and what needs a decision.

**What they typed:**

```
Summarize our weekly contact center performance. Include call volume, handle
time, first contact resolution, abandonment, chat volume, fraud claim counts,
staffing, and any notable issues.
```

**What they got:** a complete and thorough report covering all eight topics at equal length. Roughly 900 words. The manager did not read past the second paragraph.

---

### Prompt 4. From someone in fraud review

**What they were trying to do:** draft the internal case note explaining why a synthetic test claim was denied, in the format the case system expects, so another investigator could pick it up cold.

**What they typed:**

```
Help me write up why this claim was denied. The member said the transactions
were not theirs but the device and location matched their normal pattern and
they had used the same merchant before.
```

**What they got:** a well written narrative paragraph that reads like a story. It buries the decision, does not separate facts from conclusions, and does not follow any consistent structure, so the next investigator would have to reread the whole thing to find the reasoning.

---

### Prompt 5. From someone writing an internal announcement

**What they were trying to do:** tell the contact center floor that the IVR menu was changing on Wednesday, in a way that would actually get read and would not generate forty questions.

**What they typed:**

```
Write an announcement about the IVR menu change.
```

**What they got:** a corporate announcement full of phrases like "we are excited to announce" and "as part of our ongoing commitment to member experience." It does not say what is changing, when, or what an agent should do differently.

---

## The diagnosis you are looking for

Each of these five has one primary missing element. Some have a secondary one. Name the primary.

Resist the urge to say "all four were missing." That is technically true for most weak prompts and it teaches you nothing. The coaching skill is picking the one that would fix the most with the least added text.

## Rewrite requirements

Your rewrites must:

- Be four to eight lines, not a page
- Work for somebody who was not in the room when the original was written
- Specify a source boundary where the task involves facts
- Name a shape that matches how the output will actually be consumed

That last one is worth sitting with. An output read on a phone between meetings has a different shape than an output pasted into a case system. Same information, different shape, and the shape is what determines whether anyone reads it.

## The partner test

When your partner runs your prompt, one of three things happens:

**They get roughly what you expected.** Your prompt carries its own context. Good.

**They get something reasonable but aimed at the wrong audience.** You left context in your head. Most common outcome, and the most useful one to learn from.

**They get something unusable.** Usually a missing source boundary. The model filled the gap with general knowledge and the general knowledge was not what the job needed.

Write down which of the three happened. That note is part of your submission.

## Submission

Post in the Week 3 thread by Friday end of day:

1. Three rewritten prompts, in full
2. For each, the primary missing element in the original
3. One sentence on what your partner's run revealed
4. One prompt you would add to the team library, marked clearly

## Stretch goal, only if you finish early

Take your best rewrite and break it on purpose. Remove the shape instruction, rerun, and look at what degrades. Then remove the source boundary instead and rerun. Knowing which element does the most work for a given task is the difference between following a template and actually understanding it.
