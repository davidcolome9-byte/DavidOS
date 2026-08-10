# Week 2 Solutions Key

Facilitator copy. Do not distribute before the debrief.

## What the data actually says

You need to know this cold before you run the debrief, because participants will bring you confident wrong answers and you have to be faster than the confident wrong answer.

**There are three separate stories in week 6, not one.**

**Story one: the merchant breach drove card claims.** Card claims went from 143 in week 5 to 236 in week 6, a jump of 93 claims. The grocery chain breach was announced Monday of week 6. Average claim amount also rose, from 245 to 268. Note that this argues against small dollar card testing and points instead at larger single purchase fraud on compromised cards. This story explains most of the card claims column and a meaningful share of the call volume increase, because members who read a breach announcement call in whether or not anything happened to them.

**Story two: the account opening change drove new account fraud.** This is the important one and it is easy to miss. New account claims went 14 in week 5, then 61 in week 6. The identity verification step was shortened from three checks to two on Tuesday of week 5. A one week lag between weakened verification and claims appearing is exactly what you would expect. This story has nothing to do with the grocery breach, and merging them is the single most common analytical error in this exercise.

The tell that these are separate: new account claims rose more than fourfold while total card claims rose about 65 percent. If a single external event were driving everything, those columns would move together at similar rates. They do not.

**Story three: the IVR change drove the service metrics.** Abandonment went 5.4 to 11.1 percent. ASA went 57 seconds to 132. Repeat contact went 21 to 29 percent. The IVR restructure moved fraud reporting into a submenu on Wednesday of week 6, during the exact week when fraud call volume was spiking. Members hunting for the fraud option sat in queue longer, abandoned more, and called back. Week 8 supports this: the IVR change was reverted Monday of week 8 and abandonment dropped from 8.8 to 6.1 while volume was still elevated at 14,100.

**The lagging signal almost nobody catches.** Reopened claims go 6, 9, 12, 15 across weeks 5 through 8. That column keeps climbing after every other metric starts recovering. Rushed intake during a volume spike produces claims with bad or incomplete information, and those come back as reopens two to three weeks later. That is a quality problem arriving after the crisis appears to be over, and it is the most useful finding in the whole data set because it points at something still happening.

**Verified arithmetic, so you can check participants fast:**

- Week 6 abandonment: (15980 - 14210) / 15980 = 11.08 percent
- New account claims week 5 to 6: (61 - 14) / 14 = 336 percent increase
- New account share of card claims, week 6: 61 / 236 = 25.8 percent
- New account share of card claims, week 1: 6 / 118 = 5.1 percent
- Week 6 offered volume versus the week 1 through 5 average of 12,756: up 25.3 percent

## Worked example of a strong response

**Their final prompt:**

```
Below are two tables of contact center and fraud claim data for eight weeks,
plus a list of operational events during that window. [tables and events]

Question: week 6 is an outlier across most columns. I do not think there is a
single cause. Identify how many distinct things are moving in this data and
which columns belong to which.

Give me:
1. Three findings, each with a specific number from the tables
2. Three competing explanations for the week 6 movement, ranked by how well
   they fit the data, and say explicitly which columns each one explains and
   which it does not
3. For each explanation, what additional data would confirm or rule it out
4. Anything in the data that is still getting worse in week 8
5. One recommendation I could start on Monday

Mark any inference as "inference" so I can separate it from what the numbers
directly show. Do not merge separate causes into one narrative.
```

**Their output, edited down to what they submitted:**

> **Week 6 review, Riverstone contact center and fraud**
>
> **Finding 1. Three different things happened, not one.** Card fraud claims rose 65 percent (143 to 236). New account claims rose 336 percent (14 to 61). Service metrics collapsed independently, with abandonment more than doubling to 11.1 percent. These rates are too different to share a cause.
>
> **Finding 2. New account fraud is the real signal.** New accounts were 5 percent of card claims in week 1 and 26 percent in week 6. The identity verification step dropped from three checks to two the week before. One week is the expected lag.
>
> **Finding 3. Claim quality is still degrading.** Reopened claims went 6, 9, 12, 15 across weeks 5 to 8 and have not turned. Every other metric is recovering. Inference: rushed intake during the spike produced incomplete claims that are now coming back.
>
> **Ranked explanations for week 6:**
> 1. Merchant breach drove card claims and inbound volume. Explains card claims and call volume. Does not explain the new account concentration.
> 2. Weakened account opening verification drove new account fraud. Explains the new account column only. Timing fits.
> 3. IVR restructure drove the service metrics. Explains abandonment, ASA, and repeat contact. Supported by week 8, where the revert dropped abandonment from 8.8 to 6.1 with volume still high.
>
> **What would separate them:** merchant name on the disputed transactions for explanation 1. Application channel and verification path for the 61 new account claims for explanation 2. Menu path analytics for abandoned calls in week 6 for explanation 3.
>
> **Recommendation:** pull the 61 week 6 new account claims and check how many came through the shortened verification path. If most did, the verification change is producing losses and should be reviewed before the next release. This is a smaller pull than the breach analysis and answers the more expensive question.

