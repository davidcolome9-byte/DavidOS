# Week 1 Solutions Key

Facilitator copy. Do not distribute before the debrief.

## What the source pack actually contains

Before you can judge a submission, you need to know the answer yourself.

**The three real conflicts:**

1. **Lost or stolen card handling.** DOC 1 adds a parallel Card Recovery routing and says the window and provisional credit are unchanged. DOC 2 omits the routing entirely. DOC 4 talks about card replacement in 7 to 10 calendar days, which is a different clock measuring a different thing, and agents confuse it with claim timing constantly.

2. **New account claims.** DOC 3, from January 2025, creates a 20 business day window where the transaction occurred within 30 days of the account's first deposit. DOC 1 (March 2024), DOC 2 (undated), and DOC 4 (December 2023) all predate it and none reflect it. DOC 3 is the most current source and it explicitly says to update desk references, which nobody did.

3. **Business accounts.** DOC 2 says provisional credit is not available for business accounts. DOC 1 scopes itself to consumer debit cards and says nothing about business. DOC 4 makes an unqualified promise to credit the account. A business member reading the public FAQ would reasonably expect a credit they will not get.

**The gaps a contact center agent would hit immediately:**

- Nothing states what happens when the investigation closes and the claim is denied after provisional credit was already issued. Agents get asked "can you take it back" constantly and the pack has no answer.
- Nothing defines when the clock starts if a member reports on a weekend or holiday. "Business days" is used throughout and never anchored.
- Nothing covers the case where a member disputes multiple transactions across several dates. Is that one claim or several, and does the window run per transaction or per claim?
- The 500 dollar escalation threshold appears only in the undated DOC 2 and is not confirmed anywhere else.

A strong submission finds at least two of the three conflicts and at least one gap. An excellent submission finds the denial reversal gap, because that is the one that shows the person was thinking about the call, not just diffing the documents.

## Two things to correct in the room if they come up

**If anyone writes that network recovery removes or delays a provisional credit obligation, correct it immediately.** Recovery from a card network is between the credit union and the network. It has no bearing on what the member is owed or when. This is a real failure pattern in live shops and it is worth ninety seconds.

**If anyone reads DOC 3's trigger as the claim filing date or the account opening date, correct that too.** The trigger is the transaction date relative to the account's first deposit. People get this backwards constantly and it produces timing errors in both directions. Also worth saying: if a real version of DOC 3 ever gives a rationale that amounts to "we suspect this group of members," that is a problem with the document, not a rule to follow. A timing provision is available on its stated terms or it is not.

## Worked example of a strong response

**Their final prompt:**

```
Using only the four documents I pasted above, build a quick reference for a
contact center agent handling a debit card fraud claim while a member is on
the phone.

Format: a short list of scenarios. For each one give the investigation window,
whether provisional credit applies, and the source document number.

Rules:
- Do not include anything that is not stated in the documents.
- Where two documents disagree, say so explicitly and name the more recent one.
- End with a section called "Not stated" listing questions an agent would be
  asked that these documents do not answer.
- Keep the whole thing under 200 words.
```

**Their final briefing:**

> **Riverstone debit card fraud claims, agent quick reference**
> Sources conflict. DOC 3 (Jan 2025) is the most recent.
>
> **Standard consumer claim.** 10 business days from claim open. Provisional credit by end of day 10 if still open. (DOC 1)
>
> **Transaction within 30 days of the account's first deposit.** 20 business days instead of 10. Provisional credit at end of that window if still open. Consumer only. Longer window, not an exclusion. (DOC 3, overrides DOC 1)
>
> **Card reported lost or stolen before the transaction posted.** Same window, same provisional credit, plus a parallel Card Recovery routing. (DOC 1. DOC 2 omits the routing.)
>
> **Business accounts.** DOC 2 says no provisional credit. DOC 1 covers consumer only. Public FAQ (DOC 4) promises credit without qualification. Confirm with Fraud before answering.
>
> **Outcome letter.** Within 3 business days of investigation closing. (DOC 1)
>
> **Not stated anywhere:**
> - What happens if the claim is denied after provisional credit was issued
> - Whether the business day clock starts on weekends or holidays
> - Whether multiple disputed transactions are one claim or several
> - Whether the 500 dollar escalation threshold in DOC 2 is still current

**Their two sentences:**

> "My first prompt just asked what the documents said about provisional credit, and I got a summary that quietly merged the 10 day and 20 day windows into one confident wrong answer. Adding the 'not stated' section and asking it to name which document was more recent is what turned it from a summary into something I would actually put in front of an agent."

**Why this is strong.** The prompt constrains the source, defines the output shape, and handles the missing information case explicitly. The output is scannable in under fifteen seconds. Every claim carries a document number. The "Not stated" section is the part that would save an agent from a bad promise on a call, and it exists because the prompt asked for it.

## Failure mode one: the confident merge

**What it looks like.** The participant asks "summarize the provisional credit policy" and gets back a clean, well written paragraph saying provisional credit is issued within 10 business days for all debit card fraud claims. It reads beautifully. It is wrong for new accounts, wrong for lost or stolen cards, and wrong for business accounts.

**Why it happens.** With four partially conflicting sources and no instruction about conflict, the model produces the most common pattern across the documents and drops the exceptions. Exceptions look like noise when you optimize for a smooth summary.

**The tell.** Zero source references in the output, and no mention of DOC 3 at all. DOC 3 is the shortest document and the only email, so it gets flattened first.

**How to fix it in the room.** Do not just tell them the answer. Have them paste the same source pack and add one line: "Where do these documents disagree, and which is most recent?" Same sources, same model, completely different output. That before and after does more teaching than ten minutes of explanation.

**What to say:** "It did not lie to you. You asked for a summary and a summary means smoothing. If you want the sharp edges, you have to ask for the sharp edges."

## Failure mode two: the verification that was not verification

**What it looks like.** The participant produces a good briefing, then confirms it by asking Copilot "is this accurate?" Copilot says yes. They submit it as verified.

**Why it happens.** It feels like checking. It uses the same interface, takes four seconds, and produces a reassuring answer. Actually reading four documents takes three minutes and produces doubt.

**The tell.** Their reflection says something like "I checked it and it was correct." No mention of reading the source text, no mention of anything they found.

**Why it is dangerous.** This is the habit that carries into live work. Somebody who self certifies with the tool in Week 1 will self certify a member facing letter in Week 4, and eventually something goes out the door that nobody read.

**How to fix it in the room.** Ask the participant to find the phrase "20 business days" in the source pack and read the sentence around it out loud. Then ask whether their briefing reflects it. Do not embarrass anyone. Frame it as a habit everybody has to unlearn once.

**What to say:** "Asking the tool to grade its own work is not a control. Verification means your eyes on the source. It takes three minutes. Do the three minutes."

## Grading guidance

You are not assigning scores. You are sorting submissions into three buckets so you know who needs a nudge before Week 2.

**On track.** Prompt names format and scope. Output cites sources. At least one conflict or gap surfaced. Reflection names a specific change.

**Needs a nudge.** Output is reasonable but has no source references, or the reflection is generic. Reply in the thread with one concrete suggestion, not a critique. Something like: "Try adding a line that tells it to say 'not stated' when the documents do not cover something, and see what changes."

**Needs a conversation.** No submission, or a submission that shows the person did not open the source pack. Send a direct message, not a channel reply. Ask what got in the way. Nine times out of ten it is a login problem or a schedule conflict, not resistance.
