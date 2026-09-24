// hlix v2 — ai assistant widget. talks to /api/chat (vercel serverless function).
// on a static-only preview there is no backend, and the widget says so.
(function () {
  "use strict";
  var d = document, root = d.documentElement;
  var KEY = "hlix_v2_chat";
  var history = [];
  try { history = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch (e) { history = []; }

  var SPARK = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/><path d="M18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 0 0 1.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"/></svg>';
  var CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  var fab = d.createElement("button");
  fab.className = "chat-fab";
  fab.setAttribute("aria-label", "open ai assistant");
  fab.innerHTML = SPARK + "<span>ask ai</span>";

  var panel = d.createElement("div");
  panel.className = "chat";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "hlix ai assistant");
  panel.innerHTML =
    '<div class="chat__head"><div><strong>' + SPARK + 'hlix ai</strong><small>catalog + general research q&amp;a</small></div>' +
    '<button class="chat__x" aria-label="close">' + CLOSE + "</button></div>" +
    '<div class="chat__log" data-log></div>' +
    '<div class="chat__sug" data-sug></div>' +
    '<form class="chat__form" data-form><input type="text" placeholder="ask about a compound…" maxlength="2000" autocomplete="off" data-in>' +
    '<button type="submit" aria-label="send">' + SEND + "</button></form>";
  d.body.appendChild(fab);
  d.body.appendChild(panel);

  var log = panel.querySelector("[data-log]");
  var sug = panel.querySelector("[data-sug]");
  var form = panel.querySelector("[data-form]");
  var input = panel.querySelector("[data-in]");
  var busy = false;

  var SUGGEST = ["what sizes does dsip come in?", "what's in metabolic research?", "how does the calculator work?"];

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function scroll() { log.scrollTop = log.scrollHeight; }
  function add(role, text) {
    var m = d.createElement("div");
    m.className = "chat__m chat__m--" + (role === "user" ? "u" : "a");
    m.innerHTML = esc(text);
    log.appendChild(m); scroll();
    return m;
  }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(history.slice(-20))); } catch (e) {} }

  function setOpen(open) {
    root.classList.toggle("chat-open", open);
    if (open) setTimeout(function () { input.focus(); }, 300);
  }
  window.HLIX2 = window.HLIX2 || {};
  window.HLIX2.openChat = function () { setOpen(true); };
  fab.addEventListener("click", function () { setOpen(true); });
  panel.querySelector(".chat__x").addEventListener("click", function () { setOpen(false); });
  d.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });

  if (history.length) {
    history.forEach(function (m) { add(m.role, m.content); });
  } else {
    add("assistant", "hey — ask me about a compound, a category, or how the catalog's priced.");
    SUGGEST.forEach(function (s) {
      var b = d.createElement("button");
      b.type = "button"; b.textContent = s;
      b.addEventListener("click", function () { send(s); });
      sug.appendChild(b);
    });
  }

  function send(text) {
    if (busy || !text.trim()) return;
    busy = true;
    sug.innerHTML = "";
    add("user", text);
    var prior = history.slice();
    history.push({ role: "user", content: text });

    var typing = d.createElement("div");
    typing.className = "chat__m chat__m--a";
    typing.innerHTML = '<span class="chat__dots"><i></i><i></i><i></i></span>';
    log.appendChild(typing); scroll();

    fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text, history: prior }),
    })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        typing.remove();
        var reply = res.ok ? res.data.reply : (res.data.error || "something went wrong.");
        add("assistant", reply);
        if (res.ok) { history.push({ role: "assistant", content: reply }); save(); }
      })
      .catch(function () {
        typing.remove();
        add("assistant", "couldn't reach the assistant. it only answers on the deployed site, where the chat backend is live.");
      })
      .then(function () { busy = false; });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = input.value;
    input.value = "";
    send(t);
  });
})();
