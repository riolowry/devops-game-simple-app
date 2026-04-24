// Copy this file to config.js and fill in your Supabase credentials.
// Both values are visible in Supabase: Project Settings > API.
//
// The anon key is safe to embed in a static site. It is the
// public API key used by the browser. Authentication in this
// app is by session token (not Supabase Auth).
//
// DO NOT paste the service_role key here. That key bypasses
// all security and is server-only.
project_supabase_url = "https://YOUR-PROJECT-REF.supabase.co";
project_supabase_anon_key = "YOUR-ANON-PUBLIC-KEY-HERE";

// setting the config on window
window.CONFIG = {SUPABASE_URL: project_supabase_url, SUPABASE_ANON_KEY: project_supabase_anon_key};
