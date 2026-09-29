// hlix v2 — client-side cart. No accounts, no payment processor: cart state
// lives in localStorage on this device only, and checkout (v2-checkout.js)
// emails the order request to hlix instead of charging a card.
(function () {
  "use strict";
  var d = document, root = d.documentElement;
  var KEY = "hlix_cart";

  function $(s, c) { return (c || d).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); }

  function getCart() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }
  function saveCart(cart) {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {}
    renderBadge(cart);
    renderDrawer(cart);
  }
  function itemKey(it) { return it.sku + "|" + it.form; }
  function subtotal(cart) { return cart.reduce(function (s, it) { return s + it.unitPrice * it.qty; }, 0); }
  function moneyStr(n) { return "$" + Math.ceil(n - 1e-9); }

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
        '<div class="cart__item-info"><b>' + esc(it.name) + '</b><span>' + esc(it.dose) + ' · ' + esc(it.form === "recon" ? "ready to use" : "powder") + '</span></div>' +
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
      addItem({
        sku: skuOut ? skuOut.textContent.trim() : addBtn.getAttribute("data-slug"),
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

  renderBadge(getCart());
  renderDrawer(getCart());
})();
