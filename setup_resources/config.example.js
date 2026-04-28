// Copy this file to public/config.js and fill in your Supabase credentials.
// Both values are visible in the Supabase dashboard under Project Settings > API Keys.
//
// PUBLISHABLE KEY (sb_publishable_...) is the current Supabase key for browser apps.
// It replaces the older "anon" key. It is safe to embed in a static site: it identifies
// the project to Supabase but grants only the limited Postgres `anon` role's permissions
// (which the schema.sql in this repo intentionally configures wide-open for the
// classroom exercise). Authentication in this app is by session token (the participant's
// 6-character code), not Supabase Auth.
//
// LEGACY ANON KEYS (eyJ... JWT) still work in projects created before late 2025, and
// the app accepts them as a fallback. New Supabase projects only get publishable keys.
//
// DO NOT paste an sb_secret_... or service_role key here. Those bypass all security
// and must never reach a browser. If you accidentally exposed one, rotate it immediately
// in the Supabase dashboard.
project_supabase_url = "https://YOUR-PROJECT-REF.supabase.co";
project_supabase_publishable_key = "sb_publishable_YOUR-KEY-HERE";

// Setting the config on window.
// SUPABASE_ANON_KEY is kept as an alias so any older code or third-party snippet
// that still references the old name continues to work during the migration.
window.CONFIG = {
  SUPABASE_URL: project_supabase_url,
  SUPABASE_PUBLISHABLE_KEY: project_supabase_publishable_key,
  SUPABASE_ANON_KEY: project_supabase_publishable_key,
};
