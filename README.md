# ITS DevSecOps Adventure

A classroom Kanban simulation that walks a group through the SDLC: Business → Developer → Tester → Security → SysAdmin → Business, across three sprints that progressively introduce hackers, cross-training, and CI/CD bypass with containers.

Built on Supabase, Alpine.js, and Tailwind CDN. No build step. Static hosting friendly.

## Repository layout

```
devops-game-simple-app/
├── .gitignore
├── LICENSE
├── README.md                              ← this file
│
├── setup_resources/                       ← initial setup, templates, schema (NOT served)
│ ├── config.example.js                    ← copy to public/config.js, fill in credentials
│ ├── schema.sql                           ← Postgres + Storage schema (run once in Supabase SQL editor)
│ ├── SETUP_SUPABASE_DB.md                 ← Supabase backend setup (5 min)
│ ├── SETUP_CLOUDFLARE_DEPLOYMENT.md       ← Cloudflare Pages deployment (5 min)
│ └── MANUAL_TEST_WALKTHROUGH.md           ← post-deploy verification checklist
│
└── public/                                ← deploy this folder to Cloudflare Pages
  ├── index.html                           ← participant board (login + Kanban)
  ├── admin.html                           ← facilitator console
  ├── leaderboard.html                     ← live team and individual rankings
  ├── guide.html                           ← in-app rendered markdown guides
  ├── tests.html                           ← in-browser test harness
  ├── app.core.js                          ← build marker, constants, supabase client
  ├── app.logic.js                         ← pure logic (canAct, sprint advance, flaws)
  ├── app.store.js                         ← Alpine state, loaders, realtime
  ├── app.actions.js                       ← participant action handlers
  ├── app.admin.js                         ← admin action handlers
  ├── app.boot.js                          ← Alpine.store registration glue
  ├── leaderboard.js                       ← supports leaderboard.html
  ├── guide.js                             ← supports guide.html
  ├── tests.logic.js                       ← pure-logic test suite
  ├── tests.db.js                          ← DB end-to-end test suite
  ├── config.js                            ← YOUR CREDENTIALS (gitignored, not committed)
  ├── styles.css                           ← supplemental CSS (print, a11y, motion)
  │
  └── guides/                              ← markdown sources rendered by guide.html
    ├── PARTICIPANT_GUIDE.md
    ├── FACILITATOR_GUIDE.md
    ├── TESTING_GUIDE.md
    ├── ROLE_BUSINESS.md
    ├── ROLE_DEVELOPER.md
    ├── ROLE_TESTER.md
    ├── ROLE_SECURITY.md
    ├── ROLE_SYSADMIN.md
    ├── ROLE_OBSERVER.md
    ├── ROLE_HACKER.md
    ├── ROLE_FACILITATOR.md
    ├── SPRINT1_SCENARIO.md
    ├── SPRINT2_SCENARIO.md
    └── SPRINT3_SCENARIO.md
```

## Quick start

1. **Spin up Supabase**. Create a project. SQL Editor → paste `setup_resources/schema.sql` → Run. See `setup_resources/SETUP_SUPABASE_DB.md` for details.
2. **Configure**. Copy `setup_resources/config.example.js` to `public/config.js`. Fill in your Supabase URL and publishable key.
3. **Serve**. `cd public && python3 -m http.server 8000`. Open http://localhost:8000.
4. **Sign in**. Use the seed token `FACIL1` to access `admin.html`.
5. **Run a session**. See `public/guides/FACILITATOR_GUIDE.md`.

## Verifying the build

Open the browser console on `index.html`. You should see:

```
[devsec] app.js loaded (v2 modular build, complete)
```

If you see the configuration error page instead, your `public/config.js` is missing or still has placeholder values.

## Testing

Open `tests.html` in a browser. Click **Run ALL**. All tests should pass on a fresh database. The DB tests namespace their rows with a `test_` prefix and self-clean.

## Architecture notes

- The frontend is split into small IIFE modules attached to `window.App`. `app.boot.js` mixes everything into a single Alpine store. Load order matters: core, logic, store, actions, [admin], boot.
- All permissions are computed by `App.logic.canAct(user, impersonation, issue, action, ctx)`. The same function is called by the UI to decide which buttons to render and by the action handlers to validate before writing. Tests cover the full matrix.
- Realtime sync is best-effort: subscribe via Supabase Realtime; fall back to 3-second polling on subscription failure or going offline.
- The schema has `RLS DISABLED` on every table. This is intentional for a classroom exercise where every participant uses the publishable (or legacy anon) key. For a hardened deployment, enable RLS and write policies.

## Credits

Curated drawing URLs are from [Online Coloring](https://www.online-coloring.com/). All other content original.

## License

See LICENSE file in the repository root.
