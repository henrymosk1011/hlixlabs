// hlix v2 — the account page (account.html): sign in, make an account, reset a password,
// and once signed in: your orders, shipping details and password. Talks to /api/account
// through window.HLIXAccount (v2-cart.js), which also keeps the cart in step. Everything
// shown here is set as text, never as HTML.
(function () {
  "use strict";
  var d = document;
  var A = window.HLIXAccount;
  var page = d.querySelector("[data-acct]");
  if (!page || !A) return;

  function $(s, c) { return (c || d).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); }
  function el(tag, cls, txt) {
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined && txt !== null) e.textContent = String(txt);
    return e;
  }
  function money(n) { return "$" + Math.ceil((Number(n) || 0) - 1e-9).toLocaleString("en-US"); }
  var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function day(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    return m ? MONTHS[+m[2] - 1] + " " + +m[3] + ", " + m[1] : "";
  }

  var loading = $("[data-acct-loading]");
  var outView = $("[data-acct-out]");
  var inView = $("[data-acct-in]");
  var forms = {};
  $$("[data-acct-form]").forEach(function (f) { forms[f.getAttribute("data-acct-form")] = f; });

  // Only places on this site, by name (never a URL from the address bar).
  var NEXT = { checkout: "checkout.html" };
  var next = NEXT[new URLSearchParams(location.search).get("next") || ""] || "";

  function status(form, msg, isError) {
    var s = $("[data-acct-status]", form);
    if (!s) return;
    s.hidden = !msg;
    s.textContent = msg || "";
    s.classList.toggle("is-error", !!isError);
  }
  function busy(form, on) {
    $$("button", form).forEach(function (b) { b.disabled = on; });
  }

  // ------------------------------------------------------------ signed out ---
  function show(which) {
    ["signin", "signup", "forgot"].forEach(function (k) {
      forms[k].hidden = k !== which;
      status(forms[k], "");
    });
    $$("[data-acct-tab]").forEach(function (t) {
      var on = t.getAttribute("data-acct-tab") === which;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    var first = $("input", forms[which]);
    if (first && d.activeElement && d.activeElement.closest && d.activeElement.closest("[data-acct-out]")) first.focus();
  }
  $$("[data-acct-tab]").forEach(function (t) {
    t.addEventListener("click", function () { show(t.getAttribute("data-acct-tab")); });
    t.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var to = t.getAttribute("data-acct-tab") === "signin" ? "signup" : "signin";
      show(to);
      $('[data-acct-tab="' + to + '"]').focus();
    });
  });
  $$("[data-acct-go]").forEach(function (b) {
    b.addEventListener("click", function () {
      var to = b.getAttribute("data-acct-go");
      var mail = $('input[name="email"]', forms.signin).value;
      if (to === "forgot" && mail) $('input[name="email"]', forms.forgot).value = mail;
      show(to);
    });
  });

  function afterSignIn(form) {
    status(form, "signed in. one moment…");
    return A.afterSignIn().then(function (data) {
      if (next && data && data.signedIn) { location.href = next; return; }
      render(data);
    });
  }

  forms.signin.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = forms.signin;
    var email = f.email.value.trim(), password = f.password.value;
    if (!email || !password) return status(f, "enter your email and password.", true);
    busy(f, true);
    status(f, "signing in…");
    A.api({ action: "signin", email: email, password: password }).then(function (r) {
      f.password.value = "";
      if (!r.ok) { busy(f, false); return status(f, (r.data.error || "you couldn't be signed in.").toLowerCase(), true); }
      return afterSignIn(f).then(function () { busy(f, false); });
    });
  });

  forms.signup.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = forms.signup;
    var email = f.email.value.trim(), password = f.password.value;
    if (!email) return status(f, "enter your email.", true);
    if (password.length < 10) return status(f, "use at least 10 characters for your password.", true);
    busy(f, true);
    status(f, "making your account…");
    A.api({ action: "signup", name: f.name.value.trim(), email: email, password: password }).then(function (r) {
      if (!r.ok) { busy(f, false); return status(f, (r.data.error || "your account couldn't be made.").toLowerCase(), true); }
      f.password.value = "";
      if (r.data.confirm) { busy(f, false); return status(f, "almost there: open the link we just emailed you to finish."); }
      return afterSignIn(f).then(function () { busy(f, false); });
    });
  });

  forms.forgot.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = forms.forgot;
    var email = f.email.value.trim();
    if (!email) return status(f, "enter your email.", true);
    busy(f, true);
    A.api({ action: "forgot", email: email }).then(function (r) {
      busy(f, false);
      if (!r.ok) return status(f, (r.data.error || "that didn't work. try again in a moment.").toLowerCase(), true);
      status(f, "if there's an account for that email, a link to set a new password is on its way.");
    });
  });

  // ------------------------------------------------------------- signed in ---
  var STATUS = { pending: "received", fulfilled: "complete", cancelled: "cancelled" };
  function orderCard(o) {
    var card = el("article", "acct__order" + (o.status === "cancelled" ? " is-cancelled" : ""));
    var head = el("div", "acct__order-head");
    head.appendChild(el("b", "", "#" + (o.ref || "")));
    head.appendChild(el("span", "", day(o.ordered_on)));
    var st = o.status === "fulfilled" && o.delivery === "shipped" ? "shipped" : STATUS[o.status] || o.status;
    head.appendChild(el("span", "acct__pill acct__pill--" + (o.status || ""), st));
    card.appendChild(head);

    var list = el("ul", "acct__items");
    (Array.isArray(o.items) ? o.items : []).forEach(function (it) {
      var li = el("li");
      li.appendChild(el("span", "", (Number(it.qty) || 0) + "× " + (it.name || "")));
      li.appendChild(el("span", "", money((Number(it.qty) || 0) * (Number(it.price) || 0))));
      list.appendChild(li);
    });
    card.appendChild(list);

    var total = Number(o.total) || 0, paid = Number(o.paid) || 0;
    var foot = el("div", "acct__order-foot");
    var bits = [];
    if (Number(o.discount)) bits.push("discount −" + money(o.discount));
    if (Number(o.shipping)) bits.push("shipping " + money(o.shipping));
    foot.appendChild(el("span", "", bits.join(" · ")));
    foot.appendChild(el("b", "", money(total)));
    card.appendChild(foot);

    var pay = o.status === "cancelled" ? "" : paid >= total - 0.005 ? "paid in full" : paid > 0 ? money(paid) + " paid · " + money(total - paid) + " to go" : "payment: we'll email you how to pay";
    if (pay) card.appendChild(el("p", "acct__pay" + (paid >= total - 0.005 ? " is-paid" : ""), pay));
    if (o.tracking) {
      var tr = el("p", "acct__track", "tracking: ");
      tr.appendChild(el("span", "", o.tracking));
      card.appendChild(tr);
    }
    return card;
  }

  function render(data) {
    loading.hidden = true;
    data = data || { signedIn: false };
    var on = !!data.signedIn;
    outView.hidden = on;
    inView.hidden = !on;
    if (!on) {
      if (data.offline) status(forms.signin, "couldn't reach the server. check your connection and reload.", true);
      return;
    }
    $("[data-acct-email]").textContent = data.email || "";
    var tier = $("[data-acct-tier]");
    if (tier) tier.hidden = data.tier !== "family";
    forms.reset.hidden = !data.reset;
    var p = data.profile || {};
    ["name", "phone", "address1", "address2", "city", "state", "zip", "country"].forEach(function (k) {
      var input = forms.profile.elements[k];
      if (input && d.activeElement !== input) input.value = typeof p[k] === "string" ? p[k] : "";
    });
    var box = $("[data-acct-orders]");
    box.textContent = "";
    var orders = Array.isArray(data.orders) ? data.orders : [];
    orders.forEach(function (o) { box.appendChild(orderCard(o)); });
    $("[data-acct-orders-empty]").hidden = orders.length > 0;
  }

  forms.profile.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = forms.profile, profile = {};
    ["name", "phone", "address1", "address2", "city", "state", "zip", "country"].forEach(function (k) { profile[k] = f.elements[k].value.trim(); });
    busy(f, true);
    A.api({ action: "profile", profile: profile }).then(function (r) {
      busy(f, false);
      if (r.status === 401) return A.reload().then(render);
      status(f, r.ok ? "saved." : (r.data.error || "your details couldn't be saved.").toLowerCase(), !r.ok);
    });
  });

  function passwordForm(f, withCurrent) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var pw = f.password.value;
      if (pw.length < 10) return status(f, "use at least 10 characters for your new password.", true);
      var body = { action: "password", password: pw };
      if (withCurrent) body.current = f.current.value;
      busy(f, true);
      A.api(body).then(function (r) {
        busy(f, false);
        f.password.value = "";
        if (withCurrent) f.current.value = "";
        if (r.status === 401 && !withCurrent) return A.reload().then(render);
        status(f, r.ok ? "password changed. other devices will need to sign in again." : (r.data.error || "your password couldn't be changed.").toLowerCase(), !r.ok);
        if (r.ok && !withCurrent) setTimeout(function () { f.hidden = true; }, 2500);
      });
    });
  }
  passwordForm(forms.password, true);
  passwordForm(forms.reset, false);

  function signOut(everywhere) {
    A.api({ action: "signout", everywhere: everywhere }).then(function () {
      A.signedOut();
      render({ signedIn: false });
      show("signin");
    });
  }
  $("[data-acct-signout]").addEventListener("click", function () { signOut(false); });
  $("[data-acct-signout-all]").addEventListener("click", function () { signOut(true); });

  // ------------------------------------------------------------- email links ---
  // Confirm-email and reset-password links land here with a session in the address's
  // #fragment. Take it out of the address bar at once, then hand it to the server, which
  // checks it and keeps it in cookies.
  function fromLink() {
    var h = location.hash.slice(1);
    if (!/access_token=|error_description=/.test(h)) return null;
    var q = new URLSearchParams(h);
    history.replaceState(null, "", location.pathname + location.search);
    if (q.get("error_description")) {
      render({ signedIn: false });
      status(forms.signin, ("that link didn't work: " + q.get("error_description")).toLowerCase().slice(0, 200), true);
      return Promise.resolve(false);
    }
    return A.api({ action: "link", access_token: q.get("access_token") || "", refresh_token: q.get("refresh_token") || "" }).then(function (r) {
      if (!r.ok) {
        render({ signedIn: false });
        status(forms.signin, (r.data.error || "that link didn't work.").toLowerCase(), true);
        return false;
      }
      return true;
    });
  }

  function start() {
    var linked = fromLink();
    return (linked ? linked.then(function (ok) { return ok ? A.afterSignIn() : null; }) : A.reload()).then(function (data) {
      if (data) render(data);
    });
  }
  start();
  // A link opened in this same tab while the page is already open.
  window.addEventListener("hashchange", function () {
    if (/access_token=|error_description=/.test(location.hash)) start();
  });
})();
