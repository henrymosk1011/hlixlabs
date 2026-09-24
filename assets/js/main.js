// hlix — shared site behavior: mobile nav, product image lightbox, catalog filters
(function () {
  "use strict";

  // Mobile nav toggle
  var toggle = document.querySelector(".nav__toggle");
  var mobileMenu = document.querySelector(".mobile-menu");
  if (toggle && mobileMenu) {
    toggle.addEventListener("click", function () {
      var open = mobileMenu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });
    mobileMenu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        mobileMenu.classList.remove("is-open");
        document.body.style.overflow = "";
      });
    });
  }

  // Product image lightbox (zoom)
  var media = document.querySelector("[data-zoom-trigger]");
  var lightbox = document.querySelector("[data-lightbox]");
  if (media && lightbox) {
    var inner = lightbox.querySelector("[data-lightbox-inner]");
    var openLightbox = function () {
      inner.innerHTML = media.querySelector("svg, img").outerHTML;
      lightbox.classList.add("is-open");
      document.body.style.overflow = "hidden";
    };
    var closeLightbox = function () {
      lightbox.classList.remove("is-open");
      document.body.style.overflow = "";
    };
    media.addEventListener("click", openLightbox);
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox || e.target.closest("[data-lightbox-close]")) closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLightbox();
    });
  }

  // Catalog category filter (client-side, no fetch — cards are already rendered)
  var filterBar = document.querySelector("[data-filters]");
  if (filterBar) {
    var chips = filterBar.querySelectorAll(".chip");
    var cards = document.querySelectorAll("[data-card-category]");

    var applyFilter = function (cat) {
      chips.forEach(function (c) {
        c.classList.toggle("is-active", c.getAttribute("data-filter") === cat);
      });
      cards.forEach(function (card) {
        var show = cat === "all" || card.getAttribute("data-card-category") === cat;
        card.style.display = show ? "" : "none";
      });
      var empty = document.querySelector("[data-empty-state]");
      if (empty) {
        var anyVisible = Array.prototype.some.call(cards, function (c) {
          return c.style.display !== "none";
        });
        empty.style.display = anyVisible ? "none" : "block";
      }
    };

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var cat = chip.getAttribute("data-filter");
        history.replaceState(null, "", cat === "all" ? location.pathname : "#" + cat);
        applyFilter(cat);
      });
    });

    var initial = location.hash ? location.hash.slice(1) : "all";
    var validCats = Array.prototype.map.call(chips, function (c) { return c.getAttribute("data-filter"); });
    applyFilter(validCats.indexOf(initial) > -1 ? initial : "all");
  }

  // Product detail tabs
  var tabButtons = document.querySelectorAll("[data-tab-target]");
  if (tabButtons.length) {
    tabButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = btn.getAttribute("data-tab-target");
        document.querySelectorAll("[data-tab-target]").forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        document.querySelectorAll("[data-tab-panel]").forEach(function (p) {
          p.classList.toggle("is-active", p.getAttribute("data-tab-panel") === target);
        });
      });
    });
  }
})();
