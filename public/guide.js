// ITS DevSecOps Adventure: markdown guide renderer
// Fetches a markdown file, parses with marked, renders into
// #guide-content. Allowlist gates the doc query param.
// Usage:
//   guide.html?doc=PARTICIPANT_GUIDE.md
//   guide.html?doc=ROLE_DEVELOPER.md&title=Developer+Guide
(function () {
  "use strict";

  const ALLOWED = {
    "PARTICIPANT_GUIDE.md": "Participant guide",
    "FACILITATOR_GUIDE.md": "Facilitator guide",
    "TESTING_GUIDE.md": "Testing guide",
    "ROLE_BUSINESS.md": "Role: Business",
    "ROLE_DEVELOPER.md": "Role: Developer",
    "ROLE_TESTER.md": "Role: Tester",
    "ROLE_SECURITY.md": "Role: Security",
    "ROLE_SYSADMIN.md": "Role: SysAdmin",
    "ROLE_OBSERVER.md": "Role: Observer",
    "ROLE_HACKER.md": "Role: Hacker",
    "ROLE_FACILITATOR.md": "Role: Facilitator",
    "SPRINT1_SCENARIO.md": "Sprint 1 scenario",
    "SPRINT2_SCENARIO.md": "Sprint 2 scenario",
    "SPRINT3_SCENARIO.md": "Sprint 3 scenario",
  };

  const params = new URLSearchParams(window.location.search);
  const doc = params.get("doc") || "PARTICIPANT_GUIDE.md";
  const titleOverride = params.get("title");

  const titleEl = document.getElementById("guide-title");
  const subEl = document.getElementById("guide-subtitle");
  const contentEl = document.getElementById("guide-content");
  const tocEl = document.getElementById("guide-toc");
  const rawLink = document.getElementById("guide-raw-link");
  const sidebar = document.getElementById("guide-sidebar");

  (function buildSidebar() {
    const ul = document.createElement("ul");
    ul.className = "space-y-1";
    Object.keys(ALLOWED).forEach(function (filename) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "guide.html?doc=" + encodeURIComponent(filename);
      a.textContent = ALLOWED[filename];
      a.className =
        "block px-2 py-1 rounded text-sm " +
        (filename === doc ? "bg-slate-900 text-white font-medium" : "text-slate-700 hover:bg-slate-100");
      li.appendChild(a);
      ul.appendChild(li);
    });
    sidebar.innerHTML = "";
    sidebar.appendChild(ul);
  })();

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  if (!Object.prototype.hasOwnProperty.call(ALLOWED, doc)) {
    titleEl.textContent = "Guide not found";
    contentEl.innerHTML =
      '<p class="text-rose-700">Unknown document: <code>' +
      escapeHtml(doc) +
      "</code>. Pick one from the list on the left.</p>";
    return;
  }

  document.title = (titleOverride || ALLOWED[doc]) + " · Guide";
  titleEl.textContent = titleOverride || ALLOWED[doc];
  subEl.textContent = doc;
  rawLink.href = "guides/" + doc;

  function whenReady(cb, tries) {
    if (window.marked) return cb();
    if (tries <= 0) {
      contentEl.innerHTML =
        '<p class="text-rose-700">Markdown renderer failed to load. ' +
        "Check your internet connection (marked is loaded from cdnjs) and reload.</p>";
      return;
    }
    setTimeout(function () {
      whenReady(cb, tries - 1);
    }, 50);
  }

  whenReady(function () {
    marked.setOptions({gfm: true, breaks: false, headerIds: true, mangle: false});
    fetch("guides/" + doc, {cache: "no-cache"})
      .then(function (r) {
        if (!r.ok) throw new Error("Fetch failed: " + r.status);
        return r.text();
      })
      .then(function (text) {
        contentEl.innerHTML = marked.parse(text);
        buildToc();
        highlightCurrentHash();
      })
      .catch(function (err) {
        contentEl.innerHTML =
          '<p class="text-rose-700">Could not load <code>' +
          escapeHtml(doc) +
          "</code>: " +
          escapeHtml(err.message) +
          "</p>" +
          '<p class="text-sm text-slate-500">' +
          "This usually means you are opening guide.html directly from the filesystem " +
          "(<code>file://</code>). Markdown fetch only works when the page is served " +
          "over http/https.</p>";
      });
  }, 200);

  function buildToc() {
    const headings = contentEl.querySelectorAll("h2, h3");
    if (!headings.length) {
      tocEl.innerHTML = '<p class="text-xs text-slate-500">No table of contents.</p>';
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "space-y-1 text-sm";
    headings.forEach(function (h) {
      if (!h.id) {
        h.id = h.textContent
          .toLowerCase()
          .trim()
          .replace(/[^\w]+/g, "-")
          .replace(/^-+|-+$/g, "");
      }
      const li = document.createElement("li");
      li.className = h.tagName === "H3" ? "pl-3" : "";
      const a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.textContent;
      a.className = "block px-2 py-0.5 rounded text-slate-700 hover:bg-slate-100 truncate";
      li.appendChild(a);
      ul.appendChild(li);
    });
    tocEl.innerHTML = "";
    tocEl.appendChild(ul);
  }

  function highlightCurrentHash() {
    if (!window.location.hash) return;
    const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) target.scrollIntoView({block: "start"});
  }
})();
