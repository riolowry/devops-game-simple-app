-- ============================================================
-- ITS DevSecOps Adventure: Supabase schema (v2 modular build, complete)
-- ============================================================
-- WARNING: This script DROPs all DevSecOps Adventure tables. Run on
-- a fresh Supabase project, or accept that all session data is lost.
-- To preserve data between schema upgrades, export via the admin UI
-- first.
--
-- The schema is the full target shape. Idempotent: wrapped in a
-- single transaction, DROPs use IF EXISTS, CREATEs use IF NOT EXISTS,
-- seeds use ON CONFLICT DO NOTHING. Re-running yields the same end
-- state.
-- ============================================================

BEGIN;

-- ============================================================
-- DROP (for re-runs). CASCADE clears dependent objects.
-- ============================================================
DROP TABLE IF EXISTS event_log CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS curated_urls CASCADE;
DROP TABLE IF EXISTS hacker_log CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS issues CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS game_state CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- USERS. Tokens are opaque so the Hacker role is not identifiable
-- from the token alone.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  token TEXT PRIMARY KEY,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN (
    'business', 'developer', 'tester', 'security',
    'sysadmin', 'observer', 'hacker', 'facilitator'
  )),
  team TEXT,
  -- When a participant is promoted to hacker, their prior role is
  -- stashed here so demote can restore it.
  hacker_previous_role TEXT,
  -- Cross-training. cross_trained_team is a team-name string (no
  -- FK into teams) so we don't need a join in the hot path.
  cross_trained_role TEXT CHECK (cross_trained_role IS NULL OR cross_trained_role IN (
    'business', 'developer', 'tester', 'security', 'sysadmin', 'observer'
  )),
  cross_trained_team TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TEAMS. Source of truth for team names. users.team and
-- issues.team remain TEXT (no FK) for v1.
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ISSUES (parent cards on the Kanban board)
-- ============================================================
CREATE TABLE IF NOT EXISTS issues (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description_url TEXT,
  status TEXT NOT NULL DEFAULT 'market' CHECK (status IN (
    'market', 'clarifications', 'in_progress', 'testing',
    'security', 'to_deploy', 'in_production', 'accepted'
  )),
  team TEXT,
  price INTEGER DEFAULT 100,
  batch_size INTEGER DEFAULT 1 CHECK (batch_size >= 1),
  sprint_created INTEGER DEFAULT 1 CHECK (sprint_created BETWEEN 1 AND 3),
  hacked_flag BOOLEAN DEFAULT FALSE,
  containerized BOOLEAN DEFAULT FALSE,
  -- Persistent random-flaw flag, written at issue create. Distinct
  -- from hacked_flag (intentional injection).
  flawed BOOLEAN DEFAULT FALSE,
  -- Code Freeze toggle. SysAdmin owns the toggle.
  code_freeze BOOLEAN DEFAULT FALSE,
  -- Stop Container. Hacker stops; SysAdmin restarts.
  stopped BOOLEAN DEFAULT FALSE,
  -- Acceptance Criteria. Free-text, set by Business at create.
  acceptance_criteria TEXT,
  -- Clarifications routing. When a card lands in the Clarifications
  -- column, these tell the UI who can pick it up and what kind of
  -- clarification this is so the UI can render the right action.
  clarification_target_role TEXT,
  clarification_target_team TEXT,
  -- 'rejection' = card was rejected and needs rework. The target is
  --   always the developer of the card's team. Pickup is one click and
  --   the card returns to in_progress for rework.
  -- 'question' = someone asked the target a question. The target must
  --   write a reply when they pick it up; the card then returns to the
  --   asker's column (pre_clarification_status) so they can continue.
  -- NULL when the card is not currently in the Clarifications column.
  clarification_kind TEXT CHECK (clarification_kind IS NULL OR clarification_kind IN ('rejection', 'question')),
  -- Where to send the card on pickup/answer. For rejections this is
  -- hardcoded to 'in_progress' (the rework column). For questions
  -- this is the asker's actual column at the time the question was
  -- asked, so the card returns to the asker on answer.
  pre_clarification_status TEXT,
  created_by TEXT REFERENCES users(token) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TASKS (child items under an Issue; one per coloured page)
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  parent_issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  assignee_token TEXT REFERENCES users(token) ON DELETE SET NULL,
  attachment_url TEXT,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'complete')),
  containerized BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- GAME_STATE (single row, id=1 enforced)
