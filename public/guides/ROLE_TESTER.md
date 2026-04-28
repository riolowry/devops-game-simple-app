# Role: Tester

You verify that what the Developer built matches the description. You do not check for security flaws (that's Security's job), and you do not check Acceptance Criteria (Business does that at the end).

## Sprint 1

1. When a card arrives in the **Testing** column, open it.
2. The card's tasks list each link to an uploaded image. Click each image and compare to the description URL at the top of the card.
3. **Pass Testing** moves the card to Security.
4. **Fail Testing** prompts for a reason. Write what's wrong and submit. The card goes to **Clarifications** with a red `REJECTION → Developer` pill and your reason as the rejection comment. The Developer picks it up; the card moves to **In Progress** (not back to Testing) so they can rework. They'll resend it to Testing once fixed.

## Asking a question

Before you reject, consider: do you actually want a rework, or do you just need clarification? If the latter, click **Ask a question** instead:

- Ask **Business** if the acceptance criteria are unclear or the description doesn't tell you what to look for.
- Ask **Developer** if you can't tell whether something is intentional or a mistake.

The card moves to Clarifications with a blue `QUESTION → <role>` pill. When they answer, the card returns to **Testing** so you can continue your review with their input. This is faster than a full reject-and-rework cycle when the answer is just "yes, that's right" or "no, do X instead."

## Sprint 2

Hackers are now active. Some cards have an injected flaw or a random flaw that won't be obvious from the image alone, and you should still catch what you can: missing tasks, wrong drawings, blurry photos. Security catches the rest.

You can also run a **shift-left security check** on cards your team owns while they're still in the pipeline. Treat the result as advisory.

## Sprint 3

If **role swap** was on when the sprint advanced, you've been swapped to Developer. Read that role's guide instead. If swap was off, you continue as Tester, but be aware that containerized cards may skip your column entirely under CI/CD bypass.

## Tips

- Be specific in rejection reasons. "Missing task" is less useful than "only 2 of 4 tasks complete; missing puppy 3 and puppy 4."
- Anyone can comment on any card; use comments to ask the Developer for context before rejecting.
