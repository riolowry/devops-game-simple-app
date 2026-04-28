// ============================================================
// app.store.js: Alpine store skeleton. State shape, loadX
// functions, realtime subscription setup, polling fallback,
// toast helpers, time formatting, login/logout, derived helpers.
// No action handlers (those live in app.actions.js).
// ============================================================
(function () {
  "use strict";
  window.App = window.App || {};
  const supabase = window.App.supabase;
  const dlog = window.App.dlog;

  if (!supabase) {
    // app.core.js bailed out because of missing config; nothing to do.
    return;
  }

  const COLUMN_ORDER = window.App.COLUMN_ORDER;
  const COLUMN_LABELS = window.App.COLUMN_LABELS;
  const ROLE_LABELS = window.App.ROLE_LABELS;
  const logic = window.App.logic;

  window.App.storeShape = {
    // -------- state --------
    user: null,
    issues: [],
    tasks: [],
    users: [],
    teams: [],
    comments: [],
    curatedUrls: [],
    hackerLog: [],
    eventLog: [],
    gameState: {
      id: 1,
      current_sprint: 1,
      hacker_count: 0,
      sprint3_auto_advance_seconds: 0,
      session_label: "DevSecOps Adventure",
      flaw_rate_percent: 25,
      sprint3_cicd_bypass: true,
      sprint3_role_swap: true,
      code_freeze_auto_clear: true,
      cross_training_enabled: true,
    },
    gameStateLoaded: false,
    connectionMode: "connecting",
    toastMsg: "",
    toastTimer: null,
    pollingTimer: null,
    realtimeChannels: [],
    securityCheckResult: null,
    shiftLeftResult: null,
    loginError: "",
    impersonation: {role: "", team: ""},
    commentSortDesc: true,
    _initialized: false,

    // -------- initialization --------
    async init() {
      if (this._initialized) {
        dlog("init() called again; skipping");
        return;
      }
      this._initialized = true;
      dlog("init() starting");
      // Restore comment sort preference.
      try {
        const v = localStorage.getItem("devsec_comment_order");
        if (v === "asc") this.commentSortDesc = false;
      } catch (e) {
        /* ignore */
      }
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
            // Validate role against the current enum. If it's been
            // removed (e.g. legacy 'release'), reset the session.
            if (window.App.VALID_ROLES.indexOf(match.role) === -1) {
              localStorage.removeItem("devsec_user");
              this.toast("Your session was reset due to a version upgrade. Please log in again.");
            } else {
              this.user = match;
              dlog("restored session for", match.token);
            }
          } else {
            localStorage.removeItem("devsec_user");
            dlog("stored token no longer valid; cleared");
          }
        }
      } catch (e) {
        console.warn("localStorage parse failed", e);
      }
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
        this.loadTeams(),
        this.loadComments(),
        this.loadCuratedUrls(),
        this.loadHackerLog(),
        this.loadEventLog(),
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
      // Refresh the logged-in user's record too.
      if (this.user) {
        const fresh = this.users.find((u) => u.token === this.user.token);
        if (fresh) {
          if (window.App.VALID_ROLES.indexOf(fresh.role) === -1) {
            console.warn("Logged-in token has invalid role; logging out.");
            this.logout();
            return;
          }
          this.user = fresh;
        } else {
          console.warn("Logged-in token no longer in users table; logging out.");
          this.logout();
        }
      }
    },

    async loadTeams() {
      const {data, error} = await supabase.from("teams").select("*").order("name", {ascending: true});
      if (error) {
        console.error("teams load:", error);
        return;
      }
      this.teams = data || [];
    },

    async loadComments() {
      const {data, error} = await supabase
        .from("comments")
        .select("*")
        .order("created_at", {ascending: true});
      if (error) {
        console.error("comments load:", error);
        return;
      }
      this.comments = data || [];
    },

    async loadCuratedUrls() {
      const {data, error} = await supabase
        .from("curated_urls")
        .select("*")
        .order("sprint", {ascending: true})
        .order("category", {ascending: true})
        .order("display_order", {ascending: true});
      if (error) {
        console.error("curated_urls load:", error);
        return;
      }
      this.curatedUrls = data || [];
    },

    async loadHackerLog() {
      const {data, error} = await supabase
        .from("hacker_log")
        .select("*")
        .order("created_at", {ascending: false});
      if (error) {
        console.error("hacker_log load:", error);
        return;
      }
      this.hackerLog = data || [];
    },

    async loadEventLog() {
      const {data, error} = await supabase
        .from("event_log")
        .select("*")
        .order("created_at", {ascending: false})
        .limit(2000);
      if (error) {
        console.error("event_log load:", error);
        return;
      }
      this.eventLog = data || [];
    },

    // -------- sync: realtime with polling fallback --------
    setupSync() {
      // Defensive: remove any previously registered channels first.
      this.realtimeChannels.forEach((ch) => {
        try {
          supabase.removeChannel(ch);
        } catch (e) {
          /* ignore */
        }
      });
      this.realtimeChannels = [];

      let connected = false;
      const tables = [
        "issues",
        "tasks",
        "game_state",
        "users",
        "teams",
        "hacker_log",
        "comments",
        "curated_urls",
        "event_log",
      ];

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

      // Polling fallback if realtime does not establish within 3s.
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
        case "teams":
          this.loadTeams();
          break;
        case "hacker_log":
          this.loadHackerLog();
          break;
        case "comments":
          this.loadComments();
          break;
        case "curated_urls":
          this.loadCuratedUrls();
          break;
        case "event_log":
          this.loadEventLog();
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
      if (window.App.VALID_ROLES.indexOf(match.role) === -1) {
        this.loginError = "Your account has an invalid role. Contact your facilitator.";
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
    issuesInColumn(status) {
      return this.issues.filter((i) => i.status === status);
    },
    tasksForIssue(issueId) {
      return this.tasks.filter((t) => t.parent_issue_id === issueId);
    },
    commentsForIssue(issueId) {
      const list = this.comments.filter((c) => c.issue_id === issueId);
      // Hide soft-deleted from non-facilitators.
      const visible = this.isFacilitator() ? list : list.filter((c) => !c.hidden_at);
      const sorted = visible.slice().sort((a, b) => {
        const ca = a.created_at || "";
        const cb = b.created_at || "";
        if (this.commentSortDesc) return cb.localeCompare(ca);
        return ca.localeCompare(cb);
      });
      return sorted;
    },
    commentCountForIssue(issueId) {
      return this.comments.filter((c) => c.issue_id === issueId && !c.hidden_at).length;
    },
    progressFor(issue) {
      return logic.progressFor(issue, this.tasks);
    },
    batchGateOpen(issue) {
      return logic.batchGateOpen(issue, this.tasks);
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
    relativeTime(iso) {
      return window.App.relativeTime(iso);
    },

    _rawEffectiveRole() {
      return logic.rawEffectiveRole(this.user, this.impersonation);
    },
    effectiveRole() {
      return logic.effectiveRole(this.user, this.impersonation);
    },
    effectiveTeam() {
      return logic.effectiveTeam(this.user, this.impersonation);
    },
    isHacker() {
      return logic.isHacker(this.user, this.impersonation);
    },
    isFacilitator() {
      return !!(this.user && this.user.role === "facilitator");
    },
    // True only when the user is a real facilitator AND is not
    // currently simulating a participant. UI uses this to gate
    // facilitator-only chrome (hacked/flawed badges, comment
    // moderation, universal-delete shortcuts) so that simulating as
    // a participant produces a visually identical view to what that
    // participant would see.
    isFacilitatorView() {
      return this.isFacilitator() && !(this.impersonation && this.impersonation.role);
    },
    crossTrainedRole() {
      return this.user && this.user.cross_trained_role ? this.user.cross_trained_role : null;
    },

    // All known team names (from the teams table, with users.team
    // values folded in for legacy or in-flight teams).
    allTeams() {
      const set = new Set();
      (this.teams || []).forEach((t) => {
        if (t.name) set.add(t.name);
      });
      (this.users || []).forEach((u) => {
        if (u.team) set.add(u.team);
      });
      return Array.from(set).sort();
    },

    setImpersonation(partial) {
      this.impersonation = {...this.impersonation, ...(partial || {})};
      this.securityCheckResult = null;
      this.shiftLeftResult = null;
      try {
        localStorage.setItem("devsec_impersonation", JSON.stringify(this.impersonation));
      } catch (e) {
        /* ignore */
      }
    },

    canAct(issue, action) {
      return logic.canAct(this.user, this.impersonation, issue, action, {
        gameState: this.gameState,
        tasks: this.tasks,
        securityCheckResult: this.securityCheckResult,
      });
    },

    // For the Business create-issue category dropdown.
    categoriesForCurrentSprint() {
      return window.App.SPRINT_CATEGORIES[this.gameState.current_sprint] || [];
    },

    curatedUrlsFor(sprint, category) {
      return (this.curatedUrls || []).filter(
        (u) => u.sprint === sprint && u.category === category && u.active !== false,
      );
    },

    // Comment sort toggle.
    setCommentOrder(desc) {
      this.commentSortDesc = !!desc;
      try {
        localStorage.setItem("devsec_comment_order", desc ? "desc" : "asc");
      } catch (e) {
        /* ignore */
      }
    },

    // Latest rejection comment for an issue (for the red panel at top
    // of the card detail modal).
    latestRejectionComment(issue) {
      return logic.latestRejectionComment(issue, this.comments);
    },

    // What kind of clarification is this card in? Returns 'rejection',
    // 'question', or null. Cards in Clarifications without a kind set
    // (legacy data) fall back to 'rejection' for safe behavior.
    clarificationKind(issue) {
      if (!issue || issue.status !== "clarifications") return null;
      return issue.clarification_kind || "rejection";
    },

    // Compact label rendered on the card itself in the Clarifications
    // column AND inside the modal. The Clarifications column is the
    // pedagogical signal that something needs attention; this label
    // tells participants AT A GLANCE what kind of clarification and
    // who needs to act. Examples:
    //   "REJECTION → Developer / Team A"
    //   "QUESTION → Business"
    //   "QUESTION → Tester / Team A"
    clarificationLabel(issue) {
      const kind = this.clarificationKind(issue);
      if (!kind) return "";
      const target = issue.clarification_target_role;
      const team = issue.clarification_target_team;
      const targetLabel = target ? this.roleLabel(target) : "anyone";
      const teamLabel = team ? " / " + team : "";
      return (kind === "rejection" ? "REJECTION" : "QUESTION") + " → " + targetLabel + teamLabel;
    },

    // The most recent comment that triggered the current clarification.
    // For rejections this is the latest is_rejection comment. For
    // questions this is the latest non-info comment (the question body).
    // Used in the modal panel at top to show "what we're waiting on".
    latestClarificationPrompt(issue) {
      if (!issue || issue.status !== "clarifications") return null;
      const kind = this.clarificationKind(issue);
      if (kind === "rejection") {
        return logic.latestRejectionComment(issue, this.comments);
      }
      // Question: most recent non-rejection, non-info comment whose
      // author is NOT the current target (i.e., the asker's question).
      const sorted = (this.comments || [])
        .filter((c) => c.issue_id === issue.id && !c.hidden_at && !c.is_rejection)
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      // Skip "Picked up for rework." auto comments.
      return sorted.find((c) => c.body && c.body !== "Picked up for rework.") || null;
    },

    helpForCard(issue) {
      const flags = {
        canPickup: issue ? this.canAct(issue, "pickup_clarification") : false,
        canAnswer: issue ? this.canAct(issue, "answer_question") : false,
        clarificationKind: this.clarificationKind(issue),
        codeFreeze: !!(issue && issue.code_freeze),
        containerized: !!(issue && issue.containerized),
        stopped: !!(issue && issue.stopped),
      };
      return logic.helpForCard(
        this.effectiveRole(),
        this.crossTrainedRole(),
        this.gameState.current_sprint,
        issue ? issue.status : null,
        flags,
      );
    },

    // Hacker log summary.
    hackerStats() {
      const total = this.hackerLog.filter((l) => l.action_type !== "stop_container").length;
      const caught = this.hackerLog.filter((l) => l.caught_by_security === true && l.action_type !== "stop_container").length;
      const leaked = this.hackerLog.filter((l) => l.caught_by_security === false && l.action_type !== "stop_container").length;
      const pending = this.hackerLog.filter((l) => l.caught_by_security === null && l.action_type !== "stop_container").length;
      const stops = this.hackerLog.filter((l) => l.action_type === "stop_container").length;
      return {total, caught, leaked, pending, stops};
    },

    // -------- toast --------
    toast(msg) {
      this.toastMsg = msg;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        this.toastMsg = "";
      }, 3000);
    },
  };
})();
