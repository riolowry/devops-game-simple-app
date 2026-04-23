# ITS DevSecOps Adventure: CRUD App Implementation Plan

A static-site implementation of the "DevSecOps Adventure" coloring game that replaces the GitHub Organization / Projects / Issues dependency with a single-page web app and a managed key/value backend.

## 1. Overview and Scope

The source exercise (johnanvik/devops-colouring, itself based on Pylayeva's _DevSecOps Adventures_) uses GitHub Projects and Issues to simulate a DevOps pipeline. Participants play roles (Business, Developer, Tester, Security, Release, Admin, and optionally Hacker), move "Product Requests" through a Kanban board, and internalize DevSecOps principles across three sprints of increasing sophistication (Waterfall, Agile-with-security, CI/CD-and-Containers).

This plan implements the same workflow as a free-to-host static web app backed by a free-tier Postgres-as-a-service. No GitHub account, no organization setup, no CLI scripts. Facilitator generates tokens in an admin panel; participants paste their token into a login page; everyone sees a live Kanban board.

**Target scale:** 20 to 25 participants typical, up to 50 worst case, plus one facilitator. Session duration roughly 90 minutes.

## 2. Source Material and Attribution

This implementation is derived from:

- johnanvik, _devops-colouring_ repository (template, labels, workflow), `https://github.com/johnanvik/devops-colouring`
- Pylayeva, Dana (2024). _DevSecOps Adventures: A Game-Changing Approach with Chocolate, LEGO, and Coaching Games_. `https://doi.org/10.1007/979-8-8688-0397-0`

Attribution is preserved in the app footer, the README, and the embedded help text.

## 3. Architecture Decisions

### 3.1 Frontend: no-build vanilla HTML + Alpine.js, responsive

A single HTML file loads Alpine.js, Tailwind CSS, and the Supabase JS client from CDNs. Two pages: `index.html` for participants, `admin.html` for the facilitator. Deployment is a drag-and-drop of the folder onto Cloudflare Pages.

**Responsive requirement.** Both participant and facilitator views must work on phones (portrait, 375px minimum) through to desktop monitors (1920px+). Specifically:

- Kanban board uses horizontal scroll with CSS scroll-snap on small screens, so participants on phones swipe between columns one at a time. Columns have `min-w-[280px]` so cards stay legible. On wide screens, multiple columns are visible at once.
- Card detail modal opens full-screen on phones (`inset-0`) and centered with a max-width on tablet and up.
- Admin panel uses tabs that become a vertical accordion or stacked layout below the `sm` breakpoint.
- Forms stack vertically on mobile and switch to multi-column grids at `sm` and above.
- Tables in the admin view are wrapped in `overflow-x-auto` containers so they horizontally scroll on narrow screens without blowing out the layout.
- Tap targets (buttons, card click areas) are at least 44px tall, per mobile usability guidance.
- Header collapses non-essential elements into a menu icon below `sm`.

**Rationale.** A Vite + React toolchain adds a build step, a `node_modules` directory, and a CI configuration that does not earn its keep for an app of this size. Alpine.js gives us reactivity and state binding in 15 KB, with no compile step. Anyone who can read HTML can maintain this.

**Rejected alternatives.**

- React + Vite: requires Node, `npm run build`, and tooling knowledge for future edits.
- Svelte: same build-step problem.
- Pure vanilla JS (no framework): doable but the Kanban and modal code gets verbose without reactivity.

### 3.2 Backend: Supabase free tier

Supabase (managed Postgres + REST + Realtime) is the backend. The browser talks directly to Supabase using the anon key, which is safe to embed in a static site provided the Postgres Row Level Security (RLS) is configured appropriately (or, for a throwaway classroom DB, explicitly disabled with a documented warning).

**Rationale.**

- Free tier: 500 MB database, 2 GB egress per month, unlimited API requests, realtime over WebSocket. Comfortable for a 90-minute session with 50 users.
- Five-minute setup: create project, paste schema SQL, copy URL and anon key into `config.js`.
- Realtime subscriptions over WebSocket give sub-second card updates without polling. Polling fallback handles restrictive networks.
- Built-in SQL schema gives us referential integrity (parent Issues and child Tasks) without writing a wrapper API.

**Rejected alternatives.**

| Service               | Why not                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| Firebase Firestore    | 50K reads/day burns through in a busy session with 50 users polling        |
| Firebase Realtime DB  | 100 concurrent connection limit on free tier is uncomfortably close to 50+ |
| Cloudflare Workers KV | 1000 writes/day free tier; classroom session will exceed this              |
| Cloudflare D1         | Generous free tier but requires writing and deploying a Worker API layer   |
| Upstash Redis         | 10K commands/day on free tier, too restrictive                             |
| JSONBin.io            | 10K requests/month, way too restrictive                                    |
| Deta Space            | Service discontinued in 2024                                               |
| MongoDB Atlas         | Works but needs a wrapper API; no native realtime to the browser           |

### 3.3 State transitions: explicit buttons, not drag-and-drop

Cards advance via labeled buttons ("Send to Testing", "Pass Testing", "Flag Security Issue", "Deploy", "Reject to Feedback") inside the card detail modal, shown conditionally based on current status and viewer role.

**Rationale.**

- `react-beautiful-dnd` is unmaintained; modern DnD libraries (`@dnd-kit`, `@hello-pangea/dnd`) assume React and a build step.
- Explicit buttons enforce and teach the state machine. A Developer pressing "Send to Testing" is a pedagogically stronger moment than a Developer accidentally dragging a card two columns.
- Works cleanly on touch devices without any gesture library.
- Zero accidental moves; zero library risk.

### 3.4 Authentication: opaque session tokens, no accounts

Facilitator generates unambiguous tokens (character set `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, avoiding `0`, `O`, `I`, `1`, `l`) of length 6 in the admin panel. Each token row stores `role` and `team`. Participant pastes token on the landing page; app looks it up, stores `role` and `team` in `localStorage`, redirects to the board.

**Opaque is important for the Hacker mechanic.** Tokens cannot be role-prefixed. A token like `DEV-T1-01` vs `HK-T1-02` would let anyone who overhears or glimpses a token identify the Hacker.

**This is trust-based security, not real security.** Any participant who opens DevTools can read the users table via the anon key. This is acceptable for a classroom exercise and documented as such. If a participant outs the Hacker this way, that is itself a learning moment about trust boundaries.

### 3.5 Image handling: URL-paste only

Participants paste a URL (the online-coloring.com page, or a screenshot uploaded to imgur/postimg) rather than uploading files. This keeps Supabase Storage out of the stack and the DB small.

### 3.6 Realtime sync with polling fallback

Primary mechanism: Supabase Realtime channels (Postgres WAL over WebSocket). Fallback: if the WebSocket does not connect within 3 seconds, the app falls back to polling `issues`, `tasks`, and `game_state` every 3 seconds. Conference Wi-Fi frequently blocks WebSockets, so this is not theoretical.

## 4. Data Model

Five Postgres tables. All IDs are `bigint` with `generated always as identity`, which makes the "Security flaw from issue ID" mechanic natural.

### 4.1 `users`

| Column         | Type          | Notes                                                                                      |
| -------------- | ------------- | ------------------------------------------------------------------------------------------ |
| `token`        | `text` PK     | 6-character opaque token                                                                   |
| `display_name` | `text`        | Optional friendly name                                                                     |
| `role`         | `text`        | `business`, `developer`, `tester`, `security`, `release`, `admin`, `hacker`, `facilitator` |
| `team`         | `text`        | `team_1`, `team_2`, etc., or `null` for cross-team roles                                   |
| `created_at`   | `timestamptz` |                                                                                            |

### 4.2 `issues`

| Column                     | Type                 | Notes                                                                                    |
| -------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `id`                       | `bigint` PK identity | Used directly in the security-flaw modulus check                                         |
| `title`                    | `text`               | e.g., "Puppy Sitting"                                                                    |
| `description_url`          | `text`               | Link to online-coloring.com page                                                         |
| `status`                   | `text`               | `market`, `in_progress`, `testing`, `security`, `to_deploy`, `in_production`, `feedback` |
| `team`                     | `text`               | Assigned team (or `null` until claimed)                                                  |
| `price`                    | `integer`            | Points earned on acceptance                                                              |
| `batch_size`               | `integer`            | Number of child Tasks required                                                           |
| `sprint_created`           | `integer`            | 1, 2, or 3                                                                               |
| `hacked_flag`              | `boolean`            | Set by Hacker; invisible to participants                                                 |
| `containerized`            | `boolean`            | Sprint 3 only; blocks hacker injection when true                                         |
| `feedback_reason`          | `text`               | Populated on rejection                                                                   |
| `created_by`               | `text`               | FK to `users.token`                                                                      |
| `created_at`, `updated_at` | `timestamptz`        |                                                                                          |

### 4.3 `tasks`

| Column                     | Type                 | Notes                                              |
| -------------------------- | -------------------- | -------------------------------------------------- |
| `id`                       | `bigint` PK identity |                                                    |
| `parent_issue_id`          | `bigint` FK          | References `issues.id`                             |
| `assignee_token`           | `text` FK            | References `users.token`                           |
| `attachment_url`           | `text`               | Participant pastes link to their colored page      |
| `status`                   | `text`               | `claimed`, `complete`                              |
| `containerized`            | `boolean`            | Inherited from parent at creation time in Sprint 3 |
| `created_at`, `updated_at` | `timestamptz`        |                                                    |

A parent `issue` becomes eligible for `status = testing` only when `count(tasks where parent_issue_id = X and status = complete) >= issues.batch_size`. This is enforced client-side (the "Send to Testing" button is disabled until the gate passes) and documented as a known "trust" constraint (a motivated participant could bypass by writing to the DB directly).

### 4.4 `game_state` (single row, `id = 1`)

| Column                         | Type         | Notes                                                                                             |
| ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------- |
| `id`                           | `integer` PK | Always 1                                                                                          |
| `current_sprint`               | `integer`    | 1, 2, or 3                                                                                        |
| `security_modulus`             | `integer`    | Deterministic flaw rule: `issue.id % modulus == 0` indicates a flaw. Default 7.                   |
| `hacker_count`                 | `integer`    | How many Hackers are active. 0 in Sprint 1; 0 to 2 in Sprint 2 and 3.                             |
| `sprint3_auto_advance_seconds` | `integer`    | 0 to disable; otherwise Testing and Security auto-advance after this many seconds (Sprint 3 only) |
| `session_label`                | `text`       | e.g., "CPSC 3720 Fall 2026"                                                                       |

### 4.5 `hacker_log` (audit trail)

| Column               | Type                 | Notes                                                                     |
| -------------------- | -------------------- | ------------------------------------------------------------------------- |
| `id`                 | `bigint` PK identity |                                                                           |
| `hacker_token`       | `text`               | Who injected                                                              |
| `target_issue_id`    | `bigint`             | What they targeted                                                        |
| `sprint`             | `integer`            | When                                                                      |
| `caught_by_security` | `boolean`            | Null until Security checks; true if caught, false if leaked to Production |
| `created_at`         | `timestamptz`        |                                                                           |

Visible only in the admin panel. Revealed to the room during the post-session retrospective.

## 5. Role Definitions and Permissions

Each role sees the whole board but only has action buttons enabled in the columns relevant to their role. Column ownership is defined by the role; the app hides or disables buttons outside that scope.

| Role        | Can create           | Primary column        | Key actions                                                                          |
| ----------- | -------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| Business    | Issues               | Market, In Production | Create issues, accept from Production, reject to Feedback                            |
| Developer   | Tasks (under Issues) | In Progress           | Claim issue, create child Tasks, submit colored pages, send to Testing               |
| Tester      | nothing              | Testing               | Pass (to Security) or fail (back to In Progress)                                     |
| Security    | nothing              | Security              | Run Security Check, pass (to To Deploy) or reject (to In Progress with reason)       |
| Release     | nothing              | To Deploy             | Deploy (to In Production)                                                            |
| Admin       | nothing              | all                   | Same visibility as facilitator (read-only, no admin panel access)                    |
| Hacker      | nothing              | In Progress, Testing  | Inject Flaw button (Sprint 2 and 3 only; blocked on containerized items in Sprint 3) |
| Facilitator | everything           | admin page only       | Token management, sprint control, config, reset, export                              |

Role enforcement is client-side only. This is documented as trust-based.

## 6. Hacker Mechanic (Full Design)

The Hacker is the oppositional element that differentiates Sprint 2 and 3 from Sprint 1. Getting this right is core to the exercise.

### 6.1 Secret assignment

Facilitator opens the admin panel before the session and sets `hacker_count` (default 0 for Sprint 1). When the sprint advances to 2 or 3, the facilitator opens a "Promote to Hacker" control which randomly picks `hacker_count` participants from the existing user roster (preferring Developers, since that makes the thematic sense) and updates their role to `hacker`. Those participants' existing tokens still work; their role changes silently. They are not notified in-app beyond seeing their role change on their next screen refresh.

**Tokens are opaque.** The Hacker's token does not look different from anyone else's.

The facilitator privately messages the chosen participant(s) (in-person tap on the shoulder, DM, Slack, whatever). This is outside the app. The app only knows they are now `role = hacker`.

### 6.2 Hacker actions per sprint

**Sprint 1 (Waterfall).** Hacker role does not exist yet. `hacker_count` is 0. Even if a participant is (by mistake) flagged as `hacker`, the Inject Flaw UI is hidden because `game_state.current_sprint = 1`.

**Sprint 2 (Agile with Security Failures).** Hacker sees an `Inject Flaw` button on any issue currently in `in_progress` or `testing`. Clicking it:

1. Sets `issues.hacked_flag = true`.
2. Writes a row to `hacker_log`.
3. Shows a brief toast: "Injection recorded." No lingering marker.
4. Button then disappears for this issue (can only inject once).

The UI deliberately gives the Hacker no confirmation on their own screen that the flaw exists. This prevents the "Hacker points at their screen, gets outed" failure mode.

**Sprint 3 (CI/CD and Containers).** Hacker still has Inject Flaw, but it is disabled on any issue where `containerized = true`. The button shows the tooltip: "Containerized. Cannot inject." This is how participants experience the defensive value of containers: the Hacker visibly loses leverage over containerized items.

### 6.3 Flaw visibility and detection

**Participants (including the Hacker) do not see `hacked_flag` on cards.** The Tester's view of a card is identical whether it has been hacked or not. Testers test for "is it fully colored." They do not catch hacker flaws. That is Security's job.

**Security's "Run Security Check" button** is the only mechanism that reveals flaws. When Security clicks it on an issue in their column, the app evaluates:

```
flaw_present = (issue.id % game_state.security_modulus == 0) OR issue.hacked_flag
flaw_source = if issue.hacked_flag then "injected"
              else if (issue.id % modulus == 0) then "deterministic"
              else "none"
```

Result is shown only to Security in a modal: "Flaw detected: [type]" or "Clean." Security then chooses:

- Pass (advances to To Deploy). If flaw was present and Security passed anyway, this is logged.
- Reject (back to In Progress with a reason field). Reason is visible to the Developer.

When Security makes a decision on an item with `hacked_flag = true`, the corresponding `hacker_log` row is updated with `caught_by_security = true` (if rejected) or `false` (if passed through).

### 6.4 Business rejection in Production

If a flaw slips past Security and reaches Production, Business can still reject it. When Business clicks "Reject to Feedback" on an item in Production, the issue moves to the Feedback column with a reason. If `hacked_flag` was true, the `hacker_log` entry is updated to reflect that the hacker "scored" (Security missed and the defect leaked). Team loses the Price for that issue.

### 6.5 Audit trail

`hacker_log` captures every injection with:

- Which Hacker injected
- Which issue
- Which sprint
- Whether Security caught it
- Timestamp

The admin panel shows this table with counts: "Injections attempted: N. Caught: M. Leaked to Production: N-M." The facilitator reveals this during the debrief. This is where the learning about security pipelines lands.

### 6.6 Configurables

From the admin panel:

- `hacker_count`: 0 (Sprint 1 default) to 2 (hard cap, configurable up to 5 if the facilitator wants a larger session variant)
- `security_modulus`: default 7; setting it to a larger number means fewer deterministic flaws, making hacker injections relatively more important to catch
- `sprint3_auto_advance_seconds`: default 0 (off); if set, Testing and Security auto-advance after this many seconds in Sprint 3, simulating CI/CD pressure

## 7. Sprint-by-Sprint Behavior

| Feature                               | Sprint 1 | Sprint 2                                                            | Sprint 3                                             |
| ------------------------------------- | -------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| Hacker role active                    | no       | yes                                                                 | yes                                                  |
| Containerization option               | no       | no                                                                  | yes (Developer toggle on Task creation)              |
| Hacker blocked on containerized items | n/a      | n/a                                                                 | yes                                                  |
| Auto-advance Testing and Security     | no       | no                                                                  | optional (facilitator setting)                       |
| Cross-role permissions                | strict   | relaxed (Dev can add test notes, Tester can flag security concerns) | same as Sprint 2                                     |
| Security modulus default              | 7        | 7                                                                   | 11 (fewer deterministic flaws, more hacker pressure) |

The facilitator advances sprints via an admin button. Advancing to Sprint 2 prompts the facilitator to pick Hackers. Advancing to Sprint 3 enables the "Containerized" checkbox on new Tasks.

Between sprints, issues are not wiped. The board state carries forward, which is pedagogically accurate: you are inheriting a mess from the previous way of working.

## 8. State Machine and Workflow

Statuses and allowed transitions:

```
market        --(Business creates)-->  in_progress
in_progress   --(Developer sends)-->   testing            (requires all child Tasks complete)
testing       --(Tester passes)-->     security
testing       --(Tester fails)-->      in_progress
security      --(Security passes)-->   to_deploy
security      --(Security rejects)-->  in_progress
to_deploy     --(Release deploys)-->   in_production
in_production --(Business accepts)-->  (archived)
in_production --(Business rejects)-->  feedback
feedback      --(Developer picks up)--> in_progress
```

Transitions are triggered by labeled buttons in the card detail modal. Each button is conditionally visible based on viewer role and current status. Server-side enforcement is absent by design (classroom app); client-side is sufficient and transparent.

## 9. Facilitator Operations

Accessible only at `/admin.html` with the facilitator token.

**User management.**

- Generate N tokens with assigned roles and teams (single button, shows a printable list).
- CSV import: paste or upload a CSV of `display_name, role, team` and receive tokens.
- CSV export of the current user list (for printing handout cards).
- Delete individual tokens.
- Promote Developer to Hacker (random pick or manual pick).

**Sprint control.**

- Current sprint indicator.
- "Advance to Sprint 2" and "Advance to Sprint 3" buttons with confirmation.
- "Reset to Sprint 1" (does not wipe issues; just resets the sprint counter).

**Configuration.**

- Security modulus (integer input).
- Hacker count (integer input with cap).
- Sprint 3 auto-advance seconds (0 to disable).
- Session label (shown in the app header).

**Board operations.**

- Global board view (read-only).
- Hacker log viewer with stats.
- Force-move any card (emergency intervention).
- Delete any card.

**Reset controls.**

- "Reset Issues and Tasks" (wipes all issues and tasks; keeps users and game_state).
- "Reset Everything" (wipes all tables including users; full factory reset).
- "Export Game State as JSON" (downloads full state for post-session review).

## 10. UI Structure

All views are responsive from a 375px phone width up through desktop. Breakpoints follow Tailwind defaults: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px.

### 10.1 Landing page (`index.html` default view)

Single input: "Enter your token." On submit, looks up the user, stores `{token, role, team}` in `localStorage`, switches to the board view.

### 10.2 Board view (`index.html` after login)

- Header: session label, current sprint badge, "You are: [role] on [team]," logout button. Below `sm`, the header collapses non-critical elements into a menu icon.
- Seven columns (Market, In Progress, Testing, Security, To Deploy, In Production, Feedback), laid out in a horizontal-scroll container with scroll-snap. On phones, one column fills the viewport; users swipe left/right. On desktop, multiple columns are visible at once.
- A column-name strip above the board acts as both a navigation hint and a direct-jump control on touch devices.
- Each column shows cards filtered by `status`. Cards are colored by team and show: title, price, batch size, progress (X of Y Tasks complete).
- Tap or click a card to open the detail modal.
- Detail modal shows: full info, list of child Tasks with links, conditional action buttons based on role and status. Full-screen on phones, centered with `max-w-2xl` on `sm` and above.
- "Help" tab: embedded Markdown rendering of the participant guide.
- Connection indicator: green (realtime), yellow (polling fallback), red (disconnected).

### 10.3 Admin page (`admin.html`)

Tabbed layout: Users, Sprint, Config, Log, Reset, Export. Protected by a facilitator-role token. Below the `sm` breakpoint, tabs become a vertical stack of collapsible sections (native `<details>` elements) so the facilitator can work from a phone or tablet if needed. Tables inside tabs are wrapped in `overflow-x-auto` so they scroll horizontally on narrow screens.

## 11. Security Flaw Detection

Combined rule evaluated server-less, in the browser, at the moment Security clicks "Run Security Check":

```js
const flawDeterministic = issue.id % gameState.security_modulus === 0;
const flawInjected = issue.hacked_flag === true;
const hasFlaw = flawDeterministic || flawInjected;
const source = flawInjected
  ? "injected"
  : flawDeterministic
    ? "deterministic"
    : "none";
```

The check is shown only to Security. The Developer never sees the modulus; they only see the rejection reason after Security has acted. This preserves the game dynamic (Security is a real gate, not a formality).

For post-session debrief, the admin panel exposes: total issues, flaws-by-source, caught-by-Security counts, leaked-to-Production counts.

## 12. Gotchas and Mitigations

| #   | Gotcha                                                                             | Mitigation                                                                                                                |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Supabase free projects pause after 7 days of inactivity                            | Pre-session checklist item: hit the app URL the day before to wake the project                                            |
| 2   | Conference Wi-Fi often blocks WebSockets                                           | Polling fallback at 3s interval kicks in automatically if realtime fails to connect within 3s                             |
| 3   | Opaque tokens required for Hacker secrecy                                          | Token generator uses no role prefix; only facilitator sees role mapping                                                   |
| 4   | Hacker can be outed if UI confirms their injection lingers                         | "Inject Flaw" shows a transient toast then hides the button; no persistent state visible to Hacker                        |
| 5   | Base64 images would bloat DB fast                                                  | URL-paste only; Supabase Storage not used                                                                                 |
| 6   | Client-side role enforcement is bypassable                                         | Documented as trust-based; acceptable for classroom; not real security                                                    |
| 7   | Batch Size gate can be bypassed by DB manipulation                                 | Same as above; enforced client-side, documented limitation                                                                |
| 8   | Last-write-wins on concurrent edits                                                | Documented; in practice, move-card actions are idempotent and the game tolerates it                                       |
| 9   | Participants may close browser tab and lose token                                  | Token is in `localStorage`; survives reload. Facilitator can re-issue if localStorage cleared                             |
| 10  | Auto-generated issue IDs in Postgres are monotonic and non-resetting on truncate   | `TRUNCATE ... RESTART IDENTITY` in reset SQL to reset the ID sequence                                                     |
| 11  | Supabase anon key is visible in browser                                            | Expected; rate-limiting and RLS (if enabled) protect against abuse. For a classroom session over 90 minutes, this is fine |
| 12  | Facilitator forgets to promote Hackers when advancing to Sprint 2                  | "Advance to Sprint 2" dialog includes a mandatory Hacker-count confirmation                                               |
| 13  | 50 participants on a shared network polling every 3s = about 17 requests/s         | Well within Supabase free tier's unlimited request allowance; minimal egress                                              |
| 14  | Session label collisions if multiple facilitators share one Supabase project       | Recommend one Supabase project per session / course offering; free tier allows multiple projects per account              |
| 15  | Issue IDs reused across sprints could create false "deterministic flaw" clustering | Accepted; the exercise tolerates this because the modulus rule is part of the teaching point                              |

## 13. File Deliverables

```
PLAN.md                          # this document
README.md                        # project overview and quick start
FACILITATOR_GUIDE.md             # full facilitator walkthrough
PARTICIPANT_GUIDE.md             # participant instructions (also embedded in app Help tab)
SETUP_SUPABASE_DB.md             # step-by-step backend creation
SETUP_CLOUDFLARE_DEPLOYMENT.md   # Cloudflare Pages deploy steps
schema.sql                       # Postgres schema and seed game_state row
index.html                       # participant app (landing + board + help)
admin.html                       # facilitator admin panel
app.js                           # shared application logic
config.example.js                # template: SUPABASE_URL and SUPABASE_ANON_KEY
styles.css                       # small amount of custom CSS (most styling via Tailwind CDN)
```

Total: 12 files. No `node_modules`, no build artifacts, no hidden folders.

## 14. Deployment Plan

### 14.1 Backend (Supabase)

1. Create a free Supabase account at `https://supabase.com`.
2. Create a new project. Region: closest to the conference venue. Note the DB password (not needed for the app, but keep it).
3. Project Settings -> API: copy the `URL` and `anon public` key.
4. SQL Editor: paste `schema.sql` and run it. Confirms 5 tables and one `game_state` seed row.
5. Database -> Publications: enable realtime on `issues`, `tasks`, `game_state`.
6. (Optional, recommended for production classroom use): enable RLS on all tables with a simple "allow all with anon key" policy. For a throwaway classroom DB, leaving RLS disabled is acceptable and documented.

### 14.2 Frontend (Cloudflare Pages)

1. Copy `config.example.js` to `config.js` and paste the Supabase URL and anon key.
2. Log into Cloudflare, go to Workers and Pages, create a new Pages project.
3. Upload the folder directly (no Git integration needed), or connect to a Git repo.
4. No build command. No output directory (root is the output).
5. Custom domain optional.
6. The URL is provided by Cloudflare (e.g., `devops-colouring.pages.dev`).

### 14.3 Smoke test

1. Open the app URL in two browsers.
2. Go to `/admin.html`, log in with the facilitator token.
3. Create one Business token and one Developer token.
4. Log in as Business in browser A, create an Issue.
5. Verify the Issue appears in browser B within 3 seconds.
6. Log in as Developer in browser B, claim the Issue, verify status updates in browser A.

## 15. Pre-Session Checklist (Facilitator)

Day before:

- [ ] Hit the app URL to wake the Supabase project (free projects pause after 7 days).
- [ ] Log into the admin panel and confirm schema is loaded.
- [ ] Generate tokens for expected participant count (plus 2 or 3 spares).
- [ ] Export the token CSV and print a handout card for each participant (token, assigned role, assigned team).
- [ ] Set `current_sprint = 1`, `hacker_count = 0`.
- [ ] Decide which Developers will be Hackers in Sprint 2. Do not configure this yet.

Session start:

- [ ] Distribute handout cards.
- [ ] Project the facilitator's global board view on the main screen.
- [ ] Walk the room through the participant guide (or point them to the Help tab).
- [ ] Start Sprint 1.

Sprint 1 to 2 transition:

- [ ] Advance sprint in admin.
- [ ] Set `hacker_count`. Promote the chosen participant(s) to Hacker role.
- [ ] Quietly notify the chosen Hacker(s) in person or via DM. Do not announce.

Sprint 2 to 3 transition:

- [ ] Advance sprint in admin.
- [ ] Optionally set `sprint3_auto_advance_seconds` (try 60 for a mild CI/CD effect, 20 for an aggressive one).
- [ ] Announce that Developers can now mark Tasks as "Containerized" and that this has a defensive property.

## 16. Post-Session Operations

- Export game state JSON for retrospective slides.
- Open the Hacker Log tab in admin. Share with the room. Discuss:
  - How many flaws were injected per sprint?
  - What fraction were caught by Security?
  - Did containerization reduce the attack surface in Sprint 3?
  - Which teams performed best per sprint?
- Reset Issues and Tasks (keep users) for a repeat session, or Reset Everything for a fresh start.

## 17. Known Limitations and Trade-offs

1. **Not a security product.** Role enforcement, batch-size gating, and anti-cheat are all client-side. A determined participant could bypass them via the browser console. This is explicitly accepted: the exercise is about understanding the workflow, not about hardening the tool against the students.
2. **Single Supabase project = single concurrent session.** If two facilitators want to run in parallel, they each need their own Supabase project (free tier allows multiple per account).
3. **No offline mode.** The app requires network access to Supabase. If the conference venue Wi-Fi dies, the exercise pauses. There is no local-first fallback.
4. **50 participant soft cap.** The app will technically work with more, but the Kanban view becomes crowded above 50 and realtime channel count on Supabase free tier has limits worth avoiding.
5. **English-only UI.** The source exercise is English; the app inherits that. Internationalization is not in scope.
6. **No undo.** Accidental rejections or deletions require facilitator intervention via the admin panel's force-move or undelete operations. This is by design; the game tolerates mistakes and a teachable moment is preferable to a complex undo stack.
7. **Images are not hosted.** Participants must paste URLs to externally-hosted images. If the external host goes down, links break. This is explicitly accepted as a trade-off against managing Supabase Storage.

## 18. Ready-to-Build Confirmation

The scope, data model, role behavior, hacker mechanic, and deployment path above are what I will implement. If any of the following need to change, flag now:

- Supabase vs Cloudflare D1
- Vanilla HTML + Alpine.js vs React + Vite
- Buttons vs drag-and-drop
- URL-paste vs file upload for images
- Hacker count cap (2 vs 5)
- Sprint 3 auto-advance (default off vs default 60s)

If all are acceptable as stated, reply `go` and I will produce the remaining 11 files.
