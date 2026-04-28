# UX & Code Design Principles · ITS DevSecOps Adventure

This document captures the design and code quality standards established across the v2 rebuild. Anyone (human or LLM) extending this app should match these by default. They are not aspirational; they are baseline. Regressions on any of them are bugs even if functionality still "works".

The principles are grouped: visual hierarchy, layout & spacing, mobile, forms, modals, color semantics, conditional UI, state management, copy, error/empty states, code structure, and testing.

---

## 1. The participants are new learners

The app is run with students who have not held actual dev/test/security/ops jobs. Every UX decision is filtered through this. Two consequences that affect everything:

1. **Visible signals beat hidden state.** A card needing attention must say so on the card surface (in the column, on the badge, in a colored pill), not buried inside the detail modal. Students do not click through to investigate; they scan columns.
2. **The Clarifications column is the pedagogical signal.** Both rejection and question flows route here precisely because students will never think to "go check that old card I worked on yesterday". If a card needs human action, it lands in Clarifications with a kind label (`REJECTION → Developer / Team A` rose pill, or `QUESTION → Business` blue pill).

If a future change moves a workflow out of the Clarifications column "for cleanliness" or hides the kind label "for minimalism", that change is wrong regardless of how nice it looks.

---

## 2. Visual hierarchy

- **One H1 per page.** The page title appears once at the top. Section dividers are H2 in the rendered output (`text-sm font-semibold` for inline section heads is fine where a real H2 would be heavy).
- **Badges and pills are bigger than secondary metadata.** A `REJECTION → Developer` pill on a card is `text-xs font-semibold` with a contrasting background. A "container" or "freeze" tag is `text-xs` no font-weight on a pale background. The hierarchy of the visual signals follows the hierarchy of action urgency.
- **Bold the noun, not the verb.** "Waiting on **Tester** on **Team A**": the role and team are bold, "Waiting on" is regular weight. Participants scan for who, not for the verb.
- **Whitespace separates concerns.** A card detail is sectioned by visible gaps (`space-y-4` on the column container). Action button rows are separated from the content above by a `border-t border-slate-200 pt-4` rule, NOT a heading.

---

## 3. Layout & spacing tokens

| Token | Use |
|---|---|
| `gap-2` | Inline tight (badge clusters) |
| `gap-3` | Buttons in a row |
| `space-y-4` | Sections within a modal body |
| `p-3` | Banner panels (clarification banner, rejection panel) |
| `p-4` | Form blocks (ask form, answer form, reject form) |
| `rounded-lg` | All form blocks, all banner panels, all modals |
| `rounded-full` | All pills/badges |
| `border` + `bg-{color}-50` + `border-{color}-200` | Standard form-block frame |
| `border-l-4` + `bg-{color}-50` + `border-{color}-500` | Standard banner-panel frame |

If you find yourself reaching for `p-2` on a touchable element, reach for `px-4 py-3` instead and re-evaluate.

---

## 4. Touch targets (Apple/Google a11y minimum)

All clickable elements are **at least 44×44 px**.

- Primary buttons: `px-4 py-3 min-h-[44px]`.
- Inline icon buttons (the rare ones): `p-2 min-h-[44px] min-w-[44px]`.
- Form select/input on mobile: `py-2` is OK (the input has built-in vertical padding from the browser).

Do not use `text-xs` on a button. Buttons are `text-sm font-medium` minimum. Inline links can be smaller.

The rule of thumb: if a participant needs to tap it on a phone, it must be 44px tall. No exceptions for "secondary" actions; there are no secondary actions on a phone.

---

## 5. Mobile-first stacking

Every multi-button row uses:

```html
<div class="flex flex-col sm:flex-row gap-2">
  <button class="px-4 py-3 ... min-h-[44px]">Primary action</button>
  <button class="px-4 py-3 ... min-h-[44px]">Cancel</button>
</div>
```

`flex-col sm:flex-row` means **stacked on phones, side-by-side on tablets and up**. Without this, two buttons in `flex-row` on a 320px screen become unreachable.

