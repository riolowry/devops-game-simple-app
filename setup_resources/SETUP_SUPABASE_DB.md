# Setting up the Supabase database

Time required: ~10 minutes for a fresh project.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project**. Name it (e.g. `devsecops-adventure-may2026`). Pick a region near your participants. Set a strong DB password (you won't need it day-to-day, but Supabase requires one).
3. Wait ~2 minutes for provisioning.

## 2. Apply the schema

1. In the Supabase dashboard, open **SQL Editor**.
2. Copy the entire contents of `setup_resources/schema.sql` from this repository.
3. Paste into the editor. Click **Run** (or Ctrl/Cmd + Enter).
4. The output should report `Success. No rows returned`. The script:
   - drops any existing DevSecOps Adventure tables (safe: this is a fresh project)
   - creates `users`, `teams`, `issues`, `tasks`, `game_state`, `hacker_log`, `comments`, `curated_urls`, `event_log`
   - seeds the `FACIL1` facilitator user, two default teams (`Team A`, `Team B`), and 20 curated coloring URLs
   - creates the `task-images` storage bucket with public read/write policies
   - registers all tables with the realtime publication
   - disables RLS on every table (classroom trust-based)
   - installs an `updated_at` trigger on `issues` and `tasks`

5. Verify by running:

   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' ORDER BY table_name;
   ```

   You should see all 9 tables.

## 3. Get your project URL and publishable key

1. Open **Project Settings → API Keys** (left sidebar).
2. Copy the **Project URL** (looks like `https://abcdefghij.supabase.co`).
3. Copy the **publishable** key (`sb_publishable_...`). On legacy projects this is called the **anon** key (`eyJ...` JWT). Either works.

> **Do not** copy the `service_role` or `sb_secret_...` keys. Those bypass security and must never be put in browser code.

## 4. Configure the frontend

1. Copy `setup_resources/config.example.js` to `public/config.js`.
2. Replace the two placeholder strings at the top:

   ```js
   project_supabase_url = "https://YOUR-PROJECT-REF.supabase.co";
   project_supabase_publishable_key = "sb_publishable_YOUR-KEY-HERE";
   ```

3. Save. Add `public/config.js` to your `.gitignore` so you don't commit credentials.

## 5. Verify

1. Serve the `public/` directory: `python3 -m http.server 8000` from inside `public/`.
2. Open `http://localhost:8000`.
3. Open the browser DevTools console. You should see:

   ```
   [devsec] app.js loaded (v2 modular build, complete)
   ```

4. Sign in with the seed token `FACIL1`. The board should load empty.
5. Open `http://localhost:8000/admin.html` to confirm the admin panel loads.
6. (Optional) Run `App.healthCheck()` in the browser console. Every table should report `OK` with row count.

## Troubleshooting

### Every request returns 401 with "permission denied for table ..."

The Postgres role behind the publishable key (usually `anon`) lacks SELECT on the public schema. New Supabase projects no longer auto-grant CRUD to `anon` and `authenticated`. The included `schema.sql` adds explicit GRANTs so this should not happen on a freshly applied schema. If you're seeing it on an older schema run, paste this in the SQL Editor:

```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
```

Reload the app. The 401s will clear.

### "Invalid API key" or 401 with no Postgres error code

The publishable key in `public/config.js` doesn't match the project, was rotated, or was left as the placeholder. Re-copy from Supabase Dashboard → Project Settings → API Keys.

## Re-running the schema

The `schema.sql` is idempotent (DROPs use IF EXISTS, CREATEs use IF NOT EXISTS, seeds use ON CONFLICT DO NOTHING). Re-running on a project drops every table first, so any session data is lost. Export from the admin panel before re-running if you want to keep it.

## In-place migrations (preserve session data)

If you have a live deployment and don't want to drop tables, run only the new ALTER TABLEs in the SQL Editor. Current pending migration:

```sql
-- Add clarification_kind so the UI can distinguish rejection rework
-- from question-and-answer in the Clarifications column. Existing rows
-- in the column are treated as 'rejection' (the only kind that existed
-- pre-migration).
ALTER TABLE issues ADD COLUMN IF NOT EXISTS clarification_kind TEXT
  CHECK (clarification_kind IS NULL OR clarification_kind IN ('rejection', 'question'));

UPDATE issues
  SET clarification_kind = 'rejection'
  WHERE status = 'clarifications' AND clarification_kind IS NULL;
```


## Hardening for production-style use

The schema disables Row Level Security for the classroom exercise. To run this somewhere with adversarial users:

1. Re-enable RLS on every table.
2. Write policies that gate by participant token (e.g. require a `token` claim and match against `users.token`).
3. Move the publishable key behind a server endpoint that validates tokens and stamps them onto the JWT.

This is out of scope for the included schema and is left as an exercise.
