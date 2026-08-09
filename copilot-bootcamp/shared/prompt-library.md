# Prompt Library

Fifty reusable prompts for contact center, fraud review, QA, reporting, and internal communications work.

## How to use this

Copy the structure, not just the text. The value is in being able to build one when the library does not have what you need.

Anything in square brackets is yours to fill in. Anything not in brackets is doing real work and should usually stay.

**Before you contribute a prompt:** test it on one other person who was not in the room when you wrote it. Untested library prompts are how libraries die. Three people try one, get mediocre results, and quietly stop opening the file.

**Data rule:** every one of these assumes you are following your organization's data handling guidance. Do not paste member identifying information into any of them. If you are unsure whether something counts, do not paste it.

**A note on the phrase "not stated":** it appears in many of these. Keep it. Giving the model an explicit alternative to guessing is the single highest return line in this entire file.

---

# Contact center operations

## 1. Turn conflicting policy documents into a call ready briefing

Use when three documents say three things and an agent needs one answer.

```
Using only the documents pasted below, build a quick reference for an agent
handling this on a live call.

Format: one line per scenario. For each, give the answer, the condition it
applies to, and the source document.

Rules:
- Where documents disagree, say so and name the more recent one
- End with a section called "Not stated" listing questions an agent gets
  asked that these documents do not answer
- Under 200 words total

[paste documents]
```

## 2. Find the gap before the member does

Use before publishing any agent facing guidance.

```
Read the guidance below as if you were a contact center agent who has to use
it while a member is on the phone and getting impatient.

List every question a member could reasonably ask that this guidance does not
answer. Rank them by how often you would expect them to come up.

Do not suggest improvements. Just find the gaps.

[paste guidance]
```

## 3. Build a de-escalation script from a real complaint pattern

```
Below is a description of a recurring member complaint. Write three things:

1. What the member is actually upset about, which may not be what they said
2. Three sentences an agent can say early to acknowledge it without admitting
   fault or promising an outcome
3. One thing an agent should not say, and why

Plain spoken language. Nothing that sounds like a script being read.

[paste complaint pattern]
```

## 4. Compress a long policy into what an agent actually needs

```
Reduce the policy below to what an agent needs at the moment of the call.

Keep: what to do, in what order, and the conditions that change the answer.
Drop: background, rationale, history, and anything an agent cannot act on.

Format as numbered steps. Under 150 words. If a step depends on a condition,
put the condition first so the agent can skip past it.

[paste policy]
```

## 5. Turn a call transcript into a case summary

Use synthetic or de-identified transcripts only.

```
From the transcript below, produce:

FACTS: what the member stated, in their words where it matters
ACTIONS: what the agent did or committed to
OPEN: anything promised but not completed, with who owns it
UNCLEAR: anything the transcript does not resolve

Do not infer intent. Do not characterize the member's tone.
Under 150 words.

[paste transcript]
```

## 6. Draft an internal escalation that gets picked up quickly

```
Write an escalation note for [team] about the issue below.

Open with what you need them to do and by when. Then the facts. Then what has
already been tried.

Under 120 words. No greeting, no closing pleasantries. The person reading this
is deciding in ten seconds whether to act now or later, so make that decision
easy.

[paste issue]
```

## 7. Pressure test a new process before it hits the floor

```
Below is a process we are about to roll out to the contact center.

List the five ways an agent will get this wrong in the first week. For each,
say whether the cause is that the process is unclear, that it is slower than
the workaround, or that it conflicts with something else they do.

Be specific. "Training will be needed" is not an answer.

[paste process]
```

## 8. Write hold and callback language that does not create expectations

```
Write three versions of what an agent says before placing a member on hold to
research [situation].

Requirements:
- Say what you are doing and roughly how long
- Do not promise an outcome
- Do not use the phrase "I will get this fixed for you"
- Sound like a person, not a policy

Then flag any phrase in your own drafts that a member could reasonably hear as
a commitment.
```

## 9. Build the FAQ from the calls you are actually getting

```
Below is a list of question topics from recent contacts. Group them into no
more than six themes.

For each theme give:
- The question as a member would phrase it, not as we would
- A one sentence answer, or "we do not have a current answer" if the material
  below does not support one

Do not invent answers. Missing answers are the useful output here.

[paste topic list and any source material]
```

## 10. Prepare for a difficult callback

```
I have to call a member back about [situation]. Help me prepare.

Give me:
1. The three things they are most likely to ask
2. The one question I probably cannot answer, and how to say so
3. The single sentence I should open with

Keep it under 100 words. I am reading this thirty seconds before I dial.
```

