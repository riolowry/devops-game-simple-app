# Role: Business

You are the customer. You decide what gets built, what it's worth, and whether what comes back is good enough.

## Sprint 1

1. Open the board. In the **Market** column, click **+ New Product Request**.
2. Pick a category, then a curated drawing. The price, batch size, and URL pre-fill from the catalog. You can override any of them.
3. Write Acceptance Criteria. The Developer is graded against this.
4. Save. The card sits in Market until a Developer claims it.

When a card lands in **In Production**, open it and compare the uploaded images to your Acceptance Criteria.

- **Accept**: card moves to the Accepted column. The price is locked into your team's score.
- **Reject**: write a reason. The card goes to **Clarifications** with a red `REJECTION → Developer` pill, and the Developer picks it up. The card moves to **In Progress** for rework (not back to In Production) and re-runs Testing → Security → Deploy → Production before coming back to you.

## Answering questions

You are the most-asked role on the board. Developers, Testers, Security, and SysAdmin will send questions your way whenever they need clarification on requirements or acceptance criteria. When a card targets you, it shows up in **Clarifications** with a blue `QUESTION → Business` pill.

Open the card. Read the question (in the blue banner at the top). Click **Send response**, write your answer, and submit. The card returns to whoever asked, in whatever column they were in. Be specific — your answer becomes part of the card's permanent comment thread.

You can also **ask** questions yourself if a Developer's deliverable is ambiguous and you want to clarify before deciding accept/reject. Click **Ask a question** on the In Production card, target the Developer or Tester, and submit. The card returns to In Production with their reply when answered.

## Sprint 2

Hackers are now active. Some cards reaching production will have flaws that Security missed. Reject anything that doesn't match Acceptance Criteria. Don't be lenient just because you want the points.

## Sprint 3

The CI/CD pipeline is on. If the Developer marks tasks as **containerized**, the card skips Testing and Security and goes straight to Production. You're now the only quality gate. Hackers can also stop containers in production. If a card shows up **stopped**, ask SysAdmin to restart it before accepting.

## Tips

- You can edit Market-stage cards (title, URL, price, batch, Acceptance Criteria).
- You can also edit cards while they're in Clarifications, in case you need to add detail in response to a question.
- Anyone can comment on any card. Use comments to clarify scope before rejection.
- A red panel at the top of any card shows the most recent rejection reason for context.
