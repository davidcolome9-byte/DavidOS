# Week 3: Copilot as Prompt Coach

**One hour. Print this or keep it open in a second window.**

## The idea in one sentence

When a prompt fails, one of four things is missing, and finding which one takes eight seconds.

## The four things

**Goal.** What you want to happen. Not the topic. The outcome.
**Context.** Who it is for and what constraints apply.
**Source.** What it is allowed to use.
**Shape.** Format, length, structure.

That is the whole framework. There is no fifth thing.

## What you learn today

- How to diagnose a bad output instead of rewriting the prompt blindly
- Which of the four is missing most often, and why it is usually shape
- Why a prompt that works for you can fail for a teammate
- How to coach somebody else's prompt without taking it over
- How to build a prompt other people can reuse

## What you practice today

You get five weak prompts pulled from realistic contact center, QA, reporting, fraud, and internal comms situations. All scenarios are fabricated. You will:

1. Rewrite three of them using the four elements
2. Hand your rewrites to a partner who runs them cold
3. Fix based on what your partner actually got, not what you expected
4. Document what was missing in each original

## The diagnostic move

When someone shows you a bad result, do not read their prompt hunting for flaws. Ask one question:

**Which of the four is missing?**

It is almost never more than one. It is usually shape or source.

Then add only the missing piece and rerun. Do not rewrite from scratch. If you rewrite everything, you learn nothing about what actually mattered.

## Weak versus strong, same task

| Element | Weak | Strong |
|---|---|---|
| Goal | Topic named | Outcome named |
| Context | Assumed | Stated |
| Source | Open | Scoped |
| Shape | Absent | Specified |

## The template

```
Goal: [what you want to exist when this is done]
Context: [who reads it, what they know, what constraints apply]
Source: [use only the text below / use my work content / general knowledge]
Shape: [format, length, structure]

[paste any source material here]

If something is not covered by the source, say "not stated" rather than
filling the gap.
```

Four to eight lines. If yours is a page, you are explaining instead of instructing.

## Why your prompt failed for your partner

Two reasons, and both matter.

The model is not deterministic. The same prompt can give different answers on different runs. That is normal and not a defect.

More importantly, you carried context in your head that never made it into the text. You knew who the audience was. Your partner did not, and neither did the model. A prompt only counts as reusable when it works for somebody who was not in your head when you wrote it.

## What this costs you outside the session

About 30 minutes. If you do not have that off the phone, do the first two items and skip the third. Two thirds submitted beats nothing submitted, and that is an operational statement, not encouragement.

## What you submit

Post one reply in the Week 3 thread by end of day Friday containing:

1. Three rewritten prompts, in full
2. For each one, which of the four elements was missing in the original
3. One sentence on what your partner's run showed that yours did not
4. One prompt you would put in the team library, marked clearly

Item 4 is the one that matters for the rest of the boot camp. Pick the prompt you would actually hand to a coworker.

## What good looks like

Rewrites that name a real outcome, a real audience, a real source boundary, and a real format. A diagnosis that names one missing element per prompt rather than saying "it was too vague." A partner note that describes something concrete, like "she got a member facing tone because I never said it was for internal use."

## What weak looks like

Rewrites that are just longer versions of the original with more polite language. A diagnosis that says "needed more detail." A library prompt so specific to one situation that nobody else could use it.

## Ground rules

- All scenarios are synthetic. Do not swap in real case details.
- Prompts you put in the team library must work without any of your personal context.

## Worth knowing

Fixing somebody else's prompt takes about two minutes once you have the four elements. Whether that turns into anything for you depends on your shop and I am not going to promise you it will. What it does reliably is stop the same question reaching you four times.