---

# Fraud review and disputes

## 11. Check an intake note for completeness

```
Review the draft claim intake note below against the intake standard I have
pasted above it.

MISSING: required items the note does not contain, by item number
VAGUE: quote each vague phrase and say what specific information replaces it
ASK: up to four questions the agent can read out loud to close the gaps

Under 200 words. If the note describes a claim type the standard does not
cover, say so first and identify which requirements do not apply.

[paste standard, then note]
```

## 12. Separate observed facts from conclusions in a case note

```
Rewrite the case note below into two sections.

OBSERVED: only what was directly recorded, seen, or stated by a party. No
characterization.
CONCLUDED: the analysis and the determination, with the reasoning visible.

If something in the original blends the two, put it under CONCLUDED and note
what evidence it rests on. If it rests on nothing stated, flag it.

[paste note]
```

## 13. Generate competing explanations for a transaction pattern

```
Below is a synthetic transaction pattern from a training case.

Give me three competing explanations, ranked by how well they fit the pattern.
For each one, state what evidence would confirm it and what evidence would
rule it out.

Do not tell me which is correct. I want the alternatives, including the one
that is inconvenient.

[paste pattern]
```

## 14. Audit a draft determination for unsupported assertions

The most important prompt in this file.

```
Below is a case file, then my draft determination.

List every factual claim in my draft that the case file does not support.
Include claims that are implied rather than stated directly. Pay specific
attention to any sentence that asserts what a person did, intended, or knew.

Do not rewrite anything. Just list.

[paste case file, then draft]
```

## 15. Convert a determination into member facing language

```
Rewrite the determination below as a letter to the member.

Hard rules:
- Use only findings stated in the determination
- Do not state or imply that the member authorized anything, unless the
  determination says so directly
- If the outcome is partial, say what they keep in the first two sentences
- Do not include internal analysis, device data, or investigative reasoning
- Under 200 words, plain language, sentences under 20 words

Then list separately anything you left out that you think I should double
check.

[paste determination]
```

## 16. Build the follow up question set from a thin statement

```
Below is a member's initial statement about a disputed transaction.

Write the six questions I should ask next, ordered so the answers to early
ones inform the later ones. Each question should be one sentence and readable
out loud without sounding like an interrogation.

Then list what the statement already establishes so I do not ask it twice.

[paste statement]
```

## 17. Spot the inconsistency across statements

```
Below are two or more statements from the same synthetic case, taken at
different times.

List every point where they differ. For each, quote both versions and say
whether the difference is factual, a change in certainty, or a change in
wording only.

Do not draw a conclusion about credibility. Just find the differences.

[paste statements]
```

## 18. Draft the handoff note for a case someone else will finish

```
Write a handoff note for the case below so another investigator can pick it up
cold.

Sections: where it stands, what has been checked, what has not, what the next
action is, and any deadline.

The test: could someone with no prior knowledge of this case take the next
action without calling me? If not, say what is missing.

Under 200 words.

[paste case detail]
```

## 19. Build a pattern summary across multiple synthetic claims

```
Below are several synthetic claims from the same period.

Identify what they have in common: merchant, channel, amount range, timing,
account age, or entry point. Rank the commonalities by how unusual they are
relative to normal claim mix.

Say explicitly which commonalities are probably coincidental given the small
number of claims.

[paste claims]
```

## 20. Stress test your own theory

```
Here is my working theory about a synthetic case: [theory]

Here is the evidence: [evidence]

Argue against my theory. Give me the three strongest reasons it could be
wrong, and for each, say what I would need to find to rule that objection out.

Do not be balanced. Argue the other side.
```

---

# Quality assurance and coaching

## 21. Turn review notes into a coaching note the agent will read

```
Goal: a coaching note an agent will read and act on.
Context: this is peer coaching from a QA reviewer to an agent on the same
team. It is not a performance action and must not read like one.
Source: use only the observations below. Do not infer intent or attitude.
Shape: open with one specific thing they did well, described concretely. Then
two things to change, each with what to do instead. Under 150 words, no
headers, written the way I would say it standing next to them.

Observations:
[paste]
```

## 22. Check your own feedback for accusation language

```
Below is coaching feedback I drafted.

Flag every phrase that characterizes the person rather than the behavior.
Flag every sentence that assumes why they did something.

Do not rewrite it. Just show me the phrases with a one word reason for each.

[paste feedback]
```

## 23. Build a calibration set from disagreements

