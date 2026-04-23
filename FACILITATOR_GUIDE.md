# Facilitator guide

Everything you need to run a session, in order of when you need it.

## Before the session (the day before)

### 1. Wake the Supabase project

If you set up Supabase more than a day ago, the free-tier project has probably paused. Open your app URL in a browser. The first request takes 30 to 60 seconds; subsequent pages load instantly. Do this the day before to avoid a cold start during the session.

### 2. Log in as facilitator

Go to `your-site.pages.dev/admin.html` and enter your facilitator token (default `FACIL1`, or whatever you changed it to).

### 3. Set the session label

**Config tab** → update **Session label** to something participants will see in the header, e.g. `CPSC 3720 Fall 2026` or `DevOpsDays Calgary tutorial`.

### 4. Generate participant tokens

**Users tab** → **Bulk create**. Paste a list like:

```
Alice, business,
Bob, developer, Team 1
Carol, developer, Team 1
Dan, developer, Team 1
Eve, tester, Team 1
Frank, developer, Team 2
Grace, developer, Team 2
Harry, developer, Team 2
Iris, tester, Team 2
Jack, security,
Kate, release,
```

The commas matter. Empty positions are fine.

**Suggested role distribution for 20 participants:**

- 2 Business (or 1 Business + 1 Observer as a watcher)
- 2 teams of 3 to 4 Developers each
- 1 Tester per team
- 1 or 2 Security
- 1 Release

Generated tokens appear in a yellow "New tokens" box at the top. **Print this page or copy the tokens now** (they remain in the All tokens table but mixing them up is easy).

### 5. Prepare handouts

Print a card for each participant showing:
- Their token
- Their role
- Their team (if any)
- The app URL

Keep a master list (the CSV you just created) so you know who has which token, especially once you start promoting Hackers.

### 6. Decide Hacker candidates

Do not promote them yet. Just mentally pick one or two participants who will become Hackers at Sprint 2. Any participant role is eligible (Business, Developer, Tester, Security, Release, Observer), and a non-Developer hacker is often more interesting for the exercise. Ideally pick participants who will enjoy the role and not give it away.

## At session start

### 1. Project the board

On the main screen, open `admin.html` → **Board tab** for a facilitator-eye view, or use a second browser/tab with `index.html` logged in as an Observer role.

### 2. Distribute tokens

Hand out the printed cards. Each participant gets one.

### 3. Walk through the rules

Three minutes, tops. Participants read the details in the Help tab inside the app. Key points:

- Each role owns one column of the board.
- Business creates Product Requests; Developers do the colouring; Testers visually check; Security runs a Security Check; Release deploys.
- Use [online-coloring.com](https://www.online-coloring.com) for the colouring. Upload finished pages to any image host (imgur, postimg) and paste the URL into your Task.
- Three sprints. Each one works slightly differently. You will tell them how.

### 4. Start Sprint 1

Sprint 1 is Waterfall. Everyone stays strictly in their own column. Business should create several Product Requests to fill the Market column. Give this sprint 15 to 20 minutes. The point is for participants to feel the pain of strict silos and handoff bottlenecks.

## Sprint transitions

### Sprint 1 to Sprint 2

1. Announce you are switching to Agile. Silos are relaxed: Developers can now help test, Testers can flag security concerns, etc. In the app this is documented but not enforced, so it is mostly a cultural shift.
2. Privately approach your Hacker candidate(s). Tell them they are the Hacker for this sprint. Their job is to inject flaws into any item in the active pipeline (In Progress, Testing, Security, or To Deploy) on any team, by opening the card and clicking **Inject Flaw**. Security's job is to catch these before they reach Production.
3. Back at the admin panel: **Sprint tab** → find the candidate in the **Eligible participants** list → **Make Hacker**. Any role is promotable (not just Developers). Their prior role is recorded and restored on demote. Their token works exactly the same.
4. Click **Advance Sprint**.
5. Run Sprint 2 for 20 to 25 minutes.

Watch the **Hacker Log** tab during the sprint. Injections appear in real time.

### Sprint 2 to Sprint 3

1. Announce CI/CD and Containers. Developers can now mark their Tasks as Containerized when they create them. Containerized Tasks cannot be tampered with by the Hacker.
2. **Sprint tab** → **Advance Sprint**.
3. Optionally: **Config tab** → raise **Security modulus** to 11 (fewer deterministic flaws, more pressure on catching hacker injections). Leave **Sprint 3 auto-advance** at 0 for a first run.
4. Run Sprint 3 for 20 minutes.

Expected observation: Containerized items flow through safely. Non-containerized items still get injected. Participants should infer the defensive value of containers without being told.

## During each sprint

- The **Board tab** shows the global view. `[!]` markers reveal which items have been hacked (invisible to everyone else). Do not project this view; use it only for your own monitoring.
- **Hacker Log** shows attempts and outcomes.
- If a Developer gets stuck, use the card detail modal in an incognito window logged in as another role to unstick them. Or use the admin reset if things really go sideways.

## Common situations

**"I lost my token."** Admin panel → Users tab. Create a new token with the same role and team, delete the old one. Hand the new token to the participant.

**"I accidentally rejected something."** The rejecting role tells the Developer, who picks it back up from Feedback or In Progress and continues. This is fine; the workflow tolerates it.

**"The board isn't updating."** Check the connection indicator in the header. Green means realtime, yellow means polling (3 second latency, acceptable), red means offline. If red, check the Wi-Fi. Supabase going down is rare but possible; there is no offline mode.

**Someone figured out the Hacker via DevTools.** Teachable moment. In real life, pipeline security has to assume insider threats exist. Acknowledge it and continue.

## After the session

### 1. Retrospective

Open the **Hacker Log tab** and project it. Walk through:

- How many injections happened per sprint?
- How many did Security catch?
- How many leaked to Production?
- Did containerization visibly reduce the attack surface in Sprint 3?

Also open **Export tab** and download the JSON. Keep it for post-course reflection or research.

### 2. Reset

- For a repeat session with the same participants: **Reset tab** → **Reset Issues and Tasks**. Keeps users; wipes the board.
- For a fresh class: **Reset tab** → **Reset Everything**. Wipes all users except your facilitator token.

### 3. Shut down (optional)

You can leave the Supabase project running. The free tier has no ongoing costs. It will pause after 7 days of inactivity; the next visit wakes it.

## Cheat sheet

| Situation | Where to go |
|---|---|
| Make tokens | Admin → Users |
| Bulk import a roster | Admin → Users → Bulk create |
| Promote a Hacker | Admin → Sprint → Eligible participants list → Make Hacker |
| Advance the sprint | Admin → Sprint → Advance Sprint |
| Tune flaw rate | Admin → Config → Security modulus |
| Watch hacker activity | Admin → Log |
| See all hacked items | Admin → Board (look for `[!]`) |
| Export for retro | Admin → Export |
| Clear the board, keep users | Admin → Reset → Reset Issues and Tasks |
| Clear everything | Admin → Reset → Reset Everything |
