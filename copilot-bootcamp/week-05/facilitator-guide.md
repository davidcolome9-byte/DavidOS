# Week 5 Facilitator Guide: Copilot as Agent Builder

**Session length:** 60 minutes
**Format:** Teams meeting, screen sharing during build and test
**Prep time for you:** 45 minutes. This is the heaviest prep week.

## What you are trying to accomplish

Weeks 1 through 4 taught people to write a good prompt each time they need one. Week 5 is where they stop retyping.

An agent is a reusable set of instructions with a name, a defined job, and a fixed set of sources. That is the honest description and it is the one to lead with. Participants who arrive expecting something autonomous and futuristic will be disappointed by the reality, so set the expectation immediately: you are packaging a prompt so that other people can use it without knowing how to write it.

That framing is not a downgrade. It is the point. The value of an agent is that the person who does not want to learn prompting gets the benefit anyway, from an agent your best prompter built.

Three things have to land:

One. An agent is instructions plus scope plus sources. Nothing mystical.

Two. A narrow agent that does one thing well beats a broad agent that does everything adequately. Every failed agent in a corporate rollout was too broad.

Three. Testing an agent means trying to break it, not confirming it works.

## Before you start

1. **Post the exercise file and the one pager in the channel thread** the morning of the session, and paste the link again at 0:00 and 0:25.
2. **Confirm what your tenant actually allows.** This is the week where facilitator prep can fail badly. Find out before the session whether participants can create agents, whether creation requires an admin, and which surface is available to them: Copilot Studio, agent building inside Microsoft 365 Copilot, or nothing at all.
3. **Build the example agent yourself and test it.** Not optional. You will demo it live.
4. **Prepare the fallback.** If nobody can create agents in your environment, the entire exercise still works as a written specification exercise plus manual simulation, where participants paste their instruction block at the top of a Copilot chat and treat that chat as the agent. Say this plainly at the start rather than discovering it mid session. The spec is the transferable skill either way.
5. **Time a publish and index cycle yourself.** An attached knowledge source does not become readable the instant you publish. If it takes more than two minutes in your tenant, say so at 0:25, or the room will spend the exercise debugging instructions that were fine.
6. **Have a governance answer ready.** Someone will ask who owns agents, who reviews them, and what happens if one gives bad guidance. If your shop has no answer yet, say that, and say what you would recommend. Do not improvise a policy.

## Run of show

### 0:00 to 0:05 Open and deflate

Deliberately lower expectations in the first thirty seconds.

> "An agent is a saved set of instructions with a name and a fixed list of sources. That is it. If you were expecting something that goes off and does your job, this is not that, and anybody selling you that is selling you something. What it actually does is let the best prompt writer on the team build something the other twenty people can use without learning any of this."

Then raise the stakes:

> "Which means the quality of the agent is entirely the quality of the instructions inside it. Everything from the last four weeks is what makes this week work."

### 0:05 to 0:15 Teach: the five parts of an agent spec

Teach the spec, not the interface. Interfaces change. The spec transfers.

**Name and one line job.** If you cannot write the job in one sentence, the agent is too broad. "Helps with fraud stuff" is not a job. "Checks a draft claim intake note for missing information before it is submitted" is a job.

**Instructions.** This is your Week 3 framework, written once instead of typed daily. Goal, context, source boundary, shape. Plus one thing prompts do not need: what to do when the request is outside scope.

**Knowledge sources.** What the agent is allowed to read. Narrow is better. An agent pointed at one well maintained document outperforms an agent pointed at an entire SharePoint site, because the site contains three outdated versions of the same policy.

**Starter prompts.** Three to five example questions shown to the user. These do more work than people expect. Most users will click a starter rather than type, so the starters effectively define what the agent gets used for.

**Guardrails.** What it must never do. Never give a specific timeline without citing the source document. Never draft member facing text. Never state a determination. These are the sentences that keep an agent from becoming a liability.

**Anticipated question here:** "Can the agent take actions, like open a claim?" Depending on configuration, some agents can connect to other systems. Do not build that in a boot camp. Read only agents that help a person think are the right starting point, and they are where all the early value is. Say that plainly.

### 0:15 to 0:25 Demo: build one live

Build the example agent on screen in about six minutes. Talk through each of the five parts as you fill it in.

Then spend four minutes on the part that matters: **try to break it.**

Ask it three things in this order:

1. Something squarely in scope. It will work. Move on quickly, this is the boring part.
2. Something adjacent but out of scope. For a claim intake agent, ask it to write a letter to the member. Watch whether the guardrail holds. If you did not write a guardrail, it will cheerfully write the letter, which is a better demo than if it refuses.
3. Something that requires information the knowledge source does not contain. Watch whether it says so or fills the gap.

If it fails any of these, fix the instruction live and rerun. Doing this on screen is the single most useful thing you do all session, because it shows that agent building is iterative and not a one shot configuration exercise.