**Their verification note:**

> "I recalculated week 6 abandonment from offered and handled: 1770 divided by 15980 is 11.08 percent, which matches the table and matches what Copilot reported. I also checked the new account percent change by hand: 61 minus 14 is 47, divided by 14 is 336 percent. Copilot's first answer said 'more than quadrupled' which is right, but its second answer said 436 percent, which is wrong. It looks like it divided 61 by 14 and called it a percent increase."

**Their investigation pick:**

> "The verification change, because it is the only one of the three we caused ourselves and the only one that is still producing new losses today."

**Why this is strong.** The prompt explicitly rejects the single narrative before the model has a chance to produce one. The findings separate what the numbers show from what the participant is inferring. The recommendation is scoped to something a person could actually do Monday, and it is justified by cost, not just by interest. The verification note caught a real arithmetic error and described it precisely enough that you can see what went wrong.

## Failure mode one: one story to explain everything

**What it looks like.** The output opens with "The grocery store data breach in week 6 caused a surge in fraud claims and call volume, which overwhelmed the contact center and drove abandonment and handle time up." Clean. Causal. Reads like a real executive summary. It is wrong.

**Why it happens.** The events list contains one dramatic external event, and dramatic external events are narratively attractive. The model builds the most coherent single story available, and coherence is what it optimizes for when you do not tell it otherwise. Participants accept it because it sounds like something a director would say.

**What it costs.** Under this explanation, the recommendation is "monitor breach related claims and add staff." That does nothing about the verification change, which is the only cause Riverstone actually controls and the only one still generating new losses. A whole quarter of losses walks in the front door while everyone watches the grocery store.

**The tell.** The new account claims column is either not mentioned or is described as "also increased." If a participant's output treats a 336 percent move as a footnote to a 65 percent move, they took the narrative and skipped the data.

**How to fix it in the room.** Put both percentages on screen next to each other. Ask: "If one event caused both of these, why did one move five times harder than the other?" Let them answer. Then have them rerun with one added line: "Do not merge separate causes into one narrative. Say how many distinct things are moving." Same data, different answer.

**What to say:** "It gave you a story because you asked for a story. A story has one villain. Data usually has three."

## Failure mode two: arithmetic accepted because it was formatted

**What it looks like.** The submission cites a figure like "a 436 percent increase in new account fraud." The number appears in a tidy bulleted list with a bold header and it is wrong. The participant never checked because the output looked finished.

**Why it happens.** Formatting reads as confidence. A number inside a clean bullet with a bold label feels audited. It is not. Percent change is also genuinely easy to get wrong in a way that produces plausible looking output: dividing the new value by the old value instead of dividing the difference by the old value gives 436 percent instead of 336 percent, and both are large numbers that fit the story.

**What it costs.** More than being wrong. If someone forwards a wrong figure to a director and the director repeats it in a meeting, the correction lands on the person who sent it, and they lose the credibility they were trying to build. Week 2 is where people start forwarding Copilot output to leadership, so this is exactly the right week to make the point hurt a little.

**The tell.** No verification note, or a verification note that says "checked and correct" without stating what was calculated or what number came out.

**How to fix it in the room.** Do not lecture. Ask the participant to compute one percent change on screen, out loud, right then. It takes fifteen seconds and it settles the point permanently for everyone watching.

**What to say:** "You get to cite numbers you checked. Everything else is a number Copilot mentioned, and those go in your notes, not in your director's inbox."

## Grading guidance

**On track.** Identifies more than one cause. Cites specific numbers. Verification note names an actual calculation. Recommendation is scoped and actionable.

**Needs a nudge.** Single narrative, or numbers with no verification. Reply in the thread with one line: "Try rerunning with 'do not merge separate causes into one narrative' added, and look at what happens to the new account column."

**Needs a conversation.** Output is a restatement of the tables. Direct message, not a thread reply. Usually this means the person never got past "analyze this," which is a prompting problem and is exactly what Week 3 fixes. Tell them that. It is a real answer, not a consolation.

## Note for your evidence tracker

Any participant who catches a Copilot arithmetic error this week is a specific, citable outcome. Write down the person, the error, and how they found it. "Participants independently identified calculation errors in AI output during structured verification exercises" is a sentence that does real work in a promotion packet, and it is only true if you wrote down the instances.