```
Below are two reviewers' scores and comments on the same synthetic calls.

For each call where they disagree, state what each reviewer appears to be
weighting differently. Then write one clarifying sentence for the QA standard
that would have prevented the disagreement.

Do not decide who was right.

[paste scores and comments]
```

## 24. Find the theme across a month of reviews

```
Below are the improvement notes from [number] call reviews this month.

Group them into no more than four themes. For each theme, say how many reviews
it appeared in and quote one representative example.

Then say which theme is a training problem, which is a process problem, and
which is neither. Explain each call briefly.

[paste notes]
```

## 25. Write the positive that does not sound hollow

```
Below is something an agent did well on a call.

Write two sentences recognizing it that a skeptical person would find
credible. Name the specific behavior and the specific effect it had.

Do not use the words "great," "excellent," or "amazing." Do not open with
"I wanted to take a moment."

[paste observation]
```

## 26. Prepare for a coaching conversation you are dreading

```
I have to give feedback to someone about [behavior]. I have been putting it
off.

Give me:
1. The opening sentence, which should be direct and not soften the point
2. The specific observable behavior, stated without characterization
3. The thing they will most likely say back, and how to respond
4. What I am willing to agree to

Under 150 words. Plain language.
```

## 27. Audit a QA form for questions that cannot be scored consistently

```
Below is our QA evaluation form.

Identify every item that two reasonable reviewers could score differently on
the same call. For each, say what makes it ambiguous: a vague adjective, a
missing threshold, or a judgment about intent.

Do not rewrite the form. Just find the ambiguity.

[paste form]
```

## 28. Turn a trend into a floor huddle talking point

```
Below is a QA trend from this month.

Write what a team lead says in a five minute huddle. Structure: what we are
seeing, one concrete example, what to do differently starting today, and one
sentence on why it matters to the member.

Under 120 words. Spoken language, not written language. It gets read aloud.

[paste trend]
```

---

# Reporting and analysis

## 29. The weekly update that gets read

```
Goal: a weekly update my manager can read in 90 seconds on her phone.
Context: she knows our normal ranges. She only needs to know what moved and
what needs her decision.
Source: use only the numbers pasted below. If a metric is not in the data, do
not mention it.
Shape:
- Line 1: the most important change, with the number
- Then up to three bullets, each under 15 words, for anything outside normal
- Then "Needs your call" with any decision I am waiting on
- Anything stable gets one line: "Everything else within normal range"
- Under 150 words, no headers, no preamble

[paste numbers]
```

## 30. Three competing explanations for a metric movement

```
Here is [description of data]. [paste]

Question: [the specific thing that changed]

Give me:
1. What the data shows, three bullets, with the numbers
2. Three competing explanations, ranked, and for each say which columns it
   explains and which it does not
3. What additional data would confirm or rule out each one
4. One recommendation I could start on Monday

Do not merge separate causes into one narrative. Mark inferences as
"inference."
```

## 31. Find what is still getting worse

```
Below is [number] weeks of metrics.

Ignore what improved. List only the measures that are still moving in the
wrong direction in the most recent period, even if they are small.

For each, say how many consecutive periods it has moved that way.

[paste data]
```

## 32. Sanity check a number before you send it

```
I am about to report this figure: [figure]

Here is the underlying data: [paste]

Show me the calculation step by step. State the formula you used. Then tell me
one way this number could be misleading even if the arithmetic is correct.
```

## 33. Rewrite an analysis for a different audience

```
Below is an analysis I wrote for [original audience].

Rewrite it for [new audience], who cares about [what they care about] and has
[time available].

Keep every factual statement exactly as written. Change only what leads, what
gets cut, and the vocabulary.

Then tell me what you cut and why.

[paste analysis]
```

## 34. Build the question list before you build the report

```
I am being asked to report on [topic] to [audience].

Before I pull any data, tell me the five questions this audience will actually
ask when they see the report. Then tell me which of those five my current plan
to report [what you plan to report] would not answer.
```

## 35. Turn a data pull into a one paragraph finding

```
Below is a data extract.

Write one paragraph, under 80 words, stating the single most important thing
in it and why it matters. No preamble, no methodology, no caveats about
limitations unless a limitation changes the conclusion.

Then, separately, list the caveats I left out so I can decide whether any
belong.

[paste extract]
```

## 36. Compare two periods without cherry picking

```
Compare [period A] to [period B] using the data below.

Rules:
- Report every measure in the data, including the ones that did not move
- Do not select the most favorable comparison window
- Where a change is within normal variation, say so rather than reporting it
  as a movement

[paste data]
```

## 37. Prepare answers to the hard questions about your own analysis

