# Role: Developer

You build the product. You claim cards from Market, pull a task per item in the batch, complete each task by drawing and uploading, and ship the card to Testing.

## Sprint 1

1. Open the **Market** column. Click a card you want to work on.
2. Click **Claim**. The card moves to **In Progress** and is now your team's.
3. Click **+ Add task** for each item in the batch.
4. For each task: open the description URL in a new tab, color the page, photograph or screenshot it, then upload via the **Complete** button on the task. The image goes to Supabase storage and is linked from the task.
5. When every task in the batch is **complete**, click **Send to Testing**.

## Sprint 2

You can run a **shift-left security check** on cards your team owns while they're still in the pipeline (any status except Market, Accepted, or In Production). It tells you if the card has a flaw, the same check Security runs. Use it to catch problems early.

You may also be **cross-trained** as another role. The cross-training banner at the top of the page tells you which role and team. You can act in that role, on that team, in addition to your primary.

## Sprint 3

A new task option appears: **Mark next task as containerized**. If you tick it, that task and the card become containerized. With CI/CD bypass on, **Send to Testing** ships containerized cards directly to Production. Faster, but no Tester or Security review.

## Rejection / Clarifications

If the card gets rejected by Tester, Security, or Business, it lands in **Clarifications** with a red `REJECTION → Developer / Team A` pill and the rejection reason in a red banner at the top of the card. Click **Pick up for rework** — the card moves to **In Progress** (regardless of which column rejected it) so you can fix it. Address the issue, complete a new task if needed, and resend.

## Asking a question

Sometimes the requirements are unclear, the acceptance criteria are ambiguous, or a rejection reason doesn't tell you what's actually wrong. Don't guess — **Ask a question**. Open the card and click **Ask a question**. Pick who you need to hear from:

- **Business** when acceptance criteria are vague, the description is missing details, or you're not sure what "done" means.
- **Tester** when you got a rejection from Testing and you can't tell what failed, or you want to check your understanding of how they'll evaluate.
- **Security** when a security concern comes up mid-development and you want to confirm the right fix.
- **SysAdmin** when you have a deployment-time concern (containerized vs not, code freeze coordination).

Write your question, send it. The card moves to **Clarifications** with a blue `QUESTION → <role>` pill so the target can see they need to act. When they answer, the card returns to the column it was in (in_progress for you), with their reply in the comment thread.

This works even from a rejection — if you got rejected and don't understand why, click **Ask a question** and target the rejecter for clarification.

## Hidden

If you've been secretly promoted to Hacker, the UI still shows you as Developer. Find your own briefing.
