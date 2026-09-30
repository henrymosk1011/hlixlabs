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

  // Auto-link any peptide name the assistant mentions to its product page.
  // Built once from window.HLIX_SEARCH_INDEX (already loaded site-wide for
  // the nav search), so this has no server round-trip and can't go stale.
  var linkPeptideNames = (function () {
    var items = window.HLIX_SEARCH_INDEX || [];
    if (!items.length) return null;
    var base = (window.HLIX2 && window.HLIX2.base) || "";
    var bySlug = {};
    var names = [];
    items.forEach(function (it) {
      bySlug[it.name.toLowerCase()] = it.slug;
      names.push(it.name);
    });
    names.sort(function (a, b) { return b.length - a.length; });
    var pattern = names.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|");
    var re = new RegExp("(?<![a-z0-9])(" + pattern + ")(?![a-z0-9])", "gi");
    return function (s) {
      return s.replace(re, function (match) {
        var slug = bySlug[match.toLowerCase()];
        return slug ? '<a href="' + base + "peptides/" + slug + '.html">' + match + "</a>" : match;
      });
    };
  })();

  // Small, safe markdown-lite renderer for assistant replies: escapes all
  // HTML first (the model's own text is untrusted), then recognizes a
  // narrow subset of markdown (bold, bullet/numbered lists, paragraphs,
  // line breaks) so replies read like a normal formatted chat message
  // instead of one unbroken, unwrapped block of text.
  function renderMarkdown(raw) {
    var lines = esc(raw).replace(/\r\n/g, "\n").split("\n");
    var html = "", i = 0;
    function inline(s) {
      if (linkPeptideNames) s = linkPeptideNames(s);
      return s
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[\s(])\*(?!\s)(.+?)(?!\s)\*(?=[\s).,!?]|$)/g, "$1<em>$2</em>")
        .replace(/`([^`]+?)`/g, "<code>$1</code>");
    }
    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^(-|\*)\s+/.test(line)) {
        var items = [];
        while (i < lines.length && /^(-|\*)\s+/.test(lines[i])) { items.push("<li>" + inline(lines[i].replace(/^(-|\*)\s+/, "")) + "</li>"); i++; }
        html += "<ul>" + items.join("") + "</ul>";
        continue;
      }
      if (/^\d+\.\s+/.test(line)) {
        var oitems = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { oitems.push("<li>" + inline(lines[i].replace(/^\d+\.\s+/, "")) + "</li>"); i++; }
        html += "<ol>" + oitems.join("") + "</ol>";
        continue;
      }
      var para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(-|\*)\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i])) { para.push(lines[i]); i++; }
      html += "<p>" + inline(para.join(" ")) + "</p>";
    }
    return html;
  }

  function add(role, text) {
    var m = d.createElement("div");
    m.className = "chat__m chat__m--" + (role === "user" ? "u" : "a");
    m.innerHTML = role === "user" ? esc(text) : renderMarkdown(text);
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
    add("assistant", "hey, ask me about a compound, a category, or how the catalog's priced.");
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
