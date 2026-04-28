# Participant Guide

Welcome to **ITS DevSecOps Adventure**, a hands-on simulation of a software pipeline. You'll play a role on a team that builds, tests, secures, and ships products to a Business stakeholder. Across three sprints, conditions change: a Hacker is introduced, cross-training kicks in, and finally CI/CD bypass with containers reshapes the pipeline.

## Joining

1. Open the URL the facilitator shares.
2. Enter your **6-character token**. You'll see your role and team.
3. The board has columns: Market, Clarifications, In Progress, Testing, Security, To Deploy, In Production, Accepted. Cards flow left to right.

## Your role

Click **Help** in the top right at any time. Or open the [role-specific guide](guide.html) from the sidebar:

- [Business](guide.html?doc=ROLE_BUSINESS.md): write Product Requests, accept or reject finished work
- [Developer](guide.html?doc=ROLE_DEVELOPER.md): claim, draw, upload, ship
- [Tester](guide.html?doc=ROLE_TESTER.md): verify deliverables match the description
- [Security](guide.html?doc=ROLE_SECURITY.md): catch flaws
- [SysAdmin](guide.html?doc=ROLE_SYSADMIN.md): deploy, freeze, restart
- [Observer](guide.html?doc=ROLE_OBSERVER.md): watch, take notes
- [Hacker](guide.html?doc=ROLE_HACKER.md): inject and disrupt (you'll know if this is you)

## Clarifications column: rejections AND questions

The **Clarifications** column is where any card needing attention lands. There are two distinct flows that both end up there, and you'll see a colored badge on each card telling you which:

### Rejection (rose pill: `REJECTION → Developer / Team A`)

A Tester, Security, or Business person rejected the card and the developer needs to fix it. The targeted developer clicks **Pick up for rework** — one click — and the card moves to **In Progress** so they can address the rejection reason. The rejection reason is in the red banner at the top of the card.

### Question (blue pill: `QUESTION → Business`)

Someone asked a question of a specific role/team. The card pauses in Clarifications until that person clicks **Send response**, writes their answer, and submits. The card then returns to whichever column the asker was working in. **Use questions whenever you need clarification** — about acceptance criteria, an unclear rejection reason, deployment scope, anything. The whole point of this column is that everyone can SEE that a card is blocked on a question and who needs to answer.

### Asking a question

Open any card you're working on (or any rejected card targeting you) and click **Ask a question**. Pick:

- **Which role** to ask: Business / Developer / Tester / Security / SysAdmin
- **Which team** they're on (auto-fills to the card's team for team-bound roles; Business is cross-team so no team)
- **Your question** in plain language

The card moves to Clarifications and stays there until the target answers. If the target's response doesn't fully clarify, ask again — questions can chain.

### A common pattern: asking your rejecter back

If your card was rejected and the reason isn't clear, you don't have to guess. Click **Ask a question**, target the role that rejected you, and ask. When they answer, the card returns to In Progress with the answer in the comment thread.

## Card detail

Click any card to see:

- Tags: sprint, team, price, batch progress, container, freeze, stopped
- Description URL and Acceptance Criteria
- The latest **rejection reason** (red panel) if the card has been bounced
- Action buttons appropriate to your role
- Tasks list with image attachments
- Comment thread (anyone can post; you can edit and delete your own)
- Help (?) button: context-aware tips for what you can do here

## Cross-training

In Sprint 2 you may be **cross-trained** as a second role on your team. The header banner tells you which. You can act in that role on your team's cards in addition to your primary.

## Tips

- The connection dot in the header tells you whether realtime sync is healthy (green) or polling (amber).
- Use comments instead of side-channel chat. They're persistent and visible to everyone.
- Watch the [leaderboard](leaderboard.html) for live team and individual standings.
