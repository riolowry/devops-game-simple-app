# Testing guide

This document covers how to exercise every user flow without logging in and out of six tokens. There are three ways, from fastest to most manual.

## Quick reference

| Need                                         | Use                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| Prove a feature works in seconds             | `tests.html` and click the relevant test                                  |
| Watch the board animate as tests run         | `tests.html` in one tab, `index.html` in another                          |
| Act as any role without re-logging in        | Log in on `index.html` as facilitator, use the footer **simulate** picker |
| Full pen-and-paper walkthrough for a session | The role-by-role section below                                            |

---

## 1. The three testing modes

### Mode A: `tests.html` automated runner

Open `tests.html` in a browser. It uses the same `config.js` as the app, so no setup beyond what you already did for the main app.

Each test has a **Run** button (in both the summary table and the per-test card). Click the **?** button next to any Run button to pop open a dialog explaining exactly what that test does and which category-level safeguards apply.

At the top, larger shortcuts drive batches:

- **Run all (keep data)**: every test except `cleanup`, in order. TEST rows are left in the database so you can open `index.html` or `admin.html` and inspect state afterward. This is the default.
- **Run all + cleanup**: every test including `cleanup` at the end. The DB is wiped of `TEST:` / `TEST-` rows when it finishes.
- **Frontend only**: pure JS logic tests. No database writes. Fast. Covers the permission matrix, batch gate, flaw detection, and facilitator impersonation. If these fail, the game rules themselves are broken.
- **Setup only**: health check plus `game_state` singleton and facilitator seed presence.
- **Unit only**: DB-level primitives (create user, claim, batch gate, security rule).
- **E2E only**: full-pipeline flows.
- **Sprint only**: tests that mutate `game_state.current_sprint` to exercise sprint 2 and sprint 3 rules. These always snapshot the current `game_state` and auto-restore it on completion or failure, so your real session cannot be left stuck in the wrong sprint.
- **Clean up TEST data**: deletes anything the tests created. Safe to run any time. Matches by prefix only (`TEST:` on issues, `TEST-` on users), so your real session data is untouched.
- **Reset view** clears status badges and per-test logs. It does not affect DB data or testing history.
- **Abort batch** stops a running batch after the current test finishes; remaining tests are marked skipped.

Hover or tab-focus any of these buttons and the summary table and per-test cards below will outline which tests will run (indigo outline) and fade out the ones that won't. This preview costs nothing; there's no "confirm" step, just click.

Adjust the **Delay** field (default 1500 ms) to control how fast DB-touching tests animate the board. Set it to 0 for fast CI-style runs, or 2000+ ms when using E2E tests as a live demo. Frontend tests ignore the delay (they do not touch the DB).

**Run summary** at the top of the page shows, in plain language, what is running, how many passed/failed/skipped so far, a progress bar, and an end-of-run summary that lists any failed test IDs and reminds you whether DB data was preserved.

**All tests table** below the summary lists every test with live status updates, duration, and individual **?** / **Run** buttons. A keyboard user can tab through the **?** buttons to learn what every test does without touching a mouse.

**Testing log** at the bottom is a persistent record of every test run (batched or ad-hoc). It survives page reloads (stored in browser `localStorage`, key `devsec_test_log_v1`, capped at 2000 entries). Three controls:

- **Show/Hide** toggles the log table.
- **Export (.md)** downloads a Markdown report of every run grouped by batch, with per-batch pass/fail stats and inline failure logs for any failed test. This is the file to attach to a bug report.
- **Clear history** wipes the stored history after confirmation. Only touches `localStorage`; no DB data is deleted.

What each test covers:

