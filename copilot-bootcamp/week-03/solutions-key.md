# Week 3 Solutions Key

Facilitator copy. Do not distribute before the debrief.

## Diagnosis for all five prompts

Know these cold. Participants will argue about some of them, and the arguing is good, but you need a position.

**Prompt 1, provisional credit reversal. Primary missing element: shape.**

The goal is roughly present, the source is not critical because this is general explanation, but there is no indication that the output will be read out loud to an upset member in the next thirty seconds. Add shape and it transforms. Context is the secondary miss, since "for a member who is upset about losing money" changes the register considerably.

**Prompt 2, QA coaching feedback. Primary missing element: context.**

The prompt contains excellent goal information and specific observations. What it never says is who reads this, what relationship they have with the writer, and what the document is for. Absent that, the model defaults to formal HR register, because that is the most common shape of written feedback in its training. Tell it this is a peer coaching note from a QA reviewer to an agent they work with, not a performance action, and the tone problem disappears.

**Prompt 3, weekly report. Primary missing element: shape.**

Notice that this prompt is more detailed than the others and still fails. Listing eight topics tells the model to cover eight topics, so it covers eight topics evenly, which is precisely wrong for a manager reading on a phone. The fix is not fewer topics. It is stating the consumption pattern: what changed, what needs a decision, everything else in one line or omitted.

This is the most instructive prompt in the set, because it disproves the belief that longer prompts are better prompts.

**Prompt 4, fraud case note. Primary missing element: shape.**

Secondary is source. The writer needs a structured note that separates facts, analysis, and decision, in the format the case system expects, so a colleague can pick it up cold. They asked for a write up and got prose. The word "write up" does not carry structure. Name the sections.

**Prompt 5, IVR announcement. Primary missing element: goal.**

This looks like a shape problem and is not. The writer never said what the announcement is supposed to accomplish. The real goal is "an agent knows what changed, when, and what to do differently, and does not need to ask me about it." Once you state that goal, the corporate padding has nowhere to live, because "we are excited to announce" does not serve it.

**Across the five: shape is missing three times, context once, goal once.** Source is never the primary miss in this set, which is deliberate, because Weeks 1 and 2 already hammered source. Tell the cohort this distribution during the debrief. It is a real finding and it will match their own experience.

## Worked example of a strong response

Take prompt 3, the weekly report, since it is the one most participants pick.

**Their rewrite:**

```
Goal: a weekly update my manager can read in 90 seconds on her phone between
meetings and know what changed and what needs her decision.

Context: she already knows our normal ranges. She does not need to be told
what our metrics are, only when they move. She has no time for background.

Source: use only the numbers I paste below. If a metric is not in the data,
do not mention it.

Shape:
- Line 1: the single most important change this week, with the number
- Then up to three bullets, each under 15 words, for anything else that moved
  outside normal range
- Then a section called "Needs your call" with any decision I am waiting on
- Anything stable gets one line: "Everything else within normal range"
- Total under 150 words, no headers, no preamble

[paste weekly numbers]
```

**What their partner got when running it cold:** a 130 word update that opened with the largest movement, listed two other changes, and had one decision item. Their partner said it was immediately readable and that they would have sent it.

**Their diagnosis note:**

> "Primary missing element was shape. The original was actually longer and more specific than my rewrite in one sense, because it listed eight metrics by name. That was the problem. Listing the topics told it to cover the topics evenly. Saying how the thing gets read told it what to leave out."

**Their partner note:**

> "My partner got almost exactly what I expected, which surprised me because I did not describe my manager at all beyond 'reads on a phone between meetings.' That one detail did more work than three sentences of description would have."

**Their library submission:**

> The weekly update prompt above, with a note: "Swap the source line and the numbers. Everything else works for any weekly update to any manager."

**Why this is strong.** The rewrite is shorter than the original and works better, which is the lesson of the week made concrete. The shape section describes consumption, not just format. The diagnosis names one element and explains why the more detailed original failed. The library entry identifies what is reusable and what has to be swapped, which is what makes a prompt a library prompt instead of a saved prompt.

## Failure mode one: politeness mistaken for specification

**What it looks like.** The rewrite of prompt 1 becomes:

```
Hi Copilot, could you please help me explain provisional credit reversal? I
would really appreciate a clear and helpful explanation. Please make it easy
to understand and professional. Thank you!
```

It is longer. It is friendlier. It produces the same four paragraphs as the original, possibly with a warmer opening line.

**Why it happens.** People model prompt writing on asking a colleague for a favor, and when you ask a colleague for a favor, softening language genuinely helps. It does nothing here. Politeness modifies tone, not specification, and this prompt still contains no goal beyond a topic, no audience, and no shape.

**The tell.** The rewrite got longer and no element of the four was actually added. Count elements, not words.

**How to fix it in the room.** Put the original and the rewrite side by side and ask the group to check off which of the four elements each contains. They will get identical scores. That comparison lands harder than any explanation and it takes thirty seconds.

## Failure mode two: the prompt that only works for its author

**What it looks like.** Someone rewrites prompt 2, the QA coaching feedback, and gets an excellent result. Their partner runs the identical text and gets something formal and stiff again. The author insists it worked when they ran it.

The rewrite usually contains a line like "write it the way we normally do coaching notes" or "match our team's tone."

**Why it happens.** The author has an internal picture of what their team's coaching notes sound like. That picture is doing the work in their head, and they cannot see that the words on the page do not carry it. The output looked right to them partly because they read it expecting it to be right.

There is a second contributor: the author's own work content may include real examples of coaching notes that the model can reach, while their partner's does not. Same prompt, different reachable material, different output. This is worth naming explicitly because it will keep happening after the boot camp ends.

This is the failure that kills prompt libraries. Someone contributes a prompt that works beautifully for them, three people try it, get mediocre results, and quietly stop using the library. The library dies not because the prompts were bad but because nobody tested them cold.

**The tell.** The prompt references "our" anything without defining it. Our tone, our format, our usual approach, how we normally do it.

**How to fix it in the room.** Ask the author to replace every instance of "our usual" with three concrete adjectives or an actual example. "Match our team's tone" becomes "direct, specific, no formal headers, written the way you would say it to someone standing next to you." Then have the partner rerun. The difference is immediate.

## Grading guidance

**On track.** Names one primary element per prompt. Rewrites are four to eight lines and contain specification, not encouragement. Partner note describes a concrete difference. Library prompt is genuinely portable.

**Needs a nudge.** Rewrites that are longer and more polite but not more specified. Reply with one line: "Count how many of the four elements you actually added. If the answer is zero, add shape and rerun."

**Needs a conversation.** Someone who says all five prompts were fine and the tool is the problem. This is not a skill issue, it is usually a person who has decided the program is not for them, and a thread reply will not move them. Talk to them directly, ask what they were hoping to get out of this, and listen to the answer. See the facilitation FAQ in the shared folder.

## What to log for the evidence tracker

Two things this week.

The distribution of missing elements across the cohort. If shape was the primary miss for most participants, that is a documented finding about how your team communicates, and it applies well beyond Copilot.

Any instance of a participant coaching another participant unprompted during breakouts. Write down both names. Peer coaching without a facilitator present is the outcome this week exists to produce and it is the hardest thing to claim later without notes.
