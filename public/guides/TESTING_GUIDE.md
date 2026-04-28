# Testing Guide

This is the manual end-to-end checklist. Run it before a real session, especially after schema changes.

## Setup

1. Fresh Supabase project. Run `setup_resources/schema.sql`.
2. Deploy `public/` (any static host or `python3 -m http.server` locally).
3. Open `admin.html`, sign in with `FACIL1`.
4. **Users tab**: bulk-add at minimum:
   ```
   Alice, business, (blank)
   Bob, developer, Team A
   Cathy, tester, Team A
   Dan, security, Team A
   Eve, sysadmin, Team A
   Felix, developer, Team B
   ```
5. Distribute tokens. Open the participant board (`index.html`) in a private/incognito window for each role.

## Sprint 1 happy path

1. Business: create a card with curated URL. Save.
2. Developer (Team A): claim. Add a task. Upload an image. Click Complete. Click Send to Testing.
3. Tester: open card. Click Pass Testing.
4. Security: open card. Run Security Check. Click Pass Security.
5. SysAdmin: open card. Click Deploy.
6. Business: open card. Click Accept.
7. Confirm card in **Accepted** column. Confirm leaderboard shows Team A's earned amount.

## Rejection roundtrip

1. Business: create a card.
2. Developer: claim, add task, complete, send to testing.
3. Tester: click Fail Testing. Type a reason. Submit.
4. Confirm card in **Clarifications** with red banner. Confirm rejection comment in thread.
5. Developer: click Pick up. Card returns to In Progress.
6. Developer: send back to Testing. Tester passes. Continue.

## Hacker injection (Sprint 2)

1. Admin Users: promote Felix to **Hacker**.
2. Admin Sprint: advance to Sprint 2. Confirm:
   - Cross-training assigned (banner appears for Bob, Cathy, Dan, Eve, Felix).
   - Sprint-1 non-accepted cards have halved prices.
3. As Felix (signed in fresh), find a Team A card in In Progress. Click **Inject Flaw**.
4. As Cathy (Tester), pass to Security.
5. As Dan (Security), Run Security Check. Confirm result panel shows **Flaw detected** with source `injected` (or `both` if random flaw also rolled true).
6. Reject Security with a reason.
7. Admin Log tab: confirm Felix's injection is marked `caught`.

## Code Freeze

1. Get a card to To Deploy.
2. As SysAdmin, click **Set Code Freeze**.
3. Confirm Deploy button is replaced with disabled "Deploy blocked: code freeze".
4. Click **Lift Code Freeze**. Confirm Deploy is back.

## Sprint 3 containerization

1. Admin Sprint: advance to Sprint 3. Confirm role swap fired (Cathy is now Developer; Dan is now SysAdmin).
2. As Bob (still Developer), find or create a Sprint-3 card.
3. Add a task. Tick **Mark next task as containerized**. Confirm card shows the **container** tag.
4. Complete the task. Click Send to Testing. With CI/CD bypass on, card goes directly to **In Production**.
5. As Felix (Hacker), open the card. Click **Stop Container**. Card shows **stopped** tag.
6. As any SysAdmin, click **Restart Container**. Stopped tag clears.

## Comments

1. Anyone: post a comment on any card.
2. Author: edit own comment via the edit button. Confirm `(edited)` marker appears.
3. Author: delete own comment.
4. As facilitator: hide a comment. Confirm it's invisible to non-facilitators.
5. Unhide. Hard delete. Confirm gone for everyone.

## Settings

1. Admin Settings: set flaw rate to 100%. Save.
2. Create a card. Run Security Check. Confirm flaw detected (source: random).
3. Set flaw rate to 0%. Save.
4. Create a card. Run Security Check. Confirm clean.
5. Restore default 25%.

## Reset

1. Admin Data: **Reset issues & tasks**. Confirm board is empty and users remain.
2. **Reset everything**: confirm only facilitator remains and storage bucket is empty.

## Automated tests

Open `tests.html`. Click **Run ALL**. All tests should pass on a fresh database. The DB tests create rows with a `test_` prefix and a cleanup phase removes them.
