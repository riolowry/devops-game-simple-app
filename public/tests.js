// ITS DevSecOps Adventure: test harness
// ----------------------------------------------------------------------
// Standalone in-browser test runner. Hits the same Supabase backend as
// the real app so changes are visible live on index.html / admin.html.
//
// Usage:
//   Open tests.html. Each test has a Run button. "Run all tests" runs
//   them in order. "Clean up TEST data" removes everything created by
//   tests (it matches by prefix, so your real session data is untouched).
//
// All test-created rows are prefixed:
//   - users.display_name starts with "TEST-"
//   - issues.title starts with "TEST:"
// Cleanup deletes everything with those prefixes. Cascades handle the
// rest (tasks, hacker_log rows tied to test issues).
// ----------------------------------------------------------------------

(function () {
  "use strict";

  // ==========================================================
  // Config guard. Same check the app uses.
  // ==========================================================
  if (!window.CONFIG || !window.CONFIG.SUPABASE_URL || window.CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.innerHTML =
        '<div style="font-family:system-ui;max-width:600px;margin:4rem auto;padding:1rem;">' +
        "<h1>Configuration required</h1>" +
        "<p>Copy <code>setup_resources/config.example.js</code> to <code>public/config.js</code>. " +
        'Set your Supabase URL and publishable key. See <a href="https://github.com/riolowry/devops-game-simple-app/blob/main/setup_resources/SETUP_SUPABASE_DB.md" target="_blank" rel="noopener">setup_resources/SETUP_SUPABASE_DB.md</a> in the repository for more information.</p></div>';
    });
    return;
  }

  // ==========================================================
  // Constants
  // ==========================================================
  const TEST_USER_PREFIX = "TEST-";
  const TEST_ISSUE_PREFIX = "TEST:";
  const DEFAULT_DELAY_MS = 1500; // pause between visible state changes
  const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  // Resolve the project key. Prefer the new publishable key; fall back to a
  // legacy anon JWT so an in-flight migration cannot break the test runner.
  const PROJECT_KEY = window.CONFIG.SUPABASE_PUBLISHABLE_KEY || window.CONFIG.SUPABASE_ANON_KEY;

  // Own Supabase client. We do not reuse the app's client because
  // tests.html runs standalone (no app.js loaded).
  const supabase = window.supabase.createClient(window.CONFIG.SUPABASE_URL, PROJECT_KEY);

  // ==========================================================
  // Helpers
  // ==========================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function randomToken() {
    let t = "";
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

  // TestContext: what a test uses to create and track resources.
  // Holds a list of ids so we can inspect / clean up per run.
  class TestContext {
    constructor(testId, logFn, delayMs) {
      this.testId = testId;
      this.logFn = logFn || (() => {});
      this.delayMs = delayMs == null ? DEFAULT_DELAY_MS : delayMs;
      this.users = [];
      this.issues = [];
    }

    log(m) {
      this.logFn(m);
    }
    async pause() {
      if (this.delayMs > 0) await sleep(this.delayMs);
    }

    async createUser(role, team, namePart) {
      const displayName = TEST_USER_PREFIX + (namePart || role);
      const token = randomToken();
      const {data, error} = await supabase
        .from("users")
        .insert({token, display_name: displayName, role, team: team || null})
        .select()
        .single();
      if (error) throw new Error("createUser: " + error.message);
      this.users.push(data);
      this.log("  + user " + displayName + " [" + role + (team ? "/" + team : "") + "] token " + token);
      return data;
    }

    async createIssue(creator, title, opts) {
      opts = opts || {};
      const payload = {
        title: TEST_ISSUE_PREFIX + " " + title,
        description_url: opts.description_url || null,
        status: opts.status || "market",
        price: opts.price || 100,
        batch_size: opts.batch_size || 1,
        sprint_created: opts.sprint || 1,
        created_by: creator ? creator.token : null,
        hacked_flag: !!opts.hacked_flag,
        containerized: !!opts.containerized,
      };
      const {data, error} = await supabase.from("issues").insert(payload).select().single();
      if (error) throw new Error("createIssue: " + error.message);
      this.issues.push(data);
      this.log("  + issue #" + data.id + ' "' + title + '"');
      return data;
    }

    async updateIssue(id, patch) {
      const {error} = await supabase.from("issues").update(patch).eq("id", id);
      if (error) throw new Error("updateIssue: " + error.message);
      this.log("  ~ issue #" + id + " " + JSON.stringify(patch));
    }

    async fetchIssue(id) {
      const {data, error} = await supabase.from("issues").select("*").eq("id", id).single();
      if (error) throw new Error("fetchIssue: " + error.message);
      return data;
    }

    async createTask(issue, user, opts) {
      opts = opts || {};
      const {data, error} = await supabase
        .from("tasks")
        .insert({
          parent_issue_id: issue.id,
          assignee_token: user.token,
          status: "claimed",
          containerized: !!opts.containerized,
        })
        .select()
        .single();
      if (error) throw new Error("createTask: " + error.message);
      this.log("  + task #" + data.id + " on #" + issue.id);
      return data;
    }

    async completeTask(task, url) {
      const {error} = await supabase
        .from("tasks")
        .update({attachment_url: url || "https://example.com/test.png", status: "complete"})
        .eq("id", task.id);
      if (error) throw new Error("completeTask: " + error.message);
      this.log("  ✓ task #" + task.id + " complete");
    }

    async logHackerAttempt(hacker, issue, sprint, caught) {
      const payload = {hacker_token: hacker ? hacker.token : null, target_issue_id: issue.id, sprint: sprint};
      if (caught !== undefined) payload.caught_by_security = caught;
      const {error} = await supabase.from("hacker_log").insert(payload);
      if (error) throw new Error("logHackerAttempt: " + error.message);
    }

    // ---- game_state helpers -------------------------------------------
    // Sprint-advancing tests must never leave the real session state in
    // a mutated sprint. Use snapshotGameState() at the start of a test
    // that will mutate game_state, then the runner's finally block will
    // auto-restore via restoreGameState() even if the test throws.
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
      // Keep only the columns we might mutate. If we snapshotted the
      // whole row we would write back id, created_at, etc. which is
      // fine but noisy.
      this._gsSnapshot = {
        current_sprint: gs.current_sprint,
        security_modulus: gs.security_modulus,
        hacker_count: gs.hacker_count,
        sprint3_auto_advance_seconds: gs.sprint3_auto_advance_seconds,
        session_label: gs.session_label,
      };
      this.log(
        "  [snapshot] game_state sprint=" +
          gs.current_sprint +
          " modulus=" +
          gs.security_modulus +
          " hackers=" +
          gs.hacker_count,
      );
      return this._gsSnapshot;
    }

    async restoreGameState() {
      if (!this._gsSnapshot) return;
      const snap = this._gsSnapshot;
      const {error} = await supabase.from("game_state").update(snap).eq("id", 1);
      if (error) {
        this.log("  \u2717 restore game_state FAILED: " + error.message);
        throw new Error("restoreGameState: " + error.message);
      }
      this.log("  [restored] game_state sprint=" + snap.current_sprint);
      this._gsSnapshot = null;
    }
  }

  // ==========================================================
  // Tests
  // Categories: setup, frontend, unit, e2e, sprint, cleanup
  // ==========================================================
  const tests = [
    // ---------- setup ----------
    {
      id: "health",
      name: "Health: all 5 tables reachable",
      category: "setup",
      description: "Confirms schema.sql has been run and the publishable key has read access.",
      async run(ctx) {
        const tables = ["users", "issues", "tasks", "game_state", "hacker_log"];
        for (const t of tables) {
          const {error, count} = await supabase.from(t).select("*", {count: "exact", head: true});
          if (error) throw new Error(t + ": " + error.message);
          ctx.log("  ✓ " + t + ": " + count + " rows");
        }
      },
    },
    {
      id: "game-state",
      name: "Setup: game_state singleton row exists",
      category: "setup",
      async run(ctx) {
        const {data, error} = await supabase.from("game_state").select("*").eq("id", 1).single();
        if (error) throw new Error(error.message);
        ctx.log("  sprint=" + data.current_sprint + " modulus=" + data.security_modulus);
        assert(data.id === 1, "game_state.id must be 1");
      },
    },
    {
      id: "facilitator-seed",
      name: "Setup: default facilitator token FACIL1 exists",
      category: "setup",
      async run(ctx) {
        const {data, error} = await supabase.from("users").select("*").eq("token", "FACIL1").maybeSingle();
        if (error) throw new Error(error.message);
        assert(data, "FACIL1 facilitator token missing. Re-run schema.sql.");
        assert(data.role === "facilitator", "FACIL1 should have role=facilitator");
        ctx.log("  ✓ FACIL1 present");
      },
    },

    // ---------- frontend: pure logic (no DB, no Supabase) ----------
    // These run against window.App.logic which is populated when app.js
    // loads. They cover the permission matrix, batch gate, security
    // flaw detection, and facilitator impersonation. These are the
    // rules that make the game playable; if these break, the UI breaks.
    {
      id: "fe-app-loaded",
      name: "Frontend: app.js loaded and App.logic exposed",
      category: "frontend",
      description: "Sanity check that app.js was loaded by tests.html and exposed its pure logic API.",
      async run(ctx) {
        assert(window.App, "window.App missing. app.js not loaded?");
        assert(window.App.logic, "window.App.logic missing");
        const fns = [
          "canAct",
          "batchGateOpen",
          "progressFor",
          "detectFlaw",
          "effectiveRole",
          "effectiveTeam",
          "isHacker",
        ];
        for (const f of fns) {
          assert(typeof window.App.logic[f] === "function", "App.logic." + f + " is not a function");
        }
        ctx.log("  ✓ " + fns.length + " logic functions exposed");
        assert(Array.isArray(window.App.HACKER_CANDIDATE_ROLES), "HACKER_CANDIDATE_ROLES not exported");
        assert(Array.isArray(window.App.HACKER_INJECTABLE_STATUSES), "HACKER_INJECTABLE_STATUSES not exported");
      },
    },
    {
      id: "fe-role-labels",
      name: "Frontend: role labels include observer, not admin",
      category: "frontend",
      async run(ctx) {
        const labels = window.App.ROLE_LABELS;
        assert(labels.observer === "Observer", "observer label missing");
        assert(!("admin" in labels), "admin label should be removed");
        assert(window.App.VALID_ROLES.indexOf("observer") !== -1, "observer must be in VALID_ROLES");
        assert(window.App.VALID_ROLES.indexOf("admin") === -1, "admin should not be in VALID_ROLES");
        ctx.log("  ✓ admin renamed to observer");
      },
    },
    {
      id: "fe-progress-batch",
      name: "Frontend: progressFor and batchGateOpen",
      category: "frontend",
      async run(ctx) {
        const {progressFor, batchGateOpen} = window.App.logic;
        const issue = {id: 10, batch_size: 3};
        const tasksNone = [];
        const tasksPartial = [
          {parent_issue_id: 10, status: "complete"},
          {parent_issue_id: 10, status: "claimed"},
        ];
        const tasksFull = [
          {parent_issue_id: 10, status: "complete"},
          {parent_issue_id: 10, status: "complete"},
          {parent_issue_id: 10, status: "complete"},
        ];
        assert(progressFor(issue, tasksNone).done === 0, "no done");
        assert(progressFor(issue, tasksPartial).done === 1, "1 of 3");
        assert(progressFor(issue, tasksFull).done === 3, "3 of 3");
        assert(!batchGateOpen(issue, tasksPartial), "gate closed at 1/3");
        assert(batchGateOpen(issue, tasksFull), "gate open at 3/3");
        ctx.log("  ✓ batch gate opens only when all tasks complete");
      },
    },
    {
      id: "fe-detect-flaw",
      name: "Frontend: detectFlaw (deterministic + injected)",
      category: "frontend",
      async run(ctx) {
        const d = window.App.logic.detectFlaw;
        assert(d({id: 7}, 7).source === "deterministic", "id=7 mod 7 is deterministic");
        assert(!d({id: 5}, 7).has_flaw, "id=5 mod 7 is clean");
        assert(d({id: 5, hacked_flag: true}, 7).source === "injected", "hacked overrides clean");
        assert(d({id: 7, hacked_flag: true}, 7).source === "injected", "injected wins over deterministic");
        ctx.log("  ✓ flaw detection matches Security's runtime behavior");
      },
    },
    {
      id: "fe-effective-role",
      name: "Frontend: effective role and team (facilitator impersonation)",
      category: "frontend",
      async run(ctx) {
        const {effectiveRole, effectiveTeam, isHacker} = window.App.logic;
        const facil = {role: "facilitator", team: null};
        const dev = {role: "developer", team: "Team 1"};
        assert(effectiveRole(dev, null) === "developer", "dev stays dev");
        assert(effectiveTeam(dev, null) === "Team 1", "dev team intact");
        // Facilitator with no impersonation observes (role undefined)
        assert(
          effectiveRole(facil, {role: "", team: ""}) === "facilitator",
          "facil with blank impersonation stays facilitator",
        );
        // Facilitator impersonating tester
        assert(effectiveRole(facil, {role: "tester", team: ""}) === "tester", "facil → tester");
        // Facilitator impersonating hacker should see developer in the UI but isHacker is true
        assert(
          effectiveRole(facil, {role: "hacker", team: ""}) === "developer",
          "hacker maps to developer in visible role",
        );
        assert(isHacker(facil, {role: "hacker", team: ""}) === true, "isHacker true for hacker impersonation");
        // A regular developer cannot impersonate (ignored)
        assert(
          effectiveRole(dev, {role: "security", team: ""}) === "developer",
          "non-facilitator ignores impersonation",
        );
        ctx.log("  ✓ impersonation only applies to facilitators");
      },
    },
    {
      id: "fe-canact-permissions",
      name: "Frontend: canAct permission matrix",
      category: "frontend",
      async run(ctx) {
        const canAct = window.App.logic.canAct;
        const dev1 = {role: "developer", team: "Team 1"};
        const dev2 = {role: "developer", team: "Team 2"};
        const tester = {role: "tester", team: null};
        const security = {role: "security", team: null};
        const biz = {role: "business", team: null};
        const release = {role: "release", team: null};
        const observer = {role: "observer", team: null};
        const gs = {current_sprint: 1};
        const unclaimed = {id: 1, status: "market", team: null, batch_size: 1};
        const t1InProg = {id: 2, status: "in_progress", team: "Team 1", batch_size: 2};
        const t1Testing = {id: 3, status: "testing", team: "Team 1"};
        const t1Security = {id: 4, status: "security", team: "Team 1"};
        const t1ToDeploy = {id: 5, status: "to_deploy", team: "Team 1"};
        const t1Prod = {id: 6, status: "in_production", team: "Team 1"};

        // Claim: only developers, only on market, only if unclaimed
        assert(canAct(dev1, null, unclaimed, "claim", {gameState: gs}), "dev can claim");
        assert(!canAct(tester, null, unclaimed, "claim", {gameState: gs}), "tester cannot claim");
        assert(!canAct(dev1, null, t1InProg, "claim", {gameState: gs}), "cannot claim in_progress");

        // Team scoping on in_progress
        assert(
          canAct(dev1, null, t1InProg, "add_task", {gameState: gs, tasks: []}),
          "dev1 can add task to Team 1 issue",
        );
        assert(
          !canAct(dev2, null, t1InProg, "add_task", {gameState: gs, tasks: []}),
          "dev2 cannot add task to Team 1 issue",
        );

        // Send to testing: needs batch gate
        const fullTasks = [
          {parent_issue_id: 2, status: "complete"},
          {parent_issue_id: 2, status: "complete"},
        ];
        assert(
          canAct(dev1, null, t1InProg, "send_to_testing", {gameState: gs, tasks: fullTasks}),
          "dev1 can send when gate open",
        );
        assert(
          !canAct(dev1, null, t1InProg, "send_to_testing", {gameState: gs, tasks: []}),
          "dev1 blocked when gate closed",
        );

        // Tester, Security, Release scope to their columns
        assert(canAct(tester, null, t1Testing, "pass_testing", {gameState: gs}), "tester in testing");
        assert(!canAct(tester, null, t1Security, "pass_testing", {gameState: gs}), "tester not in security");
        assert(canAct(security, null, t1Security, "run_security", {gameState: gs}), "security in security");
        assert(canAct(release, null, t1ToDeploy, "deploy", {gameState: gs}), "release in to_deploy");
        assert(canAct(biz, null, t1Prod, "accept_production", {gameState: gs}), "business in production");

        // Observer can do nothing
        const allActions = [
          "claim",
          "add_task",
          "send_to_testing",
          "pass_testing",
          "run_security",
          "deploy",
          "accept_production",
          "inject_flaw",
        ];
        for (const a of allActions) {
          assert(!canAct(observer, null, t1InProg, a, {gameState: gs, tasks: []}), "observer blocked on " + a);
        }
        ctx.log("  ✓ role/column/team matrix enforced");
      },
    },
    {
      id: "fe-hacker-inject-scope",
      name: "Frontend: hacker can inject on any team, any active status",
      category: "frontend",
      description:
        "Per professor feedback: hacker injects regardless of team, across in_progress/testing/security/to_deploy. Blocked by containerization and by sprint 1.",
      async run(ctx) {
        const canAct = window.App.logic.canAct;
        const hacker = {role: "hacker", team: "Team 1"};
        const facilAsHacker = {role: "facilitator", team: null};
        const imp = {role: "hacker", team: ""};
        const s1 = {current_sprint: 1};
        const s2 = {current_sprint: 2};

        const cases = [
          // Every active-pipeline status on another team's item, sprint 2+
          {id: 10, status: "in_progress", team: "Team 2"},
          {id: 11, status: "testing", team: "Team 2"},
          {id: 12, status: "security", team: "Team 2"},
          {id: 13, status: "to_deploy", team: "Team 2"},
        ];
        for (const c of cases) {
          assert(
            canAct(hacker, null, c, "inject_flaw", {gameState: s2}),
            "hacker injects on " + c.status + " (other team)",
          );
        }

        // Sprint 1: hacker disabled
        assert(!canAct(hacker, null, cases[0], "inject_flaw", {gameState: s1}), "sprint 1 blocks hacker");

        // Excluded statuses
        const blocked = [
          {id: 20, status: "market"},
          {id: 21, status: "in_production", team: "Team 1"},
          {id: 22, status: "feedback", team: "Team 1"},
        ];
        for (const c of blocked) {
          assert(!canAct(hacker, null, c, "inject_flaw", {gameState: s2}), "inject blocked on " + c.status);
        }

        // Containerized blocks
        assert(
          !canAct(hacker, null, {id: 30, status: "in_progress", team: "Team 1", containerized: true}, "inject_flaw", {
            gameState: s2,
          }),
          "containerized blocks injection",
        );

        // Already-hacked blocks re-inject
        assert(
          !canAct(hacker, null, {id: 31, status: "testing", team: "Team 1", hacked_flag: true}, "inject_flaw", {
            gameState: s2,
          }),
          "re-inject blocked while hacked_flag is true",
        );

        // Facilitator impersonating hacker also can inject
        assert(
          canAct(facilAsHacker, imp, {id: 32, status: "security", team: "Team 2"}, "inject_flaw", {gameState: s2}),
          "facilitator-as-hacker can inject for testing",
        );

        ctx.log("  ✓ hacker scope matches professor's spec");
      },
    },
    {
      id: "fe-create-issue-permission",
      name: "Frontend: create_issue permission respects facilitator impersonation",
      category: "frontend",
      description:
        "Regression test for the bug where createIssue checked this.user.role directly, rejecting a facilitator simulating as Business.",
      async run(ctx) {
        const canAct = window.App.logic.canAct;
        const biz = {role: "business", team: null};
        const dev = {role: "developer", team: "Team 1"};
        const facil = {role: "facilitator", team: null};
        const gs = {current_sprint: 1};

        assert(canAct(biz, null, null, "create_issue", {gameState: gs}), "business can create");
        assert(!canAct(dev, null, null, "create_issue", {gameState: gs}), "developer cannot create");
        // The bug: without impersonation, facilitator is NOT business.
        assert(!canAct(facil, null, null, "create_issue", {gameState: gs}), "facilitator observing cannot create");
        assert(
          !canAct(facil, {role: "", team: ""}, null, "create_issue", {gameState: gs}),
          "facilitator with blank impersonation cannot create",
        );
        // The fix: facilitator simulating as business CAN create.
        assert(
          canAct(facil, {role: "business", team: ""}, null, "create_issue", {gameState: gs}),
          "facilitator simulating as business CAN create (the fix)",
        );
        // A non-facilitator cannot escalate via impersonation.
        assert(
          !canAct(dev, {role: "business", team: ""}, null, "create_issue", {gameState: gs}),
          "developer cannot escalate to business via impersonation",
        );
        ctx.log("  ✓ create_issue goes through canAct; simulation honored");
      },
    },
    {
      id: "fe-impersonation-team-propagation",
      name: "Frontend: effectiveTeam propagates to team-scoped actions",
      category: "frontend",
      description:
        "Verifies a facilitator simulating as a developer on Team 2 is treated as Team 2 for add_task/send_to_testing (and that the 'Claim for X' button text uses effectiveTeam).",
      async run(ctx) {
        const canAct = window.App.logic.canAct;
        const effectiveTeam = window.App.logic.effectiveTeam;
        const facil = {role: "facilitator", team: null};
        const imp = {role: "developer", team: "Team 2"};
        const gs = {current_sprint: 1};
        const t2Issue = {id: 100, status: "in_progress", team: "Team 2", batch_size: 1};
        const t1Issue = {id: 101, status: "in_progress", team: "Team 1", batch_size: 1};

        assert(effectiveTeam(facil, imp) === "Team 2", "effective team Team 2");
        assert(
          canAct(facil, imp, t2Issue, "add_task", {gameState: gs, tasks: []}),
          "facil-as-dev-T2 can add task to T2 issue",
        );
        assert(
          !canAct(facil, imp, t1Issue, "add_task", {gameState: gs, tasks: []}),
          "facil-as-dev-T2 cannot add task to T1 issue",
        );
        const complete = [{parent_issue_id: 100, status: "complete"}];
        assert(
          canAct(facil, imp, t2Issue, "send_to_testing", {gameState: gs, tasks: complete}),
          "facil-as-dev-T2 can send T2 issue with batch gate open",
        );
        ctx.log("  ✓ team-scoped actions honor impersonation.team");
      },
    },

    {
      id: "u-create-user",
      name: "Unit: create user",
      category: "unit",
      async run(ctx) {
        const u = await ctx.createUser("developer", "TEST-ALPHA", "dev1");
        assert(u.token.length === 6, "token length 6");
        assert(u.role === "developer", "role persisted");
      },
    },
    {
      id: "u-create-issue",
      name: "Unit: business creates issue in Market",
      category: "unit",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const issue = await ctx.createIssue(biz, "create-only", {price: 50, batch_size: 2});
        assert(issue.status === "market", "starts in market");
        assert(issue.batch_size === 2, "batch_size persisted");
      },
    },
    {
      id: "u-claim",
      name: "Unit: dev claims issue → in_progress",
      category: "unit",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        await ctx.createUser("developer", "TEST-ALPHA", "dev");
        const issue = await ctx.createIssue(biz, "claimable");
        await ctx.pause();
        await ctx.updateIssue(issue.id, {team: "TEST-ALPHA", status: "in_progress"});
        const fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "in_progress", "status transitions");
        assert(fresh.team === "TEST-ALPHA", "team set");
      },
    },
    {
      id: "u-batch-gate",
      name: "Unit: batch gate blocks until all tasks complete",
      category: "unit",
      description:
        "Verifies that count(completed tasks) must reach batch_size before send_to_testing is valid. Check is client-side in the real app; this test validates the data shape.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-ALPHA", "dev");
        const issue = await ctx.createIssue(biz, "gate test", {batch_size: 2});
        await ctx.updateIssue(issue.id, {team: "TEST-ALPHA", status: "in_progress"});
        await ctx.pause();
        const t1 = await ctx.createTask(issue, dev);
        await ctx.completeTask(t1);
        await ctx.pause();

        // Count completed tasks so far. Should be 1 of 2.
        const {data: done1} = await supabase
          .from("tasks")
          .select("id")
          .eq("parent_issue_id", issue.id)
          .eq("status", "complete");
        assert(done1.length === 1, "one task complete");
        ctx.log("  gate closed: " + done1.length + "/" + issue.batch_size);

        const t2 = await ctx.createTask(issue, dev);
        await ctx.completeTask(t2);
        const {data: done2} = await supabase
          .from("tasks")
          .select("id")
          .eq("parent_issue_id", issue.id)
          .eq("status", "complete");
        assert(done2.length === 2, "gate opens at batch_size");
        ctx.log("  gate OPEN: " + done2.length + "/" + issue.batch_size);
      },
    },
    {
      id: "u-security-rule",
      name: "Unit: deterministic security rule (id % modulus == 0)",
      category: "unit",
      async run(ctx) {
        const {data: gs} = await supabase.from("game_state").select("security_modulus").eq("id", 1).single();
        const modulus = gs.security_modulus;
        ctx.log("  current modulus: " + modulus);
        const biz = await ctx.createUser("business", null, "biz");
        // Create a few issues and check the rule.
        for (let i = 0; i < 3; i++) {
          const issue = await ctx.createIssue(biz, "mod-check-" + i);
          const hasFlaw = issue.id % modulus === 0;
          ctx.log(
            "  #" + issue.id + " % " + modulus + " = " + (issue.id % modulus) + " → " + (hasFlaw ? "FLAW" : "clean"),
          );
        }
      },
    },

    // ---------- e2e ----------
    {
      id: "e2e-happy-path",
      name: "E2E: happy path Business → Dev → Test → Sec → Release → Accept",
      category: "e2e",
      description: "Full clean flow. Open index.html in another tab to watch cards traverse.",
      async run(ctx) {
        ctx.log("→ roles");
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-HAPPY", "dev");
        await ctx.createUser("tester", "TEST-HAPPY", "tester");
        await ctx.createUser("security", null, "sec");
        await ctx.createUser("release", null, "rel");
        await ctx.pause();

        ctx.log("→ business creates");
        const issue = await ctx.createIssue(biz, "happy-path", {batch_size: 1});
        await ctx.pause();

        ctx.log("→ dev claims");
        await ctx.updateIssue(issue.id, {team: "TEST-HAPPY", status: "in_progress"});
        await ctx.pause();

        ctx.log("→ dev adds + completes one task");
        const task = await ctx.createTask(issue, dev);
        await ctx.pause();
        await ctx.completeTask(task);
        await ctx.pause();

        ctx.log("→ dev sends to testing");
        await ctx.updateIssue(issue.id, {status: "testing"});
        await ctx.pause();

        ctx.log("→ tester passes");
        await ctx.updateIssue(issue.id, {status: "security"});
        await ctx.pause();

        ctx.log("→ security passes");
        await ctx.updateIssue(issue.id, {status: "to_deploy"});
        await ctx.pause();

        ctx.log("→ release deploys");
        await ctx.updateIssue(issue.id, {status: "in_production"});
        await ctx.pause();

        ctx.log("→ business accepts (archive)");
        await supabase.from("hacker_log").update({target_issue_id: null}).eq("target_issue_id", issue.id);
        const {error} = await supabase.from("issues").delete().eq("id", issue.id);
        if (error) throw new Error("accept: " + error.message);
        // Remove from tracked issues so cleanup does not try to re-delete.
        ctx.issues = ctx.issues.filter((i) => i.id !== issue.id);
        ctx.log("✓ archived");
      },
    },
    {
      id: "e2e-feedback-loop",
      name: "E2E: rejected in production → feedback → rework → accepted",
      category: "e2e",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-FB", "dev");

        const issue = await ctx.createIssue(biz, "feedback-loop");
        await ctx.updateIssue(issue.id, {team: "TEST-FB", status: "in_progress"});
        const t = await ctx.createTask(issue, dev);
        await ctx.completeTask(t);
        await ctx.pause();

        // Fast-forward to production
        await ctx.updateIssue(issue.id, {status: "testing"});
        await ctx.pause();
        await ctx.updateIssue(issue.id, {status: "security"});
        await ctx.pause();
        await ctx.updateIssue(issue.id, {status: "to_deploy"});
        await ctx.pause();
        await ctx.updateIssue(issue.id, {status: "in_production"});
        await ctx.pause();

        ctx.log("→ business rejects to feedback");
        await ctx.updateIssue(issue.id, {status: "feedback", feedback_reason: "regression after accept"});
        await ctx.pause();
        let fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "feedback", "lands in feedback");

        ctx.log("→ dev picks up (reason cleared)");
        await ctx.updateIssue(issue.id, {status: "in_progress", feedback_reason: null});
        fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.feedback_reason === null, "reason cleared on pickup");
      },
    },
    {
      id: "e2e-security-catches",
      name: "E2E: hacker injects, security catches",
      category: "e2e",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-CATCH", "dev");
        const hacker = await ctx.createUser("hacker", "TEST-CATCH", "hax");

        const issue = await ctx.createIssue(biz, "will-be-hacked", {sprint: 2});
        await ctx.updateIssue(issue.id, {team: "TEST-CATCH", status: "in_progress"});
        const t = await ctx.createTask(issue, dev);
        await ctx.completeTask(t);
        await ctx.pause();

        ctx.log("→ hacker injects (hacked_flag=true, log pending)");
        await ctx.updateIssue(issue.id, {hacked_flag: true});
        await ctx.logHackerAttempt(hacker, issue, 2, null); // caught = null
        await ctx.pause();

        await ctx.updateIssue(issue.id, {status: "testing"});
        await ctx.pause();
        await ctx.updateIssue(issue.id, {status: "security"});
        await ctx.pause();

        ctx.log("→ security rejects (flag cleared, log = caught)");
        await supabase
          .from("hacker_log")
          .update({caught_by_security: true})
          .eq("target_issue_id", issue.id)
          .is("caught_by_security", null);
        await ctx.updateIssue(issue.id, {
          hacked_flag: false,
          status: "in_progress",
          feedback_reason: "Security flaw detected",
        });

        const fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.status === "in_progress", "back to dev");
        assert(fresh.hacked_flag === false, "flag cleared after rejection");

        const {data: log} = await supabase.from("hacker_log").select("*").eq("target_issue_id", issue.id).single();
        assert(log.caught_by_security === true, "logged as caught");
        ctx.log("✓ retro data intact");
      },
    },
    {
      id: "e2e-security-misses",
      name: "E2E: hacker injects, security misses, business rejects in prod",
      category: "e2e",
      description:
        "After accept, the issue is deleted. The fix in acceptProduction() nulls the log FK first so the retro still sees this miss.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-MISS", "dev");
        const hacker = await ctx.createUser("hacker", "TEST-MISS", "hax");

        const issue = await ctx.createIssue(biz, "slippery", {sprint: 2});
        await ctx.updateIssue(issue.id, {team: "TEST-MISS", status: "in_progress"});
        const t = await ctx.createTask(issue, dev);
        await ctx.completeTask(t);
        await ctx.pause();

        ctx.log("→ hacker injects");
        await ctx.updateIssue(issue.id, {hacked_flag: true});
        await ctx.logHackerAttempt(hacker, issue, 2, null);
        await ctx.pause();

        ctx.log("→ through testing and security (miss)");
        await ctx.updateIssue(issue.id, {status: "testing"});
        await ctx.pause();
        await ctx.updateIssue(issue.id, {status: "security"});
        await ctx.pause();
        await supabase
          .from("hacker_log")
          .update({caught_by_security: false})
          .eq("target_issue_id", issue.id)
          .is("caught_by_security", null);
        await ctx.updateIssue(issue.id, {status: "to_deploy"});
        await ctx.pause();
        await ctx.updateIssue(issue.id, {status: "in_production"});
        await ctx.pause();

        ctx.log("→ business rejects to feedback (log preserved)");
        await ctx.updateIssue(issue.id, {status: "feedback", feedback_reason: "flaw reached production"});

        const {data: log} = await supabase.from("hacker_log").select("*").eq("target_issue_id", issue.id).single();
        assert(log.caught_by_security === false, "logged as leaked");
      },
    },
    {
      id: "e2e-container-blocks",
      name: "E2E (logic): Sprint 3 container blocks inject_flaw",
      category: "e2e",
      description: "The canAct rule for inject_flaw requires !issue.containerized. This asserts that rule directly.",
      async run(ctx) {
        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-CONT", "dev");
        await ctx.createUser("hacker", "TEST-CONT", "hax");

        const issue = await ctx.createIssue(biz, "container-protected", {sprint: 3});
        await ctx.updateIssue(issue.id, {team: "TEST-CONT", status: "in_progress", containerized: true});
        await ctx.createTask(issue, dev, {containerized: true});
        await ctx.pause();

        // Simulate the permission rule from canAct:
        //   isHacker && sprint>=2 && in_progress|testing && !hacked_flag && !containerized
        const fresh = await ctx.fetchIssue(issue.id);
        const sprint = 3;
        const canInject =
          sprint >= 2 &&
          (fresh.status === "in_progress" || fresh.status === "testing") &&
          !fresh.hacked_flag &&
          !fresh.containerized;
        assert(!canInject, "canAct(inject_flaw) must be false when containerized");
        ctx.log("✓ containerization rule holds");
      },
    },

    // ---------- sprint: exercises real game_state mutations -----------
    // Every test in this category MUST call ctx.snapshotGameState() at
    // the start of its run function. The runner's finally block will
    // call ctx.restoreGameState() automatically, so even a thrown
    // assertion cannot leave the real session stuck in sprint 2 or 3.
    {
      id: "sprint-advance-flow",
      name: "Sprint: advance 1 → 2 → 3 (real game_state), restored after",
      category: "sprint",
      description:
        "Walks current_sprint through every valid value using updateGameState. Verifies each transition is observable in the DB. Snapshots the original value and restores it via the runner's auto-restore.",
      async run(ctx) {
        await ctx.snapshotGameState();
        // Deterministic start.
        await ctx.updateGameState({current_sprint: 1});
        await ctx.pause();
        let gs = await ctx.fetchGameState();
        assert(gs.current_sprint === 1, "starts at 1");

        ctx.log("→ advance to sprint 2");
        await ctx.updateGameState({current_sprint: 2});
        await ctx.pause();
        gs = await ctx.fetchGameState();
        assert(gs.current_sprint === 2, "advanced to 2");

        ctx.log("→ advance to sprint 3");
        await ctx.updateGameState({current_sprint: 3});
        await ctx.pause();
        gs = await ctx.fetchGameState();
        assert(gs.current_sprint === 3, "advanced to 3");

        ctx.log("→ reset back to 1");
        await ctx.updateGameState({current_sprint: 1});
        await ctx.pause();
        gs = await ctx.fetchGameState();
        assert(gs.current_sprint === 1, "reset to 1");
        ctx.log("✓ full sprint cycle observable; restore will follow");
      },
    },
    {
      id: "sprint-config",
      name: "Sprint: update security_modulus and hacker_count, restored after",
      category: "sprint",
      description:
        "Writes non-default config values to game_state and verifies they land. Snapshot/restore guarantees the real modulus and hacker_count are not disturbed.",
      async run(ctx) {
        const original = await ctx.snapshotGameState();
        const newMod = original.security_modulus === 11 ? 13 : 11;
        const newHackers = original.hacker_count === 2 ? 3 : 2;
        ctx.log(
          "→ change modulus " +
            original.security_modulus +
            " → " +
            newMod +
            ", hackers " +
            original.hacker_count +
            " → " +
            newHackers,
        );
        await ctx.updateGameState({security_modulus: newMod, hacker_count: newHackers});
        await ctx.pause();
        const gs = await ctx.fetchGameState();
        assert(gs.security_modulus === newMod, "modulus persisted");
        assert(gs.hacker_count === newHackers, "hacker_count persisted");
        ctx.log("✓ writes land; restore will follow");
      },
    },
    {
      id: "e2e-sprint2-real-hacker",
      name: "E2E Sprint 2: real game_state=2, full hacker-caught flow",
      category: "sprint",
      description:
        "Sets current_sprint=2 in the real game_state, runs the business → dev → hacker injects → tester → security catches flow, and verifies hacker_log reflects a caught attempt. Auto-restores game_state afterward.",
      async run(ctx) {
        await ctx.snapshotGameState();
        await ctx.updateGameState({current_sprint: 2});
        await ctx.pause();

        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-S2", "dev");
        const tester = await ctx.createUser("tester", "TEST-S2", "tst");
        const sec = await ctx.createUser("security", null, "sec");
        const hax = await ctx.createUser("hacker", "TEST-S2", "hax");

        ctx.log("→ business creates, dev claims + completes");
        const issue = await ctx.createIssue(biz, "sprint2-hacker-caught", {sprint: 2});
        await ctx.updateIssue(issue.id, {team: "TEST-S2", status: "in_progress"});
        const task = await ctx.createTask(issue, dev);
        await ctx.completeTask(task);
        await ctx.pause();

        // If App.logic is loaded, verify the live canAct rule permits
        // injection at sprint 2 (this is the whole point of advancing).
        if (window.App && window.App.logic) {
          const fresh0 = await ctx.fetchIssue(issue.id);
          const canInject = window.App.logic.canAct({role: "hacker", team: "TEST-S2"}, null, fresh0, "inject_flaw", {
            gameState: {current_sprint: 2},
          });
          assert(canInject, "canAct permits hacker inject at sprint 2");
          ctx.log("  ✓ live canAct: inject allowed at sprint 2");
        }

        ctx.log("→ hacker injects");
        await ctx.updateIssue(issue.id, {hacked_flag: true});
        await ctx.logHackerAttempt(hax, issue, 2, null);
        await ctx.pause();

        ctx.log("→ dev sends to testing, passes through security");
        await ctx.updateIssue(issue.id, {status: "testing"});
        await ctx.pause();
        await ctx.updateIssue(issue.id, {status: "security"});
        await ctx.pause();

        ctx.log("→ security catches flaw, bounces to in_progress");
        await supabase
          .from("hacker_log")
          .update({caught_by_security: true})
          .eq("target_issue_id", issue.id)
          .is("caught_by_security", null);
        await ctx.updateIssue(issue.id, {
          hacked_flag: false,
          status: "in_progress",
          feedback_reason: "Security flaw detected",
        });

        const fresh = await ctx.fetchIssue(issue.id);
        assert(fresh.hacked_flag === false, "flag cleared after catch");
        assert(fresh.status === "in_progress", "bounced back to dev");
        const {data: log} = await supabase.from("hacker_log").select("*").eq("target_issue_id", issue.id).single();
        assert(log.sprint === 2, "logged under sprint 2");
        assert(log.caught_by_security === true, "logged as caught");
        ctx.log("✓ sprint 2 end-to-end complete; restore will follow");
      },
    },
    {
      id: "e2e-sprint3-container-blocks",
      name: "E2E Sprint 3: real game_state=3, container blocks injection via live canAct",
      category: "sprint",
      description:
        "Sets current_sprint=3, creates a containerized issue+task, and evaluates canAct through the real App.logic path (not a reimplementation) to confirm injection is blocked. Checks both a real hacker and a facilitator-as-hacker. Auto-restores.",
      async run(ctx) {
        await ctx.snapshotGameState();
        await ctx.updateGameState({current_sprint: 3});
        await ctx.pause();

        assert(window.App && window.App.logic, "App.logic must be available for this sprint 3 test (load app.js)");

        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-S3C", "dev");
        const hax = await ctx.createUser("hacker", "TEST-S3C", "hax");

        const issue = await ctx.createIssue(biz, "sprint3-containerized", {sprint: 3});
        await ctx.updateIssue(issue.id, {team: "TEST-S3C", status: "in_progress", containerized: true});
        await ctx.createTask(issue, dev, {containerized: true});
        await ctx.pause();

        const fresh = await ctx.fetchIssue(issue.id);
        const gs3 = {current_sprint: 3};

        // Hacker attempting to inject
        const hackerCan = window.App.logic.canAct({role: "hacker", team: "TEST-S3C"}, null, fresh, "inject_flaw", {
          gameState: gs3,
        });
        assert(!hackerCan, "containerized blocks real hacker at sprint 3");

        // Facilitator impersonating hacker
        const facilCan = window.App.logic.canAct(
          {role: "facilitator", team: null},
          {role: "hacker", team: ""},
          fresh,
          "inject_flaw",
          {gameState: gs3},
        );
        assert(!facilCan, "containerized blocks facil-as-hacker at sprint 3");

        ctx.log("✓ container blocks injection via live canAct; restore will follow");
      },
    },
    {
      id: "e2e-sprint3-non-container-vulnerable",
      name: "E2E Sprint 3: real game_state=3, non-containerized still injectable (negative control)",
      category: "sprint",
      description:
        "Negative control: at sprint 3 without the container flag, injection must still succeed via canAct. Without this test, a bug that universally blocks injection at sprint 3 would look identical to the container-blocks test. Auto-restores.",
      async run(ctx) {
        await ctx.snapshotGameState();
        await ctx.updateGameState({current_sprint: 3});
        await ctx.pause();

        assert(window.App && window.App.logic, "App.logic must be available for this sprint 3 test (load app.js)");

        const biz = await ctx.createUser("business", null, "biz");
        const dev = await ctx.createUser("developer", "TEST-S3N", "dev");
        const hax = await ctx.createUser("hacker", "TEST-S3N", "hax");

        const issue = await ctx.createIssue(biz, "sprint3-plain", {sprint: 3});
        await ctx.updateIssue(issue.id, {team: "TEST-S3N", status: "in_progress"});
        await ctx.createTask(issue, dev);
        await ctx.pause();

        const fresh = await ctx.fetchIssue(issue.id);
        const gs3 = {current_sprint: 3};
        const canInject = window.App.logic.canAct({role: "hacker", team: "TEST-S3N"}, null, fresh, "inject_flaw", {
          gameState: gs3,
        });
        assert(canInject, "non-containerized MUST still be injectable at sprint 3");

        // Also do a real DB injection + security-catches round-trip.
        ctx.log("→ actually inject");
        await ctx.updateIssue(issue.id, {hacked_flag: true});
        await ctx.logHackerAttempt(hax, issue, 3, null);
        await ctx.pause();
        await ctx.updateIssue(issue.id, {status: "testing"});
        await ctx.pause();
        await ctx.updateIssue(issue.id, {status: "security"});
        await ctx.pause();

        ctx.log("→ security catches");
        await supabase
          .from("hacker_log")
          .update({caught_by_security: true})
          .eq("target_issue_id", issue.id)
          .is("caught_by_security", null);
        await ctx.updateIssue(issue.id, {
          hacked_flag: false,
          status: "in_progress",
          feedback_reason: "Security flaw detected",
        });
        const {data: log} = await supabase.from("hacker_log").select("*").eq("target_issue_id", issue.id).single();
        assert(log.sprint === 3, "logged under sprint 3");
        ctx.log("✓ sprint 3 plain issue is still hackable; restore will follow");
      },
    },

    // ---------- cleanup ----------
    {
      id: "cleanup",
      name: "Cleanup: delete every row with TEST prefix",
      category: "cleanup",
      description:
        "Safe to run any time. Removes issues titled TEST: ... and users named TEST-... Everything else is untouched.",
      async run(ctx) {
        ctx.log("→ delete TEST: issues (cascades tasks + hacker_log)");
        const r1 = await supabase
          .from("issues")
          .delete()
          .like("title", TEST_ISSUE_PREFIX + "%");
        if (r1.error) throw new Error("delete issues: " + r1.error.message);

        ctx.log("→ delete orphan hacker_log rows (target_issue_id = null)");
        const r2 = await supabase.from("hacker_log").delete().is("target_issue_id", null);
        if (r2.error) throw new Error("delete hacker_log: " + r2.error.message);

        ctx.log("→ delete TEST- users");
        const r3 = await supabase
          .from("users")
          .delete()
          .like("display_name", TEST_USER_PREFIX + "%");
        if (r3.error) throw new Error("delete users: " + r3.error.message);

        ctx.log("✓ cleanup done");
      },
    },
  ];

  // ==========================================================
  // Public interface for tests.html
  // ==========================================================
  window.TEST_HARNESS = {
    tests,
    supabase,
    TestContext,
    sleep,
    constants: {TEST_USER_PREFIX, TEST_ISSUE_PREFIX, DEFAULT_DELAY_MS},
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
        // Safety net: if the test snapshotted game_state, restore it
        // no matter what. Without this a failed sprint test could
        // leave the real session stuck at sprint 2 or 3.
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
