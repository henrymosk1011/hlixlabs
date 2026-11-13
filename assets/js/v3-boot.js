// hlix — the main site's first script, in <head> before the page draws: motion and theme
// settings, where the site root is (this tag's data-base for pages, data-assets for files),
// and whether someone is signed in on this browser. A file rather than an inline script so
// the Content-Security-Policy can allow scripts from this site only.
(function () {
  var h = document.documentElement;
  h.classList.add("js");
  if (/[?&]motion=off/.test(location.search) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) h.classList.add("no-motion");
  try {
    var t = localStorage.getItem("hlix-theme");
    if (t === "light" || t === "dark") h.setAttribute("data-theme", t);
  } catch (e) {}
  var me = document.currentScript;
  var base = (me && me.getAttribute("data-base")) || "";
  var assets = (me && me.getAttribute("data-assets")) || "";
  window.HLIX2 = { base: base };                 // read by the shared scripts (chat, calculator, planner)
  window.HLIX3 = { base: base, assets: assets }; // read by v3.js, v3-cart.js
  // api/account.js sets hlix_in while someone's signed in (the session itself is in cookies no script can read)
  if (/(?:^|;\s*)hlix_in=1/.test(document.cookie)) {
    h.classList.add("signed-in");
    // a silver, gold or family & friends account, as last loaded here: members-only products
    // (bac water) show at once; v3-cart.js checks with the account and corrects it
    try { if (localStorage.getItem("hlix_member") === "1") h.classList.add("is-member"); } catch (e) {}
  }
})();
