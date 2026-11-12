// hlix — the cart (main site). No payment processor: checkout (v3-checkout.js) sends an
// order request instead of charging a card. The cart lives in localStorage ("hlix_cart",
// the same storage and line shape as the archived /v2/ site); while someone's signed in
// (an account, api/account.js) it's also saved to their account so it follows them to any
// device. Signing in merges this browser's cart into the account's; signing out clears it
// from this browser.
//
// Exposes window.HLIXCart (the product page in v3.js, checkout) and window.HLIXAccount
// (the account page's v2-account.js, checkout), and fires "hlix:cart" when the cart
// changes and "hlix:account" when who's signed in is known.
(function () {
  "use strict";
  var d = document, root = d.documentElement;
  var KEY = "hlix_cart";
  var SYNCED = "hlix_cart_synced"; // the cart as last saved to the account, to tell edits made here since
  var cfg = window.HLIX3 || { base: "", assets: "" };

  function $(s, c) { return (c || d).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  // Website prices are whole dollars; member prices can have cents.
  function money(n) {
    var c = Math.round((Number(n) || 0) * 100);
    return "$" + (c % 100 ? (c / 100).toFixed(2) : (c / 100).toLocaleString("en-US"));
  }
  function fire(name, detail) {
    var ev;
    try { ev = new CustomEvent(name, { detail: detail }); } catch (e) { ev = d.createEvent("CustomEvent"); ev.initCustomEvent(name, false, false, detail); }
    d.dispatchEvent(ev);
  }
  var MINUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>';
  var PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

  function get() { try { var c = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(c) ? c : []; } catch (e) { return []; } }
  function count(cart) { return cart.reduce(function (s, it) { return s + (it.qty || 0); }, 0); }
  function subtotal(cart) { return cart.reduce(function (s, it) { return s + it.unitPrice * it.qty; }, 0); }
  function key(it) { return it.sku + "|" + it.form + "|" + (it.unit === "pack" ? "pack" : "vial"); }

  var lastCount = count(get());
  function save(cart, localOnly) {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {}
    render(cart);
    fire("hlix:cart");
    if (!localOnly && signedIn()) schedulePush();
  }

  // ------------------------------------------------------------------
  // the account's copy (api/account.js)
  // ------------------------------------------------------------------
  function signedIn() { return /(?:^|;\s*)hlix_in=1/.test(d.cookie); }
  function text(v, max) { return typeof v === "string" ? v.slice(0, max) : ""; }
  function slim(cart) {
    return cart.slice(0, 50).map(function (it) {
      var q = Math.max(1, Math.min(999, parseInt(it.qty, 10) || 1));
      return {
        sku: text(it.sku, 40), form: it.form === "powder" ? "powder" : "recon", unit: it.unit === "pack" ? "pack" : "vial", qty: q,
        name: text(it.name, 160), dose: text(it.dose, 40), slug: text(it.slug, 120), category: text(it.category, 80),
        unitPrice: Math.max(0, Number(it.unitPrice) || 0)
      };
    }).filter(function (it) { return it.sku; });
  }
  function shape(cart) { return JSON.stringify(slim(cart).map(function (it) { return [it.sku, it.form, it.unit, it.qty]; })); }
  function readSynced() { try { return localStorage.getItem(SYNCED); } catch (e) { return null; } }
  function setSynced(cart) { try { localStorage.setItem(SYNCED, shape(cart)); } catch (e) {} }
  // Same product, form and unit in both: the bigger amount (never doubled up).
  function merge(a, b) {
    var out = [], at = {};
    a.concat(b).forEach(function (it) {
      var k = key(it);
      if (at[k] === undefined) { at[k] = out.length; out.push(JSON.parse(JSON.stringify(it))); }
      else if ((it.qty | 0) > (out[at[k]].qty | 0)) out[at[k]].qty = it.qty | 0;
    });
    return slim(out);
  }
  function api(body) {
    return fetch("/api/account", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, status: r.status, data: data || {} }; });
    }, function () { return { ok: false, status: 0, data: { error: "couldn't reach the server. check your connection and try again." } }; });
  }
  var pushTimer = null;
  function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(push, 400); }
  function push() {
    var cart = get();
    return api({ action: "cart", cart: slim(cart) }).then(function (r) {
      if (r.ok) setSynced(cart);
      else if (r.status === 401) root.classList.remove("signed-in");
      return r;
    });
  }
  // Who's signed in, and their cart. `merging`: just signed in, so this browser's cart
  // (made signed out) joins the account's. Otherwise the account's cart wins, unless this
  // browser has changes that never reached it.
  function load(merging) {
    return fetch("/api/account", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        data = data && typeof data === "object" ? data : { signedIn: false };
        account.data = data;
        root.classList.toggle("signed-in", !!data.signedIn);
        if (data.signedIn) {
          var local = get(), server = Array.isArray(data.cart) ? data.cart : [];
          if (!merging && readSynced() !== null && shape(local) === readSynced()) {
            save(slim(server), true);
            setSynced(server);
          } else {
            var both = merge(server, local);
            save(both, true);
            if (shape(both) !== shape(server)) push(); else setSynced(both);
          }
        }
        fire("hlix:account", data);
        return data;
      }, function () {
        return (account.data = { signedIn: false, offline: true });
      });
  }
  var account = {
    data: null,
    api: api,
    signedIn: signedIn,
    reload: function () { return (account.ready = load(false)); },
    afterSignIn: function () { return (account.ready = load(true)); },
    // Signed out: this browser forgets the cart (it's the account's, not the browser's).
    signedOut: function () {
      try { localStorage.removeItem(SYNCED); } catch (e) {}
      root.classList.remove("signed-in");
      account.data = { signedIn: false };
      save([], true);
      fire("hlix:account", account.data);
    }
  };
  account.ready = signedIn() ? load(false) : Promise.resolve((account.data = { signedIn: false }));
  window.HLIXAccount = account;

  // ------------------------------------------------------------------
  // family & friends pricing: an account an admin marked as family & friends gets hlix's
  // cost (account.data.prices: a pack of 10, by SKU). A vial is a tenth of the pack, rounded
  // up to the cent; powder and ready to use cost the same. The database prices every order
  // itself; these are only what the pages show.
  // ------------------------------------------------------------------
  function familyPack(sku) {
    var a = account.data;
    var p = a && a.tier === "family" && a.prices ? Number(a.prices[sku]) : 0;
    return p > 0 ? p : null;
  }
  function familyPrice(sku, unit) {
    var p = familyPack(sku);
    if (p === null) return null;
    var cents = Math.round(p * 100);
    return unit === "pack" ? cents / 100 : Math.ceil(cents / 10) / 100;
  }

  // ------------------------------------------------------------------
  // silver and gold: a percent off the website price (account.data.discount: 25 or 50),
  // on every vial, powder or ready to use, to the cent. By the vial only. The database
  // prices every order itself (shop_place_order); these are only what the pages show.
  // ------------------------------------------------------------------
  function member() {
    var a = account.data, off = a && (a.tier === "silver" || a.tier === "gold") ? Number(a.discount) : 0;
    return off > 0 && off < 100 ? { tier: a.tier, off: off } : null;
  }
  // a website price (whole dollars) with the member's discount off, or the same price
  function memberPrice(price) {
    var m = member();
    return m && price > 0 ? Math.round(price * (100 - m.off)) / 100 : price;
  }

  // Every line at its current price: family & friends prices for them, the live website
  // price (less a member's discount) for everyone else (v2-prices.js). A pack keeps its
  // price if there's none.
  function reprice() {
    var cart = get(), changed = false;
    cart.forEach(function (it) {
      var u = familyPrice(it.sku, it.unit);
      if (u === null && it.unit !== "pack" && window.HLIXPrices) {
        u = window.HLIXPrices.unit(it.sku, it.form);
        if (u !== null) u = memberPrice(u);
      }
      if (u !== null && u !== it.unitPrice) { it.unitPrice = u; changed = true; }
    });
    if (changed) save(cart, true); // only prices changed: nothing to save to the account
  }
  d.addEventListener("hlix:prices", reprice);
  d.addEventListener("hlix:account", reprice);

  // ------------------------------------------------------------------
  // the cart's own API
  // ------------------------------------------------------------------
  function photo(it) { return cfg.assets + "assets/img/vials/" + String(it.sku || "").toLowerCase() + "-" + (it.form === "powder" ? "powder" : "recon") + "-s.webp"; }
  function url(it) { return cfg.base + "peptides/" + it.slug; }
  function formLabel(f) { return f === "recon" ? "ready to use" : "powder"; }
  function lineMeta(it) {
    return esc(it.dose) + " · " + formLabel(it.form) + (it.unit === "pack" ? " · pack of 10" : "");
  }

  window.HLIXCart = {
    get: get,
    subtotal: function () { return subtotal(get()); },
    count: function () { return count(get()); },
    clear: function () { save([]); },
    add: function (item) {
      item.unit = item.unit === "pack" ? "pack" : "vial";
      var cart = get();
      var hit = cart.filter(function (it) { return key(it) === key(item); })[0];
      if (hit) { hit.qty += item.qty; hit.unitPrice = item.unitPrice; } else cart.push(item);
      save(cart);
    },
    setQty: function (i, q) { var cart = get(); if (!cart[i]) return; cart[i].qty = Math.max(1, q | 0); save(cart); },
    remove: function (i) { var cart = get(); cart.splice(i, 1); save(cart); },
    familyPrice: familyPrice,
    member: member,
    memberPrice: memberPrice,
    money: money,
    photo: photo,
    url: url,
    lineMeta: lineMeta
  };

  // ------------------------------------------------------------------
  // badge + drawer
  // ------------------------------------------------------------------
  function lineHtml(it, i) {
    var u = url(it);
    return '<div class="line">' +
      '<a href="' + u + '" tabindex="-1" aria-hidden="true"><img class="line__img" src="' + photo(it) + '" alt="" width="56" height="70" loading="lazy"></a>' +
      '<div class="line__info"><a href="' + u + '">' + esc(it.name) + "</a><span>" + lineMeta(it) + " · " + money(it.unitPrice) + " each</span>" +
        '<div class="line__ctrl"><div class="qty qty--sm"><button type="button" data-dec="' + i + '" aria-label="one fewer">' + MINUS + "</button><span>" + it.qty + '</span><button type="button" data-inc="' + i + '" aria-label="one more">' + PLUS + "</button></div></div></div>" +
      '<div class="line__end"><b class="line__price">' + money(it.unitPrice * it.qty) + '</b><button type="button" class="line__x" data-rm="' + i + '">remove</button></div>' +
    "</div>";
  }

  function render(cart) {
    var n = count(cart);
    $$("[data-cart-count]").forEach(function (el) {
      el.textContent = n > 99 ? "99+" : n;
      el.hidden = n === 0;
      if (n > lastCount) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
    });
    lastCount = n;
    var list = $("[data-cart-list]");
    if (!list) return;
    var empty = $("[data-cart-empty]"), foot = $("[data-cart-foot]"), sub = $("[data-cart-subtotal]"), title = $("[data-cart-n]");
    if (title) title.textContent = n ? "(" + n + ")" : "";
    if (!cart.length) {
      list.innerHTML = "";
      list.hidden = true;
      if (empty) empty.hidden = false;
      if (foot) foot.hidden = true;
      return;
    }
    list.hidden = false;
    if (empty) empty.hidden = true;
    if (foot) foot.hidden = false;
    list.innerHTML = cart.map(lineHtml).join("");
    if (sub) sub.textContent = money(subtotal(cart));
  }

  var list = $("[data-cart-list]");
  if (list) list.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-dec],[data-inc],[data-rm]") : null;
    if (!t) return;
    var cart = get();
    if (t.hasAttribute("data-dec")) { var i = +t.getAttribute("data-dec"); if (cart[i] && cart[i].qty > 1) window.HLIXCart.setQty(i, cart[i].qty - 1); else window.HLIXCart.remove(i); }
    else if (t.hasAttribute("data-inc")) { var j = +t.getAttribute("data-inc"); if (cart[j]) window.HLIXCart.setQty(j, cart[j].qty + 1); }
    else window.HLIXCart.remove(+t.getAttribute("data-rm"));
  });

  // another tab changed the cart
  window.addEventListener("storage", function (e) { if (e.key === KEY) render(get()); });

  // While an email to hlix about this visit's cart is held (the hlix_cv cookie, set by
  // api/_lib/alerts.js), say when they leave the site and when they come back, so it goes
  // out soon after they've gone. Going to another page of the site isn't leaving.
  var internal = false, internalT = null, gone = false;
  function held() { return /(?:^|;\s*)hlix_cv=1(?:;|$)/.test(document.cookie); }
  function presence(away) {
    if (away === gone || !held()) return;
    gone = away;
    try {
      fetch("/api/account", {
        method: "POST", credentials: "same-origin", keepalive: true,
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ action: "presence", away: away })
      }).catch(function () {});
    } catch (e) {}
  }
  function goingInside() {
    internal = true;
    clearTimeout(internalT);
    internalT = setTimeout(function () { internal = false; }, 3000); // the link didn't leave the page after all
  }
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (a && a.origin === location.origin && !a.hasAttribute("download") && (!a.target || a.target === "_self")
      && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) goingInside();
  }, true);
  document.addEventListener("submit", goingInside, true);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { if (!internal) presence(true); }
    else { internal = false; presence(false); }
  });
  window.addEventListener("pagehide", function () { if (!internal) presence(true); });
  window.addEventListener("pageshow", function (e) { if (e.persisted) { internal = false; presence(false); } });

  render(get());
})();
