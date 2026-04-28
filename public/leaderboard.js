// ============================================================
// leaderboard.js: standalone leaderboard page. Reads team and
// individual stats from Supabase, computes client-side, and
// re-renders on realtime changes.
// ============================================================
(function () {
  "use strict";

  if (!window.CONFIG || !window.CONFIG.SUPABASE_URL || window.CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    document.addEventListener("DOMContentLoaded", () => {
      const el = document.getElementById("leaderboard-content");
      if (el) el.textContent = "Configuration required. See setup_resources/SETUP_SUPABASE_DB.md.";
    });
    return;
  }

  const PROJECT_KEY = window.CONFIG.SUPABASE_PUBLISHABLE_KEY || window.CONFIG.SUPABASE_ANON_KEY;
  const supabase = window.supabase.createClient(window.CONFIG.SUPABASE_URL, PROJECT_KEY, {
    realtime: {params: {eventsPerSecond: 10}},
  });

  const state = {
    issues: [],
    users: [],
    tasks: [],
    eventLog: [],
    gameState: {session_label: "DevSecOps Adventure", current_sprint: 1},
  };

  async function loadAll() {
    const [iRes, uRes, tRes, eRes, gRes] = await Promise.all([
      supabase.from("issues").select("*"),
      supabase.from("users").select("*"),
      supabase.from("tasks").select("*"),
      supabase.from("event_log").select("*").order("created_at", {ascending: false}).limit(2000),
      supabase.from("game_state").select("*").eq("id", 1).maybeSingle(),
    ]);
    state.issues = iRes.data || [];
    state.users = uRes.data || [];
    state.tasks = tRes.data || [];
    state.eventLog = eRes.data || [];
    if (gRes.data) state.gameState = gRes.data;
    render();
  }

  function teamStats() {
    const groups = {};
    state.issues.forEach((i) => {
      const team = i.team || "(no team)";
      if (!groups[team]) groups[team] = {team, accepted: 0, in_pipeline: 0, total: 0, earned: 0};
      groups[team].total++;
      if (i.status === "accepted") {
        groups[team].accepted++;
        groups[team].earned += i.price || 0;
      } else if (i.status !== "market") {
        groups[team].in_pipeline++;
      }
    });
    return Object.values(groups).sort((a, b) => b.earned - a.earned);
  }

  function individualStats() {
    const rows = state.users
      .filter((u) => u.role !== "facilitator")
      .map((u) => {
        const tasksDone = state.tasks.filter(
          (t) => t.assignee_token === u.token && t.status === "complete",
        ).length;
        const cardsTouched = new Set(
          state.eventLog.filter((e) => e.actor_token === u.token && e.issue_id != null).map((e) => e.issue_id),
        ).size;
        return {
          token: u.token,
          name: u.display_name || "(no name)",
          role: u.role,
          team: u.team || "",
          tasks_done: tasksDone,
          cards_touched: cardsTouched,
        };
      });
    return rows.sort((a, b) => b.cards_touched - a.cards_touched || b.tasks_done - a.tasks_done);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function render() {
    const sessionEl = document.getElementById("session-label");
    if (sessionEl) sessionEl.textContent = state.gameState.session_label || "DevSecOps Adventure";
    const sprintEl = document.getElementById("current-sprint");
    if (sprintEl) sprintEl.textContent = "Sprint " + state.gameState.current_sprint;

    const teams = teamStats();
    const teamBody = document.getElementById("team-body");
    if (teamBody) {
      teamBody.innerHTML = teams
        .map(
          (t, idx) =>
            "<tr class=\"border-b border-slate-200\">" +
            "<td class=\"py-2 px-3 text-slate-500\">" +
            (idx + 1) +
            "</td>" +
            "<td class=\"py-2 px-3 font-medium\">" +
            escapeHtml(t.team) +
            "</td>" +
            "<td class=\"py-2 px-3 text-right tabular-nums\">" +
            t.accepted +
            "</td>" +
            "<td class=\"py-2 px-3 text-right tabular-nums\">" +
            t.in_pipeline +
            "</td>" +
            "<td class=\"py-2 px-3 text-right tabular-nums font-semibold\">" +
            t.earned +
            "</td>" +
            "</tr>",
        )
        .join("");
    }

    const indv = individualStats();
    const indvBody = document.getElementById("individual-body");
    if (indvBody) {
      indvBody.innerHTML = indv
        .map(
          (r, idx) =>
            "<tr class=\"border-b border-slate-200\">" +
            "<td class=\"py-2 px-3 text-slate-500\">" +
            (idx + 1) +
            "</td>" +
            "<td class=\"py-2 px-3 font-mono text-xs\">" +
            escapeHtml(r.token) +
            "</td>" +
            "<td class=\"py-2 px-3 font-medium\">" +
            escapeHtml(r.name) +
            "</td>" +
            "<td class=\"py-2 px-3\">" +
            escapeHtml(r.role) +
            "</td>" +
            "<td class=\"py-2 px-3\">" +
            escapeHtml(r.team) +
            "</td>" +
            "<td class=\"py-2 px-3 text-right tabular-nums\">" +
            r.tasks_done +
            "</td>" +
            "<td class=\"py-2 px-3 text-right tabular-nums\">" +
            r.cards_touched +
            "</td>" +
            "</tr>",
        )
        .join("");
    }
  }

  function setupRealtime() {
    const tables = ["issues", "users", "tasks", "event_log", "game_state"];
    tables.forEach((table) => {
      supabase
        .channel("lb:" + table)
        .on("postgres_changes", {event: "*", schema: "public", table: table}, () => {
          loadAll();
        })
        .subscribe();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadAll();
    setupRealtime();
  });
})();
