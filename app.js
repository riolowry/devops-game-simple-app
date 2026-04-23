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
  if (
    !window.CONFIG ||
    !window.CONFIG.SUPABASE_URL ||
    window.CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF")
  ) {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.innerHTML = `
        <div style="font-family: system-ui; max-width: 600px; margin: 4rem auto; padding: 1rem;">
          <h1>Configuration required</h1>
          <p>Copy <code>config.example.js</code> to <code>config.js</code> and set your
          Supabase URL and anon key. See <a href="SUPABASE_SETUP.md">SUPABASE_SETUP.md</a>.</p>
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
  const COLUMN_ORDER = [
    "market",
    "in_progress",
    "testing",
    "security",
    "to_deploy",
    "in_production",
    "feedback",
  ];

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
    admin: "Admin",
    hacker: "Developer", // Hacker sees themselves as Developer in the UI
    facilitator: "Facilitator",
  };

  // Must match the CHECK constraint in schema.sql exactly.
  const VALID_ROLES = [
    "business",
    "developer",
    "tester",
    "security",
    "release",
    "admin",
    "hacker",
    "facilitator",
  ];

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
  // Supabase client
  // ============================================================
  const supabase = window.supabase.createClient(
    window.CONFIG.SUPABASE_URL,
    window.CONFIG.SUPABASE_ANON_KEY,
    { realtime: { params: { eventsPerSecond: 10 } } },
  );

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
        const { data, error } = await supabase
          .from("game_state")
          .select("*")
          .eq("id", 1)
          .maybeSingle();
        if (error) {
          console.error("gameState load:", error);
          return;
        }
        if (data) this.gameState = data;
        this.gameStateLoaded = true;
      },

      async loadIssues() {
        const { data, error } = await supabase
          .from("issues")
          .select("*")
          .order("id", { ascending: true });
        if (error) {
          console.error("issues load:", error);
          return;
        }
        this.issues = data || [];
      },

      async loadTasks() {
        const { data, error } = await supabase
          .from("tasks")
          .select("*")
          .order("id", { ascending: true });
        if (error) {
          console.error("tasks load:", error);
          return;
        }
        this.tasks = data || [];
      },

      async loadUsers() {
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .order("created_at", { ascending: true });
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
            console.warn(
              "Logged-in token no longer in users table; logging out.",
            );
            this.logout();
          }
        }
      },

      async loadHackerLog() {
        const { data, error } = await supabase
          .from("hacker_log")
          .select("*")
          .order("created_at", { ascending: false });
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
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: table },
              () => {
                dlog("realtime change:", table);
                this.handleRealtimeChange(table);
              },
            )
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
            console.warn(
              "Realtime not connected after 3s; starting polling fallback",
            );
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
          this.loginError =
            "Token not recognized. Check with your facilitator.";
          return false;
        }
        this.user = match;
        try {
          localStorage.setItem(
            "devsec_user",
            JSON.stringify({ token: match.token }),
          );
        } catch (e) {
          /* private browsing may block */
        }
        return true;
      },

      logout() {
        this.user = null;
        try {
          localStorage.removeItem("devsec_user");
        } catch (e) {
          /* ignore */
        }
      },

      // -------- derived state / helpers --------
      issuesInColumn(status) {
        return this.issues.filter((i) => i.status === status);
      },
      tasksForIssue(issueId) {
        return this.tasks.filter((t) => t.parent_issue_id === issueId);
      },
      progressFor(issue) {
        const ts = this.tasksForIssue(issue.id);
        const done = ts.filter((t) => t.status === "complete").length;
        return { done, total: issue.batch_size, all: ts.length };
      },
      batchGateOpen(issue) {
        const p = this.progressFor(issue);
        return p.done >= issue.batch_size;
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
        for (let i = 0; i < team.length; i++)
          h = (h * 31 + team.charCodeAt(i)) >>> 0;
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

      effectiveRole() {
        if (!this.user) return null;
        return this.user.role === "hacker" ? "developer" : this.user.role;
      },
      isHacker() {
        return !!(this.user && this.user.role === "hacker");
      },
      isFacilitator() {
        return !!(this.user && this.user.role === "facilitator");
      },

      // Permission matrix. FIX: claim is now on 'market' status (was
      // incorrectly 'in_progress', which meant nobody could ever move
      // a new issue off the Market column).
      canAct(issue, action) {
        if (!this.user || !issue) return false;
        const role = this.effectiveRole();
        const s = issue.status;
        switch (action) {
          case "claim":
            return role === "developer" && s === "market" && !issue.team;
          case "add_task":
            return (
              role === "developer" &&
              s === "in_progress" &&
              !!issue.team &&
              issue.team === this.user.team
            );
          case "send_to_testing":
            return (
              role === "developer" &&
              s === "in_progress" &&
              issue.team === this.user.team &&
              this.batchGateOpen(issue)
            );
          case "pass_testing":
          case "fail_testing":
            return role === "tester" && s === "testing";
          case "run_security":
            return role === "security" && s === "security";
          case "pass_security":
          case "reject_security":
            return (
              role === "security" &&
              s === "security" &&
              !!this.securityCheckResult &&
              this.securityCheckResult.issue_id === issue.id
            );
          case "deploy":
            return role === "release" && s === "to_deploy";
          case "accept_production":
          case "reject_production":
            return role === "business" && s === "in_production";
          case "pickup_feedback":
            return role === "developer" && s === "feedback";
          case "inject_flaw":
            return (
              this.isHacker() &&
              this.gameState.current_sprint >= 2 &&
              (s === "in_progress" || s === "testing") &&
              !issue.hacked_flag &&
              !issue.containerized
            );
          default:
            return false;
        }
      },

      // -------- issue actions --------
      async createIssue({ title, description_url, price, batch_size }) {
        if (!this.user || this.user.role !== "business") {
          this.toast("Only Business can create Product Requests.");
          return;
        }
        const { error } = await supabase.from("issues").insert({
          title: (title || "").trim(),
          description_url: (description_url || "").trim() || null,
          status: "market", // explicit (matches schema default)
          price: parseInt(price) || 100,
          batch_size: Math.max(1, parseInt(batch_size) || 1),
          sprint_created: this.gameState.current_sprint,
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
        if (!this.user || !this.user.team) {
          this.toast("You are not on a team. Ask your facilitator.");
          return;
        }
        const { error } = await supabase
          .from("issues")
          .update({ team: this.user.team, status: "in_progress" })
          .eq("id", issue.id);
        if (error) {
          console.error("claimIssue:", error);
          this.toast("Claim failed: " + error.message);
          return;
        }
        this.toast("Claimed for " + this.user.team + ".");
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
        const modulus = this.gameState.security_modulus || 7;
        const deterministic = Number(issue.id) % modulus === 0;
        const injected = issue.hacked_flag === true;
        const hasFlaw = deterministic || injected;
        this.securityCheckResult = {
          issue_id: issue.id,
          has_flaw: hasFlaw,
          source: injected
            ? "injected"
            : deterministic
              ? "deterministic"
              : "none",
        };
      },

      async passSecurity(issue) {
        if (issue.hacked_flag) {
          const { error } = await supabase
            .from("hacker_log")
            .update({ caught_by_security: false })
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
            .update({ caught_by_security: true })
            .eq("target_issue_id", issue.id)
            .is("caught_by_security", null);
          // Clear the flag since the flaw is being sent back for rework
          await supabase
            .from("issues")
            .update({
              hacked_flag: false,
              feedback_reason: reason || "Security issue detected",
            })
            .eq("id", issue.id);
        } else {
          await supabase
            .from("issues")
            .update({
              feedback_reason: reason || "Security issue detected",
            })
            .eq("id", issue.id);
        }
        await this.setStatus(issue.id, "in_progress");
        this.securityCheckResult = null;
      },

      async deploy(issue) {
        await this.setStatus(issue.id, "in_production");
      },

      async acceptProduction(issue) {
        const { error } = await supabase
          .from("issues")
          .delete()
          .eq("id", issue.id);
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
            .update({ caught_by_security: false })
            .eq("target_issue_id", issue.id)
            .is("caught_by_security", null);
        }
        await supabase
          .from("issues")
          .update({
            feedback_reason: reason || "Rejected by Business",
          })
          .eq("id", issue.id);
        await this.setStatus(issue.id, "feedback");
      },

      async pickupFeedback(issue) {
        // Clear stale rejection reason on pickup so the developer has a
        // clean slate. If the issue gets rejected again, a fresh reason
        // is written at that point.
        await supabase
          .from("issues")
          .update({ feedback_reason: null })
          .eq("id", issue.id);
        await this.setStatus(issue.id, "in_progress");
      },

      async setStatus(id, status) {
        const { error } = await supabase
          .from("issues")
          .update({ status })
          .eq("id", id);
        if (error) {
          console.error("setStatus:", error);
          this.toast("Update failed: " + error.message);
        }
      },

      // -------- task actions --------
      async createTask(issue, { containerized }) {
        if (!this.user) return;
        const isContainer =
          !!containerized && this.gameState.current_sprint >= 3;
        const { error } = await supabase.from("tasks").insert({
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
          const r = await supabase
            .from("issues")
            .update({ containerized: true })
            .eq("id", issue.id);
          if (r.error) console.error("mark issue containerized:", r.error);
        }
      },

      async completeTask(task, attachmentUrl) {
        if (!attachmentUrl || !attachmentUrl.trim()) {
          this.toast("Paste an image URL to complete the task.");
          return;
        }
        const { error } = await supabase
          .from("tasks")
          .update({ attachment_url: attachmentUrl.trim(), status: "complete" })
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
        const r1 = await supabase
          .from("issues")
          .update({ hacked_flag: true })
          .eq("id", issue.id);
        if (r1.error) {
          console.error("injectFlaw issue update:", r1.error);
          this.toast("Injection failed.");
          return;
        }
        const r2 = await supabase.from("hacker_log").insert({
          hacker_token: this.user.token,
          target_issue_id: issue.id,
          sprint: this.gameState.current_sprint,
        });
        if (r2.error) console.error("injectFlaw log insert:", r2.error);
        this.toast("Injection recorded.");
      },

      // -------- admin: user management --------
      // FIX: Validate + normalise role client-side so we can show a useful
      // error message instead of an opaque 400 from the DB CHECK constraint.
      async createUser({ display_name, role, team }) {
        const normalizedRole = (role || "").toString().toLowerCase().trim();
        if (!VALID_ROLES.includes(normalizedRole)) {
          this.toast(
            'Invalid role "' +
              role +
              '". Must be one of: ' +
              VALID_ROLES.join(", "),
          );
          return null;
        }
        const token = randomToken();
        const { error } = await supabase.from("users").insert({
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
          this.toast(
            "Invalid role(s): " +
              badRoles.join(", ") +
              ". Valid: " +
              VALID_ROLES.join(", "),
          );
          return [];
        }
        const payload = normalized.map((r) => ({ token: randomToken(), ...r }));
        const { data, error } = await supabase
          .from("users")
          .insert(payload)
          .select();
        if (error) {
          console.error("createUsersBulk:", error, "payload:", payload);
          this.toast("Bulk create failed: " + error.message);
          return [];
        }
        this.toast("Created " + (data || []).length + " user(s).");
        return data || [];
      },

      async deleteUser(token) {
        const { error } = await supabase
          .from("users")
          .delete()
          .eq("token", token);
        if (error) {
          console.error("deleteUser:", error);
          this.toast("Delete failed: " + error.message);
        }
      },

      async updateGameState(patch) {
        const { error } = await supabase
          .from("game_state")
          .update(patch)
          .eq("id", 1);
        if (error) {
          console.error("updateGameState:", error);
          this.toast("Config update failed: " + error.message);
          return;
        }
        this.toast("Configuration saved.");
      },

      async advanceSprint() {
        const next = Math.min(3, this.gameState.current_sprint + 1);
        await this.updateGameState({ current_sprint: next });
      },

      async resetSprint() {
        await this.updateGameState({ current_sprint: 1 });
      },

      async promoteToHacker(token) {
        const { error } = await supabase
          .from("users")
          .update({ role: "hacker" })
          .eq("token", token);
        if (error) {
          console.error(error);
          this.toast("Promote failed: " + error.message);
          return;
        }
        this.toast("Promoted to hacker.");
      },

      async demoteHacker(token) {
        const { error } = await supabase
          .from("users")
          .update({ role: "developer" })
          .eq("token", token);
        if (error) {
          console.error(error);
          this.toast("Demote failed: " + error.message);
          return;
        }
        this.toast("Demoted to developer.");
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
        await this.updateGameState({
          current_sprint: 1,
          hacker_count: 0,
          sprint3_auto_advance_seconds: 0,
        });
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
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        });
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
        const caught = this.hackerLog.filter(
          (l) => l.caught_by_security === true,
        ).length;
        const leaked = this.hackerLog.filter(
          (l) => l.caught_by_security === false,
        ).length;
        const pending = this.hackerLog.filter(
          (l) => l.caught_by_security === null,
        ).length;
        return { total, caught, leaked, pending };
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
    TOKEN_ALPHABET,
    randomToken,
    supabase,
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
          const { error, count } = await supabase
            .from(t)
            .select("*", { count: "exact", head: true });
          results[t] = error
            ? { status: "ERROR", code: error.code, message: error.message }
            : { status: "OK", row_count: count };
        } catch (e) {
          results[t] = { status: "EXCEPTION", message: e.message };
        }
      }
      console.table(results);
      return results;
    },
  };
})();
