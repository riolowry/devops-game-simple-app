// ============================================================
// app.admin.js: admin-only actions (user CRUD, team CRUD, sprint
// advance with side effects, settings save, curated URL CRUD,
// reset, export). Mixed into the Alpine store on admin.html via
// app.boot.js.
// ============================================================
(function () {
  "use strict";
  window.App = window.App || {};
  const supabase = window.App.supabase;
  if (!supabase) return;

  const VALID_ROLES = window.App.VALID_ROLES;
  const STORAGE_BUCKET = window.App.STORAGE_BUCKET;
  const CURATED_URL_DEFAULTS = window.App.CURATED_URL_DEFAULTS;
  const logic = window.App.logic;
  const randomToken = window.App.randomToken;

  window.App.adminActions = {
    // -------- USERS --------
    async createUser({display_name, role, team}) {
      const normalizedRole = (role || "").toString().toLowerCase().trim();
      if (!VALID_ROLES.includes(normalizedRole)) {
        this.toast('Invalid role "' + role + '". Must be one of: ' + VALID_ROLES.join(", "));
        return null;
      }
      const token = randomToken();
      const {error} = await supabase.from("users").insert({
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
      const normalized = (rows || []).map((r) => ({
        display_name: (r.display_name || "").toString().trim() || null,
        role: (r.role || "developer").toString().toLowerCase().trim(),
        team: (r.team || "").toString().trim() || null,
      }));
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

    async updateUser(token, patch) {
      // Whitelist editable fields. Role changes are validated.
      const safe = {};
      ["display_name", "team", "cross_trained_role", "cross_trained_team"].forEach((k) => {
        if (Object.prototype.hasOwnProperty.call(patch, k)) safe[k] = patch[k];
      });
      if (Object.prototype.hasOwnProperty.call(patch, "role")) {
        const r = (patch.role || "").toString().toLowerCase().trim();
        if (!VALID_ROLES.includes(r)) {
          this.toast("Invalid role: " + r);
          return;
        }
        safe.role = r;
      }
      const {error} = await supabase.from("users").update(safe).eq("token", token);
      if (error) {
        console.error("updateUser:", error);
        this.toast("Update failed: " + error.message);
      }
    },

    async deleteUser(token) {
      const {error} = await supabase.from("users").delete().eq("token", token);
      if (error) {
        console.error("deleteUser:", error);
        this.toast("Delete failed: " + error.message);
      }
    },

    async promoteToHacker(token) {
      // Read fresh from the DB rather than this.users, which may be
      // stale: between any prior write to this user (a previous
      // promote-then-demote, or even just the user's creation) and
      // this call, realtime may not have round-tripped yet. In the
      // test harness there's no realtime at all. The decision below
      // depends on the user's current role; read it authoritatively.
      const {data: target, error: fetchErr} = await supabase
        .from("users")
        .select("*")
        .eq("token", token)
        .single();
      if (fetchErr || !target) {
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
        .update({role: "hacker", hacker_previous_role: target.role})
        .eq("token", token);
      if (error) {
        console.error(error);
        this.toast("Promote failed: " + error.message);
        return;
      }
      this.toast("Promoted to hacker (was " + target.role + ").");
    },

    async demoteHacker(token) {
      // Read fresh from the DB rather than this.users (see comment on
      // promoteToHacker). The bug this prevents: a fast
      // promote-then-demote sees the PRE-promote cached row in the
      // local store, where hacker_previous_role is null. The fallback
      // then demotes the user to 'developer' instead of restoring
      // their actual prior role, silently breaking hacker cover for
      // every cycle until realtime catches up.
      const {data: target, error: fetchErr} = await supabase
        .from("users")
        .select("*")
        .eq("token", token)
        .single();
      if (fetchErr || !target) {
        this.toast("User not found.");
        return;
      }
      if (target.role !== "hacker") {
        // Defensive: refuse rather than silently changing a non-hacker's
        // role. Should be unreachable from the UI (button only shown
        // for hackers) but worth catching if reached programmatically.
        this.toast("User is not currently a hacker.");
        return;
      }
      const restoreRole = target.hacker_previous_role || "developer";
      const {error} = await supabase
        .from("users")
        .update({role: restoreRole, hacker_previous_role: null})
        .eq("token", token);
      if (error) {
        console.error(error);
        this.toast("Demote failed: " + error.message);
        return;
      }
      this.toast("Demoted to " + restoreRole + ".");
    },

    // -------- TEAMS --------
    async createTeam(name) {
      const n = (name || "").toString().trim();
      if (!n) return;
      const {error} = await supabase.from("teams").insert({name: n});
      if (error) {
        console.error("createTeam:", error);
        this.toast("Create team failed: " + error.message);
      }
    },

    async renameTeam(oldName, newName) {
      const n = (newName || "").toString().trim();
      if (!n || n === oldName) return;
      // Update teams row.
      const r1 = await supabase.from("teams").update({name: n}).eq("name", oldName);
      if (r1.error) {
        console.error("renameTeam team:", r1.error);
        this.toast("Rename failed: " + r1.error.message);
        return;
      }
      // Cascade rename through users.team and issues.team.
      await supabase.from("users").update({team: n}).eq("team", oldName);
      await supabase.from("issues").update({team: n}).eq("team", oldName);
      await supabase.from("users").update({cross_trained_team: n}).eq("cross_trained_team", oldName);
      this.toast("Renamed team.");
    },

    async deleteTeam(name) {
      // Detach users and issues first; we don't want a team delete to
      // silently orphan rows.
      await supabase.from("users").update({team: null}).eq("team", name);
      await supabase.from("issues").update({team: null}).eq("team", name);
      await supabase.from("users").update({cross_trained_team: null}).eq("cross_trained_team", name);
      const {error} = await supabase.from("teams").delete().eq("name", name);
      if (error) {
        console.error("deleteTeam:", error);
        this.toast("Delete team failed: " + error.message);
      }
    },

    // -------- GAME STATE / SPRINT --------
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
      const cur = this.gameState.current_sprint;
      const next = Math.min(3, cur + 1);
      if (next === cur) return;
      // Sprint 1 -> 2 requires at least one active hacker.
      if (cur === 1 && next === 2) {
        const hackers = this.users.filter((u) => u.role === "hacker");
        if (hackers.length === 0) {
          this.toast("Promote at least one hacker before advancing to Sprint 2.");
          return;
        }
      }
      const plan = logic.sprintAdvancePlan(cur, next, this.gameState, this.users, this.issues);
      // Apply in order: devaluations -> code_freeze clears -> role swap -> cross-training.
      for (const dv of plan.devaluations) {
        await supabase.from("issues").update({price: dv.price}).eq("id", dv.id);
      }
      if (plan.codeFreezeClears.length > 0) {
        await supabase.from("issues").update({code_freeze: false}).in("id", plan.codeFreezeClears);
      }
      for (const sw of plan.roleSwaps) {
        await supabase.from("users").update({role: sw.role}).eq("token", sw.token);
      }
      for (const ct of plan.crossTraining) {
        await supabase
          .from("users")
          .update({cross_trained_role: ct.cross_trained_role, cross_trained_team: ct.cross_trained_team})
          .eq("token", ct.token);
      }
      await this.updateGameState({current_sprint: next});
    },

    async resetSprint() {
      // Reset to Sprint 1 clears cross-training fields and code freezes.
      await supabase
        .from("users")
        .update({cross_trained_role: null, cross_trained_team: null})
        .neq("token", "NONE_MATCHES");
      await supabase.from("issues").update({code_freeze: false, stopped: false}).neq("id", 0);
      await this.updateGameState({current_sprint: 1});
    },

    async reassignCrossTraining() {
      const patches = logic.assignCrossTraining(this.users || []);
      for (const p of patches) {
        await supabase
          .from("users")
          .update({cross_trained_role: p.cross_trained_role, cross_trained_team: p.cross_trained_team})
          .eq("token", p.token);
      }
      this.toast("Cross-training re-assigned.");
    },

    // -------- CURATED URLS --------
    async createCuratedUrl(row) {
      const safe = {
        sprint: parseInt(row.sprint) || 1,
        category: (row.category || "").toString().trim(),
        label: (row.label || "").toString().trim(),
        url: (row.url || "").toString().trim(),
        default_batch_size: parseInt(row.default_batch_size) || 1,
        default_price: parseInt(row.default_price) || 50,
        display_order: parseInt(row.display_order) || 0,
        active: row.active !== false,
      };
      if (!safe.category || !safe.label || !safe.url) {
        this.toast("Category, label, and URL are required.");
        return;
      }
      const {error} = await supabase.from("curated_urls").insert(safe);
      if (error) {
        console.error("createCuratedUrl:", error);
        this.toast("Create failed: " + error.message);
      }
    },

    async editCuratedUrl(id, patch) {
      const {error} = await supabase.from("curated_urls").update(patch).eq("id", id);
      if (error) {
        console.error("editCuratedUrl:", error);
        this.toast("Edit failed: " + error.message);
      }
    },

    async deleteCuratedUrl(id) {
      const {error} = await supabase.from("curated_urls").delete().eq("id", id);
      if (error) {
        console.error("deleteCuratedUrl:", error);
        this.toast("Delete failed: " + error.message);
      }
    },

    async resetCuratedUrlsToDefaults() {
      // Wipe and re-seed.
      const r1 = await supabase.from("curated_urls").delete().neq("id", 0);
      if (r1.error) {
        this.toast("Reset failed: " + r1.error.message);
        return;
      }
      const r2 = await supabase.from("curated_urls").insert(CURATED_URL_DEFAULTS);
      if (r2.error) {
        this.toast("Re-seed failed: " + r2.error.message);
        return;
      }
      this.toast("Curated URLs reset to defaults.");
    },

    // -------- COMMENT MODERATION --------
    // (Hide/unhide live in app.actions.js as hideCommentByFacilitator
    // and unhideCommentByFacilitator. Hard-delete is via deleteComment.)

    // -------- RESETS / EXPORT --------
    async resetIssuesAndTasks() {
      const r1 = await supabase.from("hacker_log").delete().neq("id", 0);
      const r2 = await supabase.from("comments").delete().neq("id", 0);
      const r3 = await supabase.from("tasks").delete().neq("id", 0);
      const r4 = await supabase.from("issues").delete().neq("id", 0);
      const r5 = await supabase.from("event_log").delete().neq("id", 0);
      if (r1.error || r2.error || r3.error || r4.error || r5.error) {
        console.error("reset errors:", r1.error, r2.error, r3.error, r4.error, r5.error);
        this.toast("Reset partially failed. See console.");
        return;
      }
      this.toast("Issues, tasks, comments, hacker log, and event log cleared.");
    },

    async resetEverything() {
      // 1. Wipe the task-images bucket.
      try {
        const {data: files, error: listError} = await supabase.storage
          .from(STORAGE_BUCKET)
          .list("", {limit: 1000});
        if (listError) {
          console.error("resetEverything storage list:", listError);
        } else if (files && files.length > 0) {
          const filePaths = files.filter((f) => f.id).map((f) => f.name);
          if (filePaths.length > 0) {
            const {error: rmError} = await supabase.storage.from(STORAGE_BUCKET).remove(filePaths);
            if (rmError) console.error("resetEverything storage remove:", rmError);
          }
        }
      } catch (e) {
        console.error("resetEverything storage exception:", e);
      }
      // 2. Wipe the database tables, then reset game_state.
      await supabase.from("event_log").delete().neq("id", 0);
      await supabase.from("hacker_log").delete().neq("id", 0);
      await supabase.from("comments").delete().neq("id", 0);
      await supabase.from("tasks").delete().neq("id", 0);
      await supabase.from("issues").delete().neq("id", 0);
      await supabase.from("users").delete().neq("role", "facilitator");
      await this.updateGameState({
        current_sprint: 1,
        hacker_count: 0,
        sprint3_auto_advance_seconds: 0,
      });
      this.toast("Full reset complete. Images cleared.");
    },

    exportStateJSON() {
      const payload = {
        exported_at: new Date().toISOString(),
        session_label: this.gameState.session_label,
        game_state: this.gameState,
        users: this.users,
        teams: this.teams,
        issues: this.issues,
        tasks: this.tasks,
        comments: this.comments,
        curated_urls: this.curatedUrls,
        hacker_log: this.hackerLog,
        event_log: this.eventLog,
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
  };
})();
