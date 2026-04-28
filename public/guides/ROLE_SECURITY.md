# Role: Security

You catch flaws. Some are hacker injections, some are random defects.

## Sprint 1

Security is mostly idle in Sprint 1. There are no hackers yet, but cards still pass through your column briefly.

1. When a card arrives in **Security**, open it.
2. Click **Run Security Check**. The result panel shows whether a flaw was found and the source (random, injected, or both).
3. **Pass Security**: card moves to To Deploy.
4. **Reject Security**: write a reason; the card goes to **Clarifications** with a red `REJECTION → Developer` pill. The Developer picks it up and the card moves to **In Progress** for rework — not back to Security. The dev will resend through Testing → Security once fixed.

## Asking a question

If you find a flaw and aren't sure whether the right move is reject (full rework) or just a quick clarification, click **Ask a question** instead:

- Ask **Developer** if you want them to confirm a specific implementation detail before you decide.
- Ask **Business** if you want to verify whether a particular risk is acceptable for this card.

The card moves to Clarifications with a blue `QUESTION → <role>` pill. When they answer, the card returns to **Security** so you can finish your review with their input.

## Sprint 2

Hackers are active. The flaw rate setting plus injections means a meaningful fraction of cards have flaws. Be skeptical.

You can also run a **shift-left** check (advisory) for cards your team owns earlier in the pipeline.

## Sprint 3

If **role swap** is on and you advanced to Sprint 3, you've been swapped to SysAdmin. Read that guide. Containerized cards may bypass you entirely under CI/CD bypass.

## How the check works

Each card has two flaw sources. The card-level **flawed** flag is rolled deterministically from the card's id when the card is created (the rate is set in admin Settings). On top of that, hackers can **inject** flaws explicitly. Your check returns a structured result with both signals.

When you reject a flagged card, the system marks the corresponding hacker_log entry as **caught**. When you pass a flagged card, the entry is marked **leaked**. Facilitator sees the running tally on the admin dashboard.
