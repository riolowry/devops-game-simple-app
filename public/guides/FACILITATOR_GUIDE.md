# Facilitator Guide

This guide covers running an ITS DevSecOps Adventure session end to end. For setup, see [setup_resources/SETUP_SUPABASE_DB.md](https://github.com/riolowry/devops-game-simple-app/blob/main/setup_resources/SETUP_SUPABASE_DB.md) and [setup_resources/SETUP_CLOUDFLARE_DEPLOYMENT.md](https://github.com/riolowry/devops-game-simple-app/blob/main/setup_resources/SETUP_CLOUDFLARE_DEPLOYMENT.md).

## Pre-session

1. Spin up a Supabase project (free tier is enough). Copy `setup_resources/config.example.js` to `public/config.js` and fill in URL and publishable key.
2. Open the SQL editor and paste the entire `setup_resources/schema.sql`. Run it. Confirm no errors.
3. Deploy the `public/` folder. Cloudflare Pages or any static host works. For a local dry run: `python3 -m http.server` from the `public/` directory.
4. Open `admin.html` in your browser. Sign in with `FACIL1` (the seed token).
5. **Users tab**: bulk-add your participants. Format: `Name, role, team`, one per line. Tokens are auto-generated; copy them out for distribution.
6. **Curated URLs tab**: confirm 20 default rows. Add or edit as desired. Use **Reset to defaults** to restore.
7. **Settings tab**: set session label, flaw rate (default 25%), and Sprint 3 toggles (CI/CD bypass and role swap default on).

## Session flow

- **Kickoff** (5 min): show participants the board on a projected screen. Introduce the columns. Hand out tokens.
- **Sprint 1 - Build** (15-20 min): Business creates 4 to 8 cards. Teams work through Market → Accepted. Watch for confused Testers (they verify deliverables, not Acceptance Criteria) and idle Security (random flaws will give them work).
- **Sprint advance to 2**: in admin Users tab, promote one participant per ~6 to **Hacker**. Open admin Sprint tab. Click **Advance sprint**. Cross-training is auto-assigned.
- **Sprint 2 - Threat** (15-20 min): Hackers inject. Watch the hacker_log on admin Sprint tab for caught vs. leaked.
- **Sprint advance to 3**: open admin Sprint tab. Click **Advance sprint**. Role swap fires (Tester→Developer, Security→SysAdmin). Cards from earlier sprints devalue.
- **Sprint 3 - DevOps** (15-20 min): Developers can mark tasks containerized. Containerized cards skip the pipeline. Hackers can stop containers in production.
- **Retrospective** (15 min): export full state JSON from the admin Data tab. Review the leaderboard, the hacker_log, and the comment threads.

## Mid-session controls

- **Simulate as**: from the participant board (`index.html`) signed in as facilitator, the bottom bar lets you act as any role on any team. Useful for unblocking a stuck card.
- **Edit users mid-session**: the Users tab is edit-in-place. Change someone's role or team without affecting the data.
- **Hide comments**: the Comments tab lets you soft-hide individual comments (reversible). Use for off-color comments. Hard delete is also available.
- **Reset issues & tasks**: clears all cards and history. Keeps users, teams, curated URLs, settings.

## The Clarifications column

This is where the two real-world flows live. Both look similar at a glance but mean different things — point this out to participants on the first card that lands here:

- **Rejection** (rose `REJECTION → Developer / Team A` pill): a Tester / Security / Business person rejected the work. Targeted dev clicks **Pick up for rework**; card moves to **In Progress** for the dev to fix. The rejection reason is the comment in the red banner at the top.
- **Question** (blue `QUESTION → Business` pill): someone asked the targeted role/team a question. Target clicks **Send response**, writes their answer; card returns to whichever column the asker was in. The question is the comment in the blue banner.

A common pedagogical moment in Sprint 2: a dev gets rejected and the reason is unclear. Show them they don't have to guess — they can click **Ask a question** while in the rejection clarification, target the rejecter back, ask for clarification, and `pre_clarification_status` stays as `'in_progress'` so they still resume rework after the answer.

## Troubleshooting

- **Participants see nothing**: check the connection dot in their header. If amber, realtime is down and the app polls every 3s.
- **Card stuck in Clarifications**: open the admin **Board** tab to see who's targeted. If a participant left, you can simulate as that role/team via the bottom bar and pick up or answer on their behalf, or edit the issue's target via the Cards admin tab.
- **Card came back to the wrong column after answer**: check `pre_clarification_status` on the issue. For rejections it must be `'in_progress'`; for questions it should be the asker's actual column. The app sets these correctly; if you see a mismatch on a card from a previous deployment, run the in-place migration in `SETUP_SUPABASE_DB.md`.
- **Hacker won't promote**: facilitators cannot be hackers. Use a different participant token.
- **Image upload fails**: check the Supabase storage bucket policies. The schema.sql sets them, but a manual project may have overridden them.

## Reset between sessions

- **Reset issues & tasks**: same users, same teams, fresh cards.
- **Reset everything**: nuke. Keeps only your facilitator user. Wipes the storage bucket too.

## Export

Use **Download full state JSON** for the retrospective. The export contains every table including comment thread, hacker log, and event log.
