// hlix — site-wide product search (client-side, reads window.HLIX_SEARCH_INDEX)
(function () {
  "use strict";
  if (!window.HLIX_SEARCH_INDEX) return;

  var prefix = window.HLIX_PREFIX || "";
  var overlay = document.querySelector("[data-search-overlay]");
  var input = document.querySelector("[data-search-input]");
  var results = document.querySelector("[data-search-results]");
  if (!overlay || !input || !results) return;

  function money(v) {
    return "$" + (Number.isInteger(v) ? v : v.toFixed(2)).toString();
  }

  function render(query) {
    var q = query.trim().toLowerCase();
    var matches = !q ? [] : window.HLIX_SEARCH_INDEX.filter(function (item) {
      return item.name.toLowerCase().indexOf(q) > -1 || item.category.toLowerCase().indexOf(q) > -1;
    }).slice(0, 8);

    if (!q) {
      results.innerHTML = '<p class="search-panel__hint">Start typing to search the catalog…</p>';
      return;
    }
    if (!matches.length) {
      results.innerHTML = '<p class="search-panel__hint">No matches for “' + escapeHtml(query) + '”.</p>';
      return;
    }
    results.innerHTML = matches.map(function (item) {
      var priceLabel = (item.multi ? "FROM " : "") + money(item.priceFrom);
      return '<a class="search-result" href="' + prefix + "peptides/" + item.slug + '.html">' +
        '<span class="search-result__name">' + escapeHtml(item.name) + '</span>' +
        '<span class="search-result__cat">' + escapeHtml(item.category) + '</span>' +
        '<span class="search-result__price">' + priceLabel + '</span>' +
        '</a>';
    }).join("");
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function openSearch() {
    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
    render("");
    setTimeout(function () { input.focus(); }, 10);
  }

  function closeSearch() {
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    input.value = "";
  }

  document.querySelectorAll("[data-search-trigger]").forEach(function (btn) {
    btn.addEventListener("click", openSearch);
  });
  document.querySelectorAll("[data-search-close]").forEach(function (btn) {
    btn.addEventListener("click", closeSearch);
  });
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeSearch();
  });
  input.addEventListener("input", function () { render(input.value); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) closeSearch();
    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing && !overlay.classList.contains("is-open")) {
      e.preventDefault();
      openSearch();
    }
  });
})();