-- ============================================================
CREATE TABLE IF NOT EXISTS game_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_sprint INTEGER DEFAULT 1 CHECK (current_sprint BETWEEN 1 AND 3),
  hacker_count INTEGER DEFAULT 0 CHECK (hacker_count BETWEEN 0 AND 5),
  sprint3_auto_advance_seconds INTEGER DEFAULT 0 CHECK (sprint3_auto_advance_seconds >= 0),
  session_label TEXT DEFAULT 'DevSecOps Adventure',
  -- Random-flaw rate as a percentage 0..100. Default 25 per spec.
  flaw_rate_percent INTEGER DEFAULT 25 CHECK (flaw_rate_percent BETWEEN 0 AND 100),
  -- Sprint 3 toggles. Both default TRUE matching the original
  -- exercise. Facilitator must toggle sprint3_cicd_bypass OFF before
  -- the conference if they want the current pipeline behaviour
  -- through sprint 3.
  sprint3_cicd_bypass BOOLEAN DEFAULT TRUE,
  sprint3_role_swap BOOLEAN DEFAULT TRUE,
  -- When advancing the sprint, auto-clear any code_freeze flags.
  code_freeze_auto_clear BOOLEAN DEFAULT TRUE,
  -- Toggle for the cross-training assignment.
  cross_training_enabled BOOLEAN DEFAULT TRUE
);