### 0:25 to 0:45 Hands on

Twenty minutes. Everyone does the same thing in the session, regardless of what their account can do.

**In the session:** write the spec, paste the instruction block as the first message in a Copilot chat, paste the standard under it, and run the three break tests against that chat.

**Homework, for anyone who can create agents:** build it for real afterward and post what changed.

Announce it this way round rather than as a main path and a fallback. Building the thing takes ten to twenty minutes on a cooperative tenant and teaches almost nothing. The instructions are what determine quality, and the chat tests them identically.

Chat prompts to drop:

At 0:30: "If your one line job description has the word 'and' in it, you have two agents. Pick one."

At 0:36: "Stop testing whether it works. Test whether you can make it do something it should not."

At 0:41: "Write down one thing it got wrong. That is your submission, more than the agent itself."

At 0:43: two minute warning.

### 0:45 to 0:55 Debrief

Ask two people to share screens and demo their agent, including a failure.

Questions to ask, in order:

1. "What is the one line job?" Anyone who cannot answer in one sentence built something too broad, and this becomes obvious to the whole room without you saying it.
2. "What did you get it to do that it should not have done?" This is the real question. Give it most of the time.
3. "What did you change after that?"

Then ask the room the governance question directly:

> "If twenty people build agents like this and each one gives slightly different guidance about claim timelines, what happens in six months?"

Let them answer. They will land on the problem themselves: agents drift, sources go stale, and nobody owns them. That realization matters more than any policy you could state, and it sets up the capstone, where every agent needs a named owner and a review date.

Close by naming the pattern: **narrow job, tight sources, explicit guardrails, break it before you share it.**

### 0:55 to 1:00 Submission and close

Restate submission. Preview Week 6 clearly and with some weight, because people need runway:

> "Next week is the showcase. Five minutes each, one workflow you actually improved, with before and after. Start thinking about which one now, not Monday night."

## Talking points you can lift directly

On why narrow wins:

> "Every agent that fails in a company fails the same way. Somebody built one agent to handle everything, the instructions became a page long, and it does eleven things at about sixty percent quality. Nobody uses a tool that is right sixty percent of the time. Build the one that is right ninety five percent of the time about one thing."

On why the spec matters more than the build:

> "The interface will change. Microsoft will move buttons and rename things twice before next year. The five part spec will still be the five part spec, because it is a description of what you want, not a description of the software."

On testing:

> "Ask it the thing you would be embarrassed to have it get wrong in front of a member. If you have not done that, you have not tested it."

On finding the hole first:

> "Find the hole before somebody on the floor finds it while a member is waiting. That is the entire reason we are spending most of the exercise on testing."

## Anticipated questions and how to answer them

**"Who is allowed to build these?"**
Answer based on your actual tenant configuration. If you do not know, say so and confirm by Friday. Guessing here creates a mess.

**"What happens if my agent gives someone wrong information?"**
The person who used it is still responsible for what they do with it, and the person who built it is responsible for the instructions. That is why guardrails and a named owner are part of the spec rather than optional extras.

**"Can it read our SharePoint?"**
Only what the user already has permission to see, same rule as Week 1. And you should point it at specific documents rather than an entire site, because a site usually contains multiple versions of the same policy and the agent cannot tell which one is current.

**"Should everybody build their own or should we have a few shared ones?"**
A few good shared ones, each with a named owner and a review date. Twenty personal agents giving twenty slightly different answers about claim timelines is worse than no agents.

**"Is this going to eliminate jobs?"**
Give a straight answer. See the facilitation FAQ in the shared folder for the longer version. The short version: this changes what the first draft costs, not whether the work needs judgment. Do not oversell the reassurance either, because people can tell.

**"Can I build one for my own use that nobody reviews?"**
For your own drafting, yes. The moment you share it with someone who will act on its output, it needs an owner and a review date. That is the line.

## Failure modes for you, the facilitator

- **You spend the session teaching the interface.** Buttons change, and half the room may be on Path B anyway. Teach the spec.
- **You demo an agent that works perfectly.** Then nobody tests theirs properly. Break yours on purpose, live.
- **You dodge the governance question.** Somebody will ask who owns this. If your organization has not decided, saying so is a fine answer. Inventing a policy on a Teams call is not.
- **You let the room believe agents are autonomous.** Correct this immediately every time it surfaces. Overselling in Week 5 produces disappointment in Week 6 and kills whatever adoption you built.

## What to capture for your own records

Log the number of participants who produced a working agent or a complete spec, and capture two or three specs in full. A written agent specification with instructions, sources, and guardrails is the single most concrete artifact this program produces, and it is the thing to show somebody who asks what the boot camp actually accomplished.

Also log every break test failure participants found in their own agents. Same reason as previous weeks: it demonstrates a control, not just enthusiasm.
