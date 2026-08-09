# Week 2 Knowledge Check: Analyst

Five questions. Answer from memory first, then check yourself. Takes about five minutes.

---

**Question 1**

Which of these tasks carries the highest risk of Copilot producing a wrong answer that looks right?

A. Suggesting explanations for a change in call volume
B. Calculating a percent change between two figures
C. Rewriting a finding for a different audience
D. Listing what additional data would confirm a theory

---

**Question 2**

You paste a metrics table and type "analyze this data." What do you get back and why is it low value?

A. An error, because Copilot needs a specific question format
B. A description of the table, which you could already read yourself
C. A refusal, because the data is unlabeled
D. Three ranked explanations, which is exactly what you want

---

**Question 3**

Card fraud claims rose 65 percent in one week. New account fraud claims rose 336 percent in the same week. A single external event is offered as the explanation for both. What should you conclude?

A. The external event explains both, since both went up
B. The rates are too different to share one cause, so at least two things are happening
C. The new account number is probably a data error
D. Percent changes are unreliable and should be ignored

---

**Question 4**

Which recommendation is most likely to get acted on?

A. Continue to monitor fraud claim volume closely
B. Consider a review of relevant operational processes
C. Pull the 61 new account claims from week 6 and check how many came through the shortened verification path
D. Increase staffing to address elevated contact volume

---

**Question 5**

You are writing an interpretation you are not certain about into an email to your director. What is the correct move?

A. Leave it out, since you cannot prove it
B. State it as fact, since hedged writing looks weak
C. Label it as a working theory and say what would confirm it
D. Ask Copilot whether the theory is correct and cite its answer

---
---

## Answer key

**1. B.** Calculating a percent change.

Arithmetic is where Copilot fails in a way you cannot detect from the output. A wrong percent change appears in the same clean formatting as a right one. Options A, C, and D are all generative tasks where the output is a suggestion you evaluate with your own judgment, so a weak answer is visibly weak. A wrong number is invisibly wrong. Verify anything you plan to cite.

**2. B.** A description of the table.

The model has no question to answer, so it defaults to summarizing what is in front of it. You already know what is in the table. Value starts when you point at something specific that broke the pattern and ask why. "Analyze this" is the Week 2 equivalent of last week's "summarize this."

**3. B.** At least two things are happening.

This is the core skill of the week. If one cause were driving both columns, they would move at broadly similar rates. A fivefold difference in rate of change means the columns have different drivers, and merging them into one story hides the cause you actually control. This is the same instinct as a fraud review: when the pattern does not fit cleanly, the misfit is the information.

**4. C.** Pull the 61 claims and check the verification path.

A, B, and D are things people write when they do not want to commit to anything. C names a specific data set, a specific question, and produces an answer that changes a decision. A recommendation that could not possibly be wrong is also a recommendation that cannot possibly be useful.

**5. C.** Label it as a working theory and say what would confirm it.

Nobody has ever been criticized for writing "my working theory is X, and pulling Y would confirm it." People do get criticized for stating theories as facts that later fall apart. Option D is the trap: asking the model to validate its own output is not verification, it is the same output twice.

---

## If you missed two or more

The one that matters is question 3. Go back to the exercise data and look at the new account claims column next to the card claims column. If you can articulate why those two numbers cannot share a cause, you have the skill this week was built to teach and the rest is practice.
