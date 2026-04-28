// ITS DevSecOps Adventure: test harness (v2 schema)
// ----------------------------------------------------------------------
// In-browser test runner. Hits the same Supabase backend as the real app
// so changes are visible live on index.html / admin.html.
//
// Public interface (consumed by tests.html):
//   window.TEST_HARNESS.tests                            array of specs
//   window.TEST_HARNESS.runTest(testId, logFn, delayMs)  run one test
//   window.TEST_HARNESS.TestContext                      class
//   window.TEST_HARNESS.constants                        prefixes, defaults
//
// Test rows are namespaced. Cleanup matches by these prefixes only:
//   - users.display_name starts with "TEST-"
//   - users.token         starts with "TEST"          (we generate these)
//   - issues.title        starts with "TEST:"
//   - teams.name          starts with "TEST-"
// ----------------------------------------------------------------------

(function () {
  "use strict";

  // ==========================================================
  // Config guard
  // ==========================================================
  if (!window.CONFIG || !window.CONFIG.SUPABASE_URL || window.CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.innerHTML =
        '<div style="font-family:system-ui;max-width:600px;margin:4rem auto;padding:1rem;">' +
        "<h1>Configuration required</h1>" +
        "<p>Copy <code>setup_resources/config.example.js</code> to <code>public/config.js</code>. " +
        'See <a href="https://github.com/riolowry/devops-game-simple-app/blob/main/setup_resources/SETUP_SUPABASE_DB.md" target="_blank" rel="noopener">SETUP_SUPABASE_DB.md</a>.</p></div>';
    });
    return;
  }

  // ==========================================================
  // Constants
  // ==========================================================
  const TEST_USER_PREFIX = "TEST-";
  const TEST_ISSUE_PREFIX = "TEST:";
  const TEST_TEAM_PREFIX = "TEST-";
  const TEST_TOKEN_PREFIX = "TEST"; // 4 chars + 6 random = 10-char tokens
  const DEFAULT_DELAY_MS = 1500;
  const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  // ==========================================================
  // Supabase client
  // Reuse the app's client if app.core.js already created one. Otherwise
  // create our own (tests.html loads core directly so this is the path
  // when app.core.js was loaded but the IIFE hadn't yet run).
  // ==========================================================
  const PROJECT_KEY = window.CONFIG.SUPABASE_PUBLISHABLE_KEY || window.CONFIG.SUPABASE_ANON_KEY;
  const supabase =
    (window.App && window.App.supabase) || window.supabase.createClient(window.CONFIG.SUPABASE_URL, PROJECT_KEY);

  // ==========================================================
  // Helpers
  // ==========================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function randomToken() {
    // Token format: "TEST" + 6 random alphabet chars = 10-char unique token.
    // 32^6 ≈ 1.07 billion possibilities. With ~30 tokens per test run the
    // birthday-paradox collision probability is < 1 in a million, so this
    // is effectively collision-free in practice. The previous 2-char
    // suffix gave only 1024 possibilities and caused intermittent
    // duplicate-key failures on multi-run sessions.
    let t = TEST_TOKEN_PREFIX;
    const arr = new Uint32Array(6);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 6; i++) {
      t += TOKEN_ALPHABET[arr[i] % TOKEN_ALPHABET.length];
    }
    return t;
  }

  function assert(cond, msg) {
    if (!cond) throw new Error("assert failed: " + msg);
  }

  // ==========================================================
  // TestContext: helpers + resource tracking
  // ==========================================================
  class TestContext {
    constructor(testId, logFn, delayMs) {
      this.testId = testId;
      this.logFn = logFn || (() => {});
      this.delayMs = delayMs == null ? DEFAULT_DELAY_MS : delayMs;
      this.users = [];
      this.issues = [];
      this.teams = [];
      this._gsSnapshot = null;
    }
    log(m) {
      this.logFn(m);
    }
    async pause() {
      if (this.delayMs > 0) await sleep(this.delayMs);
    }

    async createTeam(suffix) {
      const name = TEST_TEAM_PREFIX + (suffix || Math.floor(Math.random() * 1e6));
      const {data, error} = await supabase.from("teams").insert({name}).select().single();
      if (error) throw new Error("createTeam: " + error.message);
      this.teams.push(data);
      this.log("  + team " + name);
      return data;
    }

    async createUser(role, team, namePart) {
      const displayName = TEST_USER_PREFIX + (namePart || role);
      const token = randomToken();
      const {data, error} = await supabase
        .from("users")
        .insert({token, display_name: displayName, role, team: team || null})
        .select()
        .single();
      if (error) throw new Error("createUser(" + role + "): " + error.message);
      this.users.push(data);
      this.log("  + user " + displayName + " [" + role + (team ? "/" + team : "") + "] token " + token);
      return data;
    }

    async createIssue(creator, slug, opts) {
      opts = opts || {};
      const title = TEST_ISSUE_PREFIX + " " + slug;
      const payload = Object.assign(
        {
          title,
          status: "market",
          price: 100,
          batch_size: 1,
          sprint_created: 1,
          created_by: creator ? creator.token : null,
          flawed: false,
        },
        opts,
      );
      const {data, error} = await supabase.from("issues").insert(payload).select().single();
      if (error) throw new Error("createIssue: " + error.message);
      this.issues.push(data);
      this.log("  + issue #" + data.id + " " + title);
      return data;
    }

    async updateIssue(id, patch) {
      const {error} = await supabase.from("issues").update(patch).eq("id", id);
      if (error) throw new Error("updateIssue(" + id + "): " + error.message);
      this.log("  ~ issue #" + id + " " + JSON.stringify(patch));
    }

    async fetchIssue(id) {
      const {data, error} = await supabase.from("issues").select("*").eq("id", id).single();
      if (error) throw new Error("fetchIssue(" + id + "): " + error.message);
      return data;
    }

    async createTask(issue, dev, opts) {
      opts = opts || {};
      const payload = {
        parent_issue_id: issue.id,
        assignee_token: dev ? dev.token : null,
        status: "claimed",
        containerized: !!opts.containerized,
      };
      const {data, error} = await supabase.from("tasks").insert(payload).select().single();
      if (error) throw new Error("createTask: " + error.message);
      this.log("  + task T#" + data.id + " on issue #" + issue.id);
      return data;
    }

    async completeTask(task) {
      const {error} = await supabase
        .from("tasks")
        .update({status: "complete", attachment_url: "https://example.com/test.png"})
        .eq("id", task.id);
      if (error) throw new Error("completeTask: " + error.message);
      this.log("  ✓ task T#" + task.id + " complete");
    }

    async postComment(issue, author, body, opts) {
      opts = opts || {};
      const payload = {
        issue_id: issue.id,
        author_token: author ? author.token : null,
        author_role_at_post: author ? author.role : null,
        author_team_at_post: author ? author.team : null,
        body,
        is_rejection: !!opts.isRejection,
        rejection_target_role: opts.targetRole || null,
        rejection_target_team: opts.targetTeam || null,
      };
      const {data, error} = await supabase.from("comments").insert(payload).select().single();
      if (error) throw new Error("postComment: " + error.message);
      this.log('  + comment #' + data.id + ' "' + body.slice(0, 40) + '"');
      return data;
    }

    async logHackerAttempt(hacker, issue, sprint, caught, actionType) {
      const payload = {
        hacker_token: hacker ? hacker.token : null,
        target_issue_id: issue.id,
        sprint,
        caught_by_security: caught,
        action_type: actionType || "inject",
      };
      const {data, error} = await supabase.from("hacker_log").insert(payload).select().single();
      if (error) throw new Error("logHackerAttempt: " + error.message);
      return data;
    }

    async fetchGameState() {
      const {data, error} = await supabase.from("game_state").select("*").eq("id", 1).single();
      if (error) throw new Error("fetchGameState: " + error.message);
      return data;
    }

    async updateGameState(patch) {
      const {error} = await supabase.from("game_state").update(patch).eq("id", 1);
      if (error) throw new Error("updateGameState: " + error.message);
      this.log("  ~ game_state " + JSON.stringify(patch));
    }

    async snapshotGameState() {
      const gs = await this.fetchGameState();
      this._gsSnapshot = gs;
      this.log("  📸 game_state snapshot taken");
      return gs;
    }

    async restoreGameState() {
      if (!this._gsSnapshot) return;
      const {id, ...rest} = this._gsSnapshot;
      const {error} = await supabase.from("game_state").update(rest).eq("id", 1);
      if (error) throw new Error("restoreGameState: " + error.message);
      this.log("  📥 game_state restored");
      this._gsSnapshot = null;
    }

    // ==========================================================
    // makeMockStore: build a minimal store-like object that can have
    // App.actions methods called against it via .call(store, ...).
    // Lets tests exercise the REAL action handlers (with their canAct
    // gates, comment posts, event logging, toast paths) without
    // requiring Alpine to be loaded.
    //
    // Usage:
    //   const store = await ctx.makeMockStore({user: dev});
    //   await window.App.actions.claimIssue.call(store, issue);
    //   const fresh = await ctx.fetchIssue(issue.id);
    //   assert(fresh.team === dev.team, "team set by claimIssue");
    //
    // The store auto-reloads issues/tasks/comments from the DB before
    // each action call (so canAct sees current state). After the
    // action it reloads again so subsequent reads inside the test
    // see the action's effects.
    // ==========================================================
    async makeMockStore(overrides) {
      overrides = overrides || {};
      const harness = this;
      const App = window.App;
      if (!App || !App.storeShape) {
        throw new Error("App.storeShape unavailable; ensure app.store.js is loaded");
      }

      // Start from the storeShape (state + getter methods) and mix in
      // both action sets. We do NOT call init() — that would set up
      // Alpine reactivity and realtime subscriptions we don't need.
      const store = Object.assign(
        {},
        App.storeShape,
        App.actions || {},
        App.adminActions || {},
      );

      // Live game_state. Tests that mutate it should also restore it
      // via ctx.snapshotGameState() / restoreGameState().
      const gs = await this.fetchGameState();
      store.gameState = gs;
      store.gameStateLoaded = true;

      // Hydrate the four collections action handlers commonly read.
      const reload = async () => {
        const [iss, tks, cmts, usrs] = await Promise.all([
          supabase.from("issues").select("*"),
          supabase.from("tasks").select("*"),
          supabase.from("comments").select("*"),
          supabase.from("users").select("*"),
        ]);
        store.issues = iss.data || [];
        store.tasks = tks.data || [];
        store.comments = cmts.data || [];
        store.users = usrs.data || [];
      };
      await reload();
      store._reload = reload;

      // No Alpine → no $watch → toasts just append to the log.
      store.toast = (msg) => {
        store._lastToast = msg;
        harness.log("  toast: " + msg);
      };

      // No localStorage interactions either.
      store.commentSortDesc = true;
      store.user = overrides.user || null;
      store.impersonation = overrides.impersonation || {role: "", team: ""};
      if (overrides.gameState) {
        store.gameState = Object.assign({}, store.gameState, overrides.gameState);
      }

      return store;
    }
  }

  // ==========================================================
  // Cleanup primitive: deletes all TEST-prefixed rows.
  // Called by the cleanup test, and as a hard reset before runs.
  // Order matters: child rows / FK-referencing rows first.
  // ==========================================================
  async function deleteAllTestRows(logFn) {
    const log = logFn || (() => {});
    // Get ids of test issues to scope dependent deletes.
    const {data: testIssues} = await supabase
      .from("issues")
      .select("id")
      .like("title", TEST_ISSUE_PREFIX + "%");
    const issueIds = (testIssues || []).map((r) => r.id);
    if (issueIds.length > 0) {
      await supabase.from("tasks").delete().in("parent_issue_id", issueIds);
      await supabase.from("comments").delete().in("issue_id", issueIds);
      await supabase.from("hacker_log").delete().in("target_issue_id", issueIds);
      await supabase.from("event_log").delete().in("issue_id", issueIds);
      const {error} = await supabase.from("issues").delete().in("id", issueIds);
      if (error) throw new Error("delete issues: " + error.message);
      log("  - " + issueIds.length + " test issue(s) and dependents");
    }
    // Test users (token starts with TEST)
    const {error: uErr, count: uCount} = await supabase
      .from("users")
      .delete({count: "exact"})
      .like("token", TEST_TOKEN_PREFIX + "%");
    if (uErr) throw new Error("delete users: " + uErr.message);
    if (uCount) log("  - " + uCount + " test user(s)");
    // Test teams
    const {error: tErr, count: tCount} = await supabase
      .from("teams")
      .delete({count: "exact"})
      .like("name", TEST_TEAM_PREFIX + "%");
    if (tErr) throw new Error("delete teams: " + tErr.message);
    if (tCount) log("  - " + tCount + " test team(s)");
  }

  // ==========================================================
  // Tests
  // ==========================================================
  const tests = [
    // ---------- setup ----------
    {
      id: "setup-health",
      name: "Setup: schema reachable (all 9 tables)",
      category: "setup",
      description: "Confirms every table the app uses is queryable and not 401/404.",
      async run(ctx) {
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
        for (const t of tables) {
          const {error} = await supabase.from(t).select("*", {head: true, count: "exact"}).limit(1);
          assert(!error, t + ": " + (error && error.message));
          ctx.log("  ✓ " + t);
        }
      },
    },
    {
      id: "setup-game-state",
      name: "Setup: game_state singleton row exists",
      category: "setup",
      description:
        "Reads the singleton game_state row (id=1) and confirms the v2 columns exist with the right types: current_sprint (number), flaw_rate_percent (number), sprint3_cicd_bypass (boolean). A failure here means schema.sql was not applied or was applied in pre-v2 state.",
      async run(ctx) {
        const gs = await ctx.fetchGameState();
        assert(gs && gs.id === 1, "row id=1 missing");
        assert(typeof gs.current_sprint === "number", "current_sprint not a number");
        assert(typeof gs.flaw_rate_percent === "number", "flaw_rate_percent missing");
        assert(typeof gs.sprint3_cicd_bypass === "boolean", "sprint3_cicd_bypass missing");
        ctx.log("  ✓ singleton OK, sprint=" + gs.current_sprint + ", flaw_rate=" + gs.flaw_rate_percent + "%");
      },
    },
    {
      id: "setup-facilitator-seed",
      name: "Setup: FACIL1 seed user exists",
      category: "setup",
      description:
        "Confirms the seeded facilitator user with token FACIL1 exists with role='facilitator'. The schema seeds this row; a failure means schema.sql was applied without seed data, or the facilitator was deleted manually.",
      async run(ctx) {
        const {data, error} = await supabase.from("users").select("*").eq("token", "FACIL1").maybeSingle();
        assert(!error, error && error.message);
        assert(data, "FACIL1 user missing; re-run schema.sql");
        assert(data.role === "facilitator", "FACIL1 role is " + data.role);
        ctx.log("  ✓ FACIL1 present");
      },
    },
    {
      id: "setup-curated-urls",
      name: "Setup: 20 curated URLs seeded",
      category: "setup",
      description:
        "Confirms at least 20 curated URL rows are present in curated_urls. The schema seeds 20 (sprint 1 dogs/cats/birds, sprint 2 cars/boats, sprint 3 aliens/unicorns) for the Business 'pick a drawing' dropdown.",
      async run(ctx) {
        const {count, error} = await supabase.from("curated_urls").select("*", {head: true, count: "exact"});
        assert(!error, error && error.message);
        assert(count >= 20, "expected ≥20 curated URLs, got " + count);
        ctx.log("  ✓ " + count + " curated URLs present");
      },
    },

    // ---------- frontend (pure logic; no DB) ----------
    {
      id: "fe-app-loaded",
      name: "Frontend: window.App.logic exposed",
      category: "frontend",
      description:
        "Verifies window.App.logic exposes every helper the rest of the app and the test suite depend on (canAct, effectiveRole, isHacker, progressFor, batchGateOpen, detectFlaw, flawForIssueId, assignCrossTraining, sprintAdvancePlan, helpForCard, latestRejectionComment). A failure means the modular app split lost a helper export.",
      async run(ctx) {
        assert(window.App, "window.App missing; check script load order");
        assert(window.App.logic, "window.App.logic missing");
        for (const f of [
          "canAct",
          "effectiveRole",
          "effectiveTeam",
          "isHacker",
          "progressFor",
          "batchGateOpen",
          "detectFlaw",
          "flawForIssueId",
          "assignCrossTraining",
          "sprintAdvancePlan",
          "helpForCard",
          "latestRejectionComment",
        ]) {
          assert(typeof window.App.logic[f] === "function", "App.logic." + f + " is not a function");
        }
        ctx.log("  ✓ App.logic exposes all expected helpers");
      },
    },
    {
      id: "fe-role-labels",
      name: "Frontend: role + column constants are sane",
      category: "frontend",
      description:
        "Sanity-checks the role enum and label map after the v1→v2 rename: 'release' must NOT be in VALID_ROLES (replaced by 'sysadmin'), the 'hacker' UI label must be 'Developer' (cover identity), and the COLUMN_LABELS map must include 'Clarifications' and 'Accepted'.",
      async run(ctx) {
        const labels = window.App.ROLE_LABELS;
        assert(labels.business === "Business", "Business label");
        assert(labels.sysadmin === "SysAdmin", "SysAdmin label");
        assert(labels.hacker === "Developer", "hacker should display as Developer");
        assert(window.App.VALID_ROLES.indexOf("observer") !== -1, "observer in VALID_ROLES");
        assert(window.App.VALID_ROLES.indexOf("release") === -1, "legacy 'release' must not be in VALID_ROLES");
        assert(window.App.COLUMN_LABELS.clarifications === "Clarifications", "Clarifications column");
        assert(window.App.COLUMN_LABELS.accepted === "Accepted", "Accepted column");
        ctx.log("  ✓ labels and roles match v2 schema");
      },
    },
    {
      id: "fe-progress-batch",
      name: "Frontend: progressFor + batchGateOpen",
      category: "frontend",
      description:
        "Pure-logic test of progressFor (counts complete tasks for an issue) and batchGateOpen (returns true only when every task on the issue is complete). Without these, Send-to-Testing would be permitted prematurely.",
      async run(ctx) {
        const {progressFor, batchGateOpen} = window.App.logic;
        const issue = {id: 1, batch_size: 3};
        const tasks = [
          {parent_issue_id: 1, status: "complete"},
          {parent_issue_id: 1, status: "claimed"},
          {parent_issue_id: 1, status: "complete"},
        ];
        const p = progressFor(issue, tasks);
        assert(p.done === 2, "done count");
        assert(p.total === 3, "total");
        assert(!batchGateOpen(issue, tasks), "gate should be closed at 2/3");
        tasks[1].status = "complete";
        assert(batchGateOpen(issue, tasks), "gate should open at 3/3");
        ctx.log("  ✓ progress and gate behave");
      },
    },
    {
      id: "fe-detect-flaw",
      name: "Frontend: detectFlaw classifies random vs injected vs both",
      category: "frontend",
      description:
        "Pure-logic test of detectFlaw at the four classification cases: rate=100+clean, rate=100+injected (source='both'), rate=0+injected (source='injected'), rate=0+clean (source='none'). Drives the 'flaw source' label Security sees during Run Security Check.",
      async run(ctx) {
        const d = window.App.logic.detectFlaw;
        // Force random=true via flaw_rate=100
        assert(d({id: 1, hacked_flag: false, flawed: false}, 100).flawed === true, "rate 100 → flawed");
        assert(d({id: 1, hacked_flag: false, flawed: false}, 100).source === "random", "source random");
        assert(d({id: 1, hacked_flag: true, flawed: false}, 100).source === "both", "rate 100 + injected = both");
        assert(d({id: 1, hacked_flag: true, flawed: false}, 0).source === "injected", "injected only");
        assert(d({id: 1, hacked_flag: false, flawed: false}, 0).source === "none", "clean");
        ctx.log("  ✓ flaw classification correct");
      },
    },
    {
      id: "fe-effective-role",
      name: "Frontend: effective role/team + impersonation + hacker mask uses hacker_previous_role",
      category: "frontend",
      description:
        "Pure-logic test of role resolution. Facilitator with no impersonation stays facilitator. Facilitator with impersonation gets the impersonated role/team. Hacker masking is the critical case: a hacker promoted from tester must mask as 'tester' (so their visible role doesn't suddenly change and out them); a hacker promoted from business masks as 'business'; only when hacker_previous_role is null (legacy data or facilitator impersonating raw 'hacker') does it fall back to 'developer'. rawEffectiveRole always returns 'hacker' so isHacker() still works for inject/stop-container permission checks. A regression here either outs hackers (the v2 cover bug) or breaks facilitator simulation.",
      async run(ctx) {
        const {effectiveRole, effectiveTeam, isHacker, rawEffectiveRole} = window.App.logic;

        // Facilitator: identity + impersonation override.
        const facil = {role: "facilitator"};
        assert(effectiveRole(facil, null) === "facilitator", "facil no-imp");
        assert(effectiveRole(facil, {role: "developer", team: "T"}) === "developer", "facil imp role");
        assert(effectiveTeam(facil, {role: "developer", team: "T"}) === "T", "facil imp team");

        // Hacker promoted from tester must STILL appear as tester.
        const hackerFromTester = {role: "hacker", team: "T", hacker_previous_role: "tester"};
        assert(
          effectiveRole(hackerFromTester, null) === "tester",
          "hacker-from-tester must mask as 'tester', got " + effectiveRole(hackerFromTester, null),
        );
        assert(rawEffectiveRole(hackerFromTester, null) === "hacker", "raw still 'hacker' for permission gates");
        assert(isHacker(hackerFromTester, null), "isHacker true regardless of cover");

        // Hacker promoted from business must mask as business (cross-team role).
        const hackerFromBiz = {role: "hacker", team: null, hacker_previous_role: "business"};
        assert(effectiveRole(hackerFromBiz, null) === "business", "hacker-from-business masks as 'business'");

        // Hacker with no prior role (legacy/test data) falls back to 'developer'.
        const orphanHacker = {role: "hacker", team: "T"};
        assert(
          effectiveRole(orphanHacker, null) === "developer",
          "orphan hacker falls back to 'developer' (legacy fallback)",
        );

        // Facilitator impersonating 'hacker' (no underlying real hacker) → 'developer'.
        assert(
          effectiveRole(facil, {role: "hacker", team: "T"}) === "developer",
          "facil-impersonating-hacker falls back to 'developer'",
        );
        ctx.log("  ✓ all role resolution branches correct");
      },
    },
    {
      id: "u-promote-demote-roundtrip",
      name: "Unit: promoteToHacker stashes prior role; demoteHacker restores it",
      category: "unit",
      description:
        "DB+admin-action round-trip. Creates a tester user, calls real adminActions.promoteToHacker.call(facilitatorStore, token), asserts users.role='hacker' AND hacker_previous_role='tester'. Then calls demoteHacker.call(facilitatorStore, token), asserts users.role='tester' AND hacker_previous_role=null. Combined with effectiveRole's cover logic, this is what keeps a tester-turned-hacker visually identical to the rest of the room. Catches regressions where promote forgets to stash prior role (would force fallback to 'developer' = obvious tell) or demote leaves stale hacker_previous_role.",
      async run(ctx) {
        const tst = await ctx.createUser("tester", "TEST-PD", "tst");
        const {data: facil} = await supabase.from("users").select("*").eq("token", "FACIL1").single();
        const fStore = await ctx.makeMockStore({user: facil});

        await window.App.adminActions.promoteToHacker.call(fStore, tst.token);
        await ctx.pause();
        const {data: promoted} = await supabase.from("users").select("*").eq("token", tst.token).single();
        assert(promoted.role === "hacker", "promote sets role='hacker', got " + promoted.role);
        assert(
          promoted.hacker_previous_role === "tester",
          "promote stashes prior role, got " + promoted.hacker_previous_role,
        );

        // Cover check: effectiveRole on the promoted user returns 'tester', not 'developer'.
        assert(
          window.App.logic.effectiveRole(promoted, null) === "tester",
          "post-promote effectiveRole MUST be 'tester' (cover preserved), got " +
            window.App.logic.effectiveRole(promoted, null),
        );

        await window.App.adminActions.demoteHacker.call(fStore, tst.token);
        await ctx.pause();
        const {data: demoted} = await supabase.from("users").select("*").eq("token", tst.token).single();
        assert(demoted.role === "tester", "demote restores prior role, got " + demoted.role);
        assert(demoted.hacker_previous_role === null, "demote clears prior-role stash");
      },
    },
    {
      id: "fe-canact-matrix",
      name: "Frontend: canAct matrix sample (claim, deploy, code freeze, hacker)",
      category: "frontend",
      description:
        "Sample of canAct rules across roles and states: business creates only, dev claims unclaimed market, dev cannot claim already-teamed, sysadmin deploys, code freeze blocks deploy, hacker injects in S2 in_progress, hacker can NOT inject in S1, hacker can NOT inject containerized cards. Catches regressions in the central permission gate without exhaustive coverage.",
      async run(ctx) {
        const canAct = window.App.logic.canAct;
        const ctxObj = {gameState: {current_sprint: 1}, tasks: []};

        // Business creates only
        assert(canAct({role: "business"}, null, null, "create_issue", ctxObj), "biz create");
        assert(!canAct({role: "developer"}, null, null, "create_issue", ctxObj), "dev cannot create");

        // Dev claims unclaimed market
        const market = {id: 1, status: "market", team: null};
        assert(canAct({role: "developer", team: "A"}, null, market, "claim", ctxObj), "dev claim");
        const claimed = {id: 1, status: "market", team: "B"};
        assert(!canAct({role: "developer", team: "A"}, null, claimed, "claim", ctxObj), "no claim teamed");

        // SysAdmin deploy + code freeze
        const td = {id: 1, status: "to_deploy", code_freeze: false};
        assert(canAct({role: "sysadmin"}, null, td, "deploy", ctxObj), "sysadmin deploy");
        const tdFrozen = {id: 1, status: "to_deploy", code_freeze: true};
        assert(!canAct({role: "sysadmin"}, null, tdFrozen, "deploy", ctxObj), "freeze blocks deploy");

        // Hacker injection scope (sprint 2+)
        const ip = {id: 1, status: "in_progress", containerized: false, hacked_flag: false};
        assert(!canAct({role: "hacker"}, null, ip, "inject_flaw", {gameState: {current_sprint: 1}}), "no inject S1");
        assert(canAct({role: "hacker"}, null, ip, "inject_flaw", {gameState: {current_sprint: 2}}), "inject S2");
        const ipCont = {...ip, containerized: true};
        assert(!canAct({role: "hacker"}, null, ipCont, "inject_flaw", {gameState: {current_sprint: 2}}), "container blocks");

        ctx.log("  ✓ canAct samples match expected matrix");
      },
    },
    {
      id: "fe-cross-training",
      name: "Frontend: assignCrossTraining round-robin",
      category: "frontend",
      description:
        "Tests assignCrossTraining round-robin: with 3 developers (and one facilitator who must be excluded), each gets a different cross_trained_role from {tester, security, sysadmin} and keeps their own team. Deterministic ordering by created_at then token so the same input always produces the same output (replay-safe).",
      async run(ctx) {
        const users = [
          {token: "D1", role: "developer", team: "A", created_at: "2024-01-01"},
          {token: "D2", role: "developer", team: "A", created_at: "2024-01-02"},
          {token: "D3", role: "developer", team: "A", created_at: "2024-01-03"},
          {token: "F1", role: "facilitator", team: null, created_at: "2024-01-04"},
        ];
        const patches = window.App.logic.assignCrossTraining(users);
        assert(patches.length === 3, "facilitator excluded; 3 patches");
        const map = Object.fromEntries(patches.map((p) => [p.token, p]));
        assert(map.D1.cross_trained_role === "tester", "D1 → tester");
        assert(map.D2.cross_trained_role === "security", "D2 → security");
        assert(map.D3.cross_trained_role === "sysadmin", "D3 → sysadmin");
        assert(map.D1.cross_trained_team === "A", "team preserved");
        ctx.log("  ✓ round-robin deterministic");
      },
    },
    {
      id: "fe-sprint-advance-plan",
      name: "Frontend: sprintAdvancePlan devaluation + role swap",
      category: "frontend",
      description:
        "Tests sprintAdvancePlan for the 2→3 transition: tester→developer and security→sysadmin role swaps fire (when sprint3_role_swap=true), accepted issues do NOT get devalued, and non-accepted older-sprint issues get price/=2. Without this the sprint-advance side effects could silently break.",
      async run(ctx) {
        const plan23 = window.App.logic.sprintAdvancePlan(
          2,
          3,
          {sprint3_role_swap: true, code_freeze_auto_clear: true, cross_training_enabled: true},
          [
            {token: "T1", role: "tester", team: "A"},
            {token: "S1", role: "security", team: "A"},
            {token: "D1", role: "developer", team: "A"},
          ],
          [
            {id: 1, status: "in_progress", price: 100, sprint_created: 1},
            {id: 2, status: "accepted", price: 200, sprint_created: 1},
          ],
        );
        assert(plan23.roleSwaps.length === 2, "two role swaps");
        assert(plan23.roleSwaps.find((s) => s.token === "T1").role === "developer", "tester → dev");
        assert(plan23.roleSwaps.find((s) => s.token === "S1").role === "sysadmin", "security → sysadmin");
        assert(plan23.devaluations.length === 1, "only non-accepted devalues");
        assert(plan23.devaluations[0].price === 50, "price halved");
        ctx.log("  ✓ plan structure correct");
      },
    },

    // ---------- unit (DB primitives, single-step) ----------
    {
      id: "u-create-user",
      name: "Unit: insert user; reject invalid role",
      category: "unit",
      description:
        "DB-level: insert a valid user; then attempt insert with role='release' (legacy role removed in v2) and assert the CHECK constraint rejects it. Catches schema drift where the role enum was widened or the legacy 'release' value was reintroduced.",
      async run(ctx) {
        const u = await ctx.createUser("developer", "TEST-A", "u1");
        assert(u.token && u.token.startsWith("TEST"), "token prefix");
        // Invalid role must be rejected by CHECK constraint
        const {error} = await supabase
          .from("users")
          .insert({token: "TESTBOG", display_name: "TEST-bogus", role: "release"});
        assert(error, "invalid role 'release' should be rejected");
        ctx.log("  ✓ valid insert worked, invalid was rejected (" + error.message + ")");
      },
    },
    {
      id: "u-create-issue",
      name: "Unit: business creates issue with acceptance criteria",
      category: "unit",
      description:
        "DB-level: business creates an issue with v2 fields (acceptance_criteria, description_url, batch_size). Confirms the row inserts and starts in 'market' status. Catches schema regressions where a new column was added without a default or the status enum was changed.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const issue = await ctx.createIssue(biz, "u-create", {
          batch_size: 2,
          acceptance_criteria: "All tasks colored neatly",
          description_url: "https://example.com/test.html",
        });
        assert(issue.title.startsWith(TEST_ISSUE_PREFIX), "title prefix");
        assert(issue.acceptance_criteria === "All tasks colored neatly", "acceptance_criteria stored");
        assert(issue.status === "market", "starts in market");
        ctx.log("  ✓ issue created with v2 fields");
      },
    },
    {
      id: "u-claim",
      name: "Unit: claim flips team + status atomically",
      category: "unit",
      description:
        "DB-level: update an issue from market/no-team to in_progress/team='TEST-A' in one statement. Confirms the schema accepts both fields changing atomically. The actual claim ACTION is exercised in e2e-happy-path.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const issue = await ctx.createIssue(biz, "u-claim");
        await ctx.updateIssue(issue.id, {team: "TEST-A", status: "in_progress"});
        const fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.team === "TEST-A", "team set");
        assert(fresh.status === "in_progress", "status moved");
      },
    },
    {
      id: "u-batch-gate",
      name: "Unit: batch gate opens only when all tasks complete",
      category: "unit",
      description:
        "DB+logic: create 2 tasks under an issue with batch_size=2; the gate must be closed at 0/2 and 1/2, then open at 2/2. Catches a regression where progressFor or batchGateOpen miscounts task completions, which would let Send-to-Testing fire too early.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-B", "dev");
        const issue = await ctx.createIssue(biz, "u-batch", {batch_size: 2});
        await ctx.updateIssue(issue.id, {team: "TEST-B", status: "in_progress"});
        const t1 = await ctx.createTask(issue, dev);
        const t2 = await ctx.createTask(issue, dev);
        const {batchGateOpen} = window.App.logic;
        let tasks = [
          {parent_issue_id: issue.id, status: "claimed", id: t1.id},
          {parent_issue_id: issue.id, status: "claimed", id: t2.id},
        ];
        assert(!batchGateOpen({id: issue.id, batch_size: 2}, tasks), "closed at 0/2");
        await ctx.completeTask(t1);
        tasks[0].status = "complete";
        assert(!batchGateOpen({id: issue.id, batch_size: 2}, tasks), "closed at 1/2");
        await ctx.completeTask(t2);
        tasks[1].status = "complete";
        assert(batchGateOpen({id: issue.id, batch_size: 2}, tasks), "open at 2/2");
      },
    },
    {
      id: "u-flaw-determinism",
      name: "Unit: flawForIssueId is deterministic",
      category: "unit",
      description:
        "Pure-logic stability + distribution test for flawForIssueId: same id+rate always returns the same boolean (no random-on-each-call), rate=0 always false, rate=100 always true, rate=25 over 1000 ids produces 200-300 trues (Knuth multiplicative hash spreads modulo-100 evenly).",
      async run(ctx) {
        const f = window.App.logic.flawForIssueId;
        assert(f(123, 25) === f(123, 25), "same input same output");
        assert(f(123, 0) === false, "rate 0 false");
        assert(f(123, 100) === true, "rate 100 true");
        let trues = 0;
        for (let i = 1; i <= 1000; i++) if (f(i, 25)) trues++;
        ctx.log("  rate 25 over 1000 ids → " + trues + " trues (~250 expected)");
        assert(trues > 200 && trues < 300, "distribution off; got " + trues);
      },
    },

    // ---------- e2e (full pipeline flows) ----------
    // The tests in this section come in two flavors:
    //   (a) "real e2e" tests: build a mock store via ctx.makeMockStore
    //       and call the actual App.actions.* handlers. These exercise
    //       the canAct gate, the DB write, the comment posting, and
    //       the event_log write — i.e. the full handler.
    //   (b) "schema flow" tests: use ctx.updateIssue() directly to walk
    //       a card through statuses. These verify the schema accepts
    //       the transitions and that downstream logic (e.g. hacker_log
    //       update sequencing) works. They do NOT exercise the action
    //       handler. Each schema-flow test names this honestly in its
    //       description.

    {
      id: "e2e-happy-path",
      name: "E2E (real): business → dev → tester → security → sysadmin → accept via action handlers",
      category: "e2e",
      description:
        "Full pipeline using REAL action handlers (not direct DB updates). Calls App.actions.createIssue, claimIssue, createTask, completeTask, sendToTesting, passTesting, runSecurityCheck, passSecurity, deploy, acceptProduction in sequence. Each handler runs its canAct gate, writes to DB, posts the appropriate comment, and writes event_log. Catches regressions in any handler that the schema-only tests miss (e.g. forgotten team assignment on claim, missing comment on accept, broken canAct). Asserts the card ends in 'accepted' (NOT deleted, per v2 spec).",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-HP", "dev");
        const tst = await ctx.createUser("tester", "TEST-HP", "tst");
        const sec = await ctx.createUser("security", "TEST-HP", "sec");
        const sa = await ctx.createUser("sysadmin", "TEST-HP", "sa");

        // Business creates the card via the real handler.
        const bizStore = await ctx.makeMockStore({user: biz});
        await window.App.actions.createIssue.call(bizStore, {
          title: "TEST: happy-real",
          description_url: "https://example.com/happy.html",
          price: 100,
          batch_size: 1,
          acceptance_criteria: "Looks like a puppy",
        });
        await ctx.pause();
        // Find the issue we just created (createIssue doesn't return it).
        await bizStore._reload();
        const issue = bizStore.issues.find((i) => i.title === "TEST: happy-real" && i.created_by === biz.token);
        assert(issue, "createIssue did not insert the card");
        ctx.issues.push(issue); // track for cleanup
        assert(issue.status === "market", "starts in market");
        assert(issue.acceptance_criteria === "Looks like a puppy", "acceptance criteria stored");

        // Dev claims via real handler. Must set team AND move to in_progress.
        ctx.log("→ dev claims (real claimIssue handler)");
        const devStore = await ctx.makeMockStore({user: dev});
        await window.App.actions.claimIssue.call(devStore, issue);
        await ctx.pause();
        let fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.team === "TEST-HP", "team set by claim, got " + fresh.team);
        assert(fresh.status === "in_progress", "status moved to in_progress");

        // Dev adds and completes a task via real handlers.
        ctx.log("→ dev creates + completes task");
        await devStore._reload();
        const ctx2 = await ctx.makeMockStore({user: dev});
        await window.App.actions.createTask.call(ctx2, fresh, {});
        await ctx2._reload();
        const newTask = ctx2.tasks.find((t) => t.parent_issue_id === issue.id);
        assert(newTask, "task created");
        // completeTask requires a real File. Schema-update the task to bypass storage.
        await supabase
          .from("tasks")
          .update({status: "complete", attachment_url: "https://example.com/done.png"})
          .eq("id", newTask.id);
        await ctx.pause();

        // Send to testing via real handler (must verify batch gate first).
        ctx.log("→ dev sends to testing (real sendToTesting handler)");
        const ctx3 = await ctx.makeMockStore({user: dev});
        await window.App.actions.sendToTesting.call(ctx3, fresh);
        await ctx.pause();
        fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "testing", "moved to testing, got " + fresh.status);

        // Tester passes via real handler.
        ctx.log("→ tester passes (real passTesting handler)");
        const tstStore = await ctx.makeMockStore({user: tst});
        await window.App.actions.passTesting.call(tstStore, fresh);
        await ctx.pause();
        fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "security", "moved to security");

        // Security runs check then passes.
        ctx.log("→ security runs check + passes (real handlers)");
        const secStore = await ctx.makeMockStore({user: sec});
        await window.App.actions.runSecurityCheck.call(secStore, fresh);
        // securityCheckResult is set on the store; passSecurity gates on it.
        await window.App.actions.passSecurity.call(secStore, fresh);
        await ctx.pause();
        fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "to_deploy", "moved to to_deploy, got " + fresh.status);

        // SysAdmin deploys.
        ctx.log("→ sysadmin deploys (real deploy handler)");
        const saStore = await ctx.makeMockStore({user: sa});
        await window.App.actions.deploy.call(saStore, fresh);
        await ctx.pause();
        fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "in_production", "moved to in_production");

        // Business accepts.
        ctx.log("→ business accepts (real acceptProduction handler)");
        const bizStore2 = await ctx.makeMockStore({user: biz});
        await window.App.actions.acceptProduction.call(bizStore2, fresh);
        await ctx.pause();
        fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "accepted", "ends in accepted column, got " + fresh.status);

        // Verify the comment trail: at least one comment per major step.
        const {data: cmts} = await supabase
          .from("comments")
          .select("*")
          .eq("issue_id", issue.id)
          .order("created_at", {ascending: true});
        ctx.log("  → " + (cmts || []).length + " comments posted by handlers");
        // acceptProduction posts an "Accepted" comment.
        assert(
          (cmts || []).some((c) => c.body.toLowerCase().includes("accept")),
          "acceptProduction must post an Accepted comment",
        );
      },
    },
    {
      id: "e2e-rejection-pickup-rework",
      name: "E2E: tester rejects → kind=rejection, pickup goes to In Progress (NOT testing)",
      category: "e2e",
      description: "Asserts the v2 rejection rule: every rejection sets clarification_kind='rejection' and pre_clarification_status='in_progress' (the rework column), so that when the dev picks up, the card lands in In Progress where they can fix it — not back in the column where it was rejected.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-RJ", "dev");
        const tst = await ctx.createUser("tester", "TEST-RJ", "tst");

        const issue = await ctx.createIssue(biz, "reject");
        await ctx.updateIssue(issue.id, {team: "TEST-RJ", status: "testing"});
        await ctx.pause();

        ctx.log("→ tester rejects from testing (mirrors _rejectAndComment behavior)");
        // Mirror what app.actions.js _rejectAndComment does:
        // status='clarifications', kind='rejection', pre='in_progress' (HARDCODED).
        await ctx.updateIssue(issue.id, {
          status: "clarifications",
          clarification_target_role: "developer",
          clarification_target_team: "TEST-RJ",
          clarification_kind: "rejection",
          pre_clarification_status: "in_progress",
        });
        await ctx.postComment(issue, tst, "Missing tasks", {
          isRejection: true,
          targetRole: "developer",
          targetTeam: "TEST-RJ",
        });
        await ctx.pause();

        const inClar = await ctx.fetchIssue(issue.id);
        assert(inClar.status === "clarifications", "in clarifications");
        assert(inClar.clarification_kind === "rejection", "kind=rejection");
        assert(inClar.clarification_target_role === "developer", "target=developer");
        assert(
          inClar.pre_clarification_status === "in_progress",
          "pre_clarification_status MUST be 'in_progress' for rejections, got " + inClar.pre_clarification_status,
        );

        // canAct rule: developer on team can pickup_clarification, can NOT
        // answer_question (this is a rejection, not a question).
        const canPickup = window.App.logic.canAct(
          {role: "developer", team: "TEST-RJ"}, null, inClar, "pickup_clarification",
          {gameState: {current_sprint: 1}, tasks: []},
        );
        assert(canPickup === true, "dev should be able to pickup_clarification");
        const canAnswer = window.App.logic.canAct(
          {role: "developer", team: "TEST-RJ"}, null, inClar, "answer_question",
          {gameState: {current_sprint: 1}, tasks: []},
        );
        assert(canAnswer === false, "answer_question must be false for rejection kind");

        ctx.log("→ dev picks up: should land in In Progress (NOT testing)");
        await ctx.updateIssue(issue.id, {
          status: "in_progress",
          clarification_target_role: null,
          clarification_target_team: null,
          clarification_kind: null,
          pre_clarification_status: null,
        });
        const restored = await ctx.fetchIssue(issue.id);
        assert(
          restored.status === "in_progress",
          "Card MUST land in in_progress after rejection pickup (was: " + restored.status + ")",
        );
        assert(restored.clarification_kind === null, "kind cleared on pickup");
        assert(restored.pre_clarification_status === null, "pre cleared on pickup");
        ctx.log("✓ rejection-rework cycle correct");
      },
    },

    {
      id: "e2e-question-answer-roundtrip",
      name: "E2E: tester asks dev a question → kind=question, dev answers, card returns to Testing",
      category: "e2e",
      description: "Asserts the v2 question/answer rule: ask sets kind='question' and pre_clarification_status=<asker's column>; answer returns the card to that column. Distinct from rejection, which always returns to in_progress.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-QA", "dev");
        const tst = await ctx.createUser("tester", "TEST-QA", "tst");

        const issue = await ctx.createIssue(biz, "question");
        await ctx.updateIssue(issue.id, {team: "TEST-QA", status: "testing"});
        await ctx.pause();

        ctx.log("→ tester asks dev a question (mirrors askQuestion action)");
        await ctx.updateIssue(issue.id, {
          status: "clarifications",
          clarification_target_role: "developer",
          clarification_target_team: "TEST-QA",
          clarification_kind: "question",
          pre_clarification_status: "testing",
        });
        await ctx.postComment(issue, tst, "Is the puppy supposed to be blue?", {});
        await ctx.pause();

        const asked = await ctx.fetchIssue(issue.id);
        assert(asked.clarification_kind === "question", "kind=question");
        assert(asked.pre_clarification_status === "testing", "pre=testing (asker's column)");

        // canAct rule: question kind hides pickup_clarification, exposes answer_question.
        const canPickup = window.App.logic.canAct(
          {role: "developer", team: "TEST-QA"}, null, asked, "pickup_clarification",
          {gameState: {current_sprint: 1}, tasks: []},
        );
        assert(canPickup === false, "pickup_clarification must be false for question kind");
        const canAnswer = window.App.logic.canAct(
          {role: "developer", team: "TEST-QA"}, null, asked, "answer_question",
          {gameState: {current_sprint: 1}, tasks: []},
        );
        assert(canAnswer === true, "developer on team should answer_question");
        const canAnswerWrongTeam = window.App.logic.canAct(
          {role: "developer", team: "TEST-OTHER"}, null, asked, "answer_question",
          {gameState: {current_sprint: 1}, tasks: []},
        );
        assert(canAnswerWrongTeam === false, "developer on different team must not answer");

        ctx.log("→ dev answers: post answer comment + restore to testing");
        await ctx.postComment(issue, dev, "Yes, blue body and brown eyes.", {});
        await ctx.updateIssue(issue.id, {
          status: "testing",
          clarification_target_role: null,
          clarification_target_team: null,
          clarification_kind: null,
          pre_clarification_status: null,
        });
        const answered = await ctx.fetchIssue(issue.id);
        assert(
          answered.status === "testing",
          "After answer, card returns to asker's column (testing), got " + answered.status,
        );
        assert(answered.clarification_kind === null, "kind cleared on answer");
        ctx.log("✓ question-answer cycle correct");
      },
    },

    {
      id: "fe-clarification-permissions",
      name: "Frontend: pickup vs answer canAct rules split correctly by kind",
      category: "frontend",
      description: "pickup_clarification must reject question-kind cards; answer_question must reject rejection-kind cards. ask_question is allowed broadly except in clarifications-question and accepted.",
      async run(ctx) {
        const canAct = window.App.logic.canAct;
        const gs = {gameState: {current_sprint: 1}, tasks: []};

        const rejection = {
          id: 1, status: "clarifications", clarification_kind: "rejection",
          clarification_target_role: "developer", clarification_target_team: "A",
          pre_clarification_status: "in_progress",
        };
        const question = {
          id: 2, status: "clarifications", clarification_kind: "question",
          clarification_target_role: "business", clarification_target_team: null,
          pre_clarification_status: "in_progress",
        };
        const inProgress = {id: 3, status: "in_progress", team: "A"};
        const accepted = {id: 4, status: "accepted", team: "A"};

        // Pickup only on rejection kind, only by target.
        assert(canAct({role: "developer", team: "A"}, null, rejection, "pickup_clarification", gs) === true, "dev pickup OK");
        assert(canAct({role: "developer", team: "A"}, null, question, "pickup_clarification", gs) === false, "no pickup on question");
        assert(canAct({role: "tester", team: "A"}, null, rejection, "pickup_clarification", gs) === false, "tester not target");

        // Answer only on question kind, only by target.
        assert(canAct({role: "business"}, null, question, "answer_question", gs) === true, "business answers");
        assert(canAct({role: "business"}, null, rejection, "answer_question", gs) === false, "no answer on rejection");
        assert(canAct({role: "developer", team: "A"}, null, question, "answer_question", gs) === false, "wrong target");

        // Ask: allowed on workable cards, blocked on accepted, blocked on observer.
        // Hackers slip through as 'developer' via effectiveRole() masking — by
        // design — so canAct sees role='developer' and they can ask. The comment
        // they post is attributed to 'developer', preserving cover.
        assert(canAct({role: "developer", team: "A"}, null, inProgress, "ask_question", gs) === true, "dev can ask");
        assert(canAct({role: "tester", team: "A"}, null, inProgress, "ask_question", gs) === true, "tester can ask");
        assert(canAct({role: "observer"}, null, inProgress, "ask_question", gs) === false, "observer cannot ask");
        // Hacker masks to developer in effectiveRole, so canAct returns true.
        // This is intentional: lets hackers communicate while keeping cover.
        assert(canAct({role: "hacker", team: "A"}, null, inProgress, "ask_question", gs) === true, "hacker masks to dev (cover preserved)");
        assert(canAct({role: "business"}, null, accepted, "ask_question", gs) === false, "no ask on accepted");

        // Re-target from rejection: dev who is the rejection target can flip into question.
        assert(canAct({role: "developer", team: "A"}, null, rejection, "ask_question", gs) === true, "dev target can ask back");
        assert(canAct({role: "tester", team: "A"}, null, rejection, "ask_question", gs) === false, "non-target cannot ask in clarifications");

        ctx.log("✓ all clarification permission cells correct");
      },
    },
    {
      id: "e2e-security-catches",
      name: "E2E: hacker injects, security catches",
      category: "e2e",
      description:
        "Hacker injects (sets hacked_flag=true on an in_progress card and writes a hacker_log row), card moves through testing→security, Security marks the log entry caught_by_security=true and rejects the card. Asserts the audit trail is preserved (caught=true) and the issue's hacked_flag is cleared. Catches regressions in the security catch path that would lose retro data.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-CT", "dev");
        const hacker = await ctx.createUser("hacker", "TEST-CT", "hax");

        const issue = await ctx.createIssue(biz, "will-catch", {sprint_created: 2});
        await ctx.updateIssue(issue.id, {team: "TEST-CT", status: "in_progress"});
        const t = await ctx.createTask(issue, dev);
        await ctx.completeTask(t);
        await ctx.pause();

        ctx.log("→ hacker injects, log pending verdict");
        await ctx.updateIssue(issue.id, {hacked_flag: true});
        await ctx.logHackerAttempt(hacker, issue, 2, null);
        await ctx.pause();

        await ctx.updateIssue(issue.id, {status: "testing"});
        await ctx.pause();
        await ctx.updateIssue(issue.id, {status: "security"});
        await ctx.pause();

        ctx.log("→ security rejects: log = caught, hacked_flag cleared");
        await supabase
          .from("hacker_log")
          .update({caught_by_security: true})
          .eq("target_issue_id", issue.id)
          .eq("action_type", "inject")
          .is("caught_by_security", null);
        await ctx.updateIssue(issue.id, {
          hacked_flag: false,
          status: "clarifications",
          clarification_target_role: "developer",
          clarification_target_team: "TEST-CT",
          pre_clarification_status: "security",
        });

        const fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "clarifications", "back to clarifications");
        assert(fresh.hacked_flag === false, "flag cleared");

        const {data: log} = await supabase
          .from("hacker_log")
          .select("*")
          .eq("target_issue_id", issue.id)
          .single();
        assert(log.caught_by_security === true, "logged as caught");
        ctx.log("✓ retro data intact");
      },
    },
    {
      id: "e2e-security-misses",
      name: "E2E: hacker injects, security misses, business rejects in production",
      category: "e2e",
      description:
        "Hacker injects, Security passes (caught_by_security=false), card reaches in_production, Business rejects. Asserts the hacker_log row is preserved with caught_by_security=false (NOT deleted via accept-cascade — v2 keeps cards in 'accepted' rather than deleting). Catches regressions where the FK-null-then-delete dance from v1 was reintroduced.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-MS", "dev");
        const hacker = await ctx.createUser("hacker", "TEST-MS", "hax");

        const issue = await ctx.createIssue(biz, "will-leak", {sprint_created: 2});
        await ctx.updateIssue(issue.id, {team: "TEST-MS", status: "in_progress"});
        const t = await ctx.createTask(issue, dev);
        await ctx.completeTask(t);
        await ctx.pause();

        await ctx.updateIssue(issue.id, {hacked_flag: true});
        await ctx.logHackerAttempt(hacker, issue, 2, null);
        await ctx.pause();

        await ctx.updateIssue(issue.id, {status: "testing"});
        await ctx.pause();
        await ctx.updateIssue(issue.id, {status: "security"});
        await ctx.pause();

        ctx.log("→ security misses (passes)");
        await supabase
          .from("hacker_log")
          .update({caught_by_security: false})
          .eq("target_issue_id", issue.id)
          .eq("action_type", "inject")
          .is("caught_by_security", null);
        await ctx.updateIssue(issue.id, {status: "to_deploy"});
        await ctx.pause();
        await ctx.updateIssue(issue.id, {status: "in_production"});
        await ctx.pause();

        ctx.log("→ business rejects to clarifications; log preserved (issue NOT deleted in v2)");
        await ctx.updateIssue(issue.id, {
          status: "clarifications",
          clarification_target_role: "developer",
          clarification_target_team: "TEST-MS",
          pre_clarification_status: "in_production",
        });
        await ctx.postComment(issue, biz, "Flaw reached production", {
          isRejection: true,
          targetRole: "developer",
          targetTeam: "TEST-MS",
        });

        const {data: log} = await supabase
          .from("hacker_log")
          .select("*")
          .eq("target_issue_id", issue.id)
          .single();
        assert(log.caught_by_security === false, "logged as leaked");
        ctx.log("✓ retro data preserved through rejection");
      },
    },
    {
      id: "e2e-container-blocks-inject",
      name: "E2E: Sprint 3 container blocks inject_flaw (logic)",
      category: "e2e",
      description: "canAct(inject_flaw) must be false when issue.containerized is true.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-CB", "dev");
        await ctx.createUser("hacker", "TEST-CB", "hax");

        const issue = await ctx.createIssue(biz, "container-protected", {sprint_created: 3});
        await ctx.updateIssue(issue.id, {team: "TEST-CB", status: "in_progress", containerized: true});
        await ctx.createTask(issue, dev, {containerized: true});

        const fresh = await ctx.fetchIssue(issue.id);
        const can = window.App.logic.canAct({role: "hacker", team: "TEST-CB"}, null, fresh, "inject_flaw", {
          gameState: {current_sprint: 3},
          tasks: [],
        });
        assert(can === false, "containerized must block inject_flaw");
        ctx.log("✓ rule holds");
      },
    },
    {
      id: "e2e-stop-container",
      name: "E2E: Sprint 3 hacker stops container, sysadmin restarts",
      category: "e2e",
      description:
        "Sprint 3: hacker stops a containerized in_production card (sets stopped=true, logs hacker_log with action_type='stop_container'); SysAdmin restarts (clears stopped); the log row is updated to caught_by_security=true (= 'recovered'). Catches regressions in the v2 stop_container action_type addition.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-SC", "dev");
        const hacker = await ctx.createUser("hacker", "TEST-SC", "hax");
        await ctx.createUser("sysadmin", "TEST-SC", "sa");

        const issue = await ctx.createIssue(biz, "stoppable", {
          sprint_created: 3,
          status: "in_production",
          containerized: true,
          team: "TEST-SC",
        });

        ctx.log("→ hacker stops container");
        await ctx.updateIssue(issue.id, {stopped: true});
        await ctx.logHackerAttempt(hacker, issue, 3, null, "stop_container");

        const stopped = await ctx.fetchIssue(issue.id);
        assert(stopped.stopped === true, "stopped flag set");

        ctx.log("→ sysadmin restarts");
        await ctx.updateIssue(issue.id, {stopped: false});
        await supabase
          .from("hacker_log")
          .update({caught_by_security: true})
          .eq("target_issue_id", issue.id)
          .eq("action_type", "stop_container")
          .is("caught_by_security", null);

        const {data: log} = await supabase
          .from("hacker_log")
          .select("*")
          .eq("target_issue_id", issue.id)
          .eq("action_type", "stop_container")
          .single();
        assert(log.caught_by_security === true, "stop logged as recovered");
      },
    },
    {
      id: "e2e-comment-crud",
      name: "E2E: comment CRUD (post, edit, delete)",
      category: "e2e",
      description:
        "DB-level CRUD on comments: insert, edit (sets edited_at), delete. Confirms the comments table has the right shape and that the basic CRUD round-trip works against the live schema. Does NOT exercise canAct gating — see fe-canact tests for that.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const issue = await ctx.createIssue(biz, "comments");
        const c = await ctx.postComment(issue, biz, "first thought", {});
        const {error: eErr} = await supabase
          .from("comments")
          .update({body: "edited", edited_at: new Date().toISOString()})
          .eq("id", c.id);
        assert(!eErr, "edit");
        const {data: edited} = await supabase.from("comments").select("*").eq("id", c.id).single();
        assert(edited.body === "edited", "body updated");
        assert(edited.edited_at, "edited_at stamped");
        const {error: dErr} = await supabase.from("comments").delete().eq("id", c.id);
        assert(!dErr, "delete");
      },
    },

    // ---------- sprint (mutates real game_state with auto-restore) ----------
    {
      id: "sprint-advance-flow",
      name: "Sprint: advance 1 → 2 → 3 (real game_state, auto-restored)",
      category: "sprint",
      description: "Walks current_sprint through 1→2→3 directly via updateGameState. Snapshots the original value and restores on completion.",
      async run(ctx) {
        await ctx.snapshotGameState();
        await ctx.updateGameState({current_sprint: 1});
        await ctx.pause();
        let gs = await ctx.fetchGameState();
        assert(gs.current_sprint === 1, "S1");

        await ctx.updateGameState({current_sprint: 2});
        await ctx.pause();
        gs = await ctx.fetchGameState();
        assert(gs.current_sprint === 2, "S2");

        await ctx.updateGameState({current_sprint: 3});
        await ctx.pause();
        gs = await ctx.fetchGameState();
        assert(gs.current_sprint === 3, "S3");

        ctx.log("✓ all three sprints reachable; restore will run in finally");
      },
    },
    {
      id: "sprint-flaw-rate-config",
      name: "Sprint: flaw_rate_percent toggle 0 / 25 / 100 reflects in detectFlaw",
      category: "sprint",
      description:
        "Toggles game_state.flaw_rate_percent between 0 and 100, fetches it back, asserts detectFlaw on a clean issue produces the expected output (false at rate=0, true at rate=100). Snapshots and restores game_state.",
      async run(ctx) {
        await ctx.snapshotGameState();
        const issue = {id: 1, hacked_flag: false, flawed: false};
        await ctx.updateGameState({flaw_rate_percent: 0});
        let gs = await ctx.fetchGameState();
        assert(window.App.logic.detectFlaw(issue, gs.flaw_rate_percent).flawed === false, "rate 0 → clean");
        await ctx.updateGameState({flaw_rate_percent: 100});
        gs = await ctx.fetchGameState();
        assert(window.App.logic.detectFlaw(issue, gs.flaw_rate_percent).flawed === true, "rate 100 → flawed");
      },
    },
    {
      id: "sprint-cicd-bypass-flag",
      name: "Sprint: sprint3_cicd_bypass toggle reflected on game_state",
      category: "sprint",
      description:
        "Toggles game_state.sprint3_cicd_bypass off and on, asserts the value round-trips through the DB. Snapshots and restores game_state. Catches schema regressions where the CICD bypass flag column was renamed or its default changed.",
      async run(ctx) {
        await ctx.snapshotGameState();
        await ctx.updateGameState({sprint3_cicd_bypass: false});
        let gs = await ctx.fetchGameState();
        assert(gs.sprint3_cicd_bypass === false, "off");
        await ctx.updateGameState({sprint3_cicd_bypass: true});
        gs = await ctx.fetchGameState();
        assert(gs.sprint3_cicd_bypass === true, "on");
      },
    },

    // ---------- additional edge cases (UX + backend rules) ----------

    {
      id: "e2e-code-freeze-blocks-deploy",
      name: "E2E: code freeze blocks deploy (real handlers)",
      category: "e2e",
      description:
        "Real-handler test of the Code Freeze rule. SysAdmin deploys a card with code_freeze=false: succeeds. SysAdmin then attempts to deploy a card with code_freeze=true: handler must short-circuit on canAct (UI surfaces the 'Code Freeze active' toast), card stays in to_deploy. Catches regressions where the deploy handler skipped the canAct check or the canAct rule forgot to gate on code_freeze.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const sa = await ctx.createUser("sysadmin", "TEST-CF", "sa");

        const issueA = await ctx.createIssue(biz, "freeze-clear", {
          team: "TEST-CF",
          status: "to_deploy",
          code_freeze: false,
        });
        const issueB = await ctx.createIssue(biz, "freeze-on", {
          team: "TEST-CF",
          status: "to_deploy",
          code_freeze: true,
        });

        const saStore = await ctx.makeMockStore({user: sa});
        await window.App.actions.deploy.call(saStore, issueA);
        await ctx.pause();
        let freshA = await ctx.fetchIssue(issueA.id);
        assert(freshA.status === "in_production", "non-frozen deploys cleanly");

        await window.App.actions.deploy.call(saStore, issueB);
        await ctx.pause();
        let freshB = await ctx.fetchIssue(issueB.id);
        assert(freshB.status === "to_deploy", "frozen card MUST stay in to_deploy, got " + freshB.status);
        ctx.log("✓ code freeze enforced");
      },
    },

    {
      id: "e2e-rejection-real-handler",
      name: "E2E: real failTesting → clarifications + rejection comment",
      category: "e2e",
      description:
        "Calls the REAL App.actions.failTesting handler (the schema-flow e2e-rejection-pickup-rework test mirrors what the handler does, but doesn't exercise the handler itself). Asserts the handler updates issue.status, sets clarification_kind='rejection', sets pre_clarification_status='in_progress' (NOT testing), AND posts a comment with is_rejection=true and the right rejection_target_role/team. Catches regressions where the handler forgot to set kind, used the prior status instead of in_progress, or skipped the comment write.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-RR", "dev");
        const tst = await ctx.createUser("tester", "TEST-RR", "tst");
        const issue = await ctx.createIssue(biz, "real-reject", {team: "TEST-RR", status: "testing"});

        const tstStore = await ctx.makeMockStore({user: tst});
        await window.App.actions.failTesting.call(tstStore, issue, "Drawing has no colour at all");
        await ctx.pause();

        const fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "clarifications", "moved to clarifications, got " + fresh.status);
        assert(fresh.clarification_kind === "rejection", "kind=rejection");
        assert(
          fresh.pre_clarification_status === "in_progress",
          "pre MUST be in_progress, got " + fresh.pre_clarification_status,
        );
        assert(fresh.clarification_target_role === "developer", "target=developer");
        assert(fresh.clarification_target_team === "TEST-RR", "target_team=card team");

        const {data: cmts} = await supabase
          .from("comments")
          .select("*")
          .eq("issue_id", issue.id)
          .eq("is_rejection", true);
        assert((cmts || []).length === 1, "exactly one rejection comment, got " + (cmts || []).length);
        assert(cmts[0].body === "Drawing has no colour at all", "rejection body matches");
        assert(cmts[0].rejection_target_role === "developer", "comment target_role=developer");
        assert(cmts[0].rejection_target_team === "TEST-RR", "comment target_team=card team");
      },
    },

    {
      id: "e2e-question-real-handler",
      name: "E2E: real askQuestion + answerQuestion → returns to asker's column",
      category: "e2e",
      description:
        "Calls the REAL askQuestion and answerQuestion handlers. Tester in 'testing' asks Business a question. Asserts handler sets kind='question' and pre_clarification_status='testing' (asker's column, NOT in_progress). Then Business calls answerQuestion with a body. Asserts the card returns to 'testing' (asker's column), kind clears, and the answer comment is posted with is_rejection=false. Also tests rejection paths: empty body, self-targeting, wrong target answering.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const tst = await ctx.createUser("tester", "TEST-QR", "tst");
        const dev = await ctx.createUser("developer", "TEST-QR", "dev");
        const issue = await ctx.createIssue(biz, "real-question", {team: "TEST-QR", status: "testing"});

        // Self-target should be rejected (handler refuses).
        const tstStore = await ctx.makeMockStore({user: tst});
        await window.App.actions.askQuestion.call(tstStore, issue, "tester", "TEST-QR", "self?");
        let fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "testing", "self-target ask must be rejected");

        // Empty body should be rejected.
        await window.App.actions.askQuestion.call(tstStore, issue, "business", null, "   ");
        fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "testing", "empty-body ask must be rejected");

        // Real ask: tester → business with question text.
        await window.App.actions.askQuestion.call(
          tstStore, issue, "business", null,
          "Should the puppy be a real puppy or a cartoon puppy?",
        );
        await ctx.pause();
        fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "clarifications", "moved to clarifications");
        assert(fresh.clarification_kind === "question", "kind=question");
        assert(fresh.clarification_target_role === "business", "target=business");
        assert(fresh.clarification_target_team === null, "business is cross-team (target_team null)");
        assert(fresh.pre_clarification_status === "testing", "pre=testing (asker's column)");

        // Wrong target tries to answer: handler must refuse.
        const devStore = await ctx.makeMockStore({user: dev});
        await window.App.actions.answerQuestion.call(devStore, fresh, "I'm not the target");
        fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "clarifications", "wrong-target answer must be refused");

        // Empty answer body must be rejected.
        const bizStore = await ctx.makeMockStore({user: biz});
        await window.App.actions.answerQuestion.call(bizStore, fresh, "");
        fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "clarifications", "empty answer must be refused");

        // Real answer: business posts reply.
        await window.App.actions.answerQuestion.call(bizStore, fresh, "Cartoon puppy please.");
        await ctx.pause();
        fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "testing", "card returns to asker's column (testing), got " + fresh.status);
        assert(fresh.clarification_kind === null, "kind cleared on answer");
        assert(fresh.clarification_target_role === null, "target cleared on answer");

        const {data: cmts} = await supabase
          .from("comments")
          .select("*")
          .eq("issue_id", issue.id)
          .order("created_at", {ascending: true});
        assert(
          (cmts || []).some((c) => c.body === "Cartoon puppy please." && c.is_rejection === false),
          "answer comment posted with is_rejection=false",
        );
      },
    },

    {
      id: "e2e-sprint-advance-cross-training",
      name: "E2E: advance 1 → 2 assigns cross_trained_role to all eligible users",
      category: "sprint",
      description:
        "Snapshots game_state. Creates 3 developers, 1 tester, 1 security, 1 sysadmin (all on TEST-CT) plus a facilitator-equivalent user that should be EXCLUDED. Calls App.adminActions.advanceSprint to step from 1 to 2. Asserts every eligible user got a cross_trained_role from the round-robin (tester / security / sysadmin), the facilitator-role user did NOT, and cross_trained_team matches each user's primary team. Catches regressions in the cross-training round-robin or the eligibility filter.",
      async run(ctx) {
        await ctx.snapshotGameState();
        await ctx.updateGameState({current_sprint: 1, cross_training_enabled: true});

        const biz = await ctx.createUser("business", null, "biz");
        const d1 = await ctx.createUser("developer", "TEST-CT", "d1");
        const d2 = await ctx.createUser("developer", "TEST-CT", "d2");
        const d3 = await ctx.createUser("developer", "TEST-CT", "d3");
        const t1 = await ctx.createUser("tester", "TEST-CT", "t1");
        const s1 = await ctx.createUser("security", "TEST-CT", "s1");
        const a1 = await ctx.createUser("sysadmin", "TEST-CT", "a1");
        // At least one hacker is required for sprint 1 → 2 advance.
        const h1 = await ctx.createUser("hacker", "TEST-CT", "h1");

        // Use the seeded facilitator (FACIL1) as the actor.
        const {data: facil} = await supabase.from("users").select("*").eq("token", "FACIL1").single();
        const fStore = await ctx.makeMockStore({user: facil});
        await window.App.adminActions.advanceSprint.call(fStore);
        await ctx.pause();

        const tokens = [d1.token, d2.token, d3.token, t1.token, s1.token, a1.token];
        const {data: refreshed} = await supabase.from("users").select("*").in("token", tokens);
        for (const u of refreshed || []) {
          assert(
            u.cross_trained_role && ["tester", "security", "sysadmin", "developer"].includes(u.cross_trained_role),
            u.display_name + " must have cross_trained_role, got " + u.cross_trained_role,
          );
          assert(u.cross_trained_team === "TEST-CT", u.display_name + " cross_trained_team preserved");
        }
        // Hackers (and business, as cross-team) are not cross-trained candidates per assignCrossTraining.
        const {data: hUser} = await supabase.from("users").select("*").eq("token", h1.token).single();
        assert(!hUser.cross_trained_role, "hacker must not be cross-trained");
      },
    },

    {
      id: "e2e-sprint-advance-role-swap-and-clears-freeze",
      name: "E2E: advance 2 → 3 swaps roles + clears code freeze",
      category: "sprint",
      description:
        "Snapshots game_state. Sets sprint=2 with sprint3_role_swap=true and code_freeze_auto_clear=true. Creates a tester and a security user. Creates one TEST issue with code_freeze=true. Advances to sprint 3 via advanceSprint. Asserts: tester role flipped to developer, security flipped to sysadmin, the TEST issue's code_freeze is now false. Catches regressions in the role swap (would break Sprint 3 staffing) or the freeze auto-clear (would carry stale freezes into a new sprint).",
      async run(ctx) {
        await ctx.snapshotGameState();
        await ctx.updateGameState({current_sprint: 2, sprint3_role_swap: true, code_freeze_auto_clear: true});

        const biz = await ctx.createUser("business", null, "biz");
        const t1 = await ctx.createUser("tester", "TEST-RS", "t1");
        const s1 = await ctx.createUser("security", "TEST-RS", "s1");
        const issue = await ctx.createIssue(biz, "frozen", {
          team: "TEST-RS",
          status: "to_deploy",
          code_freeze: true,
        });

        const {data: facil} = await supabase.from("users").select("*").eq("token", "FACIL1").single();
        const fStore = await ctx.makeMockStore({user: facil});
        await window.App.adminActions.advanceSprint.call(fStore);
        await ctx.pause();

        const {data: tFresh} = await supabase.from("users").select("*").eq("token", t1.token).single();
        const {data: sFresh} = await supabase.from("users").select("*").eq("token", s1.token).single();
        assert(tFresh.role === "developer", "tester swapped to developer, got " + tFresh.role);
        assert(sFresh.role === "sysadmin", "security swapped to sysadmin, got " + sFresh.role);

        const iFresh = await ctx.fetchIssue(issue.id);
        assert(iFresh.code_freeze === false, "code freeze auto-cleared on sprint advance");
      },
    },

    {
      id: "e2e-sprint-advance-devalues-non-accepted-only",
      name: "E2E: sprint advance halves price on stale non-accepted, leaves accepted alone",
      category: "sprint",
      description:
        "Tests the v2 devaluation rule on sprint advance: any issue created in a prior sprint that has NOT yet reached 'accepted' has its price halved (technical debt penalty). Issues already in 'accepted' keep their full price. Snapshots game_state, creates two issues (one in_progress sprint=1, one accepted sprint=1), advances to sprint 2, asserts: in_progress price is halved, accepted price unchanged.",
      async run(ctx) {
        await ctx.snapshotGameState();
        await ctx.updateGameState({current_sprint: 1});

        const biz = await ctx.createUser("business", null, "biz");
        await ctx.createUser("hacker", null, "h"); // required for 1→2
        const stale = await ctx.createIssue(biz, "stale", {
          status: "in_progress",
          team: "TEST-DV",
          sprint_created: 1,
          price: 200,
        });
        const done = await ctx.createIssue(biz, "done", {
          status: "accepted",
          team: "TEST-DV",
          sprint_created: 1,
          price: 200,
        });

        const {data: facil} = await supabase.from("users").select("*").eq("token", "FACIL1").single();
        const fStore = await ctx.makeMockStore({user: facil});
        await window.App.adminActions.advanceSprint.call(fStore);
        await ctx.pause();

        const sFresh = await ctx.fetchIssue(stale.id);
        const dFresh = await ctx.fetchIssue(done.id);
        assert(sFresh.price === 100, "stale non-accepted halved 200 → 100, got " + sFresh.price);
        assert(dFresh.price === 200, "accepted price preserved at 200, got " + dFresh.price);
      },
    },

    {
      id: "e2e-comment-moderation-hide-unhide",
      name: "E2E: facilitator hide/unhide soft-deletes a comment",
      category: "e2e",
      description:
        "Posts a comment as a participant via real postComment handler, then calls hideCommentByFacilitator (sets hidden_at to NOW()) and asserts hidden_at is set. Then calls unhideCommentByFacilitator (sets hidden_at=NULL) and asserts it's cleared. Catches regressions where the soft-delete became hard-delete or the unhide became no-op. Hidden comments are filtered out of latestRejectionComment etc., so this also matters for clarification routing.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const issue = await ctx.createIssue(biz, "moderation");

        const bizStore = await ctx.makeMockStore({user: biz});
        await window.App.actions.postComment.call(bizStore, issue, "An indelicate comment");
        await ctx.pause();
        const {data: posted} = await supabase
          .from("comments")
          .select("*")
          .eq("issue_id", issue.id)
          .order("created_at", {ascending: false})
          .limit(1);
        assert((posted || []).length === 1, "comment posted");
        const cId = posted[0].id;

        const {data: facil} = await supabase.from("users").select("*").eq("token", "FACIL1").single();
        const fStore = await ctx.makeMockStore({user: facil});
        await window.App.actions.hideCommentByFacilitator.call(fStore, cId);
        await ctx.pause();
        let {data: hidden} = await supabase.from("comments").select("*").eq("id", cId).single();
        assert(hidden.hidden_at !== null, "hidden_at set after hide");

        await window.App.actions.unhideCommentByFacilitator.call(fStore, cId);
        await ctx.pause();
        const {data: unhidden} = await supabase.from("comments").select("*").eq("id", cId).single();
        assert(unhidden.hidden_at === null, "hidden_at cleared after unhide");
      },
    },

    {
      id: "u-cascade-delete-issue",
      name: "Unit: deleting an issue cascades to tasks + comments + hacker_log + event_log",
      category: "unit",
      description:
        "Verifies the FK cascade declarations in schema.sql. Creates an issue, attaches a task, posts a comment, writes a hacker_log entry, writes an event_log entry. Deletes the issue. Asserts every dependent row is gone (no orphans). Catches regressions where a cascade was changed to RESTRICT or SET NULL silently — which would either block deletion or leak orphan rows.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-CD", "dev");
        const issue = await ctx.createIssue(biz, "cascade", {team: "TEST-CD"});
        const t = await ctx.createTask(issue, dev);
        await ctx.postComment(issue, biz, "x", {});
        await ctx.logHackerAttempt(dev, issue, 1, null, "inject");
        await supabase.from("event_log").insert({actor_token: biz.token, issue_id: issue.id, action: "test_evt", sprint: 1});

        const {error} = await supabase.from("issues").delete().eq("id", issue.id);
        assert(!error, "issue delete: " + (error && error.message));

        for (const tbl of ["tasks", "comments", "hacker_log", "event_log"]) {
          const col = tbl === "tasks" ? "parent_issue_id" : tbl === "hacker_log" ? "target_issue_id" : "issue_id";
          const {count} = await supabase.from(tbl).select("*", {head: true, count: "exact"}).eq(col, issue.id);
          assert(count === 0, tbl + " not cascade-deleted; " + count + " rows orphaned");
        }
        // Track-list cleanup so the harness doesn't try to delete the (already deleted) issue.
        ctx.issues = ctx.issues.filter((i) => i.id !== issue.id);
      },
    },

    {
      id: "u-curated-url-crud",
      name: "Unit: curated_urls insert + delete (admin CRUD)",
      category: "unit",
      description:
        "Admin Settings tab CRUD on curated_urls: facilitator inserts a row (sprint, category, label, url, default_price, default_batch_size), reads it back, deletes it. Catches schema regressions on the curated_urls table (column rename, default change, or seed-only INSERT permission) which would break the Business 'pick a drawing' dropdown.",
      async run(ctx) {
        const payload = {
          sprint: 1,
          category: "TEST-cats",
          label: "TEST: curated drawing",
          url: "https://example.com/test-curated.html",
          default_price: 99,
          default_batch_size: 1,
        };
        const ins = await supabase.from("curated_urls").insert(payload).select().single();
        assert(!ins.error, "curated insert: " + (ins.error && ins.error.message));
        const id = ins.data.id;
        const fetched = await supabase.from("curated_urls").select("*").eq("id", id).single();
        assert(fetched.data.label === "TEST: curated drawing", "label persisted");
        assert(fetched.data.default_price === 99, "default_price persisted");
        const del = await supabase.from("curated_urls").delete().eq("id", id);
        assert(!del.error, "curated delete: " + (del.error && del.error.message));
      },
    },

    {
      id: "fe-canact-comment-everyone",
      name: "Frontend: anyone logged in can add_comment",
      category: "frontend",
      description:
        "Verifies the v2 rule that comment posting is the universal communication channel — every role (business, developer, tester, security, sysadmin, observer) can add_comment on any non-null user, regardless of card status. The only restriction is being logged in. Catches regressions where canAct accidentally restricts commenting.",
      async run(ctx) {
        const canAct = window.App.logic.canAct;
        const gs = {gameState: {current_sprint: 1}, tasks: []};
        const issue = {id: 1, status: "in_progress", team: "A"};
        for (const role of ["business", "developer", "tester", "security", "sysadmin", "observer"]) {
          assert(
            canAct({role, team: "A"}, null, issue, "add_comment", gs) === true,
            role + " must be able to add_comment",
          );
        }
        assert(canAct(null, null, issue, "add_comment", gs) === false, "logged-out cannot comment");
      },
    },

    {
      id: "fe-canact-edit-delete-issue",
      name: "Frontend: edit_issue + delete_issue gating by role and status",
      category: "frontend",
      description:
        "Business owns issue editing and deletion when the card is editable: market state and clarifications-targeting-business state are editable by Business; accepted is NOT (terminal). Other roles cannot edit/delete. Catches regressions where the v2 rule allowing Business edits in clarifications-for-business was forgotten, or where accepted cards became writable.",
      async run(ctx) {
        const canAct = window.App.logic.canAct;
        const gs = {gameState: {current_sprint: 1}, tasks: []};

        const market = {id: 1, status: "market", team: null};
        const accepted = {id: 2, status: "accepted", team: "A"};
        const clarBiz = {
          id: 3, status: "clarifications", clarification_kind: "question",
          clarification_target_role: "business", clarification_target_team: null,
          team: "A",
        };

        assert(canAct({role: "business"}, null, market, "edit_issue", gs) === true, "business edits market");
        assert(canAct({role: "business"}, null, market, "delete_issue", gs) === true, "business deletes market");
        assert(canAct({role: "business"}, null, accepted, "edit_issue", gs) === false, "no edit on accepted");
        assert(canAct({role: "business"}, null, accepted, "delete_issue", gs) === false, "no delete on accepted");
        assert(canAct({role: "business"}, null, clarBiz, "edit_issue", gs) === true, "business edits clarBiz");

        assert(canAct({role: "developer", team: "A"}, null, market, "edit_issue", gs) === false, "dev can't edit");
        assert(canAct({role: "developer", team: "A"}, null, market, "delete_issue", gs) === false, "dev can't delete");
      },
    },

    {
      id: "fe-helpforcard-coverage",
      name: "Frontend: helpForCard returns useful bullets for every status × role bucket",
      category: "frontend",
      description:
        "Smoke test that helpForCard never returns an empty bullet list for combinations participants will actually encounter (own-role × current-status). Catches regressions where a status added to the column order didn't get a help branch, leaving the in-card '?' help button silent.",
      async run(ctx) {
        const help = window.App.logic.helpForCard;
        const cases = [
          ["business", 1, "market"],
          ["developer", 1, "market"],
          ["developer", 1, "in_progress"],
          ["developer", 2, "in_progress"],
          ["tester", 1, "testing"],
          ["security", 1, "security"],
          ["sysadmin", 1, "to_deploy"],
          ["business", 1, "in_production"],
          ["developer", 1, "clarifications"],
          ["business", 1, "accepted"],
        ];
        for (const [role, sprint, status] of cases) {
          const out = help(role, null, sprint, status, {});
          assert(Array.isArray(out.bullets) && out.bullets.length > 0,
            "no help bullets for " + role + " in " + status + " sprint " + sprint);
        }
      },
    },

    {
      id: "fe-clarification-label-formatting",
      name: "Frontend: clarification label formats kind + target consistently",
      category: "frontend",
      description:
        "Verifies the clarificationLabel helper that drives the rose/blue pill on cards in the Clarifications column. Format is '<KIND> → <Role> / <Team>' for team-bound roles, '<KIND> → <Role>' for cross-team (Business). Catches regressions where the pedagogical signal (the visible kind) gets dropped or the team label disappears, which would leave students unable to tell who needs to act.",
      async run(ctx) {
        // Build a minimal store-like object just for label calls.
        const store = Object.assign({}, window.App.storeShape);
        const ROLE_LABELS = window.App.ROLE_LABELS;
        store.roleLabel = (r) => ROLE_LABELS[r] || r;
        store.clarificationKind = window.App.storeShape.clarificationKind || (() => null);
        store.clarificationLabel = window.App.storeShape.clarificationLabel || (() => "");

        const teamRej = {
          status: "clarifications", clarification_kind: "rejection",
          clarification_target_role: "developer", clarification_target_team: "Team A",
        };
        const crossQ = {
          status: "clarifications", clarification_kind: "question",
          clarification_target_role: "business", clarification_target_team: null,
        };
        const labelA = store.clarificationLabel.call(store, teamRej);
        const labelB = store.clarificationLabel.call(store, crossQ);
        ctx.log("  rejection label: " + labelA);
        ctx.log("  question label: " + labelB);
        assert(/REJECTION/.test(labelA) && /Developer/.test(labelA) && /Team A/.test(labelA),
          "rejection label malformed: " + labelA);
        assert(/QUESTION/.test(labelB) && /Business/.test(labelB) && !/Team/.test(labelB),
          "question label malformed: " + labelB);
      },
    },

    // ---------- cleanup ----------
    {
      id: "cleanup",
      name: "Cleanup: delete every TEST-prefixed row",
      category: "cleanup",
      description: "Removes test users, issues, tasks, comments, hacker_log entries, event_log entries, and TEST- teams. Does not touch real session data. The harness also auto-cleans within each test (resources tracked in ctx); this is the catch-all for anything that escaped per-test cleanup.",
      async run(ctx) {
        await deleteAllTestRows((m) => ctx.log(m));
        ctx.log("✓ cleanup done");
      },
    },
  ];

  // ==========================================================
  // Public interface
  // ==========================================================
  window.TEST_HARNESS = {
    tests,
    supabase,
    TestContext,
    sleep,
    constants: {TEST_USER_PREFIX, TEST_ISSUE_PREFIX, TEST_TEAM_PREFIX, TEST_TOKEN_PREFIX, DEFAULT_DELAY_MS},
    deleteAllTestRows,
    async runTest(testId, logFn, delayMs) {
      const t = tests.find((x) => x.id === testId);
      if (!t) throw new Error("unknown test: " + testId);
      const ctx = new TestContext(testId, logFn, delayMs);
      const started = performance.now();
      const startedAt = new Date().toISOString();
      let outcome;
      try {
        await t.run(ctx);
        const ms = Math.round(performance.now() - started);
        logFn("✓ passed in " + ms + " ms");
        outcome = {
          success: true,
          ctx,
          ms,
          testId,
          name: t.name,
          category: t.category,
          startedAt,
          endedAt: new Date().toISOString(),
        };
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        logFn("✗ " + (err.message || err));
        console.error("test failure", testId, err);
        outcome = {
          success: false,
          error: err,
          ctx,
          ms,
          testId,
          name: t.name,
          category: t.category,
          startedAt,
          endedAt: new Date().toISOString(),
        };
      } finally {
        // Auto-restore game_state for any test that snapshotted it.
        if (ctx._gsSnapshot) {
          try {
            await ctx.restoreGameState();
          } catch (e) {
            logFn("⚠ auto-restore game_state failed: " + (e.message || e));
            console.error("game_state restore failed", testId, e);
          }
        }
      }
      return outcome;
    },
  };
})();
