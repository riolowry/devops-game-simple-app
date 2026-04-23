// ITS DevSecOps Adventure: shared application logic
// Uses Alpine.js store pattern. Loaded by both index.html and admin.html.
//
// Debugging helpers (run these in the browser console):
//   App.enableDebug()    // verbose logging (reload to take effect)
//   App.disableDebug()
//   App.healthCheck()    // probe each table, show row counts or errors
//   App.store()          // returns the live Alpine store (inspect state)
//   App.supabase         // the raw Supabase client (run ad-hoc queries)

(function () {
  "use strict";

  // ============================================================
  // Config check
  // ============================================================
  if (!window.CONFIG || !window.CONFIG.SUPABASE_URL || window.CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.innerHTML = `
        <div style="font-family: system-ui; max-width: 600px; margin: 4rem auto; padding: 1rem;">
          <h1>Configuration required</h1>
          <p>Copy <code>config.example.js</code> to <code>config.js</code> and set your
          Supabase URL and anon key. See <a href="SETUP_SUPABASE_DB.md">SETUP_SUPABASE_DB.md</a>.</p>
        </div>
      `;
    });
    return;
  }

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
  // Constants
  // ============================================================
  const COLUMN_ORDER = ["market", "in_progress", "testing", "security", "to_deploy", "in_production", "feedback"];

  const COLUMN_LABELS = {
    market: "Market",
    in_progress: "In Progress",
    testing: "Testing",
    security: "Security",
    to_deploy: "To Deploy",
    in_production: "In Production",
    feedback: "Feedback",
  };

  const ROLE_LABELS = {
    business: "Business",
    developer: "Developer",
    tester: "Tester",
    security: "Security",
    release: "Release",
    observer: "Observer",
    hacker: "Developer", // Hacker sees themselves as Developer in the UI
    facilitator: "Facilitator",
  };

  // Must match the CHECK constraint in schema.sql exactly.
  const VALID_ROLES = ["business", "developer", "tester", "security", "release", "observer", "hacker", "facilitator"];

  // Participant roles eligible to be secretly promoted to Hacker.
  // Excludes 'facilitator' (conflict of interest with the audit log)
  // and 'hacker' itself (already promoted).
  const HACKER_CANDIDATE_ROLES = ["business", "developer", "tester", "security", "release", "observer"];

  // Statuses a Hacker may inject flaws into. Excludes:
  //   'market'        nothing to hack yet (no team, no work)
  //   'in_production' already deployed; defeats "catch before ship"
  //   'feedback'      rejected, waiting for rework pickup
  const HACKER_INJECTABLE_STATUSES = ["in_progress", "testing", "security", "to_deploy"];

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

  // ============================================================
  // Pure logic (testable without Supabase, Alpine, or DOM)
  // These functions take everything they need as arguments. They
  // are exposed on window.App.logic at the bottom of this file so
  // tests-frontend.js can exercise them directly.
  //
  // The Alpine store below also delegates to these to avoid
  // duplicating the rules (single source of truth for permissions
  // and flaw detection).
  // ============================================================
  function logic_rawEffectiveRole(user, impersonation) {
    if (!user) return null;
    if (user.role === "facilitator" && impersonation && impersonation.role) {
      return impersonation.role;
    }
    return user.role;
  }

  function logic_effectiveRole(user, impersonation) {
    const raw = logic_rawEffectiveRole(user, impersonation);
    return raw === "hacker" ? "developer" : raw;
  }

  function logic_effectiveTeam(user, impersonation) {
    if (!user) return null;
    if (user.role === "facilitator" && impersonation && impersonation.team) {
      return impersonation.team;
    }
    return user.team;
  }

  function logic_isHacker(user, impersonation) {
    return logic_rawEffectiveRole(user, impersonation) === "hacker";
  }

  function logic_progressFor(issue, tasks) {
    if (!issue) return {done: 0, total: 0, all: 0};
    const ts = (tasks || []).filter((t) => t.parent_issue_id === issue.id);
    const done = ts.filter((t) => t.status === "complete").length;
    return {done, total: issue.batch_size, all: ts.length};
  }

  function logic_batchGateOpen(issue, tasks) {
    if (!issue) return false;
    return logic_progressFor(issue, tasks).done >= issue.batch_size;
  }

  // Deterministic + injected flaw detection. Same rule Security uses.
  function logic_detectFlaw(issue, securityModulus) {
    if (!issue) return {has_flaw: false, source: "none"};
    const modulus = Math.max(2, securityModulus || 7);
    const deterministic = Number(issue.id) % modulus === 0;
    const injected = issue.hacked_flag === true;
    if (injected) return {has_flaw: true, source: "injected"};
    if (deterministic) return {has_flaw: true, source: "deterministic"};
    return {has_flaw: false, source: "none"};
  }

  // canAct: pure permission check. ctx is { gameState, tasks, securityCheckResult }.
  // Kept deliberately dumb: no side effects, no store reads.
  // For actions that operate on an issue, pass the issue. For actions
  // that do not (create_issue), issue may be null.
  function logic_canAct(user, impersonation, issue, action, ctx) {
    if (!user) return false;
    const role = logic_effectiveRole(user, impersonation);
    const team = logic_effectiveTeam(user, impersonation);
    const gs = (ctx && ctx.gameState) || {};
    const tasks = (ctx && ctx.tasks) || [];
    const scr = ctx && ctx.securityCheckResult;

    // Actions that do not require an issue.
    if (action === "create_issue") {
      return role === "business";
    }

    if (!issue) return false;
    const s = issue.status;

    switch (action) {
      case "claim":
        return role === "developer" && s === "market" && !issue.team;
      case "add_task":
        return role === "developer" && s === "in_progress" && !!issue.team && issue.team === team;
      case "send_to_testing":
        return role === "developer" && s === "in_progress" && issue.team === team && logic_batchGateOpen(issue, tasks);
      case "pass_testing":
      case "fail_testing":
        return role === "tester" && s === "testing";
      case "run_security":
        return role === "security" && s === "security";
      case "pass_security":
      case "reject_security":
        return role === "security" && s === "security" && !!scr && scr.issue_id === issue.id;
      case "deploy":
        return role === "release" && s === "to_deploy";
      case "accept_production":
      case "reject_production":
        return role === "business" && s === "in_production";
      case "pickup_feedback":
        return role === "developer" && s === "feedback";
      case "inject_flaw":
        // Hacker may inject on any team's item (no team restriction),
        // in any active pipeline status (in_progress through to_deploy),
        // as long as the item has not already been hacked and is not
        // containerized. Market/in_production/feedback are excluded
        // by HACKER_INJECTABLE_STATUSES.
        return (
          logic_isHacker(user, impersonation) &&
          (gs.current_sprint || 1) >= 2 &&
          HACKER_INJECTABLE_STATUSES.indexOf(s) !== -1 &&
          !issue.hacked_flag &&
          !issue.containerized
        );
      default:
        return false;
    }
  }

  // ============================================================
  // Supabase client
  // ============================================================
  const supabase = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY, {
    realtime: {params: {eventsPerSecond: 10}},
  });

  // ============================================================
  // Alpine store definition
  // ============================================================
  document.addEventListener("alpine:init", () => {
    Alpine.store("app", {
      // -------- state --------
      user: null,
      issues: [],
      tasks: [],
      users: [],
      hackerLog: [],
      gameState: {
        id: 1,
        current_sprint: 1,
        security_modulus: 7,
        hacker_count: 0,
        sprint3_auto_advance_seconds: 0,
        session_label: "DevSecOps Adventure",
      },
      gameStateLoaded: false,
      connectionMode: "connecting", // 'realtime' | 'polling' | 'disconnected' | 'connecting'
      toastMsg: "",
      toastTimer: null,
      pollingTimer: null,
      realtimeChannels: [],
      securityCheckResult: null,
      loginError: "",
      // Facilitator-only: lets the facilitator act as another role/team
      // without logging out. Ignored for non-facilitators. Both fields
      // empty-string means "observe only" (no action buttons shown).
      impersonation: {role: "", team: ""},
      _initialized: false, // FIX: idempotency guard for init()

      // -------- initialization --------
      async init() {
        // FIX: Guard against double-init. Without this, a second call
        // to supabase.channel('pub:issues') returns the already-subscribed
        // channel and .on() throws "cannot add postgres_changes after subscribe()".
        if (this._initialized) {
          dlog("init() called again; skipping");
          return;
        }
        this._initialized = true;
        dlog("init() starting");
        try {
          await this.loadAll();
        } catch (e) {
          console.error("Initial load failed:", e);
        }
        this.loadFromLocalStorage();
        this.setupSync();
        dlog("init() done");
      },

      loadFromLocalStorage() {
        try {
          const stored = localStorage.getItem("devsec_user");
          if (stored) {
            const u = JSON.parse(stored);
            const match = this.users.find((x) => x.token === u.token);
            if (match) {
              this.user = match;
              dlog("restored session for", match.token);
            } else {
              localStorage.removeItem("devsec_user");
              dlog("stored token no longer valid; cleared");
            }
          }
        } catch (e) {
          console.warn("localStorage parse failed", e);
        }
        // Restore facilitator impersonation (safe no-op for non-facilitators
        // since effectiveRole/effectiveTeam gate on isFacilitator()).
        try {
          const imp = localStorage.getItem("devsec_impersonation");
          if (imp) this.impersonation = JSON.parse(imp);
        } catch (e) {
          /* ignore */
        }
      },

      // -------- data loading --------
      async loadAll() {
        await Promise.all([
          this.loadGameState(),
          this.loadIssues(),
          this.loadTasks(),
          this.loadUsers(),
          this.loadHackerLog(),
        ]);
      },

      async loadGameState() {
        const {data, error} = await supabase.from("game_state").select("*").eq("id", 1).maybeSingle();
        if (error) {
          console.error("gameState load:", error);
          return;
        }
        if (data) this.gameState = data;
        this.gameStateLoaded = true;
      },

      async loadIssues() {
        const {data, error} = await supabase.from("issues").select("*").order("id", {ascending: true});
        if (error) {
          console.error("issues load:", error);
          return;
        }
        this.issues = data || [];
      },

      async loadTasks() {
        const {data, error} = await supabase.from("tasks").select("*").order("id", {ascending: true});
        if (error) {
          console.error("tasks load:", error);
          return;
        }
        this.tasks = data || [];
      },

      async loadUsers() {
        const {data, error} = await supabase.from("users").select("*").order("created_at", {ascending: true});
        if (error) {
          console.error("users load:", error);
          return;
        }
        this.users = data || [];
        // FIX: Refresh the logged-in user's record too. Without this, the
        // Hacker promotion (admin changes user's role in DB) never reaches
        // the user's in-memory session, so their UI stays as Developer.
        if (this.user) {
          const fresh = this.users.find((u) => u.token === this.user.token);
          if (fresh) {
            this.user = fresh;
          } else {
            console.warn("Logged-in token no longer in users table; logging out.");
            this.logout();
          }
        }
      },

      async loadHackerLog() {
        const {data, error} = await supabase.from("hacker_log").select("*").order("created_at", {ascending: false});
        if (error) {
          console.error("hacker_log load:", error);
          return;
        }
        this.hackerLog = data || [];
      },

      // -------- sync: realtime with polling fallback --------
      setupSync() {
        // Defensive: remove any previously registered channels before
        // creating new ones. Combined with the _initialized guard in init(),
        // this ensures we never call .on() on a subscribed channel.
        this.realtimeChannels.forEach((ch) => {
          try {
            supabase.removeChannel(ch);
          } catch (e) {
            /* ignore */
          }
        });
        this.realtimeChannels = [];

        let connected = false;
        const tables = ["issues", "tasks", "game_state", "users", "hacker_log"];

        tables.forEach((table) => {
          const ch = supabase
            .channel("pub:" + table)
            .on("postgres_changes", {event: "*", schema: "public", table: table}, () => {
              dlog("realtime change:", table);
              this.handleRealtimeChange(table);
            })
            .subscribe((status) => {
              dlog("subscribe status", table, status);
              if (status === "SUBSCRIBED") {
                connected = true;
                this.connectionMode = "realtime";
                if (this.pollingTimer) {
                  clearInterval(this.pollingTimer);
                  this.pollingTimer = null;
                }
              } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                console.warn("Realtime channel issue on", table, status);
              }
            });
          this.realtimeChannels.push(ch);
        });

        // Polling fallback if realtime does not establish within 3s
        setTimeout(() => {
          if (!connected) {
            console.warn("Realtime not connected after 3s; starting polling fallback");
            this.connectionMode = "polling";
            this.startPolling();
          }
        }, 3000);

        window.addEventListener("offline", () => {
          this.connectionMode = "disconnected";
        });
        window.addEventListener("online", () => {
          this.connectionMode = "connecting";
          this.loadAll();
        });
      },

      handleRealtimeChange(table) {
        switch (table) {
          case "issues":
            this.loadIssues();
            break;
          case "tasks":
            this.loadTasks();
            break;
          case "game_state":
            this.loadGameState();
            break;
          case "users":
            this.loadUsers();
            break;
          case "hacker_log":
            this.loadHackerLog();
            break;
        }
      },

      startPolling() {
        if (this.pollingTimer) clearInterval(this.pollingTimer);
        this.pollingTimer = setInterval(() => {
          if (navigator.onLine) this.loadAll();
        }, 3000);
      },

      // -------- auth --------
      async login(rawToken) {
        this.loginError = "";
        const token = (rawToken || "").trim().toUpperCase();
        if (!token) {
          this.loginError = "Please enter a token.";
          return false;
        }
        await this.loadUsers();
        const match = this.users.find((u) => u.token === token);
        if (!match) {
          this.loginError = "Token not recognized. Check with your facilitator.";
          return false;
        }
        this.user = match;
        try {
          localStorage.setItem("devsec_user", JSON.stringify({token: match.token}));
        } catch (e) {
          /* private browsing may block */
        }
        return true;
      },

      logout() {
        this.user = null;
        this.impersonation = {role: "", team: ""};
        try {
          localStorage.removeItem("devsec_user");
          localStorage.removeItem("devsec_impersonation");
        } catch (e) {
          /* ignore */
        }
      },

      // -------- derived state / helpers --------
      // All game-rule functions delegate to the pure `logic_*` helpers
      // above so the rules are defined exactly once and the tests can
      // exercise them without Alpine or Supabase.
      issuesInColumn(status) {
        return this.issues.filter((i) => i.status === status);
      },
      tasksForIssue(issueId) {
        return this.tasks.filter((t) => t.parent_issue_id === issueId);
      },
      progressFor(issue) {
        return logic_progressFor(issue, this.tasks);
      },
      batchGateOpen(issue) {
        return logic_batchGateOpen(issue, this.tasks);
      },
      userByToken(token) {
        return this.users.find((u) => u.token === token);
      },
      teamColor(team) {
        if (!team) return "bg-slate-200 text-slate-800";
        const palette = [
          "bg-rose-100 text-rose-900",
          "bg-amber-100 text-amber-900",
          "bg-emerald-100 text-emerald-900",
          "bg-sky-100 text-sky-900",
          "bg-violet-100 text-violet-900",
          "bg-pink-100 text-pink-900",
          "bg-lime-100 text-lime-900",
          "bg-cyan-100 text-cyan-900",
        ];
        let h = 0;
        for (let i = 0; i < team.length; i++) h = (h * 31 + team.charCodeAt(i)) >>> 0;
        return palette[h % palette.length];
      },
      columnOrder() {
        return COLUMN_ORDER;
      },
      columnLabel(s) {
        return COLUMN_LABELS[s] || s;
      },
      roleLabel(r) {
        return ROLE_LABELS[r] || r;
      },

      // Raw role after applying facilitator impersonation (if active).
      // Hackers get "developer" as their visible role (plus their secret
      // inject button, gated separately). All methods below are thin
      // wrappers around the pure logic_* helpers defined at the top of
      // this file (single source of truth for rules).
      _rawEffectiveRole() {
        return logic_rawEffectiveRole(this.user, this.impersonation);
      },
      effectiveRole() {
        return logic_effectiveRole(this.user, this.impersonation);
      },
      effectiveTeam() {
        return logic_effectiveTeam(this.user, this.impersonation);
      },
      isHacker() {
        return logic_isHacker(this.user, this.impersonation);
      },
      isFacilitator() {
        return !!(this.user && this.user.role === "facilitator");
      },

      // All team names in current use (derived from users). Used by the
      // facilitator's impersonation team picker.
      allTeams() {
        const teams = new Set();
        this.users.forEach((u) => {
          if (u.team) teams.add(u.team);
        });
        return Array.from(teams).sort();
      },

      // Update impersonation, persist to localStorage, clear any stale
      // per-card state (e.g. an in-progress security check that referenced
      // the previous role's view).
      setImpersonation(partial) {
        this.impersonation = {...this.impersonation, ...(partial || {})};
        this.securityCheckResult = null;
        try {
          localStorage.setItem("devsec_impersonation", JSON.stringify(this.impersonation));
        } catch (e) {
          /* ignore */
        }
      },

      // Permission matrix. Delegates to logic_canAct so the rules are
      // defined once. The store just supplies the live context
      // (gameState, tasks, securityCheckResult).
      canAct(issue, action) {
        return logic_canAct(this.user, this.impersonation, issue, action, {
          gameState: this.gameState,
          tasks: this.tasks,
          securityCheckResult: this.securityCheckResult,
        });
      },

      // -------- issue actions --------
      async createIssue({title, description_url, price, batch_size}) {
        // Delegate to canAct so the single source of truth (logic_canAct)
        // decides. This fixes the bug where a facilitator simulating as
        // Business was rejected because the old check read this.user.role
        // directly, ignoring impersonation.
        if (!this.canAct(null, "create_issue")) {
          this.toast("Only Business can create Product Requests.");
          return;
        }
        const {error} = await supabase.from("issues").insert({
          title: (title || "").trim(),
          description_url: (description_url || "").trim() || null,
          status: "market", // explicit (matches schema default)
          price: parseInt(price) || 100,
          batch_size: Math.max(1, parseInt(batch_size) || 1),
          sprint_created: this.gameState.current_sprint,
          // created_by is intentionally the real token, not the
          // impersonated one: the audit trail must show who actually
          // performed the action.
          created_by: this.user.token,
        });
        if (error) {
          console.error("createIssue:", error);
          this.toast("Create failed: " + error.message);
          return;
        }
        this.toast("Issue created.");
      },

      // FIX: claim now transitions market -> in_progress in addition to
      // assigning the team. Previously only team was set, so the issue
      // stayed in the Market column forever.
      async claimIssue(issue) {
        const team = this.effectiveTeam();
        if (!this.user || !team) {
          this.toast("You are not on a team. Ask your facilitator.");
          return;
        }
        const {error} = await supabase.from("issues").update({team, status: "in_progress"}).eq("id", issue.id);
        if (error) {
          console.error("claimIssue:", error);
          this.toast("Claim failed: " + error.message);
          return;
        }
        this.toast("Claimed for " + team + ".");
      },

      async sendToTesting(issue) {
        if (!this.batchGateOpen(issue)) {
          this.toast("Need " + issue.batch_size + " completed tasks first.");
          return;
        }
        await this.setStatus(issue.id, "testing");
      },

      async passTesting(issue) {
        await this.setStatus(issue.id, "security");
      },
      async failTesting(issue) {
        await this.setStatus(issue.id, "in_progress");
      },

      runSecurityCheck(issue) {
        const res = logic_detectFlaw(issue, this.gameState.security_modulus);
        this.securityCheckResult = {issue_id: issue.id, has_flaw: res.has_flaw, source: res.source};
      },

      async passSecurity(issue) {
        if (issue.hacked_flag) {
          const {error} = await supabase
            .from("hacker_log")
            .update({caught_by_security: false})
            .eq("target_issue_id", issue.id)
            .is("caught_by_security", null);
          if (error) console.error("hacker_log update (passSecurity):", error);
        }
        await this.setStatus(issue.id, "to_deploy");
        this.securityCheckResult = null;
      },

      async rejectSecurity(issue, reason) {
        if (issue.hacked_flag) {
          await supabase
            .from("hacker_log")
            .update({caught_by_security: true})
            .eq("target_issue_id", issue.id)
            .is("caught_by_security", null);
          // Clear the flag since the flaw is being sent back for rework
          await supabase
            .from("issues")
            .update({hacked_flag: false, feedback_reason: reason || "Security issue detected"})
            .eq("id", issue.id);
        } else {
          await supabase
            .from("issues")
            .update({feedback_reason: reason || "Security issue detected"})
            .eq("id", issue.id);
        }
        await this.setStatus(issue.id, "in_progress");
        this.securityCheckResult = null;
      },

      async deploy(issue) {
        await this.setStatus(issue.id, "in_production");
      },

      async acceptProduction(issue) {
        // Preserve the retrospective audit trail. hacker_log has
        // ON DELETE CASCADE on target_issue_id, so without this step the
        // caught/leaked counts lose every flaw that reached production and
        // was accepted (i.e. the ones we most want to discuss in the retro).
        // Null the FK first so the log rows persist after issue deletion.
        await supabase.from("hacker_log").update({target_issue_id: null}).eq("target_issue_id", issue.id);

        const {error} = await supabase.from("issues").delete().eq("id", issue.id);
        if (error) {
          console.error("acceptProduction:", error);
          this.toast("Accept failed: " + error.message);
          return;
        }
        this.toast("Accepted. Issue archived.");
      },

      async rejectProduction(issue, reason) {
        if (issue.hacked_flag) {
          await supabase
            .from("hacker_log")
            .update({caught_by_security: false})
            .eq("target_issue_id", issue.id)
            .is("caught_by_security", null);
        }
        await supabase
          .from("issues")
          .update({feedback_reason: reason || "Rejected by Business"})
          .eq("id", issue.id);
        await this.setStatus(issue.id, "feedback");
      },

      async pickupFeedback(issue) {
        // Clear stale rejection reason on pickup so the developer has a
        // clean slate. If the issue gets rejected again, a fresh reason
        // is written at that point.
        await supabase.from("issues").update({feedback_reason: null}).eq("id", issue.id);
        await this.setStatus(issue.id, "in_progress");
      },

      async setStatus(id, status) {
        const {error} = await supabase.from("issues").update({status}).eq("id", id);
        if (error) {
          console.error("setStatus:", error);
          this.toast("Update failed: " + error.message);
        }
      },

      // -------- task actions --------
      async createTask(issue, {containerized}) {
        if (!this.user) return;
        const isContainer = !!containerized && this.gameState.current_sprint >= 3;
        const {error} = await supabase
          .from("tasks")
          .insert({
            parent_issue_id: issue.id,
            assignee_token: this.user.token,
            status: "claimed",
            containerized: isContainer,
          });
        if (error) {
          console.error("createTask:", error);
          this.toast("Task create failed: " + error.message);
          return;
        }
        if (isContainer) {
          const r = await supabase.from("issues").update({containerized: true}).eq("id", issue.id);
          if (r.error) console.error("mark issue containerized:", r.error);
        }
      },

      async completeTask(task, attachmentUrl) {
        if (!attachmentUrl || !attachmentUrl.trim()) {
          this.toast("Paste an image URL to complete the task.");
          return;
        }
        const {error} = await supabase
          .from("tasks")
          .update({attachment_url: attachmentUrl.trim(), status: "complete"})
          .eq("id", task.id);
        if (error) {
          console.error("completeTask:", error);
          this.toast("Update failed: " + error.message);
          return;
        }
        this.toast("Task complete.");
      },

      // -------- hacker action --------
      async injectFlaw(issue) {
        if (!this.canAct(issue, "inject_flaw")) return;
        const r1 = await supabase.from("issues").update({hacked_flag: true}).eq("id", issue.id);
        if (r1.error) {
          console.error("injectFlaw issue update:", r1.error);
          this.toast("Injection failed.");
          return;
        }
        const r2 = await supabase
          .from("hacker_log")
          .insert({hacker_token: this.user.token, target_issue_id: issue.id, sprint: this.gameState.current_sprint});
        if (r2.error) console.error("injectFlaw log insert:", r2.error);
        this.toast("Injection recorded.");
      },

      // -------- admin: user management --------
      // FIX: Validate + normalise role client-side so we can show a useful
      // error message instead of an opaque 400 from the DB CHECK constraint.
      async createUser({display_name, role, team}) {
        const normalizedRole = (role || "").toString().toLowerCase().trim();
        if (!VALID_ROLES.includes(normalizedRole)) {
          this.toast('Invalid role "' + role + '". Must be one of: ' + VALID_ROLES.join(", "));
          return null;
        }
        const token = randomToken();
        const {error} = await supabase
          .from("users")
          .insert({
            token,
            display_name: (display_name || "").toString().trim() || null,
            role: normalizedRole,
            team: (team || "").toString().trim() || null,
          });
        if (error) {
          console.error("createUser:", error);
          this.toast("Create user failed: " + error.message);
          return null;
        }
        return token;
      },

      async createUsersBulk(rows) {
        // Normalize (lowercase role, trim strings, convert '' to null)
        const normalized = rows.map((r) => ({
          display_name: (r.display_name || "").toString().trim() || null,
          role: (r.role || "developer").toString().toLowerCase().trim(),
          team: (r.team || "").toString().trim() || null,
        }));
        // Validate roles BEFORE hitting the DB so we give a readable error
        const invalid = normalized.filter((r) => !VALID_ROLES.includes(r.role));
        if (invalid.length > 0) {
          const badRoles = Array.from(new Set(invalid.map((r) => r.role)));
          this.toast("Invalid role(s): " + badRoles.join(", ") + ". Valid: " + VALID_ROLES.join(", "));
          return [];
        }
        const payload = normalized.map((r) => ({token: randomToken(), ...r}));
        const {data, error} = await supabase.from("users").insert(payload).select();
        if (error) {
          console.error("createUsersBulk:", error, "payload:", payload);
          this.toast("Bulk create failed: " + error.message);
          return [];
        }
        this.toast("Created " + (data || []).length + " user(s).");
        return data || [];
      },

      async deleteUser(token) {
        const {error} = await supabase.from("users").delete().eq("token", token);
        if (error) {
          console.error("deleteUser:", error);
          this.toast("Delete failed: " + error.message);
        }
      },

      async updateGameState(patch) {
        const {error} = await supabase.from("game_state").update(patch).eq("id", 1);
        if (error) {
          console.error("updateGameState:", error);
          this.toast("Config update failed: " + error.message);
          return;
        }
        this.toast("Configuration saved.");
      },

      async advanceSprint() {
        const next = Math.min(3, this.gameState.current_sprint + 1);
        await this.updateGameState({current_sprint: next});
      },

      async resetSprint() {
        await this.updateGameState({current_sprint: 1});
      },

      // Promote a participant to Hacker. Any role except facilitator
      // and current hacker is eligible. We stash the prior role in
      // `previous_role` so demote can restore it; without this, a
      // tester-turned-hacker would silently become a developer on demote.
      async promoteToHacker(token) {
        const target = this.users.find((u) => u.token === token);
        if (!target) {
          this.toast("User not found.");
          return;
        }
        if (target.role === "hacker") {
          this.toast("Already a hacker.");
          return;
        }
        if (target.role === "facilitator") {
          this.toast("Facilitators cannot be hackers (audit-log integrity).");
          return;
        }
        const {error} = await supabase
          .from("users")
          .update({role: "hacker", previous_role: target.role})
          .eq("token", token);
        if (error) {
          console.error(error);
          this.toast("Promote failed: " + error.message);
          return;
        }
        this.toast("Promoted to hacker (was " + target.role + ").");
      },

      // Demote back to whatever role they had before promotion.
      // Falls back to 'developer' for legacy rows created before the
      // previous_role column existed.
      async demoteHacker(token) {
        const target = this.users.find((u) => u.token === token);
        const restoreRole = (target && target.previous_role) || "developer";
        const {error} = await supabase
          .from("users")
          .update({role: restoreRole, previous_role: null})
          .eq("token", token);
        if (error) {
          console.error(error);
          this.toast("Demote failed: " + error.message);
          return;
        }
        this.toast("Demoted to " + restoreRole + ".");
      },

      async resetIssuesAndTasks() {
        const r1 = await supabase.from("hacker_log").delete().neq("id", 0);
        const r2 = await supabase.from("tasks").delete().neq("id", 0);
        const r3 = await supabase.from("issues").delete().neq("id", 0);
        if (r1.error || r2.error || r3.error) {
          console.error("reset errors:", r1.error, r2.error, r3.error);
          this.toast("Reset partially failed. See console.");
          return;
        }
        this.toast("Issues and tasks cleared.");
      },

      async resetEverything() {
        await supabase.from("hacker_log").delete().neq("id", 0);
        await supabase.from("tasks").delete().neq("id", 0);
        await supabase.from("issues").delete().neq("id", 0);
        await supabase.from("users").delete().neq("role", "facilitator");
        await this.updateGameState({current_sprint: 1, hacker_count: 0, sprint3_auto_advance_seconds: 0});
        this.toast("Full reset complete.");
      },

      exportStateJSON() {
        const payload = {
          exported_at: new Date().toISOString(),
          session_label: this.gameState.session_label,
          game_state: this.gameState,
          users: this.users,
          issues: this.issues,
          tasks: this.tasks,
          hacker_log: this.hackerLog,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "devsecops-export-" + Date.now() + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },

      // -------- hacker stats --------
      hackerStats() {
        const total = this.hackerLog.length;
        const caught = this.hackerLog.filter((l) => l.caught_by_security === true).length;
        const leaked = this.hackerLog.filter((l) => l.caught_by_security === false).length;
        const pending = this.hackerLog.filter((l) => l.caught_by_security === null).length;
        return {total, caught, leaked, pending};
      },

      // -------- toast --------
      toast(msg) {
        this.toastMsg = msg;
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
          this.toastMsg = "";
        }, 3000);
      },
    });
  });

  // ============================================================
  // Debug helpers on window.App
  // In the browser console:
  //   App.healthCheck()     probe each table, show status
  //   App.store()           get the Alpine store
  //   App.enableDebug()     turn on verbose logging (reload to take effect)
  //   App.supabase          the raw Supabase client
  // ============================================================
  window.App = {
    COLUMN_ORDER,
    COLUMN_LABELS,
    ROLE_LABELS,
    VALID_ROLES,
    HACKER_CANDIDATE_ROLES,
    HACKER_INJECTABLE_STATUSES,
    TOKEN_ALPHABET,
    randomToken,
    supabase,
    // Pure logic (no Alpine, no Supabase, no DOM). Used by the store
    // above and by tests-frontend.js to exercise the rules directly.
    logic: {
      rawEffectiveRole: logic_rawEffectiveRole,
      effectiveRole: logic_effectiveRole,
      effectiveTeam: logic_effectiveTeam,
      isHacker: logic_isHacker,
      progressFor: logic_progressFor,
      batchGateOpen: logic_batchGateOpen,
      detectFlaw: logic_detectFlaw,
      canAct: logic_canAct,
    },
    store: function () {
      return window.Alpine && Alpine.store ? Alpine.store("app") : null;
    },
    enableDebug: function () {
      try {
        localStorage.setItem("devsec_debug", "1");
      } catch (e) {}
      console.log("Debug enabled. Reload the page to take effect.");
    },
    disableDebug: function () {
      try {
        localStorage.removeItem("devsec_debug");
      } catch (e) {}
      console.log("Debug disabled. Reload the page to take effect.");
    },
    async healthCheck() {
      const tables = ["users", "issues", "tasks", "game_state", "hacker_log"];
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
  };
})();
