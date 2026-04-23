# Supabase setup

The backend is one Supabase project. Free tier. About 5 minutes of work.

## 1. Create a Supabase account

Go to [supabase.com](https://supabase.com) and sign up. Free tier, no credit card required.

## 2. Create a new project

Click **New project**. Choose:

- **Name**: anything, e.g. `devops-colouring`. This is just for your dashboard.
- **Database password**: generate a strong one. Save it somewhere. You will not need it for the app itself, but Supabase requires it.
- **Region**: pick the one closest to where the conference is happening. This affects latency.
- **Pricing plan**: Free.

Provisioning takes about 2 minutes.

## 3. Run the schema

Open the **SQL Editor** (left sidebar). Click **New query**. Paste the entire contents of `schema.sql` from this project. Click **Run**.

You should see `Success. No rows returned.` or similar. The editor might flag a warning about the `ALTER PUBLICATION` lines; that is fine as long as the query finishes without an error.

Verify by running:

```sql
SELECT * FROM users;
SELECT * FROM game_state;
```

You should see one user (`FACIL1`, the default facilitator) and one game state row.

## 4. Copy your API credentials

Go to **Project Settings** (gear icon, bottom left) then **API**.

You need two values:

- **Project URL**: looks like `https://abcdefghijk.supabase.co`
- **Project API keys** → **anon public**: a long JWT string starting with `eyJ...`

Do **not** copy the `service_role` key. That key bypasses security and must never be in a browser.

## 5. Paste them into `config.js`

In this project folder, copy `config.example.js` to `config.js` and fill in:

```js
window.CONFIG = {
  SUPABASE_URL: 'https://abcdefghijk.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...'
};
```

Save.

## 6. Verify realtime is enabled

The schema adds the tables to the realtime publication, but double-check:

1. Left sidebar: **Database** → **Publications**.
2. Click `supabase_realtime`.
3. Confirm `issues`, `tasks`, `game_state`, `users`, `hacker_log` all show as enabled.

If any are missing, toggle them on.

## 7. Test locally (optional)

You can open `index.html` directly in a browser from your local filesystem for a quick smoke test, though some browsers block `file://` imports. Easier: skip ahead to deployment.

## Troubleshooting

**"Configuration required" page.** You either did not create `config.js`, or its contents still contain the placeholder `YOUR-PROJECT-REF`. Double-check the file.

**"Token not recognized."** You are trying to log in before any tokens exist. Log in as the facilitator first (default token `FACIL1`) and generate tokens in the admin panel.

**Cards do not update in real time.** The yellow dot in the header indicates polling fallback is active (usually because the network blocks WebSockets). Functionality is unchanged; updates arrive within 3 seconds.

**Paused project.** Supabase pauses free-tier projects after 7 days of inactivity. The first request after a pause wakes it, but may take 30 to 60 seconds. Hit the app URL the day before your session to warm it up.

## Hardening (optional)

For a long-running deployment (not a throwaway classroom), enable Row Level Security in the Supabase dashboard and add policies. See the `schema.sql` file; the `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` lines are where you would switch this back on. Writing policies is outside the scope of this guide but the Supabase docs cover it well.
