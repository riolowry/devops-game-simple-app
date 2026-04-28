// ============================================================
// app.boot.js: Alpine.store("app", ...) registration. Reads
// pieces off window.App that earlier files attached, mixes them
// into a single Alpine store. adminActions are mixed in only
// when present (admin.html loads app.admin.js, index.html does
// not).
// ============================================================
(function () {
  "use strict";
  if (!window.App || !window.App.storeShape) {
    // app.core.js bailed out (config missing); nothing to do.
    return;
  }
  document.addEventListener("alpine:init", () => {
    if (!window.Alpine || !window.Alpine.store) {
      console.warn("[devsec] Alpine not present at alpine:init");
      return;
    }
    const merged = Object.assign(
      {},
      window.App.storeShape,
      window.App.actions || {},
      window.App.adminActions || {},
    );
    Alpine.store("app", merged);
  });
})();
