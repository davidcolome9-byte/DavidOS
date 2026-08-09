# Week 1 Knowledge Check: Researcher

Five questions. Answer from memory first, then check yourself. Takes about four minutes.

---

**Question 1**

You ask Copilot a question and it returns a clear, well written answer with no source references attached. What is the correct next move?

A. Use it. If it were wrong, it would say so.
B. Treat it as unverified and find the source yourself before acting on it.
C. Ask Copilot whether the answer is accurate.
D. Rewrite the prompt to be longer.

---

**Question 2**

A teammate says "I do not want to use Copilot because it can read every document in the credit union." What is the accurate correction?

A. They are right, which is why we only use synthetic data.
B. It can read everything but it forgets after each session.
C. It only reaches content you already have permission to open. It does not grant new access.
D. It can read everything but only leadership can see the results.

---

**Question 3**

You paste a set of documents into Copilot and ask for a summary. The summary is smooth, confident, and drops three exceptions that appear in the source. What most likely caused this?

A. The documents were too long.
B. Copilot cannot read exceptions.
C. You asked for a summary, and summarizing smooths over conflicting details unless you ask it not to.
D. A permissions error.

---

**Question 4**

Which of these prompt additions does the most to reduce made up content in an answer drawn from pasted source material?

A. "Please be accurate."
B. "Be thorough and detailed."
C. "If something is not stated in the text, say 'not stated' instead of guessing."
D. "Double check your work."

---

**Question 5**

You are building a quick reference for agents from four internal documents that partially contradict each other. Which output is most useful on a live call?

A. A single merged answer that resolves the contradictions into one clean policy.
B. A scenario list where each item names its source document and conflicts are called out explicitly.
C. Full text of all four documents in order.
D. A long paragraph covering every detail in all four documents.

---
---

## Answer key

**1. B.** Treat it as unverified and find the source yourself.

An answer without a citation is a claim, not a fact. Option C is the trap, and it is the most common real world mistake: asking the tool to grade its own work feels like verification and is not. Option A confuses fluency with accuracy, which is exactly the habit this week is built to break.

**2. C.** It only reaches content you already have permission to open.

Permissions carry over from your existing access. Copilot does not widen what you can see. This matters in a regulated environment and it is worth saying out loud, because the fear behind the question is usually genuine. Note that option A is a decent instinct with the wrong reasoning: we use synthetic data in training because practice material should never carry real risk, not because Copilot has unrestricted access.

**3. C.** Summarizing smooths over conflicting details unless you ask it not to.

This is the single most important idea in Week 1. The model is optimizing for a coherent summary, and exceptions read as noise against the dominant pattern. The fix is not a longer prompt. It is a different request: ask where the sources disagree, ask which is most recent, ask what is missing.

**4. C.** The "not stated" instruction.

A, B, and D are all vague encouragement. They change the tone of the output without changing what it does with gaps. Giving the model an explicit, easy alternative to guessing is what actually reduces invented content. This one line will do more for your output quality than anything else you learn this week.

**5. B.** A scenario list with sources named and conflicts called out.

An agent on a live call needs to know what to say and how confident to be. Option A hides the risk and will eventually cause someone to promise a member something that is not true. Options C and D are unusable at call speed. The briefing exists to prevent a bad promise, not to be complete.

---

## If you missed two or more

You are fine. Reread the "Ask, shape, verify" section of the one pager and try the exercise source pack one more time with a single change: add the "not stated" line to your prompt. That one habit fixes most of what these questions are testing.
