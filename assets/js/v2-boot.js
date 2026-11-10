// hlix v2 — runs first, in <head>, before the page draws: motion and theme settings,
// where the site root is (this tag's data-base), and whether someone is signed in on this
// browser. It's a file rather than an inline script so the site's Content-Security-Policy
// can allow scripts from this site only, which stops injected scripts from running.
(function () {
  var h = document.documentElement;
  h.classList.add("js");
  if (/[?&]motion=off/.test(location.search) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) h.classList.add("no-motion");
  try {
    var t = localStorage.getItem("hlix-theme");
    if (t === "light" || t === "dark") h.setAttribute("data-theme", t);
  } catch (e) {}
  var me = document.currentScript;
  window.HLIX2 = { base: (me && me.getAttribute("data-base")) || "" };
  // api/account.js sets hlix_in while someone's signed in (the session itself is in cookies no script can read)
  if (/(?:^|;\s*)hlix_in=1/.test(document.cookie)) h.classList.add("signed-in");
})();
