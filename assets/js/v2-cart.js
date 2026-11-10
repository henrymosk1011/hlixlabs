// hlix v2 — the cart. No payment processor: checkout (v2-checkout.js) sends an
// order request instead of charging a card. The cart lives in localStorage; while
// someone's signed in (an account, api/account.js) it's also saved to their account
// so it follows them to any device. Signing in merges this browser's cart into the
// account's; signing out clears it from this browser.
(function () {
  "use strict";
  var d = document, root = d.documentElement;
  var KEY = "hlix_cart";
  var SYNCED = "hlix_cart_synced"; // the cart as last saved to the account, to tell edits made here since

  function $(s, c) { return (c || d).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); }

  function getCart() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }
  function saveCart(cart, localOnly) {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {}
    renderBadge(cart);
    renderDrawer(cart);
    d.dispatchEvent(new CustomEvent("hlix:cart"));
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
        unitPrice: Math.max(0, Number(it.unitPrice) || 0),
      };
    }).filter(function (it) { return it.sku; });
  }
  function shape(cart) { return JSON.stringify(slim(cart).map(function (it) { return [it.sku, it.form, it.unit, it.qty]; })); }
  function readSynced() { try { return localStorage.getItem(SYNCED); } catch (e) { return null; } }
  function setSynced(cart) { try { localStorage.setItem(SYNCED, shape(cart)); } catch (e) {} }
  // Same product and form in both: the bigger amount (never doubled up).
  function merge(a, b) {
    var out = [], at = {};
    a.concat(b).forEach(function (it) {
      var k = itemKey(it);
      if (at[k] === undefined) { at[k] = out.length; out.push(JSON.parse(JSON.stringify(it))); }
      else if ((it.qty | 0) > (out[at[k]].qty | 0)) out[at[k]].qty = it.qty | 0;
    });
    return slim(out);
  }
  function api(body) {
    return fetch("/api/account", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, status: r.status, data: data || {} }; });
    }, function () { return { ok: false, status: 0, data: { error: "couldn't reach the server. check your connection and try again." } }; });
  }
  var pushTimer = null;
  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 400);
  }
  function push() {
    var cart = getCart();
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
          var local = getCart(), server = Array.isArray(data.cart) ? data.cart : [];
          if (!merging && readSynced() !== null && shape(local) === readSynced()) {
            saveCart(slim(server), true);
            setSynced(server);
          } else {
            var both = merge(server, local);
            saveCart(both, true);
            if (shape(both) !== shape(server)) push(); else setSynced(both);
          }
        }
        d.dispatchEvent(new CustomEvent("hlix:account", { detail: data }));
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
      saveCart([], true);
    },
  };
  account.ready = signedIn() ? load(false) : Promise.resolve((account.data = { signedIn: false }));
  window.HLIXAccount = account;
  function itemKey(it) { return it.sku + "|" + it.form + "|" + (it.unit === "pack" ? "pack" : "vial"); }
  function subtotal(cart) { return cart.reduce(function (s, it) { return s + it.unitPrice * it.qty; }, 0); }
  // Website prices are whole dollars; family & friends prices can have cents.
  function moneyStr(n) {
    var c = Math.round((Number(n) || 0) * 100);
    return "$" + (c % 100 ? (c / 100).toFixed(2) : String(c / 100));
  }

  window.HLIXCart = {
    get: getCart,
    subtotal: function () { return subtotal(getCart()); },
    clear: function () { saveCart([]); },
  };

  function addItem(item) {
    var cart = getCart();
    var existing = cart.filter(function (it) { return itemKey(it) === itemKey(item); })[0];
    if (existing) existing.qty += item.qty;
    else cart.push(item);
    saveCart(cart);
  }
  function removeAt(i) {
    var cart = getCart();
    cart.splice(i, 1);
    saveCart(cart);
  }
  function setQtyAt(i, qty) {
    var cart = getCart();
    if (!cart[i]) return;
    cart[i].qty = Math.max(1, qty | 0);
    saveCart(cart);
  }

  // ------------------------------------------------------------------
  // nav badge
  // ------------------------------------------------------------------
  function renderBadge(cart) {
    var count = cart.reduce(function (s, it) { return s + it.qty; }, 0);
    $$("[data-cart-count]").forEach(function (el) {
      el.textContent = count;
      el.hidden = count === 0;
    });
  }

  // ------------------------------------------------------------------
  // drawer (present on every page via nav())
  // ------------------------------------------------------------------
  function lineHtml(it, i) {
    return (
      '<div class="cart__item" data-cart-item>' +
        '<div class="cart__item-info"><b>' + esc(it.name) + '</b><span>' + esc(it.dose) + ' · ' + esc(it.form === "recon" ? "ready to use" : "powder") + (it.unit === "pack" ? " · pack of 10" : "") + '</span></div>' +
        '<div class="cart__item-ctrl">' +
          '<div class="qty qty--sm"><button type="button" data-cart-dec="' + i + '" aria-label="decrease quantity">−</button><span data-cart-qty>' + it.qty + '</span><button type="button" data-cart-inc="' + i + '" aria-label="increase quantity">+</button></div>' +
          '<b class="cart__item-price">' + moneyStr(it.unitPrice * it.qty) + '</b>' +
          '<button type="button" class="cart__item-x" data-cart-remove="' + i + '" aria-label="remove">×</button>' +
        '</div>' +
      '</div>'
    );
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function renderDrawer(cart) {
    var list = $("[data-cart-list]");
    var empty = $("[data-cart-empty]");
    var foot = $("[data-cart-foot]");
    var subEl = $("[data-cart-subtotal]");
    if (!list) return;
    if (!cart.length) {
      list.innerHTML = "";
      if (empty) empty.hidden = false;
      if (foot) foot.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (foot) foot.hidden = false;
    list.innerHTML = cart.map(lineHtml).join("");
    if (subEl) subEl.textContent = moneyStr(subtotal(cart));
  }

  var cartPanel = $("[data-cart]");
  if (cartPanel) {
    $("[data-cart-list]").addEventListener("click", function (e) {
      var dec = e.target.closest && e.target.closest("[data-cart-dec]");
      var inc = e.target.closest && e.target.closest("[data-cart-inc]");
      var rem = e.target.closest && e.target.closest("[data-cart-remove]");
      var cart = getCart();
      if (dec) { var i = +dec.getAttribute("data-cart-dec"); setQtyAt(i, cart[i].qty - 1); }
      else if (inc) { var i2 = +inc.getAttribute("data-cart-inc"); setQtyAt(i2, cart[i2].qty + 1); }
      else if (rem) { removeAt(+rem.getAttribute("data-cart-remove")); }
    });
    $$("[data-cart-open]").forEach(function (b) {
      b.addEventListener("click", function () { root.classList.add("cart-open"); });
    });
    $$("[data-cart-close]").forEach(function (b) {
      b.addEventListener("click", function () { root.classList.remove("cart-open"); });
    });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape") root.classList.remove("cart-open"); });
  }

  // ------------------------------------------------------------------
  // product page: qty stepper + add to cart
  // ------------------------------------------------------------------
  var addBtn = $("[data-add-to-cart]");
  if (addBtn) {
    var qtyWrap = $("[data-qty]");
    var qtyInput = $("[data-qty-input]", qtyWrap);
    $("[data-qty-dec]", qtyWrap).addEventListener("click", function () {
      qtyInput.value = Math.max(1, (parseInt(qtyInput.value, 10) || 1) - 1);
    });
    $("[data-qty-inc]", qtyWrap).addEventListener("click", function () {
      qtyInput.value = (parseInt(qtyInput.value, 10) || 1) + 1;
    });

    addBtn.addEventListener("click", function () {
      var priceEl = $(".price__n");
      var unitPrice = priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, "")) || 0 : 0;
      var formBtn = $('.seg[data-seg="form"] .is-active');
      var form = formBtn ? formBtn.getAttribute("data-form") : "recon";
      var skuOut = $("[data-sku-out]");
      var doseOut = $("[data-dose-out]");
      var qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
      var sku = skuOut ? skuOut.textContent.trim() : addBtn.getAttribute("data-slug");
      var live = window.HLIXPrices ? window.HLIXPrices.unit(sku, form) : null;
      if (live !== null) unitPrice = live;
      var unit = "vial";
      var fam = familyPrice(sku, buyBy);
      if (fam !== null) { unit = buyBy; unitPrice = fam; }
      addItem({
        unit: unit,
        sku: sku,
        name: addBtn.getAttribute("data-name"),
        category: addBtn.getAttribute("data-category"),
        slug: addBtn.getAttribute("data-slug"),
        dose: doseOut ? doseOut.textContent.trim() : "",
        form: form,
        unitPrice: unitPrice,
        qty: qty,
      });
      var added = $("[data-added]");
      if (added) { added.hidden = false; }
      qtyInput.value = 1;
    });
  }

  // ------------------------------------------------------------------
  // family & friends pricing: an account an admin marked as family & friends gets
  // hlix's cost (account.data.prices: a pack of 10, by SKU). A vial is a tenth of the
  // pack, rounded up to the cent; powder and ready to use cost the same. The database
  // prices every order itself; these are only what the pages show.
  // ------------------------------------------------------------------
  function familyPack(sku) {
    var a = window.HLIXAccount && window.HLIXAccount.data;
    var p = a && a.tier === "family" && a.prices ? Number(a.prices[sku]) : 0;
    return p > 0 ? p : null;
  }
  function familyPrice(sku, unit) {
    var p = familyPack(sku);
    if (p === null) return null;
    var cents = Math.round(p * 100);
    return unit === "pack" ? cents / 100 : Math.ceil(cents / 10) / 100;
  }

  // Bring every line to its current price: family & friends prices for them, the live
  // website price for everyone else (v2-prices.js). A pack keeps its price if there's none.
  function reprice() {
    var cart = getCart(), changed = false;
    cart.forEach(function (it) {
      var unit = familyPrice(it.sku, it.unit);
      if (unit === null && it.unit !== "pack" && window.HLIXPrices) unit = window.HLIXPrices.unit(it.sku, it.form);
      if (unit !== null && unit !== it.unitPrice) { it.unitPrice = unit; changed = true; }
    });
    if (changed) saveCart(cart, true); // only prices changed: nothing to save to the account
  }
  d.addEventListener("hlix:prices", reprice);
  d.addEventListener("hlix:account", function () { reprice(); renderFamily(); });

  // product page: the family & friends price, by the vial or the pack of 10
  var famBox = $("[data-family]");
  var buyBy = "vial";
  function currentSku() {
    var s = $("[data-sku-out]");
    return s ? s.textContent.trim() : "";
  }
  function renderFamily() {
    if (!famBox) return;
    var sku = currentSku();
    var on = familyPack(sku) !== null;
    famBox.hidden = !on;
    var regular = $(".pdp__info .price");
    if (regular) regular.classList.toggle("is-regular", on);
    if (!on) return;
    $$("[data-unit]", famBox).forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-unit") === buyBy ? "true" : "false");
    });
    $("[data-family-price]", famBox).textContent = moneyStr(familyPrice(sku, buyBy));
    $("[data-family-per]", famBox).textContent = buyBy === "pack" ? "/ pack of 10" : "/ vial";
  }
  if (famBox) {
    $$("[data-unit]", famBox).forEach(function (b) {
      b.addEventListener("click", function () {
        buyBy = b.getAttribute("data-unit") === "pack" ? "pack" : "vial";
        renderFamily();
      });
    });
    // after v2.js has switched the size (its own listeners run first)
    d.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("[data-variant]")) renderFamily();
    });
  }

  renderBadge(getCart());
  renderDrawer(getCart());
})();
