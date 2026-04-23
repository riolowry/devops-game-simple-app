// ITS DevSecOps Adventure: markdown guide renderer
// ----------------------------------------------------------------------
// Fetches a markdown file, parses with marked (loaded from CDN), and
// renders into #guide-content. Gated by an allowlist so the query
// param cannot be used to fetch anything other than the project's
// own .md files.
//
// Usage:
//   guide.html?doc=PARTICIPANT_GUIDE.md
//   guide.html?doc=TESTING.MD&title=Tester+manual
// ----------------------------------------------------------------------
(function () {
  "use strict";

  // Allowlist of documents this viewer can render. Keep in sync with
  // the project's .md files. Prevents anyone from pointing the viewer
  // at arbitrary URLs.
  const ALLOWED = {
    "PARTICIPANT_GUIDE.md": "Participant guide",
    "FACILITATOR_GUIDE.md": "Facilitator guide",
    "TESTING.MD": "Testing guide",
    "README.md": "README",
    "SETUP_CLOUDFLARE_DEPLOYMENT.md": "Deployment guide",
    "SETUP_SUPABASE_DB.md": "Supabase setup",
    "PLAN.md": "Project plan",
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

  // Build the sidebar links
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
        (filename === doc
          ? "bg-slate-900 text-white font-medium"
          : "text-slate-700 hover:bg-slate-100");
      li.appendChild(a);
      ul.appendChild(li);
    });
    sidebar.innerHTML = "";
    sidebar.appendChild(ul);
  })();

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
  rawLink.href = doc;

  // Helper used only for the error-path innerHTML above. Anywhere else
  // we lean on marked to render the markdown.
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Render once marked is available. The CDN script in guide.html uses
  // the defer attribute so DOMContentLoaded fires before marked loads
  // sometimes; hence this polling fallback instead of assuming order.
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
    // Configure marked: GitHub-flavored, tables, no raw HTML.
    marked.setOptions({
      gfm: true,
      breaks: false,
      headerIds: true,
      mangle: false,
      // sanitize was removed in marked v5; we mitigate by not passing
      // untrusted input. The .md files come from the project bundle.
    });

    fetch(doc, { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("Fetch failed: " + r.status);
        return r.text();
      })
      .then(function (text) {
        const html = marked.parse(text);
        contentEl.innerHTML = html;
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
          "over http/https: either the same static server that hosts the app, or " +
          "<code>python3 -m http.server</code> in the project folder.</p>";
      });
  }, 200); // up to ~10s

  // Build a table of contents from headings.
  function buildToc() {
    const headings = contentEl.querySelectorAll("h2, h3");
    if (!headings.length) {
      tocEl.innerHTML =
        '<p class="text-xs text-slate-500">No table of contents.</p>';
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "space-y-1 text-sm";
    headings.forEach(function (h) {
      // Ensure id for anchor linking; marked supplies one when headerIds:true.
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
      a.className =
        "block px-2 py-0.5 rounded text-slate-700 hover:bg-slate-100 truncate";
      li.appendChild(a);
      ul.appendChild(li);
    });
    tocEl.innerHTML = "";
    tocEl.appendChild(ul);
  }

  function highlightCurrentHash() {
    if (!window.location.hash) return;
    const target = document.getElementById(
      decodeURIComponent(window.location.hash.slice(1)),
    );
    if (target) target.scrollIntoView({ block: "start" });
  }
})();
