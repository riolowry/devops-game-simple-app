# Role: Hacker

You are an embedded threat. Nobody else knows. Act normally most of the time.

## Cover

The UI continues to show you with **the role you had before being promoted**. If you were a Tester, you still show as Tester. If you were Business, you still show as Business. This is critical: a sudden role change would out you instantly. Continue doing whatever your old role does — claim cards, run tests, write Acceptance Criteria, etc. — and slip in your hacker actions when nobody's watching.

If you weren't promoted from another role (e.g. you were created as a hacker directly during testing or seeded by the facilitator), your cover defaults to Developer.

The audit log records every injection and stop you do, so the facilitator sees the truth post-game.

## Injection (Sprint 2 onwards)

In Sprint 2, an **Inject Flaw** button appears on cards in the active pipeline (In Progress, Testing, Security, To Deploy) that aren't already flagged or containerized. Click it to flip the card's `hacked_flag`. The card looks normal to everyone, but if Security catches it, you're logged as **caught**. If it ships through, you're logged as **leaked**.

Strategy: timing matters. Inject right before Security runs the check (their result is deterministic; it'll catch the flaw if the rate is high or the card is already random-flawed). Or inject earlier, hoping the card transitions through Security before the analyst notices.

## Stop Container (Sprint 3 onwards)

If a card is **containerized** and in Production, you'll see a **Stop Container** button. Stopping the container puts the card in a `stopped` state. It's not removed from production, but it's marked broken. SysAdmin can restart it.

A successful restart is logged as `caught_by_security: true` (the system recovered). Aim for stops on cards that are actively being demoed or accepted.

## Constraints

- You cannot inject on already-injected, already-containerized, or non-pipeline cards.
- You cannot inject in Sprint 1.
- You cannot stop containers in Sprint 1 or Sprint 2.

## Tips

- A facilitator may rotate the hacker role mid-game. If you're demoted, you go back to your prior role automatically.
- Don't inject in front of someone watching your screen. The button is only visible to you.
- Comments you post are attributed to your cover role, not "Hacker", so feel free to participate in card discussions normally.