- `fe-*`: frontend unit tests against `window.App.logic` (no DB). Cover role labels, progress/batch-gate, flaw detection, effective role/team, canAct permission matrix, hacker injection scope, facilitator impersonation, and create_issue permission.
- `health`: all five tables are reachable with the anon key.
- `game-state`: the singleton `game_state` row exists.
- `facilitator-seed`: the `FACIL1` facilitator token from `schema.sql` is present.
- `u-*`: DB-level unit tests: create user, create issue, claim, batch gate, deterministic security rule.
- `e2e-happy-path`: Business to Accept with nothing going wrong.
- `e2e-feedback-loop`: reject from production, pick up, feedback_reason clears.
- `e2e-security-catches`: hacker injects, security detects and rejects.
- `e2e-security-misses`: hacker injects, security passes it, business rejects in production. Verifies the retro still sees this miss after the fix.
- `e2e-container-blocks`: Sprint 3 containerization prevents injection (logic-level, no `game_state` mutation).
- `sprint-advance-flow`: walks real `game_state.current_sprint` through 1 → 2 → 3 and resets to 1. Auto-restores the original value.
- `sprint-config`: writes non-default `security_modulus` and `hacker_count`, then auto-restores.
- `e2e-sprint2-real-hacker`: sets `current_sprint=2` in the real `game_state`, runs a full hacker-injects-security-catches flow through the live `canAct` path, then auto-restores.
- `e2e-sprint3-container-blocks`: sets `current_sprint=3`, creates a containerized task, and calls the real `App.logic.canAct` to confirm injection is blocked (both real hacker and facilitator-as-hacker). Auto-restores.
- `e2e-sprint3-non-container-vulnerable`: negative control for the above. At sprint 3 without the container flag, injection must still succeed; a DB-level injection-to-catch round-trip confirms it. Auto-restores.
- `cleanup`: remove everything with a `TEST` prefix.

**Sprint-test safety note.** Every test in the `sprint` category calls `ctx.snapshotGameState()` at the start of its run function. The harness's `runTest` wraps the test body in a `try/finally` and calls `ctx.restoreGameState()` in the `finally` branch, so even a failed assertion or thrown exception will not leave the real session's `current_sprint` mutated. If you are running a sprint test while another browser has the board open, that other browser will briefly see the sprint badge flip to 2 or 3 and then back; this is expected and harmless.

### Mode B: facilitator impersonation

Log in on `index.html` with your facilitator token (default `FACIL1`). A thin indigo bar appears fixed to the bottom of the screen with a **simulate** dropdown. Pick any role to act as a participant: Business, Developer, Tester, Security, Release, Observer, or Hacker. A team dropdown appears once a role is chosen (optional; team only matters game-mechanically for Developer actions).

While impersonating, every action button that would normally be gated by role or team shows up and works. The header above the board reflects the impersonated role (so a facilitator acting as Developer sees exactly what a real Developer sees). You stay signed in as the facilitator the whole time; your raw row in the `users` table is unchanged.

The picker is deliberately placed at the bottom of the viewport and styled subtly so nothing in the header, board, or modals gives away that you are a facilitator rather than a participant. Click **Stop simulating** to return to observe-only mode.

This replaces the old workflow of "log out, log in as Alice, do a thing, log out, log in as Bob".

A few notes:

- Facilitators can simulate **every** participant role, including Hacker and Observer. Facilitators themselves cannot be promoted to Hacker in the database (would taint the audit log), but impersonation gives you the same capability for testing and help.
- When impersonating as Developer and you create a Task, `assignee_token` is set to the facilitator's own token. The task still appears on the board and flows correctly. This is deliberate: it lets you complete your own tasks without the `task.assignee_token === user.token` check rejecting you.
- Setting the role dropdown back to **Observe only** returns the facilitator to pure spectator mode. Your impersonation choice is persisted in `localStorage` so reloads do not reset it; logout clears it.
- Non-facilitators see no picker at all. The DOM check is `x-if="$store.app.isFacilitator()"`.

### Mode C: manual walkthrough with real tokens

The old way. You need this for dress-rehearsing a real session, since it exposes the pain points participants will feel.

Copy the roster below into the admin panel's **Users → Bulk create** field, then print the generated tokens and hand them out (or sit with several browser profiles open). Then walk the steps in the role-by-role section.

---

## 2. Roster for bulk create

Paste this verbatim into `admin.html → Users tab → Bulk create → textarea`, then click **Create all**. Roles are case-insensitive; the app lowercases them on insert.

```
Alice,       business,
Bob,         developer, Team 1
Carol,       developer, Team 1
Dan,         developer, Team 1
Eve,         tester,    Team 1
Frank,       developer, Team 2
Grace,       developer, Team 2
Henry,       developer, Team 2
Iris,        tester,    Team 2
Jack,        security,
Kate,        security,
Leo,         release,
Mia,         observer,
```

