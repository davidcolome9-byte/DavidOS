# Week 2: Copilot as Analyst

**One hour. Print this or keep it open in a second window.**

## The idea in one sentence

Use Copilot to generate explanations, not to do your arithmetic.

## What you learn today

- The difference between calculation and interpretation, and why they carry different risk
- How to ask a real question instead of typing "analyze this"
- How to force competing explanations instead of accepting the first story
- How to check a number fast enough that you actually do it
- How to write a finding that a director can act on in one read

## What you practice today

You get two synthetic tables: eight weeks of contact center volume metrics and eight weeks of fraud claim counts for a made up credit union. Nothing in them is real. You will:

1. Ask a broad question and notice you got a description of the table back
2. Ask a specific question about something that broke the pattern
3. Force three ranked explanations with the evidence that would separate them
4. Verify the two or three numbers you plan to actually cite
5. Write three findings and one recommendation, short enough to read on a phone

## The pattern to remember

**Numbers get verified. Stories get generated.**

Copilot is unreliable at arithmetic and genuinely strong at producing plausible explanations you did not think of. Use it for the second thing and check the first thing yourself.

## Prompt scaffold to start from

```
Here is [description of data]. [paste table]

Question: [the actual thing you want to know, not "analyze this"]

Give me:
1. What the data shows, in three bullets, with the specific numbers
2. Three competing explanations for [the thing that changed], ranked by
   likelihood
3. For each explanation, what data would confirm it or rule it out
4. One recommendation I could act on this week

Do not speculate beyond what the data supports. Where you are inferring,
say "inference" so I can tell the difference.
```

The last line is what keeps you out of trouble when you forward the output.

## The three competing explanations rule

Any single explanation for a change in the numbers is a guess wearing a suit. If you only have one story, you have not analyzed anything, you have just described what you already believed.

This is the same discipline as a fraud review. You do not accept the first pattern that fits the transactions. You generate the alternatives and look for the one piece of evidence that eliminates two of them.

Ask for three. Rank them. Name the tiebreaker.

## What you submit

Post one reply in the Week 2 thread by end of day Friday containing:

1. Your final prompt, in full
2. Your three findings and one recommendation
3. One number you verified yourself and how you checked it
4. One sentence naming which of your three explanations you would investigate first and why

Item 3 is not optional. If you did not check a number, go check one now. It takes under a minute.

## What good looks like

Three findings that each contain a specific number and a plain language read of what it means for members. A recommendation specific enough that somebody could start it Monday. A verification note like "I recalculated the week 6 abandonment rate in Excel and got 11.2 percent, Copilot said 11.2 percent, matched." An investigation pick with a reason attached.

## What weak looks like

A summary of what the table already showed, written in longer sentences than the table used. One explanation stated as fact. A recommendation like "continue monitoring," which is what people write when they do not want to commit to anything.

## Ground rules

- Synthetic data only. The tables in the exercise are fabricated.
- Do not upload live reporting into this exercise.
- Label inferences as inferences when you pass work to somebody else.

## Time budget

| Segment | Minutes |
|---|---|
| Framing | 5 |
| Teaching | 10 |
| Demo | 10 |
| Hands on | 20 |
| Debrief | 10 |
| Close | 5 |

## One habit to take with you

When you send an analysis to anyone, include the sentence "what I would check next." It takes ten seconds, it makes you sound like someone who thinks past the report, and it protects you if the interpretation turns out to be wrong.
