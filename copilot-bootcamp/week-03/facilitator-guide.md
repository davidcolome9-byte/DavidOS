# Week 3 Facilitator Guide: Copilot as Prompt Coach

**Session length:** 60 minutes
**Format:** Teams meeting, pairs work in breakout rooms for part of the hour
**Prep time for you:** 25 minutes

## What you are trying to accomplish

Weeks 1 and 2 taught people to use Copilot. Week 3 teaches them to fix it when it does not work, and then to fix it for somebody else.

This is the week where the boot camp stops being a training and starts being a capability. A person who can write a good prompt helps themselves. A person who can look at somebody else's broken prompt and say "here is the one thing missing" multiplies across the floor. That second person is who you are trying to produce.

There is a self interested reason to care about this too, and you should say it out loud: the people who become the go to person for "hey can you help me word this" get visibility they did not have before. That is a fair trade for the effort and it is worth naming.

The hard part of this week is that people think prompting is about magic words. It is not. It is about supplying the four things the model does not have: the goal, the context, the source, and the shape of the output. When somebody's prompt fails, one of those four is missing, and the diagnosis takes about eight seconds once you know the list.

## Before you start

1. Read the five weak prompts in the exercise and rewrite each one yourself. You need to have done the work to coach it.
2. Set up breakout rooms in advance, pairs. Assign them rather than letting people self select, because self selected pairs put the two confident people together and strand everyone else. [ASSUMPTION: your Teams setup allows preassigned breakouts]
3. Pick one participant from Week 1 or 2 whose submission showed a clear before and after and ask them privately if you can use it in the demo. Real examples from the room beat invented ones.
4. Have a bad prompt of your own ready to show. Yours, not a hypothetical. This matters more than you think.

## Run of show

### 0:00 to 0:05 Open

Start with your own failure. Put a genuinely bad prompt of yours on screen, one that produced garbage, and show the garbage.

Then say:

> "Nobody in this room writes good prompts on the first try. Not me. The skill is not writing the perfect prompt. The skill is looking at a bad result and knowing which of four things is missing. That takes about eight seconds once you know the list, and by the end of today you will know the list."

This open does more for participation than any amount of encouragement, because it removes the fear that everyone else already knows how to do this.

### 0:05 to 0:15 Teach: the four missing things

This is the core content of the entire boot camp. Teach it slowly and do not add a fifth thing.

**Goal.** What do you actually want to happen. Not the topic, the outcome. "Something about the dispute policy" is a topic. "A script an agent can read to a member who is asking why their credit was reversed" is a goal. Most bad prompts name a topic and hope.

**Context.** Who is this for, what do they already know, what constraints apply. A summary for a director and a summary for a new hire are different documents. If you do not say which, you get a third thing that serves neither.

**Source.** What is it allowed to use. Pasted text only, your work content, general knowledge. This is the Week 1 lesson and it is where accuracy lives.

**Shape.** Format, length, structure. Five bullets. A table with three columns. Under 100 words. Two paragraphs and no headers. Naming the shape is the highest return per character of anything you can type.

Then give the diagnostic move, which is the actual coaching skill:

> "When someone shows you a bad output, do not read their prompt looking for what is wrong with it. Ask which of the four is missing. It is almost never more than one, and it is usually shape or source."

**Anticipated question here:** "Do I have to include all four every time?" No. Short tasks need one or two. Include all four when the output matters or when the first attempt failed.

### 0:15 to 0:25 Demo: repair in public

Take the participant example you cleared in advance, or use weak prompt number 2 from the exercise.

Show the weak prompt and its output. Then, out loud, run the diagnosis: "Goal, present. Context, missing, it does not say who reads this. Source, missing, it can pull from anywhere. Shape, missing." Add only the missing pieces. Rerun. Show the difference.

Do this twice with two different prompts so people see that the diagnosis is a repeatable move rather than a lucky guess.

Then do the thing that makes this week stick. Take a repaired prompt and deliberately break one piece, remove the shape instruction only, and rerun. Show that the output degrades in a predictable way. People believe the framework when they see it fail on command.

### 0:25 to 0:45 Hands on, in pairs

