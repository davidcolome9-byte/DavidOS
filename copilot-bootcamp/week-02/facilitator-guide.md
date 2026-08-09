# Week 2 Facilitator Guide: Copilot as Analyst

**Session length:** 60 minutes
**Format:** Teams meeting, screen sharing expected during debrief
**Prep time for you:** 30 minutes, mostly because you need to test the spreadsheet yourself

## What you are trying to accomplish

Week 1 taught people to find things. Week 2 teaches them to count things and then say what the count means.

The gap this week closes is not technical. Most people on this team can read a metrics report. What they cannot do quickly is go from "here are the numbers" to "here is what I think is happening and here is what I would do about it." That second move is what gets someone noticed, and Copilot compresses the time it takes from an hour to about ten minutes.

The failure mode to fight all session is treating Copilot as a calculator. It is not a calculator. It is a pattern reader that will happily produce a confident number that is off by a factor of ten. Participants must leave knowing that arithmetic gets checked and interpretation gets used.

## Before you start

1. Build the synthetic workbook. The exercise file contains two tables in markdown. Paste them into an Excel workbook, one per sheet, and save it somewhere the cohort can copy from. Name the sheets `Contact Volume` and `Fraud Claims`. Do this yourself before the session and confirm Copilot in Excel can read it.
2. Run the exercise yourself end to end. You need to know what the numbers actually say so you can catch a wrong answer in the debrief.
3. Confirm which participants have Copilot in Excel available versus chat only. Not everyone will. The exercise is written so it works either way, using pasted tables, but you should know the split before you start. [ASSUMPTION: mixed availability across the cohort]
4. Have the answer to "what is our actual abandonment rate target" ready, or be ready to say you do not know.

## Run of show

### 0:00 to 0:05 Open and connect to last week

Do a fast callback. Ask one question: "Did anyone use last week's 'not stated' line on something real?" Take one answer, thirty seconds, then move.

Frame this week in one breath:

> "Last week we made Copilot find things. This week we make it count things. The trap is that it is very good at sounding like it did math and only sometimes actually did math. So we are going to use it for the part it is genuinely good at, which is noticing patterns and writing the interpretation, and we are going to check the arithmetic ourselves."

### 0:05 to 0:15 Teach: the three jobs in an analysis

Keep this tight. Three ideas.

**One. Separate calculation from interpretation.** These are different tasks and they carry different risk. If Copilot says the fraud claim rate rose 40 percent, verify it. If Copilot says "the increase clusters in the two weeks after the new online enrollment flow went live," that is a hypothesis and hypotheses cannot be wrong in the same way numbers can. Use it heavily for the second thing.

**Two. Give it the question, not just the data.** Pasting a table and typing "analyze this" produces a description of the table. Everybody can already read a table. The value comes from asking a real question: "Which week broke the pattern and what are three plausible explanations?"

**Three. Make it show competing explanations.** This is the fraud investigation instinct and it is the most transferable skill in the room. Any single explanation for a data movement is a guess. Three explanations, ranked, with what evidence would separate them, is analysis. Ask for that shape explicitly.

Say this out loud because several people in the room have fraud backgrounds and it will land:

> "In a fraud review you never accept the first story that fits the transactions. You generate the competing stories and then look for the one piece of evidence that kills two of them. Same discipline here. Copilot will give you one story if you ask for one story. Ask for three."

**Anticipated question here:** "Can I just upload the real report?" Answer: not in this boot camp, and check your data handling guidance before doing it with live reporting. The synthetic workbook is built to have the same shape as a real one, so the skills transfer without the risk.

### 0:15 to 0:25 Live demo

Share your screen with the synthetic workbook open.

**Pass one, the useless version.** Paste the Contact Volume table and type "analyze this data." Read the output. It will describe the table back to you in prose. Say: "This is a very expensive way to read a spreadsheet."

**Pass two, ask a real question.** "Week 6 volume jumped while average handle time also jumped. Normally those move in opposite directions when we staff up. Give me three competing explanations for both moving up together, ranked by how likely you think they are, and for each one tell me what data would confirm or kill it."

This output will be genuinely good. Let people read it. Do not talk over it.

