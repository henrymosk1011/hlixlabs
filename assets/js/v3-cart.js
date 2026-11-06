// hlix v3 — cart. Same storage as the main site ("hlix_cart" in localStorage,
// same line shape), so a cart carries between the two designs; this file only
// draws it differently (photos, per-line links) and exposes window.HLIXCart for
// the product page (v3.js) and checkout (v3-checkout.js). No payment anywhere:
// checkout emails an order request.
(function () {
  "use strict";
  var d = document;
  var KEY = "hlix_cart";
  var cfg = window.HLIX3 || { base: "", assets: "../" };

  function $(s, c) { return (c || d).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(n) { return "$" + Math.ceil(n - 1e-9).toLocaleString("en-US"); }
  var MINUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>';
  var PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

  function get() { try { var c = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(c) ? c : []; } catch (e) { return []; } }
  function count(cart) { return cart.reduce(function (s, it) { return s + (it.qty || 0); }, 0); }
  function subtotal(cart) { return cart.reduce(function (s, it) { return s + it.unitPrice * it.qty; }, 0); }
  function key(it) { return it.sku + "|" + it.form; }

  var lastCount = count(get());
  function save(cart) {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {}
    render(cart);
    var ev;
    try { ev = new CustomEvent("hlix:cart"); } catch (e) { ev = d.createEvent("Event"); ev.initEvent("hlix:cart", false, false); }
    d.dispatchEvent(ev);
  }

  window.HLIXCart = {
    get: get,
    subtotal: function () { return subtotal(get()); },
    count: function () { return count(get()); },
    clear: function () { save([]); },
    add: function (item) {
      var cart = get();
      var hit = cart.filter(function (it) { return key(it) === key(item); })[0];
      if (hit) { hit.qty += item.qty; hit.unitPrice = item.unitPrice; } else cart.push(item);
      save(cart);
    },
    setQty: function (i, q) { var cart = get(); if (!cart[i]) return; cart[i].qty = Math.max(1, q | 0); save(cart); },
    remove: function (i) { var cart = get(); cart.splice(i, 1); save(cart); },
    photo: photo,
    url: function (it) { return cfg.base + "peptides/" + it.slug + ".html"; }
  };

  function photo(it) { return cfg.assets + "assets/img/vials/" + String(it.sku || "").toLowerCase() + "-" + (it.form === "powder" ? "powder" : "recon") + "-s.webp"; }
  function formLabel(f) { return f === "recon" ? "ready to use" : "powder"; }

  function lineHtml(it, i) {
    var url = window.HLIXCart.url(it);
    return '<div class="line">' +
      '<a href="' + url + '" tabindex="-1" aria-hidden="true"><img class="line__img" src="' + photo(it) + '" alt="" width="56" height="70" loading="lazy"></a>' +
      '<div class="line__info"><a href="' + url + '">' + esc(it.name) + "</a><span>" + esc(it.dose) + " · " + formLabel(it.form) + " · " + money(it.unitPrice) + " each</span>" +
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

  // live prices (v2-prices.js): bring lines added at an older price up to date
  d.addEventListener("hlix:prices", function () {
    if (!window.HLIXPrices) return;
    var cart = get(), changed = false;
    cart.forEach(function (it) {
      var u = window.HLIXPrices.unit(it.sku, it.form);
      if (u !== null && u !== it.unitPrice) { it.unitPrice = u; changed = true; }
    });
    if (changed) save(cart);
  });
  // another tab changed the cart
  window.addEventListener("storage", function (e) { if (e.key === KEY) render(get()); });

  render(get());
})();
