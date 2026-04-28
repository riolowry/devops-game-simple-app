// ============================================================
// app.core.js: build marker, config check, debug helpers,
// constants, Supabase client, curated URL seed defaults.
// No DOM, no Alpine. Loaded first; everything else reads from
// window.App.
// ============================================================
(function () {
  "use strict";

  // Build marker. If you suspect a stale browser cache, open the
  // DevTools console and look for this line.
  console.info("[devsec] app.js loaded (v2 modular build, complete)");

  // ============================================================
  // Config check
  // ============================================================
  if (!window.CONFIG || !window.CONFIG.SUPABASE_URL || window.CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.innerHTML = `
        <div style="font-family: system-ui; max-width: 600px; margin: 4rem auto; padding: 1rem;">
          <h1>Configuration required</h1>
          <p>Copy <code>setup_resources/config.example.js</code> to <code>public/config.js</code> and set your Supabase URL and publishable key. See <a href="https://github.com/riolowry/devops-game-simple-app/blob/main/setup_resources/SETUP_SUPABASE_DB.md" target="_blank" rel="noopener">setup_resources/SETUP_SUPABASE_DB.md</a> in the repository for more information.</p>
        </div>
      `;
    });
    return;
  }

  // Resolve the project key. Prefer the publishable key; fall back
  // to the legacy anon JWT so an in-flight migration cannot brick a
  // running session.
  const PROJECT_KEY = window.CONFIG.SUPABASE_PUBLISHABLE_KEY || window.CONFIG.SUPABASE_ANON_KEY;

  // ============================================================
  // Debug helpers
  // ============================================================
  const DEBUG = (function () {
    try {
      return localStorage.getItem("devsec_debug") === "1";
    } catch (e) {
      return false;
    }
  })();
  function dlog() {
    if (!DEBUG) return;
    console.log.apply(console, ["[devsec]"].concat(Array.from(arguments)));
  }

  // ============================================================
  // Column and role constants
  // ============================================================
  const COLUMN_ORDER = [
    "market",
    "clarifications",
    "in_progress",
    "testing",
    "security",
    "to_deploy",
    "in_production",
    "accepted",
  ];

  const COLUMN_LABELS = {
    market: "Market",
    clarifications: "Clarifications",
    in_progress: "In Progress",
    testing: "Testing",
    security: "Security",
    to_deploy: "To Deploy",
    in_production: "In Production",
    accepted: "Accepted",
  };

  const ROLE_LABELS = {
    business: "Business",
    developer: "Developer",
    tester: "Tester",
    security: "Security",
    sysadmin: "SysAdmin",
    observer: "Observer",
    hacker: "Developer", // Hacker sees themselves as Developer in the UI
    facilitator: "Facilitator",
  };

  // Must match the role CHECK in schema.sql.
  const VALID_ROLES = [
    "business",
    "developer",
    "tester",
    "security",
    "sysadmin",
    "observer",
    "hacker",
    "facilitator",
  ];

  // Roles eligible to be cross-trained (excludes hacker, facilitator).
  const CROSS_TRAINABLE_ROLES = ["business", "developer", "tester", "security", "sysadmin", "observer"];

  // Participant roles eligible to be secretly promoted to Hacker.
  const HACKER_CANDIDATE_ROLES = ["business", "developer", "tester", "security", "sysadmin", "observer"];

  // Statuses a Hacker may inject flaws into.
  const HACKER_INJECTABLE_STATUSES = ["in_progress", "testing", "security", "to_deploy"];

  // Sprint-to-category mapping for the Business dropdown.
  const SPRINT_CATEGORIES = {
    1: ["dog", "cat", "bird"],
    2: ["car", "boat"],
    3: ["alien", "unicorn"],
  };

  // Unambiguous alphabet for token generation (no 0 O I 1 l).
  const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const TOKEN_LENGTH = 6;

  function randomToken() {
    let t = "";
    const arr = new Uint32Array(TOKEN_LENGTH);
    crypto.getRandomValues(arr);
    for (let i = 0; i < TOKEN_LENGTH; i++) {
      t += TOKEN_ALPHABET[arr[i] % TOKEN_ALPHABET.length];
    }
    return t;
  }

  // Bucket name for participant image uploads. Created and policied
  // by schema.sql.
  const STORAGE_BUCKET = "task-images";

  // ============================================================
  // Curated URL defaults. Used by "Reset to defaults" in the
  // admin Curated URLs tab. Kept in sync with the seed list in
  // schema.sql.
  // ============================================================
  const CURATED_URL_DEFAULTS = [
    {sprint: 1, category: "dog", label: "Puppy Sitting", url: "https://www.online-coloring.com/coloring-page/cute-puppy-sitting-on-ground-1658.html", default_batch_size: 4, default_price: 100, display_order: 1},
    {sprint: 1, category: "dog", label: "Puppy Lying Down", url: "https://www.online-coloring.com/coloring-page/cute-puppy-lying-on-the-floor-1657.html", default_batch_size: 4, default_price: 100, display_order: 2},
    {sprint: 1, category: "dog", label: "Pomeranian", url: "https://www.online-coloring.com/coloring-page/cute-pomeranian-dog-1586.html", default_batch_size: 4, default_price: 100, display_order: 3},
    {sprint: 1, category: "cat", label: "Cute Kitten", url: "https://www.online-coloring.com/coloring-page/lovely-cat-1673.html", default_batch_size: 3, default_price: 75, display_order: 1},
    {sprint: 1, category: "cat", label: "Fuzzy Kitten", url: "https://www.online-coloring.com/coloring-page/kitten-1053.html", default_batch_size: 3, default_price: 75, display_order: 2},
    {sprint: 1, category: "cat", label: "Cartoon Kitten", url: "https://www.online-coloring.com/coloring-page/cartoon-kitten-822.html", default_batch_size: 3, default_price: 75, display_order: 3},
    {sprint: 1, category: "bird", label: "Owl", url: "https://www.online-coloring.com/coloring-page/halloween-owl-1425.html", default_batch_size: 2, default_price: 50, display_order: 1},
    {sprint: 1, category: "bird", label: "Pigeon", url: "https://www.online-coloring.com/coloring-page/cartoon-pigeon-989.html", default_batch_size: 2, default_price: 50, display_order: 2},
    {sprint: 1, category: "bird", label: "Cartoon Bird", url: "https://www.online-coloring.com/coloring-page/cartoon-bird-811.html", default_batch_size: 2, default_price: 50, display_order: 3},
    {sprint: 2, category: "car", label: "Volkswagen Bus", url: "https://www.online-coloring.com/coloring-page/cartoon-volkswagen-bus-1634.html", default_batch_size: 4, default_price: 200, display_order: 1},
    {sprint: 2, category: "car", label: "Two-Seat Convertible", url: "https://www.online-coloring.com/coloring-page/two-seat-convertible-car-858.html", default_batch_size: 4, default_price: 200, display_order: 2},
    {sprint: 2, category: "car", label: "Land Rover", url: "https://www.online-coloring.com/coloring-page/land-rover-4x4-1387.html", default_batch_size: 4, default_price: 200, display_order: 3},
    {sprint: 2, category: "boat", label: "Steamboat", url: "https://www.online-coloring.com/coloring-page/little-steamboat-350.html", default_batch_size: 3, default_price: 150, display_order: 1},
    {sprint: 2, category: "boat", label: "Sailboat", url: "https://www.online-coloring.com/coloring-page/sailing-boat-over-the-blue-waves-520.html", default_batch_size: 3, default_price: 150, display_order: 2},
    {sprint: 2, category: "boat", label: "Submarine", url: "https://www.online-coloring.com/coloring-page/yellow-submarine-854.html", default_batch_size: 3, default_price: 150, display_order: 3},
    {sprint: 3, category: "alien", label: "Four Monsters", url: "https://www.online-coloring.com/coloring-page/funny-monsters-1669.html", default_batch_size: 1, default_price: 75, display_order: 1},
    {sprint: 3, category: "alien", label: "Alien in UFO", url: "https://www.online-coloring.com/coloring-page/funny-alien-1338.html", default_batch_size: 1, default_price: 75, display_order: 2},
    {sprint: 3, category: "unicorn", label: "Unicorn Head", url: "https://www.online-coloring.com/coloring-page/cute-unicorn-face-1114.html", default_batch_size: 1, default_price: 50, display_order: 1},
    {sprint: 3, category: "unicorn", label: "Unicorn", url: "https://www.online-coloring.com/coloring-page/cartoon-unicorn-832.html", default_batch_size: 1, default_price: 50, display_order: 2},
    {sprint: 3, category: "unicorn", label: "Bunny riding Unicorn", url: "https://www.online-coloring.com/coloring-page/bunny-riding-a-unicorn-1149.html", default_batch_size: 1, default_price: 50, display_order: 3},
  ];

  // ============================================================
  // Supabase client
  // ============================================================
  const supabase = window.supabase.createClient(window.CONFIG.SUPABASE_URL, PROJECT_KEY, {
    realtime: {params: {eventsPerSecond: 10}},
  });

  // ============================================================
  // Time formatting (used in UI for "5 min ago" timestamps).
  // ============================================================
  function relativeTime(iso) {
    if (!iso) return "";
    const ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms)) return "";
    const sec = Math.floor(ms / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return sec + "s ago";
    const min = Math.floor(sec / 60);
    if (min < 60) return min + "m ago";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + "h ago";
    const days = Math.floor(hr / 24);
    return days + "d ago";
  }

  // ============================================================
  // Expose on window.App
  // ============================================================
  window.App = window.App || {};
  Object.assign(window.App, {
    supabase,
    debug: DEBUG,
    dlog,
    COLUMN_ORDER,
    COLUMN_LABELS,
    ROLE_LABELS,
    VALID_ROLES,
    CROSS_TRAINABLE_ROLES,
    HACKER_CANDIDATE_ROLES,
    HACKER_INJECTABLE_STATUSES,
    SPRINT_CATEGORIES,
    TOKEN_ALPHABET,
    TOKEN_LENGTH,
    STORAGE_BUCKET,
    CURATED_URL_DEFAULTS,
    randomToken,
    relativeTime,
    enableDebug() {
      try {
        localStorage.setItem("devsec_debug", "1");
      } catch (e) {}
      console.log("Debug enabled. Reload the page to take effect.");
    },
    disableDebug() {
      try {
        localStorage.removeItem("devsec_debug");
      } catch (e) {}
      console.log("Debug disabled. Reload the page to take effect.");
    },
    store() {
      return window.Alpine && Alpine.store ? Alpine.store("app") : null;
    },
    async healthCheck() {
      const tables = [
        "users",
        "teams",
        "issues",
        "tasks",
        "game_state",
        "hacker_log",
        "comments",
        "curated_urls",
        "event_log",
      ];
      const results = {};
      for (const t of tables) {
        try {
          const {error, count} = await supabase.from(t).select("*", {count: "exact", head: true});
          results[t] = error
            ? {status: "ERROR", code: error.code, message: error.message}
            : {status: "OK", row_count: count};
        } catch (e) {
          results[t] = {status: "EXCEPTION", message: e.message};
        }
      }
      console.table(results);
      return results;
    },
  });
})();