For grids of fields:

```html
<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
  <div>...</div>
  <div>...</div>
</div>
```

Same rule. One column on phones, two on tablets+.

For columns of cards, the board uses `overflow-x-auto snap-x snap-mandatory` so participants swipe between columns on a phone instead of pinch-zooming. Do not break this by adding `overflow-x-hidden` or removing snap utilities.

---

## 6. Forms

Every form follows the same pattern:

1. **Label is `text-sm font-medium`** in a color matching the form's purpose (rose for reject, blue for answer, indigo for ask).
2. **Required validation is on submit, not on blur.** A short `if (!body.trim()) { toast('Please write your answer.'); return; }` at the top of the click handler. No HTML5 `required` on submit-only buttons (they're not in a `<form>` element; see below).
3. **Autofocus on open** via `x-init="$nextTick(() => $el.focus())"` on the textarea. Participants can start typing without a tap.
4. **Cancel button is always present** with `border border-slate-300 hover:bg-slate-50`.
5. **Form state is local to the modal.** When the modal closes, every field is reset (see section 9, State management).
6. **HTML `<form>` tags are NEVER used in artifacts.** This app uses `@click` handlers on buttons and `x-model` on inputs. (See `<critical_ui_requirements>` in the Anthropic docs for why.)

Standard form-block markup:

```html
<template x-if="askOpen">
  <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
    <label class="block text-sm font-medium text-indigo-900">Ask a question</label>
    <textarea x-model="body" rows="3"
              x-init="$nextTick(() => $el.focus())"
              placeholder="..."
              class="w-full text-sm px-3 py-2 border border-indigo-300 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-indigo-500"></textarea>
    <div class="flex flex-col sm:flex-row gap-2">
      <button @click="..." class="px-4 py-3 bg-indigo-600 text-white text-sm font-medium
                                  rounded-lg hover:bg-indigo-700 min-h-[44px]">Send</button>
      <button @click="askOpen = false; body = ''"
              class="px-4 py-3 border border-slate-300 text-sm font-medium
                     rounded-lg hover:bg-slate-50 min-h-[44px]">Cancel</button>
    </div>
  </div>
</template>
```

---

## 7. Modals

The card detail modal is a fixed positioned overlay with these behaviors:

- **Escape key closes it.** `@keydown.escape.window="openIssue = null"` on the inner content.
- **Click outside closes it.** `@click.self="openIssue = null; …"` on the backdrop.
- **All form/UI state resets on close.** The `@click.self` handler also clears `rejectFor`, `rejectReason`, `askOpen`, `askTargetRole`, `askTargetTeam`, `askBody`, `answerOpen`, `answerBody`, `cardHelpOpen`, plus any transient store fields like `securityCheckResult` and `shiftLeftResult`. If a new piece of state is added inside the modal, add it to the close handler in the same diff.
- **Focus is preserved through Alpine reactivity.** Use `x-init="$nextTick(() => $el.focus())"` on the focus target after open.
- **Optional chaining is mandatory inside the modal body.** Use `openIssue?.foo` and `openIssue?.bar?.baz` everywhere; never `openIssue.foo`. Alpine evaluates templates one frame after `openIssue = null`, so a bare access throws and a stale modal flashes red. There are 89 `openIssue?.…` references in `index.html`; preserve that count or grow it.

---

## 8. Color semantics

Used consistently across the app and guides. Reach for these by what they mean, not by what looks good.

| Color | Meaning | Examples |
|---|---|---|
| **Rose** (rose-50/100/500/600/900) | Rejection, error, blocking issue | rejection banner, reject button, REJECTION pill |
| **Blue** (blue-50/100/500/600/900) | Question, awaiting response | question banner, send-response button, QUESTION pill |
| **Emerald** (emerald-100/600/700/800) | Positive action, success | accept, pass, deploy buttons; passed pill in test runs |
| **Indigo** (indigo-50/100/500/600/700) | Facilitator action, ask, neutral-positive accent | ask-question button, facilitator simulate banner |
| **Sky** (sky-600/700) | Pickup-for-rework | pickup button only: the "claim back the rejection" action |
| **Amber** (amber-100/200/800/900) | Caution, in-progress warning, aborted | code freeze auxiliary, aborted test pill |
| **Fuchsia** (fuchsia-100/700/900) | Hacker / facilitator-only | hacker `cover:` pill, hacked badge |
| **Cyan** (cyan-100/800) | Container | containerized tag |
| **Slate** (slate-100/200/500/600/700/900) | Neutral, secondary text, borders | metadata, separator borders |

Do not introduce a new color for a new feature. Find the one that matches its meaning. If nothing fits, reconsider whether the feature needs new visual weight or whether existing semantics cover it.

---

## 9. Conditional UI: facilitator vs facilitator-view

There is a critical distinction between two facilitator concepts:

- `isFacilitator()`: is the logged-in user actually a facilitator? (used for permission gates that should not be relaxed by simulation: data export, user CRUD, sprint advance)
- `isFacilitatorView()`: is the logged-in user a facilitator AND not currently simulating a participant? (used for UI that should DISAPPEAR when the facilitator is acting as a participant: the "hacked" tag on cards, the cross-training assignment column, the admin-only Board supervision tab)

If you add a piece of UI that should only exist in admin, gate it on `isFacilitatorView()`, not `isFacilitator()`. Otherwise the facilitator simulating as Tester will see things the actual Tester doesn't, and the simulation lies.

When a facilitator IS simulating, the bottom-fixed indigo bar (with "Stop simulating" button) is visible. This is the only persistent indicator that simulation is active. Do not remove it or replace it with a banner that scrolls away.

---

## 10. State management on close

Every modal/form close handler must reset every piece of state that the modal/form set. List them explicitly. Do not rely on the Alpine `x-data` defaults to "be wiped"; they aren't, because the `x-data` scope is per-component, not per-open.

Pattern:

```html
@click.self="openIssue = null;
             cardHelpOpen = false;
             rejectFor = null; rejectReason = '';
             askOpen = false; askTargetRole = ''; askTargetTeam = ''; askBody = '';
             answerOpen = false; answerBody = '';
             $store.app.securityCheckResult = null;
             $store.app.shiftLeftResult = null"
```

If you add a new form variable to `x-data`, add a corresponding reset to this handler in the same commit. There is no automatic mechanism.

---

## 11. Copy and microcopy

- **Buttons are imperative + outcome.** "Pick up for rework → In Progress" tells you both what you'll do and where it'll go. "Pickup" alone does not.
- **Toasts are short and informative.** "Rejected. Sent to Clarifications." beats "Rejection processed successfully." Three words to convey state are enough.
- **Use the participant's vocabulary, not the schema's.** "Send response" not "submit answer comment". "Pick up for rework" not "transition to in_progress with cleared clarification fields".
- **Help bullets in the `?` modal use second person.** "You can pick this up to address the issue." Not "User may pick up". Not "The targeted participant should pick up".
- **Empty states are full sentences.** Never an empty `<div></div>`. "No tests run yet. Pick a run button above, or run an individual test from the table below." beats nothing or ", ".

---

## 12. Error and empty states

Every list, every form, every panel has an explicit empty/loading/error treatment. Never assume a default. The participant on a slow connection sees the empty state for several seconds; make it useful.

- **Loading**: a small dot animation, not a giant spinner. The connection-mode dot in the header doubles as the global busy indicator.
- **Empty**: a sentence explaining what should appear and how. "No cards in Market yet. Click + New Product Request to add one."
- **Error**: a toast for transient errors (network, validation), an inline panel for persistent errors (config missing, schema not applied). Never silently fail.

For test runs, the run summary is the global empty/loading/error state. It says one of:

- "No tests run yet. Pick a run button..." (empty)
- "✓ {batch} complete. N passed, M failed." (success)
- A rose-bordered failure list with the failed test ids and contextual follow-ups. (failure)
- "⚠ Aborted after N passed, M failed, K skipped." (aborted)

If a future test runner change collapses these into a single "result: failed" message, that's a regression.

---

## 13. Code structure

Single-page apps in this project follow:

- **One IIFE per concern.** `app.core.js` for constants and supabase, `app.logic.js` for pure helpers, `app.store.js` for state shape, `app.actions.js` for participant handlers, `app.admin.js` for facilitator handlers, `app.boot.js` for Alpine wiring. Never put a pure helper into actions; never put a DB write into logic.
- **Pure helpers are exported from logic.** `canAct`, `effectiveRole`, `flawForIssueId`, `progressFor`, `batchGateOpen`, `helpForCard`, `latestRejectionComment`, `clarificationKind` (in store, depends on instance state). All are testable without Alpine.
- **`window.App` is the namespace.** Each IIFE sets `window.App.{concern} = …`. No globals outside `App`.
- **Boot loads all of them.** If a new module is added, `app.boot.js` mixes its exports into the Alpine store and `tests.html` adds a `<script>` for it. Both, in the same commit.
- **`.prettierrc` is the source of truth for formatting.** No spaces inside object braces (`{foo: 1}` not `{ foo: 1 }`), `printWidth: 120`, double quotes. Match it on every change.
- **Em dashes (`, `) are forbidden in code and prose.** Phrase to avoid them. The exception is academic citations that require them (rare in this project). This is a hard rule of mine, not a stylistic suggestion.

---

## 14. Action handlers read authoritative state from the DB

Every action handler that makes a decision based on a column it (or another handler) might write must read the row fresh from the DB before deciding. Reading from the local cache (`this.users.find`, `this.issues.find`, etc.) is wrong whenever a previous action could have changed the relevant column.

**The bug pattern:**

```js
// WRONG. After a fast promote-then-demote, this.users still shows
// the pre-promote state, so target.hacker_previous_role is null and
// the user is silently demoted to 'developer' instead of restored
// to their original role.
async demoteHacker(token) {
  const target = this.users.find((u) => u.token === token);
  const restoreRole = (target && target.hacker_previous_role) || "developer";
  ...
}
```

**The fix:**

```js
// RIGHT. Read fresh from DB; the local cache is only for rendering.
async demoteHacker(token) {
  const {data: target, error} = await supabase
    .from("users").select("*").eq("token", token).single();
  if (error || !target) return;
  if (target.role !== "hacker") return; // defensive
  const restoreRole = target.hacker_previous_role || "developer";
  ...
}
```

**When the cache IS fine:** if the decision depends only on a column that never changes after creation (`author_token` on a comment, the issue's `id`, etc.), reading the local cache is acceptable. Use cache for layout/rendering; read DB for decisions that gate writes.

**Why production "usually works":** Realtime sync refreshes the cache within ~50ms of any DB change. So in interactive use the race window is tiny. The bug surfaces when:

- Realtime is down and the app is in 3-second polling mode
- A user double-clicks (two actions fire faster than the round-trip)
- The handler is invoked outside Alpine (test harness, scripted automation)

The right rule is: the wrong outcome is silent and permanent. The right outcome is one extra `select` call. Read fresh.

**This principle was learned from `u-promote-demote-roundtrip` failing.** The test exposed `demoteHacker`'s stale-cache read. `editIssue` had the same anti-pattern with milder consequences (race between business edit and dev claim). Both fixed by reading fresh from DB. The current code-base has no remaining instances of this pattern; if you add a new action handler, follow the rule from the start.

---

## 15. Tests

- **Every test has a description.** No "Category explanation below applies" placeholders. The description explains: what input the test sets up, what the SUT actually does, what the test asserts, and what regression class would cause it to fail.
- **E2E tests exercise real action handlers.** Use `ctx.makeMockStore({user})` to build a store-shaped object, then `await window.App.actions.X.call(store, …)`. Tests that walk a card through statuses via `ctx.updateIssue()` only verify the schema accepts the transitions; they do not catch handler bugs. Such tests are still useful as schema-flow tests, but their description must say so honestly.
- **Failure messages identify the bug, not just "assert failed".** `assert(fresh.status === "in_progress", "rejection pickup MUST land in in_progress, got " + fresh.status)` beats `assert(fresh.status === "in_progress")`.
- **Tests cover edge cases beyond the happy path.** For every action: empty body refused, wrong-target refused, self-target refused, status guard refused (e.g. ask on accepted). Not just the success case.
- **Cleanup happens per test AND globally.** Each test tracks its created rows in `ctx`; the harness auto-cleans on test end. The `cleanup` test catches anything that escaped.
- **Token entropy must be `32^6 = ~1B`.** `TEST` prefix + 6 random characters from the 32-char alphabet. The earlier 2-character version (1024 possibilities) caused birthday-paradox collisions within a single run.
- **Run summary uses structured HTML, not run-on text.** Status line + (optional) failure list as bullets + (optional) follow-up bullets. Color-coded by emerald/rose/amber per status. Failed test ids in monospace inside a rose-bordered panel.

---

## 16. Hacker cover identity

Critical participant-flow rule that has been gotten wrong twice. Recording it here so it stops happening.

When a participant is promoted to hacker, **`effectiveRole()` returns their pre-promotion role, not "developer"**. The schema column `users.hacker_previous_role` stores this at promote time and is restored on demote. If you find yourself writing `raw === "hacker" ? "developer" : raw`, that is the bug. The correct logic:

```js
function effectiveRole(user, impersonation) {
  const raw = rawEffectiveRole(user, impersonation);
  if (raw !== "hacker") return raw;
  if (user && user.role === "hacker" && user.hacker_previous_role) {
    return user.hacker_previous_role;
  }
  return "developer"; // legacy/seed fallback only
}
```

`rawEffectiveRole()` continues to return `"hacker"` for permission gates (`isHacker`, the inject and stop-container canAct rules). `effectiveRole()` is only for UI display and comment author attribution. The two are different functions for a reason.

The admin Users table shows hackers with a `cover: <role>` pill so facilitators can verify the cover identity. This is facilitator-only. Participants see only the cover role.

---

## 17. Accessibility

- **`aria-live="polite"` on the run summary.** Screen readers announce result changes without preempting current speech.
- **`aria-labelledby` on landmark sections.** Each section has a heading element and references it from the section's aria-labelledby.
- **Buttons have visible text or aria-label.** No icon-only buttons without an accessible name.
- **Color is never the sole signal.** A red panel says "Rejection" in text; a green button says "Accept" in text. A user with red-green colorblindness is not blocked.
- **Focus rings are visible.** Tailwind's `focus:ring-2 focus:ring-{color}-500` on every input. Do not strip with `outline-none` without a replacement.

---

## 18. When in doubt

- If you're unsure whether to add a new color, don't. Pick the closest existing semantic.
- If you're unsure whether to use bold or italic for emphasis, use bold. Italic is for true tone shifts.
- If you're unsure whether a click target is big enough, make it bigger.
- If you're unsure whether a test description is good enough, write more. Two extra sentences beats a placeholder.
- If you're unsure whether the participant will see something they need, make it visible on the card surface. Students do not click through.

---

## 19. References in code

When implementing or changing something covered above, the relevant locations are:

- Color semantics: `index.html` (search `bg-rose-50`, `bg-blue-50`, `bg-emerald-600`, etc.)
- Touch targets and stacking: `index.html` (search `min-h-[44px]`)
- Modal close handlers: `index.html` line ~193 (the backdrop `@click.self`)
- Optional chaining: 89 `openIssue?.…` references in `index.html`
- Effective role / hacker mask: `app.logic.js` `effectiveRole()` function
- Facilitator vs facilitator-view: `app.store.js` `isFacilitator()` and `isFacilitatorView()`
- Test makeMockStore: `tests.js` `makeMockStore()` method on `TestContext`
- Run summary builder: `tests.html` end-of-batch handler that writes to `#narrative`

If you change one of these, search for the others. They are usually coupled.
