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

  // Contact form — posts to /api/contact (Resend), only live once deployed
  var cform = document.querySelector("[data-contact-form]");
  if (cform) {
    var cstatus = cform.querySelector("[data-contact-status]");
    var csubmit = cform.querySelector('button[type="submit"]');
    cform.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = cform.name.value.trim();
      var email = cform.email.value.trim();
      var message = cform.message.value.trim();
      if (!name || !email || !message) return;
      csubmit.disabled = true;
      cstatus.hidden = false;
      cstatus.classList.remove("is-error");
      cstatus.textContent = "Sending…";
      fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name, email: email, message: message }),
      })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          if (res.ok) {
            cstatus.textContent = "Message sent — we'll get back to you within 1–2 business days.";
            cform.reset();
          } else {
            cstatus.classList.add("is-error");
            cstatus.textContent = res.data.error || "Something went wrong. Try again in a moment.";
            csubmit.disabled = false;
          }
        })
        .catch(function () {
          cstatus.classList.add("is-error");
          cstatus.textContent = "Couldn't reach the server. This only works once the site is deployed.";
          csubmit.disabled = false;
        });
    });
  }
})();
