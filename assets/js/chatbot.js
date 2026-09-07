// hlix — chat widget frontend. Talks to /api/chat, a serverless function
// that only exists once this site is deployed to Vercel (or an
// equivalent host) with ANTHROPIC_API_KEY configured. On a local static
// preview (python -m http.server, file://, GitHub Pages without the
// function) there is no backend to answer, and the widget says so.
(function () {
  "use strict";

  var STORAGE_KEY = "hlix_chat_history";
  var history = [];
  try { history = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]"); } catch (e) { history = []; }

  var root = document.createElement("div");
  root.className = "chatbot";
  root.innerHTML =
    '<button class="chatbot__toggle" data-chatbot-toggle aria-label="Open AI assistant">' +
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/><path d="M18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 0 0 1.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"/></svg>' +
    '</button>' +
    '<div class="chatbot__panel" data-chatbot-panel>' +
      '<div class="chatbot__head">' +
        '<div><strong>hlix AI assistant</strong><span>Catalog &amp; general research Q&amp;A</span></div>' +
        '<button class="chatbot__close" data-chatbot-close aria-label="Close chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
      '</div>' +
      '<div class="chatbot__log" data-chatbot-log></div>' +
      '<form class="chatbot__form" data-chatbot-form>' +
        '<input type="text" data-chatbot-input placeholder="Ask about a compound…" autocomplete="off" maxlength="2000">' +
        '<button type="submit" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>' +
      '</form>' +
    '</div>';
  document.body.appendChild(root);

  var toggle = root.querySelector("[data-chatbot-toggle]");
  var panel = root.querySelector("[data-chatbot-panel]");
  var log = root.querySelector("[data-chatbot-log]");
  var form = root.querySelector("[data-chatbot-form]");
  var input = root.querySelector("[data-chatbot-input]");
  var closeBtn = root.querySelector("[data-chatbot-close]");

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render() {
    log.innerHTML = history.map(function (m) {
      return '<div class="chatbot-msg chatbot-msg--' + m.role + '">' + escapeHtml(m.content) + "</div>";
    }).join("");
    log.scrollTop = log.scrollHeight;
  }

  function addMessage(role, content) {
    history.push({ role: role, content: content });
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-20))); } catch (e) {}
    render();
  }

  if (history.length === 0) {
    addMessage("assistant", "Hey — ask me about a compound, a category, or how the catalog's priced.");
  } else {
    render();
  }

  toggle.addEventListener("click", function () {
    panel.classList.toggle("is-open");
    if (panel.classList.contains("is-open")) setTimeout(function () { input.focus(); }, 10);
  });
  closeBtn.addEventListener("click", function () { panel.classList.remove("is-open"); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    addMessage("user", text);
    input.value = "";

    history.push({ role: "assistant", content: "…" });
    render();

    var payloadHistory = history.slice(0, -1).filter(function (m) { return m.content !== "…"; });

    fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text, history: payloadHistory }),
    })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        history.pop();
        addMessage("assistant", res.ok ? res.data.reply : (res.data.error || "Something went wrong."));
      })
      .catch(function () {
        history.pop();
        addMessage("assistant", "Couldn't reach the assistant. This only works once the site is deployed with the chat backend live (see README).");
      });
  });
})();