**Pass three, catch it being wrong.** Ask it to compute something specific, like the percent change in first contact resolution between week 1 and week 8. Then compute it yourself on screen with a calculator or a cell formula. Whether it is right or wrong, do the check visibly. If it is right, say "it was right, and I still checked, and that took eight seconds." If it is wrong, you just got the best teaching moment of the session for free.

### 0:25 to 0:45 Hands on

Twenty minutes. Send them to the exercise.

Watch for these stalls:

- **People staring at the fraud claims table trying to do it manually.** Drop in chat at 0:30: "You are not being graded on arithmetic. Ask it the question, then check the two or three numbers you plan to actually cite."
- **People producing a wall of text.** Drop in chat at 0:36: "If your output is longer than the table, ask for it shorter. Three findings, one recommendation."
- **People who get one explanation and stop.** Drop in chat at 0:38: "Ask for the two explanations you did not think of."

At 0:42, two minute warning.

### 0:45 to 0:55 Debrief

This week the debrief should include a screen share, not just talking. Ask two people to show their output.

Run these questions:

1. "What did the numbers say?" Get the factual read.
2. "What did you think was causing it?" Get the interpretation.
3. "What would you check next to prove it?" This is the question that separates people who are going to do well in Week 6 from people who are going to coast.

Then run the accuracy check. Ask the room: "Did anybody catch Copilot doing arithmetic wrong?" Somebody will have. Give it real airtime. Ask what the wrong number was and how they noticed.

If nobody caught an error, say so honestly and add: "That does not mean there were none. It means we did not check enough. Check the numbers you cite."

Close by naming the pattern: **numbers get verified, stories get generated.**

### 0:55 to 1:00 Submission and close

Restate the submission. Preview Week 3 in one line: "Next week we stop learning prompts and start learning how to fix bad ones, including yours."

## Talking points you can lift directly

On why this is worth their time:

> "The person who says 'calls are up' is reporting. The person who says 'calls are up, it is concentrated in one channel, here are the three things it could be and here is what I would look at first' is doing analysis. The second person gets asked for their opinion next time. That is the whole difference and it is a difference in output format, not in intelligence."

On the arithmetic risk:

> "Treat every number it gives you the way you would treat a number a member reads to you over the phone. Probably right. Worth confirming before you put it in an email to your director."

On the contact center connection:

> "Every metric in here is a proxy for something a member felt. Abandonment rate is people giving up. Repeat contact rate is people we did not actually help. When you write the interpretation, write it about people, not about the number."

## Anticipated questions and how to answer them

**"Do I need to know Excel formulas for this?"**
No. Helps, does not gate you. If you can read a table you can do this exercise.

**"What if I do not have Copilot in Excel?"**
Paste the table into Copilot chat. The exercise works either way. You lose the ability to have it write formulas into cells and you keep everything else.

**"Is the interpretation it gives me actually good, or does it just sound good?"**
Both are possible and you cannot tell from the output alone. That is why we ask for three ranked explanations instead of one. When you see the alternatives side by side you can apply your own judgment about which fits what you know about the floor.

**"Can it replace our reporting analyst?"**
No, and asking it to would be a bad idea. It can replace the forty minutes you spend staring at a report trying to figure out what to say about it. Those are different jobs.

**"What if my interpretation is wrong and I put it in an email?"**
Label it as a hypothesis and say what would confirm it. Nobody has ever been criticized for writing "my working theory is X, and I would check Y to confirm." People get criticized for stating theories as facts. This is a writing habit, not an analysis habit, and it costs you one sentence.

## Failure modes for you, the facilitator

- **You spend the demo teaching Excel.** This is not an Excel class. If two people have formula questions, take them offline.
- **You let a wrong number go past in the debrief.** If someone shows an output with an obviously wrong figure, catch it kindly and immediately. Letting it stand teaches the room that nobody checks. Frame it as "good, this is the thing we said would happen, let us look at it."
- **You pick your two demo volunteers from the same skill level.** Pick one confident person and one quieter person. The quieter person's output is usually more honest about what did not work.

## What to capture for your own records

Log attendance, submission count, and specifically log any instance where a participant caught Copilot producing a wrong figure. Those are gold for the evidence tracker, because they demonstrate the program taught verification and not just usage. Write down the person's name and what they caught.