INSERT INTO game_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- HACKER_LOG (audit trail for the post-session retrospective)
-- ============================================================
CREATE TABLE IF NOT EXISTS hacker_log (
  id BIGSERIAL PRIMARY KEY,
  hacker_token TEXT REFERENCES users(token) ON DELETE SET NULL,
  target_issue_id BIGINT REFERENCES issues(id) ON DELETE CASCADE,
  sprint INTEGER NOT NULL,
  caught_by_security BOOLEAN,
  action_type TEXT NOT NULL DEFAULT 'inject' CHECK (action_type IN ('inject', 'stop_container')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COMMENTS (per-card discussion)
-- author_role_at_post and author_team_at_post are captured at write
-- time so deleted users still show meaningful attribution. Soft
-- delete via hidden_at preserves the audit trail.
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_token TEXT REFERENCES users(token) ON DELETE SET NULL,
  author_role_at_post TEXT,
  author_team_at_post TEXT,
  body TEXT NOT NULL,
  is_rejection BOOLEAN DEFAULT FALSE,
  rejection_target_role TEXT,
  rejection_target_team TEXT,
  edited_at TIMESTAMPTZ,
  hidden_at TIMESTAMPTZ,
  hidden_by_facilitator_token TEXT REFERENCES users(token) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS comments_issue_id_idx ON comments(issue_id);

-- ============================================================
-- CURATED_URLS (per-sprint per-category drawing list)
-- Seeds copied verbatim from all_role_instructions.md.
-- ============================================================
CREATE TABLE IF NOT EXISTS curated_urls (
  id BIGSERIAL PRIMARY KEY,
  sprint INTEGER NOT NULL CHECK (sprint BETWEEN 1 AND 3),
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  default_batch_size INTEGER DEFAULT 1,
  default_price INTEGER DEFAULT 50,
  display_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS curated_urls_sprint_category_idx ON curated_urls(sprint, category, active);

-- ============================================================
-- EVENT_LOG (generic per-action audit trail for the leaderboard)
-- Best-effort writes; FKs use SET NULL so a deleted issue or user
-- does not block log writes.
-- ============================================================
CREATE TABLE IF NOT EXISTS event_log (
  id BIGSERIAL PRIMARY KEY,
  actor_token TEXT REFERENCES users(token) ON DELETE SET NULL,
  issue_id BIGINT REFERENCES issues(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  sprint INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS event_log_actor_idx ON event_log(actor_token);
CREATE INDEX IF NOT EXISTS event_log_issue_idx ON event_log(issue_id);

-- ============================================================
-- SEEDS
-- ============================================================
INSERT INTO users (token, display_name, role) VALUES
  ('FACIL1', 'Facilitator', 'facilitator')
ON CONFLICT (token) DO NOTHING;

INSERT INTO teams (name) VALUES ('Team A'), ('Team B')
ON CONFLICT (name) DO NOTHING;

-- 20 curated URLs verbatim from all_role_instructions.md.
INSERT INTO curated_urls (sprint, category, label, url, default_batch_size, default_price, display_order) VALUES
  (1, 'dog',     'Puppy Sitting',         'https://www.online-coloring.com/coloring-page/cute-puppy-sitting-on-ground-1658.html', 4, 100, 1),
  (1, 'dog',     'Puppy Lying Down',      'https://www.online-coloring.com/coloring-page/cute-puppy-lying-on-the-floor-1657.html', 4, 100, 2),
  (1, 'dog',     'Pomeranian',            'https://www.online-coloring.com/coloring-page/cute-pomeranian-dog-1586.html',           4, 100, 3),
  (1, 'cat',     'Cute Kitten',           'https://www.online-coloring.com/coloring-page/lovely-cat-1673.html',                    3,  75, 1),
  (1, 'cat',     'Fuzzy Kitten',          'https://www.online-coloring.com/coloring-page/kitten-1053.html',                        3,  75, 2),
  (1, 'cat',     'Cartoon Kitten',        'https://www.online-coloring.com/coloring-page/cartoon-kitten-822.html',                 3,  75, 3),
  (1, 'bird',    'Owl',                   'https://www.online-coloring.com/coloring-page/halloween-owl-1425.html',                 2,  50, 1),
  (1, 'bird',    'Pigeon',                'https://www.online-coloring.com/coloring-page/cartoon-pigeon-989.html',                 2,  50, 2),
  (1, 'bird',    'Cartoon Bird',          'https://www.online-coloring.com/coloring-page/cartoon-bird-811.html',                   2,  50, 3),
  (2, 'car',     'Volkswagen Bus',        'https://www.online-coloring.com/coloring-page/cartoon-volkswagen-bus-1634.html',        4, 200, 1),
  (2, 'car',     'Two-Seat Convertible',  'https://www.online-coloring.com/coloring-page/two-seat-convertible-car-858.html',       4, 200, 2),
  (2, 'car',     'Land Rover',            'https://www.online-coloring.com/coloring-page/land-rover-4x4-1387.html',                4, 200, 3),
  (2, 'boat',    'Steamboat',             'https://www.online-coloring.com/coloring-page/little-steamboat-350.html',               3, 150, 1),
  (2, 'boat',    'Sailboat',              'https://www.online-coloring.com/coloring-page/sailing-boat-over-the-blue-waves-520.html', 3, 150, 2),
  (2, 'boat',    'Submarine',             'https://www.online-coloring.com/coloring-page/yellow-submarine-854.html',               3, 150, 3),
  (3, 'alien',   'Four Monsters',         'https://www.online-coloring.com/coloring-page/funny-monsters-1669.html',                1,  75, 1),
  (3, 'alien',   'Alien in UFO',          'https://www.online-coloring.com/coloring-page/funny-alien-1338.html',                   1,  75, 2),
  (3, 'unicorn', 'Unicorn Head',          'https://www.online-coloring.com/coloring-page/cute-unicorn-face-1114.html',             1,  50, 1),
  (3, 'unicorn', 'Unicorn',               'https://www.online-coloring.com/coloring-page/cartoon-unicorn-832.html',                1,  50, 2),
  (3, 'unicorn', 'Bunny riding Unicorn',  'https://www.online-coloring.com/coloring-page/bunny-riding-a-unicorn-1149.html',        1,  50, 3)
ON CONFLICT (url) DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY
-- Classroom exercise: trust-based, RLS disabled so the publishable
-- (or legacy anon) key can read and write all tables. For a hardened
-- deployment, enable RLS and write policies.
-- ============================================================
ALTER TABLE users        DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams        DISABLE ROW LEVEL SECURITY;
ALTER TABLE issues       DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks        DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_state   DISABLE ROW LEVEL SECURITY;
ALTER TABLE hacker_log   DISABLE ROW LEVEL SECURITY;
ALTER TABLE comments     DISABLE ROW LEVEL SECURITY;
ALTER TABLE curated_urls DISABLE ROW LEVEL SECURITY;
ALTER TABLE event_log    DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE PRIVILEGES (Postgres-level, distinct from RLS)
-- Disabling RLS makes Postgres fall back to standard table grants.
-- New Supabase projects (especially with sb_publishable_* keys)
-- no longer auto-grant CRUD on public.* to anon/authenticated.
-- We grant explicitly here so the SPA can read and write without
-- any Auth flow. For a hardened deployment, replace with RLS
-- policies and remove these blanket grants.
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Future tables created in public/ inherit the same privileges so
-- adding a table later does not require re-running this block.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- ============================================================
-- REALTIME publication
-- ============================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'users', 'teams', 'issues', 'tasks', 'game_state',
    'hacker_log', 'comments', 'curated_urls', 'event_log'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN
      -- already published, ignore
      NULL;
    END;
  END LOOP;
END$$;

-- ============================================================
-- AUTO-UPDATE updated_at ON ROW CHANGES
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS issues_touch ON issues;
CREATE TRIGGER issues_touch BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS tasks_touch ON tasks;
CREATE TRIGGER tasks_touch BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- STORAGE: task-images bucket
-- Holds participant uploads (their colored pages). Created public
-- so Testers and Business can view attachments without extra auth.
-- INSERT and DELETE are also allowed for the publishable/anon role
-- so the SPA can upload from completeTask() and the facilitator's
-- "Reset Everything" button can sweep the bucket clean.
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-images', 'task-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "task-images public read"   ON storage.objects;
DROP POLICY IF EXISTS "task-images public upload" ON storage.objects;
DROP POLICY IF EXISTS "task-images public delete" ON storage.objects;

CREATE POLICY "task-images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'task-images');

CREATE POLICY "task-images public upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'task-images');

CREATE POLICY "task-images public delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'task-images');

COMMIT;
