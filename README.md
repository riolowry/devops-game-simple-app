# ITS DevSecOps Adventure: static-site CRUD app

A free, self-contained implementation of the "DevSecOps Adventure" coloring game. Two HTML pages and a Supabase project are all you need. No GitHub organization, no CLI scripts, no build step.

Designed for conference tutorials and classroom sessions with 20 to 50 participants.

## What this is

A replacement for the GitHub Projects / Issues workflow used in [johnanvik/devops-colouring](https://github.com/johnanvik/devops-colouring), keeping the same pedagogical structure (three sprints, seven roles, Kanban board) but removing every external dependency except a free Supabase backend and free Cloudflare Pages hosting.

See [PLAN.md](PLAN.md) for the full design rationale, data model, and gotchas. Start here for deployment.

## Files in this repo

```
PLAN.md                   design document and gotcha register
README.md                 this file
SETUP_SUPABASE_DB.md         create the backend (5 minutes)
SETUP_CLOUDFLARE_DEPLOYMENT.md             deploy the frontend to Cloudflare Pages
FACILITATOR_GUIDE.md      pre-session and in-session playbook
PARTICIPANT_GUIDE.md      what students see (also embedded in the app)
schema.sql                run this once in Supabase SQL editor
config.example.js         copy to config.js, add Supabase URL and key
index.html                participant app (login + Kanban)
admin.html                facilitator console (users, sprints, reset, export)
app.js                    shared application logic
styles.css                small amount of supplemental CSS
```

Project's directory structure:

```
devops-game-simple-app/
├── .gitignore                          ← You know, for git.
├── README.md                           ← Overview, quick start (this file).
├── LICENSE                             ← MIT License.
│
├── setup_resources/                    ← Initial setup instructions, templates, and schemas.
│ ├── config.example.js                 ← copy to `config.js` in the `public/` folder, fill in actual credentials
│ ├── schema.sql                        ← Postgres schema (run once in Supabase SQL editor)
│ ├── SETUP_CLOUDFLARE_DEPLOYMENT.md    ← Cloudflare Pages setup and frontend deployment instructions (5 min).
│ └── SETUP_SUPABASE_DB.md              ← Supabase cloud backend setup instructions (5 min).
│
└── public/                             ← Contains the files to deploy to Cloudflare.
  ├── admin.html                        ← Current entry point for admin backend (restricted to facilitator(s) only), contains the facilitator facing admin views.
  ├── app.js                            ← Main game logic is here.
  ├── config.js                         ← Stores secrets! Don't commit to git!!
  ├── guide.html                        ← Shows all user-facing markdown guides (user-facing means facilitator(s) and Participant(s)).
  ├── guide.js                          ← Javascript to support `guide.html`.
  ├── index.html                        ← Current entry point for app, contains the participant facing views.
  ├── styles.css                        ← Supplemental CSS (I think it still needs: print, a11y, motion)
  │
  ├── guides/                           ← all the markdown guides
  │ ├── FACILITATOR_GUIDE.md            ← pre-session and in-session playbook
  │ ├── PARTICIPANT_GUIDE.md            ← what participants see
  │ └── TESTING_GUIDE.md                ← how to run tests, smoke, stress, self-test
  │
  ├── tests.html                      ← Testing page to run all tests from the browser (also contains UX views for running test, export, etc)
  └── tests.js                        ← Testing js to support all tests in tests.html
```

## Quick start

1. **Create the backend.** Follow [SETUP_SUPABASE_DB.md](SETUP_SUPABASE_DB.md). Takes about 5 minutes. You get a `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

2. **Configure the frontend.** Copy `config.example.js` to `config.js` and paste in the URL and key.

3. **Deploy.** Follow [SETUP_CLOUDFLARE_DEPLOYMENT.md](SETUP_CLOUDFLARE_DEPLOYMENT.md) to upload to Cloudflare Pages. Free, no Git required.

4. **Log in as facilitator.** Visit `your-site.pages.dev/admin.html`, enter the default facilitator token `FACIL1`, generate participant tokens.

5. **Run the session.** Follow [FACILITATOR_GUIDE.md](FACILITATOR_GUIDE.md).

## Costs

Zero. The Supabase free tier covers a 90-minute session with 50 participants comfortably. Cloudflare Pages static hosting is free forever with generous bandwidth. No credit card required for either service.

## Limitations

See section 17 of [PLAN.md](PLAN.md). The short version: this is trust-based (not secure), single-session (one Supabase project per concurrent session), and online-only (no offline mode). Acceptable trade-offs for a classroom tool.

## Attribution

This exercise is adapted from:

- Pylayeva, D. (2024). _DevSecOps Adventures: A Game-Changing Approach with Chocolate, LEGO, and Coaching Games_. Apress. [doi.org/10.1007/979-8-8688-0397-0](https://doi.org/10.1007/979-8-8688-0397-0)
- [johnanvik/devops-colouring](https://github.com/johnanvik/devops-colouring), a GitHub-based adaptation of the above.

This implementation preserves the workflow and terminology of both sources.