This gives you: 1 Business, 6 Developers split across 2 teams, 2 Testers (one per team), 2 Security officers, 1 Release, 1 Observer. Thirteen tokens total, roughly what a 20-person session looks like minus some Dev slots. Teams can be attached to any role; the field is optional on all of them.

For Sprint 2, you will promote one or two participants to Hacker. Any participant role (Business, Developer, Tester, Security, Release, Observer) is eligible. The **Admin → Sprint tab → Eligible participants → Make Hacker** button promotes them in place. Their token and name do not change; their `role` becomes `hacker` and their prior role is stashed in `previous_role` so Demote restores them correctly. Promotion is silent in the UI, so remember to quietly tell the chosen participant.

---

## 3. Role-by-role manual tests

Each test assumes you are logged in as the stated role and viewing `index.html`. For facilitators, substitute "Act as X" in the header for "log in as X".

### 3a. Business

1. Land on the Market column. Confirm the `+ New Product Request` button is visible (it only shows for Business role).
2. Click it. Fill in a title, pick a page URL from [online-coloring.com](https://www.online-coloring.com), set Price = 100 and Batch Size = 2. Create.
3. Confirm the card appears in Market, with `$100` and `Batch 0/2` pill badges.
4. Later, when an item lands in **In Production**, click it. Verify both `Accept` and `Reject to Feedback` buttons are present, and no other role's buttons (deploy, claim, etc.) are visible.
5. Accept flow: click Accept. The card disappears (deleted from the `issues` table). Confirm in `admin.html → Log tab` that any existing hacker_log row for the accepted issue still shows but with no issue reference. This proves the FK-null-before-delete fix is in place.
6. Reject flow: click Reject. Provide a reason. Click Confirm. Card moves to Feedback column with the reason visible on the card.

### 3b. Developer

1. Market column. No action buttons (correct: claiming happens from In Progress).
2. Wait for Business to create a request. Open the card.
3. Click **Claim for \<my team\>**. Confirm the card moves to In Progress with a team-color pill.
4. Click the card again. Click **+ Claim a Task**. Confirm a task row appears with status `claimed`.
5. In the task's **Paste image/page URL** field, paste any URL. Click **Mark complete**. Confirm the task badge goes from `claimed` to `complete` and the batch counter on the parent card goes from 0/2 to 1/2.
6. Create a second task (if Batch Size is 2). Complete it. Verify the batch counter is now 2/2 and the **Send to Testing** button becomes enabled.
7. Click Send to Testing. Card moves.
8. If the item later lands in Feedback: open it, confirm the rejection reason is shown, click **Pick up for rework**. Card moves back to In Progress; the rejection reason clears.

Sprint 3 specifics:

- When creating a task, a checkbox **Mark this task as Containerized** appears (only in Sprint 3). Tick it. The resulting task shows a `container` badge, and the parent card gets a `Containerized` badge at the top.
- A hacker cannot inject on a containerized item. See 3d.

### 3c. Tester

1. Items only reach you via Send to Testing. Open the card.
2. Verify each Task has an image URL attached (click through to check). Confirm the UI shows this list clearly.
3. Click **Pass Testing**. Card moves to Security.
4. Or click **Fail Testing**. Card goes back to In Progress.

Testers cannot see the `hacked_flag`. The card is visually identical whether it has been hacked or not. This is intentional: testers are not the security control.

### 3d. Security

1. Open an item in the Security column.
2. Click **Run Security Check**. The panel shows one of: **Flaw detected (source: deterministic)**, **Flaw detected (source: injected)**, or **Clean**.
3. Once the check has been run, `Pass Security` and `Reject (Security)` appear as actionable buttons. Before the check, they are hidden.
4. Reject flow: provide a reason. Confirm. Card moves back to In Progress with the reason attached.
5. Pass flow: card moves to To Deploy.

To verify the log:

- In `admin.html → Log tab`, every injection should show as **Caught** (if you rejected) or **Leaked** (if you passed). Pending rows resolve as soon as Security acts.

### 3e. Release

1. Items only reach you via Pass Security. Open the card.
2. Click **Deploy to Production**. Card moves.

No configuration, no conditional branching. Release is the simplest role.

### 3f. Observer

1. Log in with an Observer token. The header says you are signed in as Observer.
2. Open any card. Confirm no action buttons appear (no claim, no deploy, no accept, etc.) on any card in any column. Observer is read-only by design and the name change from "Admin" makes this clearer.
3. Observer role does not unlock additional actions in Sprint 2 or Sprint 3. This is intentional: Observer is for participants who are watching rather than actively playing (e.g. a TA or auditor). If you want an active facilitator-style view, use the facilitator impersonation in Mode B above.
4. An Observer may be assigned to a team; the team is informational only (no game-mechanical effect).
5. An Observer may be promoted to Hacker like any other participant role. On demote, they return to Observer.

### 3g. Hacker

1. When any participant is promoted to Hacker, their visible role in the UI becomes **Developer** (the same way all hackers appear). Their team (if they had one) is preserved. This is deliberate: the hacker identity is private, and if you were a Tester-turned-Hacker, showing "Tester" everywhere with an Inject Flaw button would give it away.
2. In Sprints 2 and 3, an extra dark **Inject Flaw** button appears at the bottom of the card detail modal on any non-containerized issue in **any active pipeline status**: `in_progress`, `testing`, `security`, or `to_deploy`. The hacker can inject on **any team's item**, not just their own.
3. Excluded statuses: `market` (nothing to hack yet), `in_production` (already deployed; hacking there defeats the pipeline teaching point), and `feedback` (rejected, waiting for rework pickup). If an item is rejected from production to feedback and then picked up back into `in_progress` without a security-triggered flag clear, it is injectable again if `hacked_flag` was not previously set on it.
4. Click Inject Flaw. A brief toast says "Injection recorded." The button disappears on that issue (cannot re-inject the same issue while `hacked_flag` is true).
5. The UI shows no lingering sign the injection happened. This is deliberate: if the hacker's screen had a persistent "hacked" indicator, anyone looking over their shoulder could identify them.
6. Verify in `admin.html → Log tab` that the injection row was written with `hacker_token`, `target_issue_id`, `sprint`, and a null `caught_by_security` (to be updated when Security acts).

### 3h. Facilitator (on admin.html)

1. Go to `admin.html`. Log in with `FACIL1` (or the token you set).
2. **Users tab**: create a single user, bulk-create a roster, dismiss the "just created" amber box, delete a user. The role dropdown should include **Observer** and not **Admin**.
3. **Sprint tab**: Advance to Sprint 2. Confirm the description text updates. The **Eligible participants** list should show users in every participant role (not just Developer). Promote one. Confirm they appear in the Current Hackers list with a "was \<role\>" annotation. Demote them; confirm the prompt says "Demote back to \<original role\>" and after demote their role is restored (not forced to Developer). Reset to Sprint 1.
4. **Config tab**: Change Session label. Save. Go to `index.html`; verify the new label appears in the header. Change Security modulus to 11. Save.
5. **Log tab**: should be empty until injections happen. After tests run, should show counts.
6. **Board tab**: read-only view with `[!]` markers on hacked items. Should match the live board minus the interactive controls.
7. **Reset tab**: **Reset Issues and Tasks** clears the board but keeps users. **Reset Everything** clears everything but FACIL1 and game_state.
8. **Export tab**: clicking the button downloads a JSON blob. Open it and verify it contains `users`, `issues`, `tasks`, `hacker_log`, and `game_state` keys.

### 3i. Facilitator simulation (on index.html)

1. Log into `index.html` with your facilitator token. A thin indigo bar appears at the bottom.
2. Without picking a role: you are in observe-only mode. No action buttons appear.
3. Pick **as Business**. The header changes to "Signed in as Business". Create a Product Request.
4. Switch to **as Developer**, then pick a team. Claim the request, add tasks, complete them, send to testing.
5. Continue through **as Tester → as Security → as Release → as Business** (to accept). All without logging out.
6. Switch to **as Observer**. Confirm no action buttons; this is what the actual Observer role sees.
7. Switch to **as Hacker** (only works in Sprint 2+). Pick a team or leave blank. Confirm the Inject Flaw button appears on any active-pipeline card regardless of which team owns it.
8. Click **Stop simulating** to return to observe-only mode.

---

## 4. Sprint-transition tests

### Sprint 1 → Sprint 2

1. Admin → Sprint → Advance. Confirm the board header shows "Sprint 2".
2. Confirm no action buttons change on non-hacker participants.
3. Go to Admin → Sprint → **Eligible participants** list. Any role (Business, Developer, Tester, Security, Release, Observer) can be promoted. Promote one participant to Hacker. Note their prior role in the confirmation prompt ("was tester" etc.).
4. Log in as that participant (or impersonate via footer). Confirm the **Inject Flaw** button is now visible on eligible cards across any team. Try on another team's `in_progress` item, then on a `testing` item, then on a `security` item, then a `to_deploy` item. All should work.
5. Demote the hacker. Confirm they return to their original role (not to "developer" by default).

### Sprint 2 → Sprint 3

1. Admin → Sprint → Advance. Header shows "Sprint 3".
2. Developer tries to create a new task on an In Progress issue. The containerization checkbox now appears. Before Sprint 3 it was hidden.
3. Tick the checkbox. Create the task. Parent card gets a `Containerized` badge.
4. Hacker impersonation: try to inject on the containerized item. The **Inject Flaw** button should be absent.
5. Hacker tries on a non-containerized item from earlier. Should still work.

---

## 5. Known gotchas

- **Supabase pauses after 7 days of inactivity.** First page load after a pause takes 30 to 60 seconds. Hit the URL the day before a real session.
- **Conference Wi-Fi may block WebSockets.** The app falls back to polling after 3 seconds. The header indicator turns from green to yellow. Functionality is unchanged.
- **Client-side role enforcement.** Someone who opens DevTools can write directly to the DB via the anon key. Documented as trust-based. A determined student can break the game. This is acceptable for a classroom exercise and, frankly, itself a teachable moment.
- **Issue acceptance used to wipe retro data.** Fixed: `acceptProduction()` now nulls the `hacker_log.target_issue_id` FK before deleting the issue, so the cascade does not delete the log row. If you wrote your own version of the app before this fix, the test `e2e-security-misses` will reveal the regression.
- **Facilitator simulation previously short-circuited on write actions.** Fixed: `createIssue` now goes through `canAct('create_issue')` instead of reading `this.user.role` directly, so a facilitator simulating as Business can actually create Product Requests. `claimIssue` and `canAct` already used effective role/team; this was the outlier. If you wrote your own version before this fix, the `fe-create-issue-permission` frontend test will catch the regression.
- **Dev team attribution on tickets.** The ticket detail modal shows the team as a prominent color-coded badge (previously faint "Team: X" text). For facilitators whose simulated team does not match, a one-click "Simulate as <team>" chip appears in the modal so swapping teams is instant.

---

## 6. Recommended testing sequence before a real session

For a first-time deployment:

1. Run `tests.html → Run frontend only`. All frontend tests should pass in under a second. These verify that the permission matrix, hacker injection scope, flaw detection, and impersonation rules match the spec. If any fail, fix the logic before touching the DB.
2. Run `tests.html → Run setup only`. All three should pass.
3. Run `tests.html → Run E2E only`. All five should pass. Watch the `admin.html → Board tab` in another window and verify cards visibly move through columns.
4. Open `admin.html` manually. Create the full roster from section 2 via bulk create.
5. Open `index.html` as facilitator. Use the footer simulation picker to walk the full pipeline (Business → Developer on Team 1 → Tester → Security → Release → Business accept).
6. Advance to Sprint 2. Promote a participant token to Hacker (try promoting a Tester or Security officer, not just a Developer, to confirm the wider eligibility). As facilitator simulating Hacker, inject on another team's card across in_progress, testing, and security statuses. As Security, run the check and confirm detection.
7. Advance to Sprint 3. Repeat with a containerized task. Confirm Inject Flaw is gone on that card.
8. Run `tests.html → Clean up TEST data` to remove everything the automated runs created, leaving your roster ready.

After that sequence, you have exercised every feature the app supports. Session-ready.
