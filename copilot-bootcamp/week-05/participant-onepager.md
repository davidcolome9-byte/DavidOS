# Week 5: Copilot as Agent Builder

**One hour. Print this or keep it open in a second window.**

## The idea in one sentence

An agent is a saved set of instructions with a name, one job, and a fixed list of sources, so people who never learned prompting get the benefit anyway.

## What an agent is not

It is not autonomous. It does not go do your job. It does not learn about your team over time unless you rebuild it.

If that sounds like a downgrade, consider what it actually gets you: the best prompt writer on the team builds it once, and twenty people use it without learning any of this.

## What you learn today

- The five parts of an agent spec
- Why narrow agents beat broad ones every time
- Why starter prompts quietly determine what an agent gets used for
- How to test by trying to break it, not by confirming it works
- Why every shared agent needs an owner and a review date

## The five part spec

**1. Name and one line job.**
If your job description contains the word "and," you have two agents. Pick one.

**2. Instructions.**
Week 3's framework, written once instead of typed daily. Goal, context, source boundary, shape. Plus one new thing: what to do when a request is out of scope.

**3. Knowledge sources.**
What it is allowed to read. Point it at specific documents, not an entire site. A site usually holds three versions of the same policy and the agent cannot tell which is current.

**4. Starter prompts.**
Three to five example questions shown to the user. Most people click a starter instead of typing, so these effectively define what your agent gets used for. Write them last and write them carefully.

**5. Guardrails.**
What it must never do. This is the part that keeps an agent from becoming a liability.

## Narrow beats broad

| Agent scope | Result |
|---|---|
| One task | Right most of the time |
| Everything | Right some of the time |

Nobody uses a tool that is right sixty percent of the time. Build the one that is right about one thing.

## Testing means breaking

Three tests, in this order. Skip the first one fast.

**Test 1. In scope.** It will work. Boring. Move on.

**Test 2. Adjacent but out of scope.** Ask it to do something next door to its job. For a claim intake agent, ask it to write a member letter. Does the guardrail hold, or does it happily comply?

**Test 3. Missing information.** Ask something your knowledge sources do not cover. Does it say so, or does it fill the gap?

Tests 2 and 3 are the exercise. Test 1 is a warm up.

## What you practice today

You build a specification for one agent, using the synthetic scenario in the exercise. If your access allows it, you build the agent. If it does not, you simulate it by pasting your instruction block at the top of a Copilot chat and running the same three tests.

Both paths teach the same thing, because the instructions are what determine quality. The spec is the transferable artifact. The build is the easy part.

## What you submit

Post one reply in the Week 5 thread by end of day Friday containing:

1. Your complete five part spec
2. The three test questions you used and what happened
3. One thing your agent did that it should not have, and the instruction you changed to fix it
4. Who owns this agent and when it gets reviewed

Item 3 is the point of the whole week. An agent you could not break is an agent you did not test hard enough.

## What good looks like

A one line job with no "and" in it. Instructions that say what to do when a request falls outside scope. Two or three specific documents as sources rather than a whole site. Starter prompts that steer usage toward the thing the agent is good at. A guardrail that survived a real attempt to violate it, or one you added after it did not.

## What weak looks like

A job description like "helps the team with fraud questions." Instructions that are one paragraph of encouragement. A whole SharePoint site as the knowledge source. Three tests that all passed.

## Ground rules

- Synthetic scenario and synthetic sources only.
- Do not connect an agent to anything that takes an action in a real system during this exercise.
- Any agent you share with someone who will act on its output needs a named owner and a review date.

## Time budget

| Segment | Minutes |
|---|---|
| Framing | 5 |
| Teaching | 10 |
| Live build | 10 |
| Hands on | 20 |
| Debrief | 10 |
| Close | 5 |

## Looking ahead

Week 6 is the showcase. Five minutes each, one workflow you actually improved, with before and after. Start thinking about which one now, not the night before.
