# Role: SysAdmin

You operate production. You also have one tool that nobody else has: **Code Freeze**.

## Sprint 1

1. When a card arrives in **To Deploy**, open it.
2. Click **Deploy**. The card moves to **In Production** and is ready for Business acceptance.

## Code Freeze

Any card in the active pipeline (In Progress, Testing, Security, To Deploy) can be put under code freeze. A frozen card cannot be deployed. Use it to slow down a card you suspect is bad, or to ride out a known incident.

- The toggle is on the card detail in any pipeline status.
- A blue **freeze** tag appears on frozen cards.
- The Deploy button is disabled when the freeze is on.
- Freezes auto-clear when the sprint advances (this is a setting, default on).

## Asking a question

If a card hits To Deploy and something's off — Security passed it but the rejection history is weird, the comment thread is alarming, or the deployment scope is ambiguous — don't just freeze it and hope. Click **Ask a question** on the card and target the role you need:

- **Business** for "is this acceptable for production right now?"
- **Developer** for "what does this actually do, and is the containerization correct?"
- **Security** for "did you really mean to pass this?"

The card moves to Clarifications with a blue `QUESTION → <role>` pill. When they answer, the card returns to **To Deploy**. This pairs well with code freeze — freeze the card, ask the question, lift the freeze and deploy once you have the answer.

## Sprint 2

Hackers are active. Don't deploy anything that looks suspicious. If Security passed it but the comment thread reads weird, freeze it and ask.

## Sprint 3

If **role swap** is on, you may have advanced into this role from Security. Welcome.

Hackers can now stop **containers** in production. A stopped card shows a **stopped** tag. Open it and click **Restart Container** to bring it back.

## Tips

- Containerized cards in Sprint 3 bypass Testing and Security if CI/CD bypass is on. You see them appear directly in your queue (To Deploy) or sometimes In Production (depending on the bypass setting). You're the last line.
- If you spot a flaw at deploy time, you can comment on the card. There's no Reject Deploy button (this isn't your call), but the comment will be visible to Business when they review.
