// ============================================================
// app.actions.js: all user action handlers (issues, tasks,
// comments, hacker, code freeze, sprint advance side effects).
// Each handler does state guard -> DB write -> optimistic UI ->
// event_log write.
// ============================================================
(function () {
  "use strict";
  window.App = window.App || {};
  const supabase = window.App.supabase;
  if (!supabase) return;

  const STORAGE_BUCKET = window.App.STORAGE_BUCKET;
  const logic = window.App.logic;

  // Best-effort event log writer. Never throws.
  async function logEvent(actorToken, issueId, action, sprint) {
    try {
      const {error} = await supabase.from("event_log").insert({
        actor_token: actorToken || null,
        issue_id: issueId || null,
        action: action,
        sprint: sprint || null,
      });
      if (error) console.warn("[devsec] event_log:", error.message);
    } catch (e) {
      console.warn("[devsec] event_log exception:", e);
    }
  }

  // Extract the in-bucket object path from a Supabase public URL,
  // for use with supabase.storage.from(BUCKET).remove([path]).
  // Public URLs look like
  //   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  // so we just split on "/<bucket>/" and take the tail. Returns
  // null if the URL is empty, foreign, or otherwise unparseable;
  // callers treat null as "nothing to clean up."
  function storagePathFromUrl(url) {
    if (!url) return null;
    const marker = "/" + STORAGE_BUCKET + "/";
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    const path = url.substring(idx + marker.length);
    return path || null;
  }

  window.App.actions = {
    // -------- ISSUE actions --------
    async createIssue({title, description_url, price, batch_size, acceptance_criteria, curated_url_id}) {
      if (!this.canAct(null, "create_issue")) {
        this.toast("Only Business can create Product Requests.");
        return;
      }
      const titleClean = (title || "").trim();
      if (!titleClean) {
        this.toast("Title is required.");
        return;
      }
      const sprint = this.gameState.current_sprint;
      // If curated_url_id is provided, prefill missing fields from it.
      let urlClean = (description_url || "").trim() || null;
      let priceN = parseInt(price);
      let batchN = parseInt(batch_size);
      if (curated_url_id) {
        const c = (this.curatedUrls || []).find((x) => x.id === curated_url_id);
        if (c) {
          if (!urlClean) urlClean = c.url;
          if (!Number.isFinite(priceN)) priceN = c.default_price;
          if (!Number.isFinite(batchN)) batchN = c.default_batch_size;
        }
      }
      if (!Number.isFinite(priceN)) priceN = 100;
      if (!Number.isFinite(batchN)) batchN = 1;
      batchN = Math.max(1, batchN);

      // Insert with flawed=false; then update with the deterministic
      // value once the id is known.
      const {data, error} = await supabase
        .from("issues")
        .insert({
          title: titleClean,
          description_url: urlClean,
          status: "market",
          price: priceN,
          batch_size: batchN,
          sprint_created: sprint,
          acceptance_criteria: (acceptance_criteria || "").trim() || null,
          flawed: false,
          created_by: this.user.token,
        })
        .select()
        .single();
      if (error) {
        console.error("createIssue:", error);
        this.toast("Create failed: " + error.message);
        return;
      }
      // Roll random flaw deterministically from the resulting id.
      const flawed = logic.flawForIssueId(data.id, this.gameState.flaw_rate_percent);
      if (flawed) {
        const r = await supabase.from("issues").update({flawed: true}).eq("id", data.id);
        if (r.error) console.warn("flaw stamp failed:", r.error.message);
      }
      logEvent(this.user.token, data.id, "create_issue", sprint);
      this.toast("Issue created.");
    },

    async editIssue(issueId, patch) {
      // Read the issue fresh from the DB before deciding whether
      // editing is allowed. Without this, between the user opening the
      // edit form and clicking Save, a dev could claim the card
      // (status: market → in_progress); the local cache would still
      // show 'market', canAct would say yes, and the edit would land
      // on a card that's already in flight. The race is rare in
      // practice (claim and edit are seconds apart, realtime usually
      // catches up) but the cost of the wrong outcome is silent
      // confusion for whoever just claimed it.
      const {data: issue, error: fetchErr} = await supabase
        .from("issues")
        .select("*")
        .eq("id", issueId)
        .single();
      if (fetchErr || !issue) return;
      if (!this.canAct(issue, "edit_issue")) {
        this.toast("You cannot edit this card right now.");
        return;
      }
      const safe = {};
      ["title", "description_url", "price", "batch_size", "acceptance_criteria"].forEach((k) => {
        if (Object.prototype.hasOwnProperty.call(patch, k)) safe[k] = patch[k];
      });
      const {error} = await supabase.from("issues").update(safe).eq("id", issueId);
      if (error) {
        console.error("editIssue:", error);
        this.toast("Edit failed: " + error.message);
        return;
      }
      logEvent(this.user.token, issueId, "edit_issue", this.gameState.current_sprint);
      this.toast("Saved.");
    },

    async deleteIssue(issue) {
      if (!issue) return;
      if (!this.canAct(issue, "delete_issue") && !this.isFacilitator()) {
        this.toast("You cannot delete this card.");
        return;
      }
      const {error} = await supabase.from("issues").delete().eq("id", issue.id);
      if (error) {
        console.error("deleteIssue:", error);
        this.toast("Delete failed: " + error.message);
        return;
      }
      logEvent(this.user.token, null, "delete_issue", this.gameState.current_sprint);
      this.toast("Card deleted.");
    },

    async claimIssue(issue) {
      const team = this.effectiveTeam();
      if (!this.user || !team) {
        this.toast("You are not on a team. Ask your facilitator.");
        return;
      }
      if (!this.canAct(issue, "claim")) {
        this.toast("You cannot claim this card.");
        return;
      }
      // Optimistic where-clause guards against double-click races.
      const {data, error} = await supabase
        .from("issues")
        .update({team, status: "in_progress"})
        .eq("id", issue.id)
        .eq("status", "market")
        .is("team", null)
        .select();
      if (error || !data || data.length === 0) {
        this.toast("Could not claim card. It may have been taken.");
        return;
      }
      logEvent(this.user.token, issue.id, "claim", this.gameState.current_sprint);
      this.toast("Claimed for " + team + ".");
    },

    async sendToTesting(issue) {
      if (!this.batchGateOpen(issue)) {
        this.toast("Need " + issue.batch_size + " completed tasks first.");
        return;
      }
      if (!this.canAct(issue, "send_to_testing")) {
        this.toast("You cannot send this card to testing.");
        return;
      }
      // Sprint 3 cicd_bypass: containerized cards skip the pipeline.
      const bypass =
        this.gameState.current_sprint >= 3 &&
        this.gameState.sprint3_cicd_bypass === true &&
        issue.containerized === true;
      const target = bypass ? "in_production" : "testing";
      await this.setStatus(issue.id, target);
      logEvent(this.user.token, issue.id, "send_to_testing", this.gameState.current_sprint);
      if (bypass) this.toast("CI/CD: shipped to production.");
    },

    async passTesting(issue) {
      await this.setStatus(issue.id, "security");
      logEvent(this.user.token, issue.id, "pass_testing", this.gameState.current_sprint);
    },

    async failTesting(issue, reason) {
      await this._rejectAndComment(issue, reason || "Testing failed", "developer", issue.team);
      logEvent(this.user.token, issue.id, "fail_testing", this.gameState.current_sprint);
    },

    runSecurityCheck(issue) {
      const res = logic.detectFlaw(issue, this.gameState.flaw_rate_percent);
      this.securityCheckResult = {issue_id: issue.id, flawed: res.flawed, source: res.source};
    },

    async passSecurity(issue) {
      if (issue.hacked_flag) {
        const {error} = await supabase
          .from("hacker_log")
          .update({caught_by_security: false})
          .eq("target_issue_id", issue.id)
          .eq("action_type", "inject")
          .is("caught_by_security", null);
        if (error) console.error("hacker_log update (passSecurity):", error);
      }
      await this.setStatus(issue.id, "to_deploy");
      this.securityCheckResult = null;
      logEvent(this.user.token, issue.id, "pass_security", this.gameState.current_sprint);
    },

    async rejectSecurity(issue, reason) {
      if (issue.hacked_flag) {
        await supabase
          .from("hacker_log")
          .update({caught_by_security: true})
          .eq("target_issue_id", issue.id)
          .eq("action_type", "inject")
          .is("caught_by_security", null);
        // Clear the flag since the flaw is being sent back for rework.
        await supabase.from("issues").update({hacked_flag: false}).eq("id", issue.id);
      }
      await this._rejectAndComment(issue, reason || "Security issue detected", "developer", issue.team);
      this.securityCheckResult = null;
      logEvent(this.user.token, issue.id, "reject_security", this.gameState.current_sprint);
    },

    async deploy(issue) {
      if (issue.code_freeze) {
        this.toast("Code Freeze is on. Cannot deploy.");
        return;
      }
      if (!this.canAct(issue, "deploy")) {
        this.toast("You cannot deploy this card.");
        return;
      }
      await this.setStatus(issue.id, "in_production");
      logEvent(this.user.token, issue.id, "deploy", this.gameState.current_sprint);
    },

    async acceptProduction(issue) {
      // Move to accepted column. Also post an info comment so the
      // event is visible inline in the discussion.
      const {error} = await supabase.from("issues").update({status: "accepted"}).eq("id", issue.id);
      if (error) {
        console.error("acceptProduction:", error);
        this.toast("Accept failed: " + error.message);
        return;
      }
      await this._postComment(issue, "Accepted by Business.", false, null, null);
      logEvent(this.user.token, issue.id, "accept_production", this.gameState.current_sprint);
      this.toast("Accepted.");
    },

    async rejectProduction(issue, reason) {
      if (issue.hacked_flag) {
        await supabase
          .from("hacker_log")
          .update({caught_by_security: false})
          .eq("target_issue_id", issue.id)
          .eq("action_type", "inject")
          .is("caught_by_security", null);
      }
      await this._rejectAndComment(issue, reason || "Rejected by Business", "developer", issue.team);
      logEvent(this.user.token, issue.id, "reject_production", this.gameState.current_sprint);
    },

    // ============================================================
    // CLARIFICATIONS column: TWO flows live here
    //
    // 1. REJECTION (clarification_kind = 'rejection')
    //    Triggered by Tester/Security/Business reject buttons.
    //    target_role = 'developer', target_team = card.team.
    //    pre_clarification_status = 'in_progress' (the rework column,
    //    NOT the column the rejection came from). On pickup, the dev
    //    claims the card back into in_progress one-click and starts
    //    fixing the work. The rejection reason is the most recent
    //    is_rejection=true comment, surfaced in the red panel at the
    //    top of the card detail.
    //
    // 2. QUESTION (clarification_kind = 'question')
    //    Triggered by the Ask Question button (anyone working the
    //    card). target_role = whoever is being asked, target_team =
    //    their team or null for cross-team roles like Business.
    //    pre_clarification_status = the asker's actual column at the
    //    time of asking. The target role/team must write a reply when
    //    they pick up; the card then returns to the asker's column.
    //
    // EVERY card in clarifications has clarification_kind set so the UI
    // can clearly label "REJECTION → Developer/Team A" vs
    // "QUESTION → Business" on the card itself. New learners need this
    // visual signal; they don't think to dig into card details.
    // ============================================================

    // Pickup for REJECTION rework. The targeted developer claims the
    // card back into in_progress to fix what was rejected. One click,
    // no body required. The pickup info comment is posted automatically.
    async pickupClarification(issue) {
      if (!this.canAct(issue, "pickup_clarification")) {
        this.toast("You cannot pick up this card.");
        return;
      }
      if (issue.clarification_kind === "question") {
        this.toast("This card is waiting on an answer; use Send response.");
        return;
      }
      // Rework lives in 'in_progress' regardless of which column the
      // rejection happened in. We stored 'in_progress' on rejection so
      // restoreTo will already be 'in_progress'; default kept for safety.
      const restoreTo = issue.pre_clarification_status || "in_progress";
      const {error} = await supabase
        .from("issues")
        .update({
          status: restoreTo,
          clarification_target_role: null,
          clarification_target_team: null,
          clarification_kind: null,
          pre_clarification_status: null,
        })
        .eq("id", issue.id);
      if (error) {
        console.error("pickupClarification:", error);
        this.toast("Pickup failed: " + error.message);
        return;
      }
      await this._postComment(issue, "Picked up for rework.", false, null, null);
      logEvent(this.user.token, issue.id, "pickup_clarification", this.gameState.current_sprint);
      this.toast("Picked up for rework. Card moved to In Progress.");
    },

    // Ask a question about a card. Routes the card to the Clarifications
    // column targeting the chosen role/team with kind='question'. The
    // card returns to the asker's column when the target answers.
    //
    // Special case: if the card is already in clarifications because of
    // a rejection AND the current user is the rejection target (the dev
    // doing rework), they can flip the card into a question targeting
    // the rejecter to ask "what did you mean by that rejection?".
    // pre_clarification_status stays as 'in_progress' so when the
    // rejecter answers, the dev resumes rework with the new info.
    async askQuestion(issue, targetRole, targetTeam, body) {
      if (!this.canAct(issue, "ask_question")) {
        this.toast("You cannot ask a question on this card.");
        return;
      }
      if (!targetRole) {
        this.toast("Pick a role to ask.");
        return;
      }
      if (!body || !body.trim()) {
        this.toast("Please write your question.");
        return;
      }
      // Don't let someone target themselves.
      if (targetRole === this.effectiveRole() && (targetTeam || null) === (this.effectiveTeam() || null)) {
        this.toast("Pick a different role to ask.");
        return;
      }
      // Determine pre_clarification_status:
      //   - Re-targeting from a rejection: keep 'in_progress' so the
      //     dev still resumes rework after the rejecter answers.
      //   - Fresh question: remember the asker's current column so the
      //     answer returns the card to the asker.
      const isRetargetFromRejection =
        issue.status === "clarifications" && issue.clarification_kind === "rejection";
      const preStatus = isRetargetFromRejection
        ? issue.pre_clarification_status || "in_progress"
        : issue.status;

      const r1 = await supabase
        .from("issues")
        .update({
          status: "clarifications",
          clarification_target_role: targetRole,
          clarification_target_team: targetTeam || null,
          clarification_kind: "question",
          pre_clarification_status: preStatus,
        })
        .eq("id", issue.id);
      if (r1.error) {
        console.error("askQuestion status:", r1.error);
        this.toast("Question failed: " + r1.error.message);
        return;
      }
      // Post the question as a regular (non-rejection) comment. The
      // clarification routing on the issue itself drives who can answer.
      await this._postComment(issue, body, false, null, null);
      logEvent(this.user.token, issue.id, "ask_question", this.gameState.current_sprint);
      this.toast("Question sent to Clarifications.");
    },

    // Answer a question. The targeted user posts their answer as a
    // comment, the card returns to the asker's column, and clarification
    // fields clear. Distinct from pickup-for-rework because (a) an
    // answer body is required and (b) the card returns to the asker's
    // pre-clarification column rather than to in_progress.
    async answerQuestion(issue, body) {
      if (!this.canAct(issue, "answer_question")) {
        this.toast("You cannot answer this question.");
        return;
      }
      if (!body || !body.trim()) {
        this.toast("Please write your answer.");
        return;
      }
      const restoreTo = issue.pre_clarification_status || "in_progress";
      // Post the answer FIRST (before clearing routing fields) so the
      // comment captures author_role_at_post correctly; then restore
      // status and clear routing.
      await this._postComment(issue, body, false, null, null);
      const {error} = await supabase
        .from("issues")
        .update({
          status: restoreTo,
          clarification_target_role: null,
          clarification_target_team: null,
          clarification_kind: null,
          pre_clarification_status: null,
        })
        .eq("id", issue.id);
      if (error) {
        console.error("answerQuestion:", error);
        this.toast("Answer failed: " + error.message);
        return;
      }
      logEvent(this.user.token, issue.id, "answer_question", this.gameState.current_sprint);
      this.toast("Answer sent. Card returned to " + this.columnLabel(restoreTo) + ".");
    },

    async setStatus(id, status) {
      const {error} = await supabase.from("issues").update({status}).eq("id", id);
      if (error) {
        console.error("setStatus:", error);
        this.toast("Update failed: " + error.message);
      }
    },

    // Internal: REJECTION flow. Sends to clarifications targeting the
    // developer on the card's team for rework. pre_clarification_status
    // is hardcoded to 'in_progress' (NOT the prior column) because every
    // rejection routes the dev to in_progress to fix the work, regardless
    // of which column the rejection came from. This matches the v2 plan:
    // "In all current rejection flows, the return target is in_progress."
    async _rejectAndComment(issue, reason, targetRole, targetTeam) {
      const r1 = await supabase
        .from("issues")
        .update({
          status: "clarifications",
          clarification_target_role: targetRole || null,
          clarification_target_team: targetTeam || null,
          clarification_kind: "rejection",
          // ALWAYS in_progress for rejections. Rework happens there.
          pre_clarification_status: "in_progress",
        })
        .eq("id", issue.id);
      if (r1.error) {
        console.error("_rejectAndComment status:", r1.error);
        this.toast("Reject failed: " + r1.error.message);
        return;
      }
      await this._postComment(issue, reason, true, targetRole, targetTeam);
      this.toast("Rejected. Sent to Clarifications.");
    },

    // Internal: post a comment row. Captures author role/team at
    // write time so deleted users still show meaningful attribution.
    async _postComment(issue, body, isRejection, targetRole, targetTeam) {
      const role = this.effectiveRole();
      const team = this.effectiveTeam();
      const payload = {
        issue_id: issue.id,
        author_token: this.user ? this.user.token : null,
        author_role_at_post: role || null,
        author_team_at_post: team || null,
        body: (body || "").trim(),
        is_rejection: !!isRejection,
        rejection_target_role: isRejection ? targetRole || null : null,
        rejection_target_team: isRejection ? targetTeam || null : null,
      };
      if (!payload.body) return;
      const {error} = await supabase.from("comments").insert(payload);
      if (error) console.warn("[devsec] comment insert:", error.message);
    },

    // -------- COMMENT actions (author CRUD) --------
    async postComment(issue, body) {
      if (!this.canAct(issue, "add_comment")) {
        this.toast("You must be logged in to comment.");
        return;
      }
      const text = (body || "").trim();
      if (!text) return;
      await this._postComment(issue, text, false, null, null);
      logEvent(this.user.token, issue.id, "post_comment", this.gameState.current_sprint);
    },

    async editComment(commentId, body) {
      const c = this.comments.find((x) => x.id === commentId);
      if (!c) return;
      if (!this.user) return;
      if (c.author_token !== this.user.token && !this.isFacilitator()) {
        this.toast("You can only edit your own comments.");
        return;
      }
      const text = (body || "").trim();
      if (!text) return;
      const {error} = await supabase
        .from("comments")
        .update({body: text, edited_at: new Date().toISOString()})
        .eq("id", commentId);
      if (error) {
        console.error("editComment:", error);
        this.toast("Edit failed: " + error.message);
      }
    },

    async deleteComment(commentId) {
      const c = this.comments.find((x) => x.id === commentId);
      if (!c) return;
      if (!this.user) return;
      // Author hard-delete.
      if (c.author_token === this.user.token) {
        const {error} = await supabase.from("comments").delete().eq("id", commentId);
        if (error) {
          console.error("deleteComment:", error);
          this.toast("Delete failed: " + error.message);
        }
        return;
      }
      // Facilitator hard-delete.
      if (this.isFacilitator()) {
        const {error} = await supabase.from("comments").delete().eq("id", commentId);
        if (error) console.error("facil deleteComment:", error);
        return;
      }
      this.toast("You can only delete your own comments.");
    },

    async hideCommentByFacilitator(commentId) {
      if (!this.isFacilitator()) return;
      const {error} = await supabase
        .from("comments")
        .update({hidden_at: new Date().toISOString(), hidden_by_facilitator_token: this.user.token})
        .eq("id", commentId);
      if (error) console.error("hideComment:", error);
    },

    async unhideCommentByFacilitator(commentId) {
      if (!this.isFacilitator()) return;
      const {error} = await supabase
        .from("comments")
        .update({hidden_at: null, hidden_by_facilitator_token: null})
        .eq("id", commentId);
      if (error) console.error("unhideComment:", error);
    },

    // -------- TASK actions --------
    async createTask(issue, {containerized}) {
      if (!this.user) return;
      const isContainer = !!containerized && this.gameState.current_sprint >= 3;
      const {error} = await supabase.from("tasks").insert({
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
      logEvent(this.user.token, issue.id, "add_task", this.gameState.current_sprint);
    },

    async completeTask(task, fileOrUrl) {
      let finalUrl = "";
      if (fileOrUrl instanceof File) {
        if (!fileOrUrl.type.startsWith("image/")) {
          this.toast("Please choose an image file.");
          return false;
        }
        if (fileOrUrl.size > 10 * 1024 * 1024) {
          this.toast("Image is over 10 MB. Please choose a smaller file.");
          return false;
        }
        this.toast("Uploading image...");
        const ext = (fileOrUrl.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
        const safeExt = ext || "png";
        const filePath =
          "sprint" +
          this.gameState.current_sprint +
          "_issue" +
          task.parent_issue_id +
          "_task" +
          task.id +
          "_" +
          Date.now() +
          "." +
          safeExt;
        const upload = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, fileOrUrl, {
          cacheControl: "3600",
          upsert: false,
          contentType: fileOrUrl.type,
        });
        if (upload.error) {
          console.error("completeTask upload:", upload.error);
          this.toast("Image upload failed: " + upload.error.message);
          return false;
        }
        const {data: pub} = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
        finalUrl = pub && pub.publicUrl ? pub.publicUrl : "";
        if (!finalUrl) {
          this.toast("Could not resolve image URL after upload.");
          return false;
        }
      } else if (typeof fileOrUrl === "string" && fileOrUrl.trim()) {
        finalUrl = fileOrUrl.trim();
      } else {
        this.toast("Choose an image to complete the task.");
        return false;
      }
      const {error} = await supabase
        .from("tasks")
        .update({attachment_url: finalUrl, status: "complete"})
        .eq("id", task.id);
      if (error) {
        console.error("completeTask DB update:", error);
        this.toast("Update failed: " + error.message);
        return false;
      }
      logEvent(this.user.token, task.parent_issue_id, "complete_task", this.gameState.current_sprint);
      this.toast("Task complete.");
      return true;
    },

    // Delete a task row and best-effort remove its uploaded image
    // from storage. Permitted for any developer on the issue's
    // team during in_progress, or for a real facilitator who is
    // not currently simulating a participant. (Simulating
    // facilitators inherit their simulated role's permissions via
    // canAct, which keeps "simulate mode shows the participant
    // experience" honest.)
    async deleteTask(task) {
      if (!this.user) return;
      const parentIssue = this.issues.find((i) => i.id === task.parent_issue_id);
      const allowed = (parentIssue && this.canAct(parentIssue, "delete_task")) || this.isFacilitatorView();
      if (!allowed) {
        this.toast("You can't delete this task.");
        return;
      }
      // Storage cleanup first, row delete second. If cleanup
      // fails we still want the row gone (the user's intent),
      // and an orphan object is harmless and recoverable later;
      // the inverse order would risk a row pointing at a missing
      // file if the row delete failed after we'd removed it.
      const oldPath = storagePathFromUrl(task.attachment_url);
      if (oldPath) {
        const rm = await supabase.storage.from(STORAGE_BUCKET).remove([oldPath]);
        if (rm.error) console.warn("deleteTask storage cleanup:", rm.error);
      }
      const {error} = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) {
        console.error("deleteTask:", error);
        this.toast("Delete failed: " + error.message);
        return;
      }
      logEvent(this.user.token, task.parent_issue_id, "delete_task", this.gameState.current_sprint);
    },

    // Replace the image on an already-completed task without
    // changing its status. Same permission scope as deleteTask
    // (any team dev during in_progress, or a real facilitator).
    // Used to recover from a wrong-image upload after the task
    // has been marked complete; the original completeTask path
    // only handles the first upload.
    async replaceTaskImage(task, file) {
      if (!this.user) return false;
      const parentIssue = this.issues.find((i) => i.id === task.parent_issue_id);
      const allowed =
        (parentIssue && this.canAct(parentIssue, "replace_task_image")) || this.isFacilitatorView();
      if (!allowed) {
        this.toast("You can't replace this image.");
        return false;
      }
      if (!(file instanceof File)) {
        this.toast("Choose an image to replace with.");
        return false;
      }
      if (!file.type.startsWith("image/")) {
        this.toast("Please choose an image file.");
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        this.toast("Image is over 10 MB. Please choose a smaller file.");
        return false;
      }
      this.toast("Uploading image...");
      // Same path scheme as completeTask: sprint/issue/task tag
      // plus a timestamp to avoid collisions with the previous
      // upload (which we'll clean up below if the row update
      // succeeds).
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const safeExt = ext || "png";
      const filePath =
        "sprint" +
        this.gameState.current_sprint +
        "_issue" +
        task.parent_issue_id +
        "_task" +
        task.id +
        "_" +
        Date.now() +
        "." +
        safeExt;
      const upload = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (upload.error) {
        console.error("replaceTaskImage upload:", upload.error);
        this.toast("Image upload failed: " + upload.error.message);
        return false;
      }
      const {data: pub} = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
      const newUrl = pub && pub.publicUrl ? pub.publicUrl : "";
      if (!newUrl) {
        this.toast("Could not resolve image URL after upload.");
        return false;
      }
      // Order: update the row first, then remove the old object.
      // If the row update fails the new file is the orphan and
      // the task still points at the (still-valid) old image.
      // If the storage remove fails afterwards we get a harmless
      // orphan instead of a row pointing at a deleted file.
      const oldPath = storagePathFromUrl(task.attachment_url);
      const {error} = await supabase.from("tasks").update({attachment_url: newUrl}).eq("id", task.id);
      if (error) {
        console.error("replaceTaskImage DB update:", error);
        this.toast("Update failed: " + error.message);
        return false;
      }
      if (oldPath) {
        const rm = await supabase.storage.from(STORAGE_BUCKET).remove([oldPath]);
        if (rm.error) console.warn("replaceTaskImage storage cleanup:", rm.error);
      }
      logEvent(this.user.token, task.parent_issue_id, "replace_task_image", this.gameState.current_sprint);
      this.toast("Image replaced.");
      return true;
    },

    // -------- HACKER actions --------
    async injectFlaw(issue) {
      if (!this.canAct(issue, "inject_flaw")) {
        this.toast("Cannot inject right now.");
        return;
      }
      const r1 = await supabase.from("issues").update({hacked_flag: true}).eq("id", issue.id);
      if (r1.error) {
        console.error("injectFlaw issue update:", r1.error);
        this.toast("Injection failed.");
        return;
      }
      const r2 = await supabase.from("hacker_log").insert({
        hacker_token: this.user.token,
        target_issue_id: issue.id,
        sprint: this.gameState.current_sprint,
        action_type: "inject",
      });
      if (r2.error) console.error("injectFlaw log insert:", r2.error);
      logEvent(this.user.token, issue.id, "inject_flaw", this.gameState.current_sprint);
      this.toast("Injection recorded.");
    },

    async stopContainer(issue) {
      if (!this.canAct(issue, "stop_container")) {
        this.toast("Cannot stop this container.");
        return;
      }
      const r1 = await supabase.from("issues").update({stopped: true}).eq("id", issue.id);
      if (r1.error) {
        console.error("stopContainer:", r1.error);
        this.toast("Stop failed.");
        return;
      }
      await supabase.from("hacker_log").insert({
        hacker_token: this.user.token,
        target_issue_id: issue.id,
        sprint: this.gameState.current_sprint,
        action_type: "stop_container",
      });
      logEvent(this.user.token, issue.id, "stop_container", this.gameState.current_sprint);
      this.toast("Container stopped.");
    },

    async restartContainer(issue) {
      if (!this.canAct(issue, "restart_container")) {
        this.toast("Cannot restart this container.");
        return;
      }
      const r1 = await supabase.from("issues").update({stopped: false}).eq("id", issue.id);
      if (r1.error) {
        console.error("restartContainer:", r1.error);
        this.toast("Restart failed.");
        return;
      }
      // Mark the corresponding stop_container log row as caught
      // (semantically: the system recovered).
      await supabase
        .from("hacker_log")
        .update({caught_by_security: true})
        .eq("target_issue_id", issue.id)
        .eq("action_type", "stop_container")
        .is("caught_by_security", null);
      logEvent(this.user.token, issue.id, "restart_container", this.gameState.current_sprint);
      this.toast("Container restarted.");
    },

    // -------- CODE FREEZE --------
    async toggleCodeFreeze(issue) {
      if (!this.canAct(issue, "toggle_code_freeze")) {
        this.toast("Cannot toggle code freeze on this card.");
        return;
      }
      const {error} = await supabase
        .from("issues")
        .update({code_freeze: !issue.code_freeze})
        .eq("id", issue.id);
      if (error) {
        console.error("toggleCodeFreeze:", error);
        this.toast("Toggle failed: " + error.message);
        return;
      }
      logEvent(this.user.token, issue.id, "toggle_code_freeze", this.gameState.current_sprint);
    },

    // -------- SHIFT-LEFT SECURITY CHECK (read-only) --------
    runShiftLeftCheck(issue) {
      if (!this.canAct(issue, "shift_left_check")) {
        this.toast("You cannot run a shift-left check on this card.");
        return;
      }
      const res = logic.detectFlaw(issue, this.gameState.flaw_rate_percent);
      this.shiftLeftResult = {issue_id: issue.id, flawed: res.flawed, source: res.source};
      logEvent(this.user.token, issue.id, "shift_left_check", this.gameState.current_sprint);
    },
  };
})();
