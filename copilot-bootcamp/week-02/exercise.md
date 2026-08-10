# Week 2 Exercise: The Week Six Spike

**Time: 20 minutes. Work alone.**

Everything below is fabricated. Riverstone Credit Union does not exist. The volumes, claim counts, dates, and events are invented for training. Do not substitute real reporting at any point.

## The scenario

You are in the digital department at Riverstone Credit Union. Your director sends you two tables at 4:10 on a Thursday with one line of context: "Week 6 looks bad. What happened? Need something for the ops meeting tomorrow morning."

You have eight weeks of contact center metrics, eight weeks of fraud claim counts, and a list of things that happened during that window. Nobody has told you which of those things caused what. That is the job.

## Your job

Produce something your director could read in ninety seconds that contains:

- Three findings, each with a specific number
- Three competing explanations for the week 6 movement, ranked
- What evidence would separate those explanations
- One recommendation specific enough to start on Monday

## Step by step

**Step 1.** Copy both tables and the events list into Copilot. If you have Copilot in Excel, open the workbook your facilitator posted. Do not rebuild it. If you do not have Copilot in Excel, paste the tables into chat as text. Both paths work.

**Step 2.** Ask a broad question first, on purpose. Something like "analyze this data." Read what comes back. It will describe the tables. Keep it so you can compare later.

**Step 3.** Ask a real question. Point at something specific that broke the pattern and ask why.

**Step 4.** Force alternatives. Ask for three ranked explanations and the evidence that would confirm or kill each one.

**Step 5.** Verify at least one number yourself. Pick a number you plan to actually cite and recalculate it by hand or in a cell. Write down what you got.

**Step 6.** Write your three findings and one recommendation. Under 250 words total. **Drafting this is Friday's work. In the session, get through Step 5.**

## Synthetic data set

### Table A. Contact center weekly metrics

| Week | Offered | Handled | Aband % | AHT min | FCR % | Repeat % | Chats | ASA sec |
|---|---|---|---|---|---|---|---|---|
| 1 | 12480 | 11900 | 4.6 | 6.2 | 74 | 18 | 3100 | 42 |
| 2 | 12610 | 12020 | 4.7 | 6.3 | 73 | 18 | 3240 | 45 |
| 3 | 12340 | 11810 | 4.3 | 6.1 | 75 | 17 | 3380 | 40 |
| 4 | 12900 | 12290 | 4.7 | 6.4 | 73 | 19 | 3510 | 48 |
| 5 | 13450 | 12720 | 5.4 | 6.8 | 71 | 21 | 3690 | 57 |
| 6 | 15980 | 14210 | 11.1 | 8.9 | 62 | 29 | 4980 | 132 |
| 7 | 15220 | 13880 | 8.8 | 8.4 | 65 | 27 | 4760 | 110 |
| 8 | 14100 | 13240 | 6.1 | 7.5 | 69 | 23 | 4220 | 74 |

Column meanings: Offered is calls arriving. Handled is calls answered by an agent. Aband % is abandoned before answer. AHT is average handle time in minutes. FCR is first contact resolution. Repeat % is members contacting again within 7 days on the same issue. Chats is digital chat sessions. ASA is average speed of answer in seconds.

### Table B. Fraud claims filed, same eight weeks

| Week | Card claims | New acct claims | ACH claims | Avg amt USD | Reopened | Prov credits |
|---|---|---|---|---|---|---|
| 1 | 118 | 6 | 22 | 214 | 4 | 71 |
| 2 | 124 | 5 | 25 | 208 | 3 | 76 |
| 3 | 111 | 7 | 21 | 231 | 5 | 68 |
| 4 | 129 | 9 | 27 | 226 | 4 | 80 |
| 5 | 143 | 14 | 33 | 245 | 6 | 92 |
| 6 | 236 | 61 | 58 | 268 | 9 | 158 |
| 7 | 219 | 52 | 54 | 259 | 12 | 149 |
| 8 | 176 | 28 | 41 | 251 | 15 | 118 |

Column meanings: Card claims is unauthorized debit card transaction claims. New acct claims is the subset filed on accounts opened within the prior 30 days. ACH claims is unauthorized ACH or online banking transfers. Avg amt is the average disputed amount. Reopened is claims reopened after being closed. Prov credits is provisional credits issued.

### Events during the same eight weeks

All fabricated.

- Week 4, Tuesday: marketing email about the mobile app refresh sent to roughly 90,000 members
- Week 5, Tuesday: new online account opening flow released, identity verification step shortened from three checks to two
- Week 6, Monday: a regional grocery chain publicly announced a card data breach affecting purchases made over the prior four months
- Week 6, Wednesday: IVR menu restructured, fraud reporting moved from option 2 to a submenu under option 4
- Week 7, Monday: four temporary agents added to the phone queue
- Week 8, Monday: IVR menu change reverted, fraud reporting back to option 2

## The trap in this data

There is not one cause. There are at least three different things moving three different sets of numbers, and they overlap in week 6. If your output gives a single explanation for everything, it is wrong no matter how good it sounds.

Read the new account claims column carefully. It moves differently from the card claims column, and the difference is the most interesting thing in the data set.

Also look at the reopened claims column. It does something the other columns do not, and it does it late.

## Verification requirement

Pick one number you plan to cite and check it yourself. Suggestions:

- Recalculate an abandonment rate from offered and handled
- Calculate the percent change in new account claims from week 5 to week 6
- Calculate what share of week 6 card claims were on new accounts

Write down what you calculated, what Copilot said, and whether they matched.

## Submission

Post in the Week 2 thread by Friday end of day:

1. Your final prompt, in full
2. Your three findings and one recommendation
3. The number you verified and how you checked it
4. One sentence on which explanation you would investigate first and why

## Stretch goal, only if you finish early

Ask Copilot to write the same findings twice: once for your director and once for a frontline team huddle. Compare them. Notice what changes and what should not change. That difference is Week 4.
