// hlix — product page vial-size (variant) selector
(function () {
  "use strict";
  var page = document.querySelector("[data-product-page]");
  if (!page) return;

  var group = page.querySelector("[data-variant-group]");
  if (!group) return;

  var media = page.querySelector("[data-zoom-trigger]");
  var doseText = media ? media.querySelector('[data-role="dose-text"]') : null;
  var skuText = media ? media.querySelector('[data-role="sku-text"]') : null;

  function moneyFromNumber(n) {
    return Number.isInteger(n) ? "$" + n : "$" + n.toFixed(2);
  }

  group.querySelectorAll("[data-variant]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      group.querySelectorAll("[data-variant]").forEach(function (c) { c.classList.remove("is-active"); });
      chip.classList.add("is-active");

      var dose = chip.getAttribute("data-dose");
      var price = parseFloat(chip.getAttribute("data-price"));
      var sku = chip.getAttribute("data-sku");

      page.querySelectorAll('[data-field="dose"]').forEach(function (el) { el.textContent = dose; });
      page.querySelectorAll('[data-field="sku"]').forEach(function (el) { el.textContent = sku; });
      page.querySelectorAll('[data-field="price"]').forEach(function (el) { el.textContent = moneyFromNumber(price); });

      if (doseText) doseText.textContent = dose;
      if (skuText) skuText.textContent = sku;
    });
  });
})();
