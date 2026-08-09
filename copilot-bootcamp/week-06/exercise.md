# Week 6 Exercise: Your Capstone and Evidence Card

**Prep before the session. Card due Friday.**

Anything you present must use synthetic examples. If your improved workflow touches real member information, show the prompt and the structure, describe the input in general terms, and use fabricated content in any example you put on screen.

## Part one: pick your workflow

Do this before Tuesday, not the night before.

Pick something you do repeatedly. Repetition is what makes a number meaningful. A one time task that went well is a story. A recurring task that got shorter is evidence.

Good candidates:

- A document you write on a schedule
- A check step you added before submitting something
- A recurring analysis or report
- An agent you built that somebody actually used
- A thing you tried that did not work, with a clear reason

**A test for whether you picked well:** can you say what it cost before, with a number, without doing new research? If yes, present it. If you have to go build a measurement first, pick something else. You have days, not weeks.

## Part two: get your before number

You probably did not measure before you started. Almost nobody does. Here is how to produce an honest number anyway.

**Best. You measured or you have a record.** Ticket counts, submission timestamps, a calendar block you actually used. Use it and say where it came from.

**Good. Timed reconstruction.** Do the task the old way once and time it. Say "timed once in [month]."

**Acceptable. Honest recall with a range.** "It used to take most of a morning, call it two to three hours." Say it is recall.

**Not acceptable.** A percentage with no underlying counts. "Forty percent faster" with nothing behind it will be doubted by anybody who has ever run a process improvement, and once they doubt one number they doubt the rest of your presentation.

## Part three: build your five minutes

**Slide or no slide, your choice.** A prompt on screen beats a slide about a prompt.

**Structure, roughly one minute each:**

1. Workflow in one sentence
2. Before, with a number and where it came from
3. What you changed, shown on screen
4. After, with the same measure
5. What did not work

**Practice once with a timer.** Five minutes is shorter than it sounds. Most people run eight on their first pass and cut two things.

## Part four: the evidence card

Due Friday. Fifteen minutes. This is the real deliverable.

Copy the template below, fill it in, post it in the Week 6 thread, and keep your own copy somewhere you will find it in a year.

---

### EVIDENCE CARD

**Name:**
**Function:**
**Date completed:**

**1. The workflow**
One sentence. What, when, for whom.

**2. Before**
The measure, the number, and where the number came from.

**3. What I changed**
The prompt, the agent, or the habit. Paste it in full. If it is an agent, include the one line job and the guardrails.

**4. After**
Same measure, new number, over what period.

**5. Quality effect**
Did the output get better, worse, or stay the same? How do you know? Faster and worse is a real result and it belongs here.

**6. What did not work**
At least one thing. Required.

**7. Who else can use this**
Name a person or a role, and say what they would need to change to reuse it.

**8. What I would tell someone starting**
Two sentences.

**9. Reusable artifact**
Paste the prompt or agent spec, cleaned up so somebody else can run it without asking you questions. If there is nothing reusable, write "none" and say why.

---

## Part five: the two week commitment

Before you leave Tuesday's call, name one person you will show one thing to within two weeks.

One person. One thing. Two weeks.

Write it here so you have it:

**Person:**
**Thing I will show them:**
**By when:**

## Worked example of a filled card

This is fabricated, using synthetic material, and shows the level of detail that makes a card useful.

---

**Name:** [participant]
**Function:** Contact center, QA review
**Date completed:** week 6

**1. The workflow**
Every Monday I write coaching notes for four call reviews and send them to the agents I reviewed.

**2. Before**
About 25 minutes per note, so roughly 100 minutes a week. Timed twice in month one, both around 24 to 27 minutes. Most of that was rewriting to get the tone right so it did not read like a write up.

**3. What I changed**
Built one prompt, reused for every note. Full text:

```
Goal: a coaching note an agent will read and act on.
Context: this is peer coaching from a QA reviewer to an agent on the same
team. It is not a performance action and must not read like one. The agent
has been here about a year.
Source: use only the observations I list below. Do not infer anything about
intent or attitude.
Shape: open with one specific thing they did well, quoted or described
concretely. Then two things to change, each with what to do instead. Under
150 words. No headers. Write it the way I would say it standing next to them.

Observations:
[my notes]
```

**4. After**
About 9 minutes per note, roughly 36 minutes a week. Measured across four weeks. Savings of about an hour a week.

**5. Quality effect**
Better, and I have something behind that. Before, I was skipping the "one thing they did well" part when I was rushed, because it was the easiest thing to cut. The prompt makes it structural, so it stopped getting dropped. Two agents mentioned unprompted that the notes felt less like being written up.

**6. What did not work**
My first version said "match our usual coaching tone." That meant nothing to the model and I got formal HR language back three times before I understood why. I had to replace it with actual description: peer to peer, not a performance action, written the way I would say it out loud. Also tried building an agent for this in Week 5 and abandoned it, because I am the only person who writes these and the prompt was enough.

**7. Who else can use this**
Anyone doing call reviews. The two team leads on the evening shift do the same task. They would need to swap the observations section and change the context line to describe their relationship with their team.

**8. What I would tell someone starting**
Do not tell it to match your usual tone, because it does not know your usual tone. Describe the relationship between the writer and the reader and the tone follows from that.

**9. Reusable artifact**
The prompt above, complete. Swap the observations, adjust the context line, done.

---

## Why this card is worth the fifteen minutes

Read section 5 again. "I was skipping the positive when I was rushed, and the prompt made it structural" is a better outcome than the time savings, and it is the kind of thing nobody remembers six months later unless they wrote it down.

Read section 6. Admitting an abandoned agent makes everything else on the card more believable. A card with no failures reads like a sales pitch.

Read section 9. That prompt is now usable by two other people without a conversation. That is what turns a personal improvement into something with a wider effect, and it is the difference between a card that describes what you did and one that shows what you produced.

## Submission

Post your evidence card in the Week 6 thread by Friday end of day. Keep your own copy somewhere you will still have it in a year.
