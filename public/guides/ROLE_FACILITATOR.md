# Role: Facilitator

You run the session. The admin panel (admin.html) is your console.

## Pre-session checklist

1. Spin up Supabase. Run `setup_resources/SETUP_SUPABASE_DB.md` (which has you paste `schema.sql` into the SQL editor).
2. Set `public/config.js` from `setup_resources/config.example.js`.
3. Deploy the `public/` directory somewhere static (Cloudflare Pages, GitHub Pages, Netlify, your laptop running `python3 -m http.server`).
4. Open admin.html with the seed token `FACIL1`.
5. In **Users**, bulk-add your participants. One per line: `Name, role, team`.
6. Confirm **Curated URLs** has the 20 default rows. Add or edit as needed.
7. In **Settings**, set the session label, flaw rate (default 25%), and confirm Sprint 3 toggles.

## During the session

- Run the rounds with **advance sprint**. Sprint 1 to Sprint 2 requires at least one **Hacker**: promote one in the Users tab first.
- The admin panel updates in real time. The board reflects what participants see.
- You can **simulate as** any role from the bottom bar of the participant board (`index.html`). This lets you test or unblock without logging in as a participant.
- The **Comments** tab lets you hide individual comments (soft, reversible) or hard-delete them. Audit data is preserved.
- The **Log** tab filters hacker-log rows by injection vs. container stop.
- Use **Reset issues & tasks** between sessions on the same project to keep users and teams.

## Sprint advance side effects

The plan is computed in `app.logic.sprintAdvancePlan`:

- **Devaluation**: every non-accepted issue from a strictly earlier sprint has its price halved.
- **Code-freeze auto-clear** (default on): every frozen card unfreezes.
- **Role swap** (Sprint 2 → 3, default on): every Tester becomes Developer; every Security becomes SysAdmin. Their `hacker_previous_role` is preserved.
- **Cross-training assignment** (Sprint 1 → 2, default on): each Developer/Tester/Security/SysAdmin gets a deterministic round-robin cross-trained role on their own team.

## Hacker promotion

Promote a participant in the **Users** tab via the `→hacker` action. Their previous role is stashed in `hacker_previous_role` and the UI continues to display them with that role to everyone else. A hacker promoted from Tester still shows as **Tester** to participants — only the hacker themselves sees the inject button. This is critical: if the cover were always Developer, a tester or business user suddenly switching to Developer would out them instantly.

In the Users table, hackers show a small `cover: tester` (or `cover: business`, etc.) pill next to their `hacker` role label. This is **only visible to facilitators** — participants see only the cover role. Use it to verify at a glance which participant is masking as which role.

If the user has no `hacker_previous_role` (e.g. you seeded them directly as a hacker via SQL or the test harness created them), the cover defaults to Developer. Promote/demote via the buttons rather than direct edits to keep the cover identity in sync.

Demote with the `demote` action to restore the prior role and clear the cover. Hackers cannot be promoted from `facilitator` (audit-log integrity).

## Reset

- **Reset issues & tasks**: clears issues, tasks, comments, hacker log, event log. Users, teams, curated URLs, settings remain.
- **Reset everything**: wipes all participant users (keeps you), all data, and clears uploaded images from storage. Settings reset to defaults.

## Export

Use **Download full state JSON** at any time. This produces a single JSON file with every table for the retrospective.
