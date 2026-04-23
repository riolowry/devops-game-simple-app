# Participant guide

You are participating in the DevSecOps Adventure. This guide covers what your role does and how the board works. The app also has a **Help** button that shows a short version.

## How to log in

Your facilitator has given you a 6-character token. Open the app URL on your phone, tablet, or laptop. Enter the token. That's it. No password.

## The board

Seven columns, left to right:

1. **Market** where Business posts new Product Requests
2. **In Progress** where Developers claim and complete tasks
3. **Testing** where Testers visually check the colouring
4. **Security** where Security runs a Security Check
5. **To Deploy** where Release prepares the deploy
6. **In Production** where Business accepts or rejects the finished product
7. **Feedback** rejected items land here and go back to In Progress

On a phone, swipe left and right to move between columns. On a tablet or laptop you can see several columns at once.

Click or tap a card to open its details. The available actions depend on your role and the card's current column.

## Your role

### Business

- In **Market**: click `+ New Product Request` to create an Issue. Pick a colouring page URL from [online-coloring.com](https://www.online-coloring.com), set a Price (points the team earns on acceptance) and a Batch Size (how many copies of the page the team must complete).
- In **In Production**: click into a card and either Accept (archives it, team earns the Price) or Reject to Feedback with a reason.

### Developer

1. In **In Progress**: click into an unclaimed Issue and Claim it for your team.
2. Create one Task per required batch item by clicking `+ Claim a Task`.
3. Open the colouring page (the Issue description URL), colour it, save the image, and upload it somewhere public (imgur, postimg, etc.). Paste the URL into your Task and mark it complete.
4. Once all Tasks are complete (the batch bar shows 3/3 or similar), click **Send to Testing** on the Issue.
5. If an Issue lands back in **In Progress** or **Feedback** (rejected), fix it and send it through again. Check the feedback reason at the top of the card.

In Sprint 3 you can mark your Tasks as **Containerized** when you create them. Containerized items are protected against hacker tampering.

### Tester

- In **Testing**: open each card and check the attached image URLs. Is every region of the drawing coloured? If yes, **Pass Testing** (advances to Security). If no, **Fail Testing** (goes back to In Progress for rework).

### Security

- In **Security**: open a card and click **Run Security Check**. The app tells you if a flaw is present and its source.
- If clean, click **Pass Security**. If flawed, click **Reject (Security)** with a reason. It goes back to In Progress.
- Your performance is tracked in the background. Miss too many and flaws reach Production, which costs the team the Price.

### Release

- In **To Deploy**: open a card and click **Deploy to Production**.

### Observer

- You can see the whole board but cannot take actions. Watcher role. Your team (if you have one) is informational only.

## Sprints

Three sprints. Behaviour changes in each.

- **Sprint 1** Waterfall. Everyone stays strictly in their column. Hand-offs are explicit and slow. This is on purpose. Feel the pain.
- **Sprint 2** Agile. Cross-role collaboration is allowed. Also: some participants have been secretly assigned as Hackers. Hackers can be drawn from any role (not just Developers). They can inject security flaws into any item across the active pipeline (In Progress, Testing, Security, or To Deploy), on any team. Security has to catch them.
- **Sprint 3** CI/CD and Containers. Developers can mark Tasks as Containerized, which protects them from Hacker tampering. Sprint moves faster.

## Security flaws

Two kinds:

1. **Deterministic**: some Issue IDs have an inherent flaw based on a formula the facilitator sets. This simulates pre-existing bugs.
2. **Injected**: only in Sprint 2 and 3, a Hacker participant may have planted a flaw. Invisible until Security checks.

As Security, you do not need to know which kind it is. The check tells you both. Your job is to catch them before they reach Production.

## Troubleshooting

**I can't log in.** Your token is case-insensitive. Check you typed it correctly. If still failing, ask the facilitator.

**The board looks frozen.** Check the coloured dot in the top-right of the header. Green is live, yellow is polling (slight delay, still works), red is no connection.

**I closed the tab.** Reopen the app URL. You stay logged in until you explicitly click Exit.

**I'm on my phone and a column looks squished.** Swipe sideways. One column fills the screen at a time; you move between them by swiping.

## Credits

Based on Pylayeva, D. (2024). *DevSecOps Adventures*. Adapted from the [johnanvik/devops-colouring](https://github.com/johnanvik/devops-colouring) exercise.
