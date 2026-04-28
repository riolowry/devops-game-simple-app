// ============================================================
// app.logic.js: pure functions. No DOM, no Supabase, no Alpine.
// Tests call directly into here. The Alpine store delegates to
// these to avoid duplicating the rules.
// ============================================================
(function () {
  "use strict";
  window.App = window.App || {};

  const HACKER_INJECTABLE_STATUSES = ["in_progress", "testing", "security", "to_deploy"];

  // Statuses that count as "in the active pipeline" for purposes of
  // SysAdmin actions like Code Freeze.
  const PIPELINE_STATUSES = ["in_progress", "testing", "security", "to_deploy"];

  // ============================================================
  // Effective role/team. Facilitator impersonation is the only
  // mechanism that flips the visible role.
  // ============================================================
  function rawEffectiveRole(user, impersonation) {
    if (!user) return null;
    if (user.role === "facilitator" && impersonation && impersonation.role) {
      return impersonation.role;
    }
    return user.role;
  }

  // effectiveRole controls how the user APPEARS to themselves and
  // others: comment authorship, role label in headers, the role used
  // by canAct for non-hacker permissions. For hackers, the cover
  // identity must be their pre-promotion role (stored in
  // hacker_previous_role on the user row by promoteToHacker). If a
  // user was a Tester and gets promoted to hacker, they must continue
  // to display as Tester. Otherwise everyone instantly knows who the
  // hacker is. Falling back to 'developer' only for legacy rows where
  // hacker_previous_role is null (e.g. user manually set role='hacker'
  // via SQL without going through promoteToHacker).
  //
  // For hacker-specific powers (inject_flaw, stop_container) the
  // canAct rules call isHacker() directly against rawEffectiveRole,
  // so masking here doesn't disable hacker mechanics.
  function effectiveRole(user, impersonation) {
    const raw = rawEffectiveRole(user, impersonation);
    if (raw !== "hacker") return raw;
    return (user && user.hacker_previous_role) || "developer";
  }

  function effectiveTeam(user, impersonation) {
    if (!user) return null;
    if (user.role === "facilitator" && impersonation && impersonation.team) {
      return impersonation.team;
    }
    return user.team;
  }

  function isHacker(user, impersonation) {
    return rawEffectiveRole(user, impersonation) === "hacker";
  }

  // Effective role set for permission checks. Returns an array of
  // {role, team} pairs covering the primary role and (when set) the
  // cross-trained role on its team. Hacker injection is handled
  // separately in canAct so it isn't part of this set.
  function effectiveRoleSet(user, impersonation) {
    const out = [];
    if (!user) return out;
    const primary = effectiveRole(user, impersonation);
    const team = effectiveTeam(user, impersonation);
    out.push({role: primary, team: team});
    // Cross-training applies only when the user is acting as their
    // primary role (no impersonation override). For the facilitator
    // impersonating someone, only the impersonated role applies.
    if (user.role !== "facilitator" || !impersonation || !impersonation.role) {
      if (user.cross_trained_role) {
        out.push({role: user.cross_trained_role, team: user.cross_trained_team || team});
      }
    }
    return out;
  }

  // ============================================================
  // Batch progress
  // ============================================================
  function progressFor(issue, tasks) {
    if (!issue) return {done: 0, total: 0, all: 0};
    const ts = (tasks || []).filter((t) => t.parent_issue_id === issue.id);
    const done = ts.filter((t) => t.status === "complete").length;
    return {done, total: issue.batch_size, all: ts.length};
  }

  function batchGateOpen(issue, tasks) {
    if (!issue) return false;
    return progressFor(issue, tasks).done >= issue.batch_size;
  }

  // ============================================================
  // Random flaw detection. Deterministic hash of issue id + rate.
  // Re-running on the same input yields the same result.
  // ============================================================
  function flawForIssueId(id, ratePercent) {
    const n = Number(id);
    if (!Number.isFinite(n)) return false;
    const rate = Math.max(0, Math.min(100, ratePercent || 0));
    if (rate <= 0) return false;
    if (rate >= 100) return true;
    // Knuth multiplicative hash, masked to 32 bits.
    const h = (n * 2654435761) >>> 0;
    return h % 100 < rate;
  }

  // Structured flaw result: returns {flawed, source}, where source
  // is 'random' | 'injected' | 'both' | 'none'.
  function detectFlaw(issue, ratePercent) {
    if (!issue) return {flawed: false, source: "none"};
    const random = flawForIssueId(issue.id, ratePercent != null ? ratePercent : 25) || issue.flawed === true;
    const injected = issue.hacked_flag === true;
    if (random && injected) return {flawed: true, source: "both"};
    if (injected) return {flawed: true, source: "injected"};
    if (random) return {flawed: true, source: "random"};
    return {flawed: false, source: "none"};
  }

  // ============================================================
  // canAct: pure permission check. ctx is { gameState, tasks,
  // securityCheckResult }. issue may be null for actions that
  // do not target an issue (create_issue).
  // Returns true if any role in the user's effective role set
  // grants the action under the given context.
  // ============================================================
  function canAct(user, impersonation, issue, action, ctx) {
    if (!user) return false;
    const team = effectiveTeam(user, impersonation);
    const gs = (ctx && ctx.gameState) || {};
    const sprint = gs.current_sprint || 1;

    // Facilitator-only meta action: anyone in facilitator role can do
    // anything in the admin panel. canAct is for board-level checks,
    // so we don't blanket-allow here; the admin tab visibility is
    // controlled separately in admin.html.

    // Special case: hacker injection. Hacker-ness is a property of
    // the underlying role (user.role === 'hacker' or impersonation
    // role 'hacker'), not part of the effective role set above.
    if (action === "inject_flaw") {
      if (!issue) return false;
      if (!isHacker(user, impersonation)) return false;
      if (sprint < 2) return false;
      if (HACKER_INJECTABLE_STATUSES.indexOf(issue.status) === -1) return false;
      if (issue.hacked_flag) return false;
      if (issue.containerized) return false;
      return true;
    }

    // Stop Container: hacker only, sprint 3+, in production, containerized, not stopped.
    if (action === "stop_container") {
      if (!issue) return false;
      if (!isHacker(user, impersonation)) return false;
      if (sprint < 3) return false;
      if (issue.status !== "in_production") return false;
      if (!issue.containerized) return false;
      if (issue.stopped) return false;
      return true;
    }

    // add_comment: any logged-in user can comment on any card.
    if (action === "add_comment") {
      return !!user;
    }

    // Iterate over the effective role set. Any role that grants the
    // action wins.
    const roles = effectiveRoleSet(user, impersonation);
    for (const r of roles) {
      if (canActByRole(r.role, r.team, issue, action, ctx, gs)) return true;
    }
    return false;
  }

  function canActByRole(role, team, issue, action, ctx, gs) {
    if (!role) return false;

    // Actions that do not require an issue.
    if (action === "create_issue") {
      return role === "business";
    }

    if (!issue) return false;
    const s = issue.status;
    const tasks = (ctx && ctx.tasks) || [];
    const scr = ctx && ctx.securityCheckResult;
    const sprint = gs.current_sprint || 1;

    // Code Freeze blocks deploy unconditionally.
    if (action === "deploy") {
      return role === "sysadmin" && s === "to_deploy" && !issue.code_freeze;
    }

    switch (action) {
      case "claim":
        return role === "developer" && s === "market" && !issue.team;

      case "edit_issue":
        // Business can edit market-stage cards and clarification cards
        // they need to respond to.
        return role === "business" && (s === "market" || s === "clarifications");

      case "delete_issue":
        // Business may delete a card while it is still in market and
        // unclaimed (no team yet, no tasks).
        return role === "business" && s === "market" && !issue.team && (tasks || []).length === 0;

      case "add_task":
        return role === "developer" && s === "in_progress" && !!issue.team && issue.team === team;

      case "delete_task":
      case "edit_task":
      case "replace_task_image":
        // Team-scoped: any developer on the issue's team while the
        // parent issue is in_progress. Not assignee-scoped: the
        // team owns its tasks collectively, so any team dev can
        // recover from a teammate's mistake. Task status (claimed
        // vs complete) is intentionally not part of this rule.
        //
        // Note: edit_task is wired into the permission table for
        // forward compatibility (sprint 3 containerized-flag toggle
        // per the original spec) but has no UI caller yet. Safe to
        // ignore until that UI is built; remove this note once it
        // is.
        return role === "developer" && s === "in_progress" && !!issue.team && issue.team === team;

      case "send_to_testing":
        return role === "developer" && s === "in_progress" && issue.team === team && batchGateOpen(issue, tasks);

      case "pass_testing":
      case "fail_testing":
        return role === "tester" && s === "testing";

      case "run_security":
        return role === "security" && s === "security";

      case "pass_security":
      case "reject_security":
        return role === "security" && s === "security" && !!scr && scr.issue_id === issue.id;

      case "accept_production":
      case "reject_production":
        return role === "business" && s === "in_production";

      case "pickup_clarification": {
        // Rejection rework only. Question answers go through
        // 'answer_question' below. We gate on clarification_kind so
        // the UI never shows the wrong button: if the kind is
        // 'question' the dev would otherwise be tempted to one-click
        // pickup without writing an answer body.
        if (s !== "clarifications") return false;
        if (issue.clarification_kind && issue.clarification_kind !== "rejection") return false;
        const tgtRole = issue.clarification_target_role;
        const tgtTeam = issue.clarification_target_team;
        if (tgtRole && tgtRole !== role) return false;
        if (tgtTeam && tgtTeam !== team) return false;
        return true;
      }

      case "answer_question": {
        // The targeted role/team writes a reply. The card returns to
        // the asker's column on submit.
        if (s !== "clarifications") return false;
        if (issue.clarification_kind !== "question") return false;
        const tgtRole = issue.clarification_target_role;
        const tgtTeam = issue.clarification_target_team;
        if (tgtRole && tgtRole !== role) return false;
        if (tgtTeam && tgtTeam !== team) return false;
        return true;
      }

      case "ask_question": {
        // Anyone working a card can ask a question of any other role
        // on the team (or of a cross-team role like Business). The
        // card moves to Clarifications targeting the chosen role; on
        // answer it returns to the asker's column.
        //
        // Allowed states: any pipeline state (in_progress through
        // in_production), market (Business asks Dev rarely), and
        // clarifications-where-current-user-is-the-rejection-target
        // (so a dev being asked to rework can flip the card into a
        // question targeting the rejecter for clarification).
        if (s === "accepted") return false;
        if (s === "clarifications") {
          // Can re-target only if the current user is the rejection
          // target (i.e., they are the dev being asked to rework).
          if (issue.clarification_kind !== "rejection") return false;
          const tgtRole = issue.clarification_target_role;
          const tgtTeam = issue.clarification_target_team;
          if (tgtRole && tgtRole !== role) return false;
          if (tgtTeam && tgtTeam !== team) return false;
          return true;
        }
        // Observer is read-only; hacker's secret identity must not be
        // exposed via authored questions.
        if (role === "observer" || role === "hacker") return false;
        return true;
      }

      case "toggle_code_freeze":
        return role === "sysadmin" && PIPELINE_STATUSES.indexOf(s) !== -1;

      case "restart_container":
        return role === "sysadmin" && issue.stopped === true;

      case "shift_left_check":
        // Sprint 2+ only. Devs and testers on the issue's team.
        if (sprint < 2) return false;
        if (role !== "developer" && role !== "tester") return false;
        if (s === "market" || s === "in_production" || s === "accepted") return false;
        // Team scope: only on issues belonging to this user's team.
        return !!issue.team && issue.team === team;

      default:
        return false;
    }
  }

  // ============================================================
  // Cross-training assignment. Deterministic round-robin within
  // each primary-role group. Sources for each primary:
  //   developer -> [tester, security, sysadmin]
  //   tester    -> [developer, security, sysadmin]
  //   security  -> [developer, tester, sysadmin]
  //   sysadmin  -> [developer, tester, security]
  // Returns an array of patches: [{token, cross_trained_role,
  // cross_trained_team}, ...]. cross_trained_team is the user's own
  // team (cross-training is within-team to avoid team chaos).
  // ============================================================
  function assignCrossTraining(users) {
    const POOLS = {
      developer: ["tester", "security", "sysadmin"],
      tester: ["developer", "security", "sysadmin"],
      security: ["developer", "tester", "sysadmin"],
      sysadmin: ["developer", "tester", "security"],
    };
    const eligible = (users || []).filter((u) => POOLS[u.role]);
    // Group by primary role; sort each group by created_at then token
    // for determinism.
    const groups = {};
    for (const u of eligible) {
      groups[u.role] = groups[u.role] || [];
      groups[u.role].push(u);
    }
    Object.keys(groups).forEach((r) => {
      groups[r].sort((a, b) => {
        const ca = a.created_at || "";
        const cb = b.created_at || "";
        if (ca < cb) return -1;
        if (ca > cb) return 1;
        return (a.token || "").localeCompare(b.token || "");
      });
    });
    const patches = [];
    Object.keys(groups).forEach((role) => {
      const pool = POOLS[role];
      groups[role].forEach((u, i) => {
        const cr = pool[i % pool.length];
        patches.push({
          token: u.token,
          cross_trained_role: cr,
          cross_trained_team: u.team || null,
        });
      });
    });
    return patches;
  }

  // ============================================================
  // Help system. Returns {title, bullets[], links[]} based on the
  // viewer's state and the card's state. Used by the per-card '?'
  // icon and the main Help modal.
  // ============================================================
  function helpForCard(role, crossTrainedRole, sprint, status, flags) {
    flags = flags || {};
    const bullets = [];
    const links = [];
    let title = "What can I do here?";

    if (status === "market") {
      if (role === "business") {
        bullets.push("You can edit or delete this card while it is in Market.");
        bullets.push("Add an Acceptance Criteria so the Developer knows the goal.");
      } else if (role === "developer") {
        bullets.push("Click Claim to start work on this card. It moves to In Progress.");
      } else {
        bullets.push("This card is waiting for a Developer to claim it.");
      }
    } else if (status === "clarifications") {
      // Two distinct flows live in this column. The kind tells us which.
      if (flags.clarificationKind === "question") {
        if (flags.canAnswer) {
          bullets.push("Someone has a question for you on this card.");
          bullets.push("Read the question above, then click Send response with your answer.");
          bullets.push("The card will return to the asker's column when you submit.");
        } else {
          bullets.push("Someone asked a question on this card; the targeted role/team is composing an answer.");
          bullets.push("You can post additional comments while you wait.");
        }
      } else {
        // Rejection (default for legacy/null kind)
        if (flags.canPickup) {
          bullets.push("This card was rejected. Read the rejection reason at the top.");
          bullets.push("Click Pick up for rework. The card returns to In Progress so you can fix it.");
          bullets.push("If the rejection reason is unclear, click Ask Question to ask the rejecter for clarification.");
        } else {
          bullets.push("This card was rejected. The dev on the targeted team will pick it up to fix it.");
          bullets.push("You can post additional comments while you wait.");
        }
      }
    } else if (status === "in_progress") {
      if (role === "developer") {
        bullets.push("Add a task per item in the batch. Upload your image when each is done.");
        bullets.push("Once every task is complete, click Send to Testing.");
        bullets.push("Stuck on what Business or Tester want? Click Ask Question.");
      }
      if (sprint >= 2 && (role === "developer" || role === "tester")) {
        bullets.push("Optional: Run shift-left security check before sending to Testing.");
      }
    } else if (status === "testing") {
      if (role === "tester") {
        bullets.push("Compare each task image to the description. Pass or fail.");
        bullets.push("Need to ask the dev or business something? Click Ask Question.");
      } else {
        bullets.push("Tester is reviewing the deliverables.");
      }
    } else if (status === "security") {
      if (role === "security") {
        bullets.push("Run the security check. Pass to send to deployment, or reject for rework.");
        bullets.push("Need to ask the dev or business something? Click Ask Question.");
      } else {
        bullets.push("Security is reviewing for flaws.");
      }
    } else if (status === "to_deploy") {
      if (role === "sysadmin") {
        bullets.push("Click Deploy to ship to production.");
        if (flags.codeFreeze) bullets.push("Code Freeze is on. Deploy is blocked until the freeze clears.");
        bullets.push("Need clarification on deployment? Click Ask Question.");
      } else if (role === "hacker" && sprint >= 2 && !flags.containerized) {
        bullets.push("You can inject a flaw on this card before it ships.");
      }
    } else if (status === "in_production") {
      if (role === "business") {
        bullets.push("Compare against your Acceptance Criteria. Accept or reject.");
        bullets.push("Need clarification before deciding? Click Ask Question.");
      }
      if (role === "hacker" && sprint >= 3 && flags.containerized) {
        bullets.push("You can stop this container to disrupt production.");
      }
      if (role === "sysadmin" && flags.stopped) bullets.push("Restart this stopped container to resume service.");
    } else if (status === "accepted") {
      bullets.push("This card has been accepted. Anyone can still post comments here.");
    }

    if (crossTrainedRole) {
      bullets.push("You are cross-trained as " + crossTrainedRole + ". You can also act in that role on this card.");
    }
    bullets.push("Anyone may post a comment on any card.");

    return {title, bullets, links};
  }

  // Latest non-hidden rejection comment for an issue.
  function latestRejectionComment(issue, comments) {
    if (!issue || !comments) return null;
    const filtered = comments
      .filter((c) => c.issue_id === issue.id && c.is_rejection && !c.hidden_at)
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return filtered[0] || null;
  }

  // Sprint advance side-effect plan. Returns a structured plan that
  // app.actions.js consumes; logic is centralized here so tests can
  // pin its behaviour without touching the DB. The plan covers:
  //   1. devaluation of older-sprint, non-accepted issues (price/2)
  //   2. role swap (sprint 2 -> 3 only): testers->developers,
  //      security->sysadmin
  //   3. code-freeze auto-clear
  //   4. cross-training assignment (sprint 1 -> 2 only)
  function sprintAdvancePlan(currentSprint, nextSprint, gameState, users, issues) {
    const plan = {
      devaluations: [],
      roleSwaps: [],
      codeFreezeClears: [],
      crossTraining: [],
      next: nextSprint,
    };
    if (!gameState) gameState = {};

    // 1. Devaluation: every non-accepted issue from a strictly
    // earlier sprint has price halved (rounded down).
    (issues || []).forEach((i) => {
      if (i.status === "accepted") return;
      if ((i.sprint_created || 1) >= nextSprint) return;
      const newPrice = Math.max(0, Math.floor((i.price || 0) / 2));
      if (newPrice !== i.price) plan.devaluations.push({id: i.id, price: newPrice});
    });

    // 2. Role swap on advance from 2 to 3.
    if (currentSprint === 2 && nextSprint === 3 && gameState.sprint3_role_swap) {
      (users || []).forEach((u) => {
        if (u.role === "tester") {
          plan.roleSwaps.push({token: u.token, role: "developer", hacker_previous_role: u.hacker_previous_role});
        } else if (u.role === "security") {
          plan.roleSwaps.push({token: u.token, role: "sysadmin", hacker_previous_role: u.hacker_previous_role});
        }
      });
    }

    // 3. Code-freeze auto-clear.
    if (gameState.code_freeze_auto_clear) {
      (issues || []).forEach((i) => {
        if (i.code_freeze) plan.codeFreezeClears.push(i.id);
      });
    }

    // 4. Cross-training assignment on advance from 1 to 2.
    if (currentSprint === 1 && nextSprint === 2 && gameState.cross_training_enabled) {
      plan.crossTraining = assignCrossTraining(users || []);
    }

    return plan;
  }

  // ============================================================
  // Expose
  // ============================================================
  window.App.logic = {
    rawEffectiveRole,
    effectiveRole,
    effectiveTeam,
    isHacker,
    effectiveRoleSet,
    progressFor,
    batchGateOpen,
    flawForIssueId,
    detectFlaw,
    canAct,
    canActByRole,
    assignCrossTraining,
    helpForCard,
    latestRejectionComment,
    sprintAdvancePlan,
    PIPELINE_STATUSES,
  };
})();
