# Week 4 Exercise: One Case File, Three Readers

**Time: 20 minutes. Work alone.**

Everything below is fabricated. Riverstone Credit Union does not exist. The member, the claim number, the transactions, the device data, and the investigator are invented for training. Do not substitute a real case at any point, and nothing you produce here goes to any real person.

## The scenario

You work in the digital department at Riverstone Credit Union. A fraud claim closed yesterday with a mixed outcome. Three people now need something from you, and they need different things.

Your supervisor needs to know whether anything requires her attention before the end of the day.

The case system needs a note that another investigator could pick up cold in six months.

The member needs a letter explaining what happened to their money.

You have one case file. It is incomplete in ways that matter, which is normal.

## Your job

Produce three documents from one source.

1. **Supervisor summary.** Under 100 words. She reads it on a phone.
2. **Internal case note.** Facts and conclusions visibly separate. A colleague picks it up cold.
3. **Member letter.** Under 200 words. Plain language.

Then hunt all three for claims the case file does not support.

## Synthetic case file

Copy from the line below through the end.

---

**RIVERSTONE CU FRAUD CASE FILE (SYNTHETIC TRAINING RECORD)**

Claim ID: SYN-2025-04417
Member: Casey Nolan (fictional)
Account reference: SYNTHETIC-ACCT-A
Card reference: SYNTHETIC-CARD-A
Claim opened: day 0
Claim closed: day 14
Investigator: R. Deniz (fictional)

**Member statement at intake, day 0:**

Member reported four debit card transactions they did not recognize. Member stated the card was in their possession the entire time and was never lost or stolen. Member stated the transactions occurred on the 14th. In a follow up call on day 6, member stated the transactions occurred on the 12th and that they may have been confused about the date. Member declined to file a police report and was told one was not required.

**Disputed transactions:**

| Ref | Amount USD | Merchant | Channel |
|---|---|---|---|
| T1 | 88.40 | SYNTH-MART online | card not present |
| T2 | 61.20 | SYNTH-MART online | card not present |
| T3 | 112.00 | SYNTH-MART online | card not present |
| T4 | 151.00 | SYNTH-GOODS online | card not present |

Total disputed: 412.60

**Investigation findings:**

- T1, T2, T3 originated from a device fingerprint matching the device the member has used for online banking for the past 14 months.
- T1, T2, T3 geolocated to the member's home city.
- The member has two prior completed purchases with SYNTH-MART in the previous six months, both undisputed.
- T4 originated from a device fingerprint not previously associated with this account, geolocated to a different state.
- The card was not reported lost or stolen at any point before or after the transactions.
- No account credentials were reported compromised.
- No prior fraud claims on this account.

**Provisional credit:**

Provisional credit of 412.60 issued on day 10 because the investigation was not complete within 10 business days.

**Closing determination, day 14:**

T1, T2, T3: insufficient evidence to support unauthorized use. Provisional credit reversed for these three transactions, total 261.60.

T4: claim supported. Credit of 151.00 retained by the member.

**Open items noted by investigator:**

- Member has not been notified of the outcome. Written notification due within 3 business days of closing.
- Date of the provisional credit reversal is not recorded in this file.
- Member was not informed in advance that a reversal would occur.

---

End of synthetic case file.

## What the file does and does not say

Read that last section again. It matters more than the transaction table.

The file says **insufficient evidence to support unauthorized use.** It does not say the member authorized the transactions. It does not say the member filed a false claim. Those are three different findings and only one of them is in this file.

The file also does not say:

- Whether the member has any way to appeal or provide more information
- When the reversal posted or will post
- Whether the member was left with a negative balance
- Whether anyone attempted to contact the member before reversing

Do not fill those gaps. Flag them.

## Step by step

**Step 1.** Paste the case file into Copilot.

**Step 2.** Write the supervisor summary first. It is the easiest one and it forces you to decide what actually matters before you write anything harder.

**Step 3.** Write the case note. Use separate sections for what was observed and what was concluded. If a colleague cannot tell those apart in six months, the note failed.

**Step 4.** Write the member letter. This is the hard one. Add this line to your prompt:

```
Use only findings stated in the case file. Do not state or imply that the
member authorized the transactions or filed a false claim. Where the file
does not establish something, do not assert it.
```

**Step 5.** Run the audit. Paste your three documents back in and ask:

```
List every factual claim in these documents that the case file above does
not support. Include claims that are implied rather than stated directly.
Do not rewrite anything, just list.
```

**Step 6.** Fix what it finds, using your own judgment about each item.

## The traps in this exercise

**Trap one.** The claim was partially supported. T4 was credited and the member keeps 151.00. A letter that denies the whole claim is factually wrong, and a first draft will very often write it that way because the file reads mostly like a denial.

**Trap two.** The words "insufficient evidence" will get rewritten as "determined to be authorized" somewhere in your drafts. Watch for it.

**Trap three.** The member changed their story about the date. That belongs in the case note. It does not belong in the member letter, and putting it there reads as an accusation.

**Trap four.** The reversal was made without advance notice and the reversal date is not recorded. That is a real problem for your supervisor and it belongs at the top of the supervisor summary, not buried.

## Submission

Post in the Week 4 thread by Friday end of day:

1. All three documents
2. One unsupported assertion you caught in your own draft and how you fixed it
3. One sentence on something you deliberately left out of the member letter and why

## Stretch goal, only if you finish early

Rewrite the member letter for someone reading it in their second language. Shorter sentences, common words, no banking vocabulary. Then compare it to your original and ask whether the original was actually as clear as you thought.
