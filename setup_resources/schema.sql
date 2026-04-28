-- ITS DevSecOps Adventure: Supabase schema
-- Run this in the Supabase SQL Editor after creating a new project.
-- Safe to run multiple times: it drops and recreates everything.

-- ============================================================
-- DROP (for re-runs)
-- ============================================================
DROP TABLE IF EXISTS hacker_log CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS issues CASCADE;
DROP TABLE IF EXISTS game_state CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- USERS
-- Each participant has a token row. Tokens are opaque so the
-- Hacker role cannot be identified from the token alone.
-- ============================================================
CREATE TABLE users (
  token TEXT PRIMARY KEY,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN (
    'business', 'developer', 'tester', 'security',
    'release', 'observer', 'hacker', 'facilitator'
  )),
  team TEXT,
  -- When a participant is promoted to 'hacker', their prior role is
  -- stashed here so demote can restore it. Without this column, demote
  -- would have to guess (and historically, incorrectly always returned
  -- to 'developer').
  previous_role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ISSUES (parent cards on the Kanban board)
-- Issue IDs are used directly by the deterministic security
-- flaw rule: id % security_modulus == 0 means "has flaw".
-- ============================================================
CREATE TABLE issues (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description_url TEXT,
  status TEXT NOT NULL DEFAULT 'market' CHECK (status IN (
    'market', 'in_progress', 'testing', 'security',
    'to_deploy', 'in_production', 'feedback'
  )),
  team TEXT,
  price INTEGER DEFAULT 100,
  batch_size INTEGER DEFAULT 1 CHECK (batch_size >= 1),
  sprint_created INTEGER DEFAULT 1 CHECK (sprint_created BETWEEN 1 AND 3),
  hacked_flag BOOLEAN DEFAULT FALSE,
  containerized BOOLEAN DEFAULT FALSE,
  feedback_reason TEXT,
  created_by TEXT REFERENCES users(token) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TASKS (child items under an Issue; one per colored page)
-- attachment_url holds either an external URL (legacy / test data)
-- or a Supabase Storage public URL written by the in-app uploader.
-- ============================================================
CREATE TABLE tasks (
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
-- GAME_STATE (single row)
-- The CHECK constraint enforces exactly one row.
-- ============================================================
CREATE TABLE game_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_sprint INTEGER DEFAULT 1 CHECK (current_sprint BETWEEN 1 AND 3),
  security_modulus INTEGER DEFAULT 7 CHECK (security_modulus >= 2),
  hacker_count INTEGER DEFAULT 0 CHECK (hacker_count BETWEEN 0 AND 5),
  sprint3_auto_advance_seconds INTEGER DEFAULT 0 CHECK (sprint3_auto_advance_seconds >= 0),
  session_label TEXT DEFAULT 'DevSecOps Adventure'
);

INSERT INTO game_state (id) VALUES (1);

-- ============================================================
-- HACKER_LOG (audit trail for post-session retrospective)
-- ============================================================
CREATE TABLE hacker_log (
  id BIGSERIAL PRIMARY KEY,
  hacker_token TEXT REFERENCES users(token) ON DELETE SET NULL,
  target_issue_id BIGINT REFERENCES issues(id) ON DELETE CASCADE,
  sprint INTEGER NOT NULL,
  caught_by_security BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEED A DEFAULT FACILITATOR TOKEN
-- Change this immediately via the admin panel.
-- ============================================================
INSERT INTO users (token, display_name, role) VALUES
  ('FACIL1', 'Facilitator', 'facilitator');

-- ============================================================
-- ROW LEVEL SECURITY
-- For a classroom exercise we disable RLS so the publishable key
-- (or legacy anon key) can read and write all tables. This is
-- intentionally trust-based. For a hardened deployment, enable RLS
-- and write policies.
-- ============================================================
ALTER TABLE users        DISABLE ROW LEVEL SECURITY;
ALTER TABLE issues       DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks        DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_state   DISABLE ROW LEVEL SECURITY;
ALTER TABLE hacker_log   DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- REALTIME
-- Add tables to the supabase_realtime publication so the
-- browser receives Postgres change events over WebSocket.
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE issues;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE hacker_log;

-- ============================================================
-- AUTO-UPDATE updated_at ON ROW CHANGES
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER issues_touch BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER tasks_touch BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- STORAGE: task-images bucket
-- Holds participant uploads (their colored pages). Created public
-- so Testers and Business can view attachments without extra auth.
-- INSERT and DELETE are also allowed for the publishable/anon role
-- so the SPA can upload from completeTask() and the facilitator's
-- "Reset Everything" button can sweep the bucket clean. This is
-- consistent with the trust-based posture above; tighten with
-- proper policies if you ever ship a hardened version.
--
-- Idempotent: re-running this whole file or just this section is
-- safe. Storage policies live on storage.objects (a project-wide
-- table), so the policy names are namespaced to the bucket.
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
