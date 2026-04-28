# Manual test walkthrough (cloud-deploy verification)

Run this checklist after deploying to a real cloud environment, before a real session. It exercises the full app surface against your live Supabase project.

You'll need three browser windows open to different roles. Use private/incognito so they don't share session state.

## Pre-flight

- [ ] `public/config.js` set with real Supabase URL and publishable key
- [ ] Schema applied (see `SETUP_SUPABASE_DB.md`)
- [ ] App reachable at the deployed URL
- [ ] Browser console on `index.html` shows `[devsec] app.js loaded (v2 modular build, complete)`
- [ ] Connection dot in header is green (realtime) within 5 seconds; amber (polling) is acceptable but indicates a realtime issue worth investigating

## Setup

1. Open `admin.html`. Sign in with `FACIL1`.
2. Users tab. Bulk-add:
   ```
   Alice, business, (blank)
   Bob, developer, Team A
   Cathy, tester, Team A
   Dan, security, Team A
   Eve, sysadmin, Team A
   ```
3. Copy the generated tokens.
4. Open `index.html` in 5 incognito windows. Sign each in.

## Sprint 1: happy path

- [ ] Alice: create card with curated dog URL, batch_size 2, save
- [ ] Bob: claim, add 2 tasks, complete each with image upload, send to testing
- [ ] Cathy: pass testing
- [ ] Dan: run security check, pass security
- [ ] Eve: deploy
- [ ] Alice: accept
- [ ] Card appears in **Accepted** column
- [ ] `leaderboard.html` shows Team A earned the card's price

## Sprint 1: rejection roundtrip

- [ ] Alice: create another card
- [ ] Bob: claim, complete, send to testing
- [ ] Cathy: fail testing, reason "test rejection"
- [ ] Card lands in **Clarifications** with red banner showing rejection
- [ ] Bob: pick up. Card returns to **In Progress**
- [ ] Bob: send to testing
- [ ] Cathy: pass

## Sprint 2: hacker

- [ ] Admin Users: promote Bob to **Hacker**. Confirm he's now flagged.
- [ ] Admin Sprint: advance to Sprint 2. Confirm:
  - Cross-training assigned (banner shows on Bob, Cathy, Dan, Eve)
  - Sprint 1 non-accepted cards have halved prices
  - Code freezes (if any) cleared
- [ ] Bob (still UI-labeled Developer): create or find an in_progress card. Click **Inject Flaw**.
- [ ] Cathy: pass to security.
- [ ] Dan: run security check. Result panel shows **Flaw detected**.
- [ ] Dan: reject with reason "flaw caught"
- [ ] Admin Log tab: filter to `inject`. Bob's row shows `caught`.

## Sprint 3: containers

- [ ] Admin Sprint: advance to Sprint 3. Confirm:
  - Cathy now has Developer role
  - Dan now has SysAdmin role
- [ ] Bob: claim a card. Add a task. Tick **Mark next task as containerized**. Card shows **container** tag.
- [ ] Bob: complete task. Click Send to Testing. Card goes directly to **In Production** (CI/CD bypass).
- [ ] Bob (Hacker): on the in-production containerized card, click **Stop Container**.
- [ ] Card shows **stopped** tag. Admin Log shows `stop_container` row.
- [ ] Eve (or Dan, post-swap): click **Restart Container**. Stopped tag clears. Log row marked caught.

## Code freeze

- [ ] Eve/Dan (SysAdmin): on a card in any pipeline status, toggle **Set Code Freeze**. Card shows **freeze** tag.
- [ ] If on a To Deploy card: confirm Deploy button is replaced with disabled message.
- [ ] Toggle **Lift Code Freeze**. Confirm cleared.

## Comments

- [ ] Anyone: post a comment on any card.
- [ ] Author: edit own comment. Confirm `(edited)` marker.
- [ ] Author: delete own comment.
- [ ] Facilitator (admin Comments tab): hide a comment. Confirm invisible to non-facilitators on the card detail.
- [ ] Facilitator: unhide. Hard delete. Confirm gone everywhere.

## Settings

- [ ] Set flaw_rate_percent to 0. Save. Run security check on any card. Confirm Clean.
- [ ] Set to 100. Save. Confirm Flaw detected.
- [ ] Restore to 25.
- [ ] Toggle CI/CD bypass off. Confirm new containerized card sent to testing now goes to Testing instead of In Production.

## Reset

- [ ] Admin Data: **Reset issues & tasks**. Confirm board empty. Users remain.
- [ ] Admin Data: **Reset everything**. Confirm only `FACIL1` remains. Storage bucket file count drops.

## Performance sanity

- [ ] With ~20 cards on the board, scrolling stays smooth.
- [ ] A status change made by one user is visible to the others within 1 second (realtime) or 3 seconds (polling).

## Sign-off

- [ ] All boxes checked above
- [ ] No errors in browser console (other than expected ones; some realtime channel warnings are okay)
- [ ] Export full state JSON. Confirm file downloads with all 9 tables present.
