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

Open the **SQL Editor** (left sidebar). Click **New query**. Paste the entire contents of `setup_resources/schema.sql` from this project. Click **Run**.

You should see `Success. No rows returned.` or similar. The editor might flag a warning about the `ALTER PUBLICATION` lines; that is fine as long as the query finishes without an error.

The schema does three things in one shot:

1. Creates the five tables (`users`, `issues`, `tasks`, `game_state`, `hacker_log`) with checks, triggers, and the seed facilitator token `FACIL1`.
2. Adds those tables to the realtime publication so the browser receives WebSocket change events.
3. Creates the `task-images` storage bucket (public-read) with policies that allow the publishable key to upload, view, and delete images. This is what the in-app file upload writes to.

Verify by running:

```sql
SELECT * FROM users;
SELECT * FROM game_state;
SELECT id, name, public FROM storage.buckets WHERE id = 'task-images';
```

You should see one user (`FACIL1`, the default facilitator), one game state row, and one bucket marked `public = true`.

## 4. Copy your API credentials

Go to **Project Settings** (gear icon, bottom left) then **API Keys**.

You need two values:

- **Project URL**: looks like `https://abcdefghijk.supabase.co`. Find it on the **API** or **Connect** screen.
- **Publishable key**: a string starting with `sb_publishable_…`. If you do not see one, click **Create new API Keys** to generate it.

Older Supabase projects (created before late 2025) may still show an **anon public** key (a long JWT starting with `eyJ…`). The app accepts both formats, so if your project predates the new key system you can use the anon key for now and migrate to a publishable key whenever it suits you. Do **not** copy any `service_role` or `sb_secret_…` value: those bypass security and must never reach a browser.

## 5. Paste them into `config.js`

Copy and rename the configuration template from `setup_resources/config.example.js` to `public/config.js`. From the project root:

```bash
cp setup_resources/config.example.js public/config.js
```

Open `public/config.js` and replace the placeholders with your actual values:

```js
project_supabase_url = "https://YOUR-PROJECT-REF.supabase.co";
project_supabase_publishable_key = "sb_publishable_YOUR-KEY-HERE";
```

For example:

```js
project_supabase_url = "https://abcdefghijk.supabase.co";
project_supabase_publishable_key = "sb_publishable_AbCdEf123...";
```

Save.

## 6. Verify realtime is enabled

The schema adds the tables to the realtime publication, but double-check:

1. Left sidebar: **Database** → **Publications**.
2. Click `supabase_realtime`.
3. Confirm `issues`, `tasks`, `game_state`, `users`, `hacker_log` all show as enabled.

If any are missing, toggle them on.

## 7. Next steps

1. Confirm `public/config.js` exists with your real credentials (not the placeholders).
2. Go to [SETUP_CLOUDFLARE_DEPLOYMENT.md](SETUP_CLOUDFLARE_DEPLOYMENT.md) and follow the deployment instructions, including dragging the `public/` folder into your Cloudflare project.

## 8. Test locally (optional)

You can open `public/index.html` directly in a browser from your local filesystem for a quick smoke test, though some browsers block `file://` imports. Easier: skip ahead to deployment.

## Troubleshooting

**"Configuration required" page.** You either did not create `public/config.js`, or its contents still contain the placeholder `YOUR-PROJECT-REF`. Double-check the file.

**"Token not recognized."** You are trying to log in before any tokens exist. Log in as the facilitator first (default token `FACIL1`) and generate tokens in the admin panel.

**Cards do not update in real time.** The yellow dot in the header indicates polling fallback is active (usually because the network blocks WebSockets). Functionality is unchanged; updates arrive within 3 seconds.

**Image upload fails.** Verify step 3 finished cleanly: the `task-images` bucket must exist and have all three storage policies (read, insert, delete). Re-running `schema.sql` is safe and will recreate everything idempotently.

**Paused project.** Supabase pauses free-tier projects after 7 days of inactivity. The first request after a pause wakes it, but may take 30 to 60 seconds. Hit the app URL the day before your session to warm it up.

## Hardening (optional)

For a long-running deployment (not a throwaway classroom), enable Row Level Security in the Supabase dashboard and add policies. See `schema.sql`; the `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` lines are where you would switch this back on, and the storage policies at the bottom of the file should be tightened so only authenticated users can upload or delete. Writing those policies is outside the scope of this guide but the Supabase docs cover it well.
