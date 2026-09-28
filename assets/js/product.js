// hlix — product page vial-size (variant) selector
(function () {
  "use strict";
  var page = document.querySelector("[data-product-page]");
  if (!page) return;

  var media = page.querySelector("[data-zoom-trigger]");
  var img = media ? media.querySelector("img") : null;
  var doseText = media ? media.querySelector('[data-role="dose-text"]') : null;
  var skuText = media ? media.querySelector('[data-role="sku-text"]') : null;

  function moneyFromNumber(n) {
    return Number.isInteger(n) ? "$" + n : "$" + n.toFixed(2);
  }

  var state = {
    sku: img ? img.getAttribute("data-sku") || "" : "",
    form: img ? img.getAttribute("data-form") || "recon" : "recon"
  };

  function applyImage(dose) {
    if (!img || !state.sku) return;
    var url = img.getAttribute("data-base") + state.sku + "-" + state.form + ".webp";
    var pre = new Image();
    pre.onload = function () {
      img.src = url;
      var name = page.querySelector("h1");
      img.alt = (name ? name.textContent : "") + " " + (dose || state.sku) + " research vial";
    };
    pre.src = url;
  }

  var group = page.querySelector("[data-variant-group]");
  if (group) {
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

        var imgId = chip.getAttribute("data-img");
        if (imgId) {
          state.sku = imgId;
          applyImage(dose);
        }
      });
    });
  }

  var formGroup = page.querySelector("[data-form-group]");
  if (formGroup) {
    formGroup.querySelectorAll("[data-form]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        formGroup.querySelectorAll("[data-form]").forEach(function (c) { c.classList.remove("is-active"); });
        chip.classList.add("is-active");
        state.form = chip.getAttribute("data-form");
        applyImage();
      });
    });
  }
})();
