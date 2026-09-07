// hlix — site-wide product search (client-side, reads window.HLIX_SEARCH_INDEX)
// Powers two UIs sharing the same match/render logic: the horizontal nav
// search bar (desktop/tablet, live dropdown) and the full-screen search
// overlay (mobile trigger + "/" shortcut everywhere).
(function () {
  "use strict";
  if (!window.HLIX_SEARCH_INDEX) return;

  var prefix = window.HLIX_PREFIX || "";

  function money(v) {
    return "$" + (Number.isInteger(v) ? v : v.toFixed(2)).toString();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function matchProducts(query) {
    var q = query.trim().toLowerCase();
    if (!q) return [];
    return window.HLIX_SEARCH_INDEX.filter(function (item) {
      return item.name.toLowerCase().indexOf(q) > -1 || item.category.toLowerCase().indexOf(q) > -1;
    }).slice(0, 8);
  }

  function resultsHtml(matches, query, emptyPrompt) {
    if (!query.trim()) return '<p class="search-panel__hint">' + emptyPrompt + '</p>';
    if (!matches.length) return '<p class="search-panel__hint">No matches for “' + escapeHtml(query) + '”.</p>';
    return matches.map(function (item) {
      var priceLabel = (item.multi ? "FROM " : "") + money(item.priceFrom);
      return '<a class="search-result" href="' + prefix + "peptides/" + item.slug + '.html">' +
        '<span class="search-result__name">' + escapeHtml(item.name) + '</span>' +
        '<span class="search-result__cat">' + escapeHtml(item.category) + '</span>' +
        '<span class="search-result__price">' + priceLabel + '</span>' +
        '</a>';
    }).join("");
  }

  // ---- full-screen overlay (mobile trigger, "/" shortcut) ----
  var overlay = document.querySelector("[data-search-overlay]");
  var modalInput = document.querySelector("[data-search-input]");
  var modalResults = document.querySelector("[data-search-results]");

  function openOverlay() {
    if (!overlay) return;
    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
    modalResults.innerHTML = resultsHtml([], "", "Start typing to search the catalog…");
    setTimeout(function () { modalInput.focus(); }, 10);
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    modalInput.value = "";
  }

  if (overlay && modalInput && modalResults) {
    document.querySelectorAll("[data-search-trigger]").forEach(function (btn) {
      btn.addEventListener("click", openOverlay);
    });
    document.querySelectorAll("[data-search-close]").forEach(function (btn) {
      btn.addEventListener("click", closeOverlay);
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeOverlay();
    });
    modalInput.addEventListener("input", function () {
      modalResults.innerHTML = resultsHtml(matchProducts(modalInput.value), modalInput.value, "Start typing to search the catalog…");
    });
  }

  // ---- inline horizontal nav search bar (desktop/tablet) ----
  var navSearch = document.querySelector("[data-search-inline]");
  var navInput = document.querySelector("[data-search-input-nav]");
  var navDropdown = document.querySelector("[data-search-dropdown]");

  if (navSearch && navInput && navDropdown) {
    var closeDropdown = function () {
      navDropdown.classList.remove("is-open");
    };
    navInput.addEventListener("input", function () {
      var q = navInput.value;
      navDropdown.innerHTML = resultsHtml(matchProducts(q), q, "Start typing to search the catalog…");
      navDropdown.classList.toggle("is-open", !!q.trim());
    });
    navInput.addEventListener("focus", function () {
      if (navInput.value.trim()) navDropdown.classList.add("is-open");
    });
    document.addEventListener("click", function (e) {
      if (!navSearch.contains(e.target)) closeDropdown();
    });
    navInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeDropdown(); navInput.blur(); }
      if (e.key === "Enter") {
        var first = navDropdown.querySelector(".search-result");
        if (first) window.location.href = first.getAttribute("href");
      }
    });
  }

  // ---- global "/" shortcut opens whichever search is available ----
  document.addEventListener("keydown", function (e) {
    if (overlay && e.key === "Escape" && overlay.classList.contains("is-open")) closeOverlay();

    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) {
      e.preventDefault();
      if (navInput && navInput.offsetParent !== null) {
        navInput.focus();
      } else {
        openOverlay();
      }
    }
  });
})();