```
Below is an analysis I am presenting.

Give me the four hardest questions a skeptical person will ask, and for each,
either the answer from the data or an honest "we do not know that yet."

Do not soften the questions.

[paste analysis]
```

---

# Internal communications

## 38. The change announcement that does not generate forty questions

```
Goal: after reading this, an agent knows what changed, when, and what to do
differently, and does not need to ask me anything.
Context: contact center floor, read between calls, on a screen.
Shape: what is changing, when it starts, what you do differently, who to ask.
Four short sections, under 120 words total.

Rules:
- No opening line about being excited
- No sentence containing "commitment to" or "as part of our ongoing"
- Lead with the change, not the reason

[paste change details]
```

## 39. Strip the corporate padding from a draft

```
Below is a draft announcement.

Cut every sentence that does not tell the reader something they can act on or
need to know. Do not add anything. Do not improve the wording of what remains.

Then show me the word count before and after.

[paste draft]
```

## 40. Write the message that admits something went wrong

```
Write an internal message about [what happened].

Structure: what happened, what the effect was, what we are doing, what we need
from you.

Rules:
- Say what happened in the first sentence, plainly
- Do not use passive voice to hide who did what
- Do not apologize more than once
- No speculation about cause if the cause is not established

Under 150 words.
```

## 41. The meeting invite people actually prepare for

```
Write a meeting invite for [topic].

Include: the decision we are making or the question we are answering, what
each person should bring, and what happens if we do not decide.

Under 80 words. If there is no decision to make, say so, and I will cancel
the meeting.
```

## 42. Turn a long thread into a decision summary

```
Below is a long message thread.

Produce:
DECIDED: what was actually agreed, with who agreed
OPEN: what is still unresolved
OWNED: any action item and who owns it
UNCLEAR: anything people seem to be assuming differently

Do not summarize the discussion. Only the state it left things in.

[paste thread]
```

## 43. Write recognition that lands

```
Write a short recognition message about [person's specific contribution].

Name the specific thing they did and the specific effect. One or two sentences.

Do not use "went above and beyond," "team player," or "rock star." Do not
describe them as a person. Describe what they did.
```

## 44. Rewrite something so it survives being forwarded

```
Below is a message I am about to send.

Rewrite it assuming it will be forwarded to someone I did not intend to send
it to.

Keep the same information. Remove anything that reads as a complaint about a
person, an assumption about someone's motives, or a commitment I have not
confirmed.

Then tell me what you removed.

[paste message]
```

## 45. Build a huddle script from a written update

```
Convert the written update below into something a team lead reads aloud in
five minutes.

Spoken language, short sentences, one idea per sentence. Include one place to
stop and ask for questions.

Cut anything that only works in writing, like nested bullets or long numbers.

[paste update]
```

---

# Prompt repair and agent building

## 46. Diagnose a prompt that did not work

```
Here is a prompt I wrote and the output it produced.

Tell me which of these four is missing or weakest: the goal, the context, the
source boundary, or the output shape. Name one, not all four.

Then show me the single line I should add. Do not rewrite the whole prompt.

Prompt: [paste]
Output: [paste]
```

## 47. Make a prompt portable

```
Below is a prompt that works for me.

Find every place where it relies on knowledge I have that is not in the text.
Look specifically for phrases like "our usual," "the normal format," or "the
way we do these."

Replace each with something explicit enough that a colleague could run this
without asking me anything.

[paste prompt]
```

## 48. Break your own prompt on purpose

```
Below is a prompt I am about to add to our team library.

Give me three inputs that would make this prompt produce a bad or misleading
result. Then tell me what line I could add to guard against each.

[paste prompt]
```

## 49. Draft an agent specification

```
Help me write an agent specification for this job: [one sentence, no "and"]

Produce all five parts:
1. Name and one line job
2. Instructions, including what to do when a request falls outside the job
3. Knowledge sources, and why nothing wider
4. Three to five starter prompts
5. Guardrails: what it must never do

Then tell me if my one line job is actually two jobs.
```

## 50. Generate break tests for an agent

```
Below is an agent specification I wrote.

Give me six test inputs designed to make it fail:
- Two that are adjacent to its job but outside it
- Two that require information its knowledge sources do not contain
- Two that are inside its job but unusual in shape

For each, say what a correct response looks like.

[paste spec]
```

---

## Contributing

Add prompts here when you have one you have used more than twice and tested on one other person. Include a one line "use when" so somebody scanning can find it.

Remove prompts that stop working. A library with fifty prompts where six are stale is worse than a library with forty four that all work.