This is the only week with paired work. Send them to breakouts.

Instructions to give before they go, and repeat in chat:

1. Each person rewrites three of the five weak prompts alone, first eight minutes
2. Then swap. Your partner runs your rewritten prompt and tells you what they got
3. Fix based on what your partner saw, not what you expected

That third instruction is the whole exercise. A prompt that works only for the person who wrote it is not a reusable prompt, and the entire point of Week 3 is producing prompts other people can use.

Pop into two or three rooms. Do not stay long. Ask one question and leave: "Which of the four was missing?"

At 0:43, bring everyone back.

### 0:45 to 0:55 Debrief

Run this differently from other weeks. Do not ask for best results. Ask for diagnoses.

Question 1: "What was missing most often in the five weak prompts?" You will hear shape and source. Confirm it. That is a genuine finding about how people write.

Question 2: "Whose prompt worked for them and failed for their partner? What was different?" This surfaces assumed context, which is the hardest failure to see in your own writing.

Question 3, and give this real time: "What would you tell somebody on your team who says Copilot gave them a useless answer?" You are rehearsing the coaching move. Make two or three people say it out loud in their own words. People remember what they said, not what you said.

Close by naming the pattern: **goal, context, source, shape. Diagnose, do not rewrite.**

### 0:55 to 1:00 Submission and close

Restate submission. Preview Week 4: "Next week we point all of this at writing, including the letters that go to members, which is where the stakes get real."

## Talking points you can lift directly

On why prompting is a real skill and not a trick:

> "Writing a good prompt is the same skill as giving a good assignment to a new hire. If you tell a new agent 'handle the fraud calls,' you get whatever they imagine. If you tell them what good looks like, who is listening, what to use, and how long it should take, you get something usable. Nobody thinks that is magic when it is a person."

On the coaching angle:

> "The person who fixes other people's prompts becomes the person other people come to. That is worth something. I am telling you that plainly because it is true and because I would rather you know it than stumble into it."

On the fraud connection:

> "Interviewing a member about a disputed transaction is a prompt. If you ask 'tell me what happened' you get a story. If you ask 'walk me through where your card was on the fourteenth, starting with the morning' you get facts. Same skill, different interface."

On iteration:

> "Do not rewrite the whole prompt when it fails. Add the missing piece and rerun. Rewriting from scratch means you learn nothing about what actually mattered."

## Anticipated questions and how to answer them

**"Is there a list of prompts I can just copy?"**
Yes, in the shared folder, over forty of them. Use them. But copy the structure, not just the text, because the value is in being able to build one when the library does not have what you need.

**"How long should a prompt be?"**
As long as it needs and no longer. A prompt with all four elements is usually four to eight lines. If yours is a page, you are probably explaining instead of instructing.

**"Why did the same prompt give my partner a different answer?"**
Two reasons. The model is not deterministic, so identical inputs can produce different outputs. And your work content differs from theirs, so a prompt that reaches your files reaches different files for them. This is exactly why prompts meant to be shared should specify their source explicitly.

**"Is this going to change every time Microsoft updates Copilot?"**
The features will change. Goal, context, source, and shape will not, because they are about communication, not about the product.

**"What if my prompt works fine and I do not know why?"**
Then take it apart. Remove one element and see what breaks. That is ten minutes well spent and it is how you get from lucky to reliable.

## Failure modes for you, the facilitator

- **You turn this into a list of tips.** Twelve tips is worse than four elements. People remember four. Resist adding your favorite trick.
- **You demo only successes.** The break it on purpose demo is the one that teaches. Do not skip it for time.
- **You let pairs skip the swap.** Some pairs will just work in parallel and compare at the end. The swap is the exercise. Say it three times.
- **You answer the coaching question yourself in the debrief.** When you ask "what would you tell a teammate," wait. The silence is productive. If you fill it, you have run a lecture instead of a rehearsal.

## What to capture for your own records

Log which of the four elements was missing most often across the cohort. That is a real finding about how your team writes, it is specific, and it makes an excellent line in a program summary. Also log any participant who spontaneously coached another participant during breakouts, because that is the outcome this week exists to produce.
