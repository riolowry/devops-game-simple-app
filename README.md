# ITS DevSecOps Adventure: static-site CRUD app

A free, self-contained implementation of the "DevSecOps Adventure" coloring game. Two static HTML entry points and a Supabase project are all you need. No GitHub organization, no CLI scripts, no build step.

Designed for conference tutorials and classroom sessions with 20 to 50 participants.

## What this is

A replacement for the GitHub Projects / Issues workflow used in [johnanvik/devops-colouring](https://github.com/johnanvik/devops-colouring), keeping the same pedagogical structure (three sprints, seven roles, Kanban board) but removing every external dependency except a free Supabase backend and free Cloudflare Pages hosting.

Participants colour pages, upload them through the app (Supabase Storage handles the files; no third-party image host required), and walk product requests through a simulated DevSecOps pipeline. A secret Hacker role injects flaws in Sprints 2 and 3; Security has to catch them.

## Repository layout

```
devops-game-simple-app/
├── .gitignore
├── LICENSE
├── README.md                              ← this file
│
├── setup_resources/                       ← initial setup, templates, schema
│ ├── config.example.js                    ← copy to public/config.js, fill in credentials
│ ├── schema.sql                           ← Postgres + Storage schema (run once in Supabase SQL editor)
│ ├── SETUP_SUPABASE_DB.md                 ← Supabase backend setup (5 min)
│ └── SETUP_CLOUDFLARE_DEPLOYMENT.md       ← Cloudflare Pages deployment (5 min)
│
└── public/                                ← deploy this folder to Cloudflare Pages
  ├── index.html                           ← participant board (login + Kanban)
  ├── admin.html                           ← facilitator console
  ├── guide.html                           ← in-app rendered markdown guides
  ├── tests.html                           ← in-browser test harness
  ├── app.js                               ← shared Alpine/Supabase application logic
  ├── guide.js                             ← supports guide.html
  ├── tests.js                             ← supports tests.html
  ├── config.js                            ← YOUR CREDENTIALS (gitignored, not committed)
  ├── styles.css                           ← supplemental CSS (print, a11y, motion)
  │
  └── guides/                              ← markdown sources rendered by guide.html
    ├── FACILITATOR_GUIDE.md
    ├── PARTICIPANT_GUIDE.md
    └── TESTING_GUIDE.md
```

## Quick start

1. **Create the backend.** Follow [setup_resources/SETUP_SUPABASE_DB.md](setup_resources/SETUP_SUPABASE_DB.md). About 5 minutes. You will obtain a `SUPABASE_URL` and a `sb_publishable_…` key.

2. **Configure the frontend.** Copy `setup_resources/config.example.js` to `public/config.js` and paste in the URL and publishable key.

3. **Deploy.** Follow [setup_resources/SETUP_CLOUDFLARE_DEPLOYMENT.md](setup_resources/SETUP_CLOUDFLARE_DEPLOYMENT.md) to upload the `public/` folder to Cloudflare Pages. Free, no Git required.

4. **Log in as facilitator.** Visit `your-site.pages.dev/admin.html`, enter the default facilitator token `FACIL1`, generate participant tokens.

5. **Run the session.** See the [Facilitator guide](public/guides/FACILITATOR_GUIDE.md) (also rendered in-app at `your-site.pages.dev/guide.html?doc=FACILITATOR_GUIDE.md`).

## Costs

Zero. The Supabase free tier (500 MB Postgres, 1 GB file storage, 5 GB storage egress + 5 GB DB egress per month) covers a 90-minute session with 50 participants comfortably; a typical session writes a few hundred ~500 KB images, well under the 1 GB cap. Cloudflare Pages static hosting is free with generous bandwidth. No credit card required for either service.

## What participants experience

Each participant logs in with a 6-character token (no password). They land on a Kanban board appropriate to their role. When a Developer finishes a colouring page, they pick the image file from their phone or laptop and the app uploads it directly to Supabase Storage; no imgur, no postimg, no link-pasting friction. Testers and Business see the uploaded images inline. The facilitator's "Reset Everything" button wipes both the database and the storage bucket in one shot, keeping the project safely under the free-tier caps between sessions.

## Limitations

The short version: this is trust-based (not secure), single-session (one Supabase project per concurrent session), and online-only (no offline mode). Acceptable trade-offs for a classroom tool. Anyone with browser DevTools can write directly to the database via the publishable key; this is documented and itself a teachable moment for the security discussion.

## Attribution

This exercise is adapted from:

- Pylayeva, D. (2024). _DevSecOps Adventures: A Game-Changing Approach with Chocolate, LEGO, and Coaching Games_. Apress. [doi.org/10.1007/979-8-8688-0397-0](https://doi.org/10.1007/979-8-8688-0397-0)
- [johnanvik/devops-colouring](https://github.com/johnanvik/devops-colouring), a GitHub-based adaptation of the above.

This implementation preserves the workflow and terminology of both sources.
