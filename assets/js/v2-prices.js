// hlix v2 — live prices. The hlix admin's Inventory page is the source of
// truth for prices; /api/prices serves them (api/prices.js). Every page ships
// with the prices it was built with, and this swaps in the current ones as
// soon as they arrive, so a price changed in the admin shows here without a
// rebuild. If the request fails (or there's no /api, as in a local static
// preview), the built-in prices simply stay.
//
// What it updates:
//   [data-sku][data-price]   product page size buttons (data-price / data-price-recon)
//   [data-live-price]        any price text: a comma-separated SKU list, shown as
//                            the lowest Powder price ("from " prefix if data-live-from)
//   HLIX_SEARCH_INDEX        each entry's priceFrom, via its skus
// then fires "hlix:prices" on document so v2.js (product page price), v2-cart.js
// (cart lines) and v2-checkout.js (order summary) can re-price themselves.
(function () {
  "use strict";
  var d = document;
  var live = null;

  function $$(s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); }
  function moneyStr(n) { return "$" + Math.ceil(n - 1e-9); }

  window.HLIXPrices = {
    // { powder, recon } (whole dollars) for a SKU, or null if not loaded / unknown
    get: function (sku) { return (live && live[sku]) || null; },
    unit: function (sku, form) {
      var p = this.get(sku);
      return p ? (form === "recon" ? p.recon : p.powder) : null;
    },
  };

  function lowest(skus) {
    var min = null;
    for (var i = 0; i < skus.length; i++) {
      var p = live[skus[i]];
      if (!p) return null;
      if (min === null || p.powder < min) min = p.powder;
    }
    return min;
  }

  function apply() {
    $$("[data-sku][data-price]").forEach(function (el) {
      var p = live[el.getAttribute("data-sku")];
      if (!p) return;
      el.setAttribute("data-price", p.powder.toFixed(2));
      el.setAttribute("data-price-recon", p.recon.toFixed(2));
    });
    $$("[data-live-price]").forEach(function (el) {
      var min = lowest(el.getAttribute("data-live-price").split(","));
      if (min === null) return;
      el.textContent = (el.hasAttribute("data-live-from") ? "from " : "") + moneyStr(min);
    });
    (window.HLIX_SEARCH_INDEX || []).forEach(function (it) {
      var min = it.skus ? lowest(it.skus) : null;
      if (min !== null) it.priceFrom = min;
    });
    var ev;
    try { ev = new CustomEvent("hlix:prices"); } catch (e) { ev = d.createEvent("Event"); ev.initEvent("hlix:prices", false, false); }
    d.dispatchEvent(ev);
  }

  if (!window.fetch) return;
  fetch("/api/prices", { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.prices || typeof data.prices !== "object") return;
      live = data.prices;
      // Wait for the other scripts (loaded after this one) to have registered
      // their "hlix:prices" listeners.
      if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", apply);
      else apply();
    })
    .catch(function () {});
})();
