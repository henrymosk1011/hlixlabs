// hlix — the main site's ui (the v3 design; no dependencies): menus, search, catalog
// filters, the product page's picker. The cart and accounts are v3-cart.js; live prices
// (v2-prices.js), chat (v2-chat.js), the calculator (v2-calc.js) and the dose planner
// (v2-planner.js) are shared with the archived /v2/ design.
(function () {
  "use strict";

  var d = document;
  var root = d.documentElement;
  root.classList.add("ready");
  var reduce = root.classList.contains("no-motion");
  var cfg = window.HLIX3 = window.HLIX3 || { base: "", assets: "../" };
  var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;

  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var money = function (n) { return "$" + Math.ceil(n - 1e-9).toLocaleString("en-US"); };
  var compact = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ""); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  var ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.3"/></svg>',
    page: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>'
  };

  // ------------------------------------------------------------------
  // tween (also used by v2-calc.js and v2-planner.js via HLIX2.tween)
  // ------------------------------------------------------------------
  function tween(from, to, dur, onUpdate, onDone) {
    if (reduce || dur <= 0 || from === to) { onUpdate(to); if (onDone) onDone(); return; }
    var start = null, finished = false;
    function finish() { if (finished) return; finished = true; onUpdate(to); if (onDone) onDone(); }
    function step(t) {
      if (finished) return;
      if (start === null) start = t;
      var p = clamp((t - start) / dur, 0, 1);
      onUpdate(from + (to - from) * (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)));
      if (p < 1) requestAnimationFrame(step); else finish();
    }
    requestAnimationFrame(step);
    setTimeout(finish, dur + 80);
  }
  window.HLIX2 = window.HLIX2 || {};
  window.HLIX2.tween = tween;

  // ------------------------------------------------------------------
  // overlays: one at a time, body locked while any is open
  // ------------------------------------------------------------------
  var OVERLAYS = { pal: "pal-open", menu: "menu-open", cart: "cart-open", filters: "filters-open" };
  var lastFocus = null;
  function isOpen(name) { return root.classList.contains(OVERLAYS[name]); }
  function syncLock() {
    var any = Object.keys(OVERLAYS).some(isOpen);
    d.body.classList.toggle("is-locked", any);
  }
  function open(name) {
    Object.keys(OVERLAYS).forEach(function (k) { if (k !== name) root.classList.remove(OVERLAYS[k]); });
    setMega(false);
    if (!isOpen(name)) lastFocus = d.activeElement;
    root.classList.add(OVERLAYS[name]);
    syncLock();
    if (name === "menu") $$("[data-menu-open]").forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
  }
  function close(name) {
    if (!isOpen(name)) return;
    root.classList.remove(OVERLAYS[name]);
    syncLock();
    if (name === "menu") $$("[data-menu-open]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    if (lastFocus && lastFocus.focus && d.body.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    lastFocus = null;
  }
  cfg.ui = { open: open, close: close, isOpen: isOpen };

  function bind(sel, fn) { $$(sel).forEach(function (el) { el.addEventListener("click", fn); }); }
  bind("[data-menu-open]", function () { open("menu"); });
  bind("[data-menu-close]", function () { close("menu"); });
  bind("[data-cart-open]", function () { open("cart"); setTimeout(function () { var x = $("[data-cart] .drawer__head .ibtn"); if (x) x.focus({ preventScroll: true }); }, 60); });
  bind("[data-cart-close]", function () { close("cart"); });
  $$(".sheet__links a").forEach(function (a) { a.addEventListener("click", function () { close("menu"); }); });

  // ------------------------------------------------------------------
  // toast
  // ------------------------------------------------------------------
  var toastEl = $("[data-toast]");
  var toastT = null;
  function toast(html, action) {
    if (!toastEl) return;
    toastEl.innerHTML = ICON.check + "<span>" + html + "</span>";
    if (action) {
      var b = d.createElement("button");
      b.type = "button"; b.className = "btn btn--solid"; b.textContent = action.label;
      b.addEventListener("click", function () { toastEl.classList.remove("is-on"); action.run(); });
      toastEl.appendChild(b);
    }
    toastEl.classList.add("is-on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("is-on"); }, 4200);
  }
  cfg.toast = toast;

  // ------------------------------------------------------------------
  // reveal on scroll
  // ------------------------------------------------------------------
  var reveals = $$("[data-reveal]");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        io.unobserve(e.target);
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -5% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
    // anything already on screen at load shows at once, even if the observer is slow to report
    requestAnimationFrame(function () {
      var vh = window.innerHeight;
      reveals.forEach(function (el) { var r = el.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) el.classList.add("in"); });
    });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // ------------------------------------------------------------------
  // top bar: scrolled state + shop mega menu
  // ------------------------------------------------------------------
  var top = $("[data-top]");
  function onScroll() { if (top) top.classList.toggle("is-scrolled", window.pageYOffset > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var megaBtn = $("[data-mega-toggle]");
  var mega = $("[data-mega]");
  var megaT = null;
  function setMega(on) {
    if (!megaBtn) return;
    clearTimeout(megaT);
    root.classList.toggle("mega-open", on);
    megaBtn.setAttribute("aria-expanded", on ? "true" : "false");
  }
  if (megaBtn && mega) {
    megaBtn.addEventListener("click", function () { setMega(!root.classList.contains("mega-open")); });
    if (fine) {
      megaBtn.addEventListener("mouseenter", function () { clearTimeout(megaT); megaT = setTimeout(function () { setMega(true); }, 120); });
      megaBtn.addEventListener("mouseleave", function () { clearTimeout(megaT); });
      top.addEventListener("mouseleave", function () { megaT = setTimeout(function () { setMega(false); }, 260); });
      top.addEventListener("mouseenter", function () { if (root.classList.contains("mega-open")) clearTimeout(megaT); });
    }
    d.addEventListener("click", function (e) { if (root.classList.contains("mega-open") && !top.contains(e.target)) setMega(false); });
    $$("a", mega).forEach(function (a) { a.addEventListener("click", function () { setMega(false); }); });
  }

  // ------------------------------------------------------------------
  // theme
  // ------------------------------------------------------------------
  function theme() { return root.getAttribute("data-theme") || "dark"; }
  function syncTheme() {
    var t = theme();
    $$("[data-theme-toggle]").forEach(function (b) { b.setAttribute("aria-label", t === "light" ? "switch to dark theme" : "switch to light theme"); });
    $$("[data-theme-label]").forEach(function (s) { s.textContent = t === "light" ? "dark mode" : "light mode"; });
  }
  bind("[data-theme-toggle]", function () {
    var next = theme() === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("hlix-theme", next); } catch (e) {}
    syncTheme();
  });
  syncTheme();

  // ------------------------------------------------------------------
  // search: the palette (/, ⌘K, every search button) and the home hero field
  // ------------------------------------------------------------------
  var IDX = window.HLIX_SEARCH_INDEX || [];
  var CATS = $$(".mega__cats a").map(function (a) {
    return { label: a.querySelector("span").textContent, href: a.getAttribute("href"), n: a.querySelector("b").textContent };
  });
  var PAGES = [
    { t: "catalog", s: "every compound", href: "catalog" },
    { t: "dosage calculator", s: "draw-to units, supply, vials needed", href: "calculator" },
    { t: "dose planner", s: "map doses on a calendar", href: "calculator#planner" },
    { t: "about", s: "the standard", href: "about" },
    { t: "contact", s: "get in touch", href: "contact" },
    { t: "checkout", s: "review & request your order", href: "checkout" },
    { t: "account", s: "sign in, your orders", href: "account" }
  ];
  var TAGS = (function () {
    var c = {};
    IDX.forEach(function (it) { (it.tags || []).forEach(function (t) { t = t.toLowerCase(); c[t] = (c[t] || 0) + 1; }); });
    return Object.keys(c).map(function (t) { return { t: t, n: c[t] }; }).sort(function (a, b) { return b.n - a.n || (a.t < b.t ? -1 : 1); });
  })();
  var RECENT_KEY = "hlix_recent";
  function recent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch (e) { return []; } }
  function thumb(it) { return cfg.assets + "assets/img/vials/" + String((it.skus && it.skus[0]) || "").toLowerCase() + "-recon-s.webp"; }
  function productUrl(it) { return cfg.base + "peptides/" + it.slug; }
  function tagUrl(t) { return cfg.base + "catalog?tag=" + encodeURIComponent(t).replace(/%20/g, "+"); }
  function priceText(it) { return (it.multi ? "from " : "") + money(it.priceFrom); }
  function hi(text, q) {
    var i = q ? text.toLowerCase().indexOf(q) : -1;
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  }

  function score(it, q, qc) {
    var name = it.name.toLowerCase(), nc = compact(name), best = 0;
    if (name.indexOf(q) === 0 || nc.indexOf(qc) === 0) best = 100;
    else if ((" " + name).indexOf(" " + q) > -1) best = 90;
    else if (qc && nc.indexOf(qc) > -1) best = 80;
    (it.tags || []).forEach(function (t) {
      t = t.toLowerCase();
      if (t === q) best = Math.max(best, 70);
      else if (t.indexOf(q) === 0) best = Math.max(best, 60);
      else if (t.indexOf(q) > -1) best = Math.max(best, 45);
    });
    if (!best && it.category.toLowerCase().indexOf(q) > -1) best = 30;
    return best;
  }
  function search(q) {
    q = q.trim().toLowerCase();
    var qc = compact(q);
    var products = IDX.map(function (it) { return { it: it, s: score(it, q, qc) }; })
      .filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s || (a.it.name < b.it.name ? -1 : 1); })
      .map(function (r) { return r.it; });
    var goals = TAGS.filter(function (g) { return g.t.indexOf(q) > -1; });
    var cats = CATS.filter(function (c) { return c.label.toLowerCase().indexOf(q) > -1; });
    var pages = PAGES.filter(function (p) { return p.t.indexOf(q) > -1; });
    return { q: q, products: products, goals: goals, cats: cats, pages: pages };
  }

  function rowProduct(it, q) {
    var why = "";
    if (q && it.name.toLowerCase().indexOf(q) < 0 && compact(it.name).indexOf(compact(q)) < 0) {
      var t = (it.tags || []).filter(function (x) { return x.toLowerCase().indexOf(q) > -1; })[0];
      if (t) why = " · " + hi(t.toLowerCase(), q);
    }
    return '<a class="sr" data-nav-item href="' + productUrl(it) + '"><img src="' + thumb(it) + '" alt="" loading="lazy" width="40" height="50">' +
      '<span class="sr__t"><b>' + hi(it.name, q) + "</b><small>" + esc(it.category.toLowerCase()) + why + "</small></span>" +
      '<span class="sr__p">' + priceText(it) + "</span></a>";
  }
  function rowIcon(href, icon, title, sub, right) {
    return '<a class="sr" data-nav-item href="' + href + '"><span class="sr__ic">' + icon + "</span>" +
      '<span class="sr__t"><b>' + title + "</b><small>" + sub + "</small></span>" + (right ? '<span class="sr__p">' + right + "</span>" : "") + "</a>";
  }
  function goalChips(list, q) {
    return '<div class="pg__chips">' + list.map(function (g) {
      return '<a data-nav-item href="' + tagUrl(g.t) + '">' + hi(g.t, q) + "<b>" + g.n + "</b></a>";
    }).join("") + "</div>";
  }
  function group(title, inner) { return '<div class="pg"><p class="pg__t">' + title + "</p>" + inner + "</div>"; }

  function renderInto(el, q, opts) {
    opts = opts || {};
    var html = "";
    if (!q.trim()) {
      var rec = recent().map(function (s) { return IDX.filter(function (it) { return it.slug === s; })[0]; }).filter(Boolean).slice(0, 4);
      if (rec.length) html += group("recently viewed", rec.map(function (it) { return rowProduct(it, ""); }).join(""));
      html += group("popular research goals", goalChips(TAGS.slice(0, 10), ""));
      html += group("jump to", PAGES.slice(0, 3).map(function (p) { return rowIcon(cfg.base + p.href, ICON.page, esc(p.t), esc(p.s)); }).join(""));
      el.innerHTML = html;
      return;
    }
    var r = search(q);
    var max = opts.compact ? 5 : 8;
    if (r.products.length) html += group("compounds · " + r.products.length, r.products.slice(0, max).map(function (it) { return rowProduct(it, r.q); }).join(""));
    if (r.goals.length) html += group("research goals", goalChips(r.goals.slice(0, opts.compact ? 4 : 8), r.q));
    if (!opts.compact && r.cats.length) html += group("categories", r.cats.map(function (c) { return rowIcon(c.href.indexOf("http") === 0 ? c.href : c.href, ICON.grid, hi(c.label, r.q), c.n + " compounds"); }).join(""));
    if (!opts.compact && r.pages.length) html += group("pages", r.pages.map(function (p) { return rowIcon(cfg.base + p.href, ICON.page, hi(p.t, r.q), esc(p.s)); }).join(""));
    if (r.products.length > max) html += group("", rowIcon(cfg.base + "catalog?q=" + encodeURIComponent(r.q), ICON.page, "see all " + r.products.length + " results", "in the catalog"));
    if (!html) html = '<p class="pal__none">nothing matches “' + esc(q.trim()) + '”. try a goal like “recovery”, or <button type="button" data-open-chat>ask the ai</button>.</p>';
    el.innerHTML = html;
    $$("[data-open-chat]", el).forEach(function (b) { b.addEventListener("click", openChat); });
  }

  // keyboard selection over [data-nav-item]
  function navKeys(input, list, onEnterEmpty) {
    var sel = -1;
    input.addEventListener("input", function () { sel = -1; });
    input.addEventListener("keydown", function (e) {
      var items = $$("[data-nav-item]", list);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!items.length) return;
        e.preventDefault();
        sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach(function (it, i) { it.classList.toggle("is-sel", i === sel); });
        items[sel].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        var target = items[sel] || (input.value.trim() ? items[0] : null);
        e.preventDefault();
        if (target) window.location.href = target.getAttribute("href");
        else if (onEnterEmpty) onEnterEmpty();
      }
    });
  }

  var pal = $("[data-pal]");
  var palIn = $("[data-pal-input]");
  var palBody = $("[data-pal-body]");
  function openPal(q) {
    if (!pal) return;
    open("pal");
    if (typeof q === "string") palIn.value = q;
    renderInto(palBody, palIn.value);
    // focus now (the palette is visible as soon as pal-open is set), so fast typing isn't lost
    palIn.focus();
    palIn.select();
  }
  if (pal) {
    bind("[data-search-open]", function () { openPal(); });
    bind("[data-pal-close]", function () { close("pal"); });
    palIn.addEventListener("input", function () { renderInto(palBody, palIn.value); });
    palBody.addEventListener("touchstart", function () { palIn.blur(); }, { passive: true });
    navKeys(palIn, palBody, function () { if (palIn.value.trim()) window.location.href = cfg.base + "catalog?q=" + encodeURIComponent(palIn.value.trim()); });
  }

  var hs = $("[data-hero-search]");
  if (hs) {
    var hIn = $("[data-hero-input]", hs), hDrop = $("[data-hero-drop]", hs);
    var showDrop = function () {
      var q = hIn.value;
      if (!q.trim()) { hDrop.hidden = true; return; }
      renderInto(hDrop, q, { compact: true });
      hDrop.hidden = false;
    };
    hIn.addEventListener("input", showDrop);
    hIn.addEventListener("focus", showDrop);
    hIn.addEventListener("blur", function () { setTimeout(function () { hDrop.hidden = true; }, 160); });
    hIn.addEventListener("keydown", function (e) { if (e.key === "Escape") { hDrop.hidden = true; } });
    navKeys(hIn, hDrop, function () { hs.submit(); });
  }

  // ------------------------------------------------------------------
  // keyboard shortcuts + escape
  // ------------------------------------------------------------------
  d.addEventListener("keydown", function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((d.activeElement || {}).tagName || "") || (d.activeElement && d.activeElement.isContentEditable);
    if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
      e.preventDefault();
      openPal();
      return;
    }
    if (e.key !== "Escape") return;
    if (lb && lb.classList.contains("is-open")) { lb.classList.remove("is-open"); return; }
    for (var k in OVERLAYS) { if (isOpen(k)) { close(k); return; } }
    if (root.classList.contains("mega-open")) { setMega(false); megaBtn.focus(); }
  });

  // ------------------------------------------------------------------
  // chat (v2-chat.js) triggers
  // ------------------------------------------------------------------
  function openChat() {
    Object.keys(OVERLAYS).forEach(close);
    if (window.HLIX2 && window.HLIX2.openChat) window.HLIX2.openChat();
  }
  bind("[data-open-chat]", openChat);

  // ------------------------------------------------------------------
  // lightbox
  // ------------------------------------------------------------------
  var lb = $("[data-lb]");
  if (lb) lb.addEventListener("click", function () { lb.classList.remove("is-open"); });
  $$("[data-zoom]").forEach(function (z) {
    z.addEventListener("click", function () {
      var src = $("img, svg", z);
      if (!src || !lb) return;
      $(".lb__in", lb).innerHTML = src.outerHTML;
      var im = $(".lb__in img", lb);
      if (im) { im.removeAttribute("data-main-img"); im.classList.remove("swap"); }
      lb.classList.add("is-open");
    });
  });

  // ------------------------------------------------------------------
  // cards: the powder photo on hover, fetched only when first wanted
  // ------------------------------------------------------------------
  if (fine) {
    d.addEventListener("mouseover", function (e) {
      var c = e.target.closest && e.target.closest("[data-card]");
      if (!c) return;
      var alt = $("[data-hover-src]", c);
      if (alt && !alt.getAttribute("src")) alt.setAttribute("src", alt.getAttribute("data-hover-src"));
    });
  }

  // ------------------------------------------------------------------
  // home spotlight
  // ------------------------------------------------------------------
  var spot = $("[data-spot]");
  if (spot) {
    var slides = $$("[data-slide]", spot), dots = $$("[data-dot]", spot), cur = 0, timer = null;
    var setSlide = function (i) {
      cur = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) {
        var on = k === cur;
        s.classList.toggle("is-on", on);
        s.setAttribute("aria-hidden", on ? "false" : "true");
        if (on) s.removeAttribute("tabindex"); else s.setAttribute("tabindex", "-1");
        if (on) { var im = $("img", s); if (im) im.loading = "eager"; }
      });
      dots.forEach(function (b, k) { if (k === cur) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
      spot.style.setProperty("--c", slides[cur].style.getPropertyValue("--c"));
    };
    var play = function () { stop(); if (!reduce && slides.length > 1) timer = setInterval(function () { if (!d.hidden) setSlide(cur + 1); }, 5200); };
    var stop = function () { clearInterval(timer); };
    dots.forEach(function (b, k) { b.addEventListener("click", function () { setSlide(k); play(); }); });
    spot.addEventListener("mouseenter", stop);
    spot.addEventListener("mouseleave", play);
    spot.addEventListener("focusin", stop);
    setSlide(0);
    play();
  }

  // ------------------------------------------------------------------
  // catalog: category, research goals, name search, sort, grid/list
  // ------------------------------------------------------------------
  var shop = $("[data-shop]");
  if (shop) (function () {
    var grid = $("[data-grid]");
    var cards = $$("[data-card]", grid);
    var catBtns = $$("[data-fcat]");
    var tagBtns = $$("[data-ftag]");
    var fq = $("[data-fq]");
    var sortSel = $("[data-sort]");
    var viewBtns = $$("[data-view]");
    var activeEl = $("[data-active]");
    var empty = $("[data-empty]");
    var fcount = $("[data-fcount]");
    var validCats = catBtns.map(function (b) { return b.getAttribute("data-fcat"); });
    var catLabel = {};
    $$(".fcat").forEach(function (b) { catLabel[b.getAttribute("data-fcat")] = $("span", b).textContent; });
    var data = cards.map(function (c) {
      return {
        el: c,
        cat: c.getAttribute("data-cat"),
        name: c.getAttribute("data-name"),
        nameC: compact(c.getAttribute("data-name")),
        tags: (c.getAttribute("data-tags") || "").split(",").filter(Boolean),
        order: +c.getAttribute("data-order"),
        sizes: +c.getAttribute("data-sizes"),
        skus: (c.getAttribute("data-skus") || "").split(","),
        price: parseFloat(c.getAttribute("data-price")) || 0
      };
    });

    var url = new URL(location.href);
    var st = {
      cat: "all",
      tags: (url.searchParams.get("tag") || "").toLowerCase().split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      q: (url.searchParams.get("q") || "").trim().toLowerCase(),
      sort: url.searchParams.get("sort") || "featured",
      view: url.searchParams.get("view") || ""
    };
    var startCat = url.searchParams.get("cat") || (location.hash ? location.hash.slice(1) : "");
    if (validCats.indexOf(startCat) > -1) st.cat = startCat;
    if (!st.view) { try { st.view = localStorage.getItem("hlix-view") || "grid"; } catch (e) { st.view = "grid"; } }
    if (["grid", "list"].indexOf(st.view) < 0) st.view = "grid";
    if (!sortSel || !$('option[value="' + st.sort + '"]', sortSel)) st.sort = "featured";
    if (fq) fq.value = st.q;
    if (sortSel) sortSel.value = st.sort;
    if (st.tags.some(function (t) { var b = tagBtns.filter(function (x) { return x.getAttribute("data-ftag") === t; })[0]; return b && b.hasAttribute("data-extra"); })) showAllTags();

    function showAllTags() {
      tagBtns.forEach(function (b) { b.hidden = false; });
      var more = $("[data-ftag-more]");
      if (more) more.hidden = true;
    }
    var moreBtn = $("[data-ftag-more]");
    if (moreBtn) moreBtn.addEventListener("click", showAllTags);

    function matches(it) {
      if (st.cat !== "all" && it.cat !== st.cat) return false;
      if (st.tags.length && !st.tags.some(function (t) { return it.tags.indexOf(t) > -1; })) return false;
      if (st.q) {
        var q = st.q, qc = compact(q);
        var hit = it.name.indexOf(q) > -1 || (qc && it.nameC.indexOf(qc) > -1) || it.tags.some(function (t) { return t.indexOf(q) > -1; }) || (catLabel[it.cat] || "").indexOf(q) > -1;
        if (!hit) return false;
      }
      return true;
    }
    function sorter(a, b) {
      switch (st.sort) {
        case "price-asc": return a.price - b.price || a.order - b.order;
        case "price-desc": return b.price - a.price || a.order - b.order;
        case "name": return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        case "sizes": return b.sizes - a.sizes || a.order - b.order;
        default: return a.order - b.order;
      }
    }
    function syncUrl() {
      var u = new URL(location.href);
      ["cat", "tag", "q", "sort", "view"].forEach(function (k) { u.searchParams.delete(k); });
      if (st.cat !== "all") u.searchParams.set("cat", st.cat);
      if (st.tags.length) u.searchParams.set("tag", st.tags.join(","));
      if (st.q) u.searchParams.set("q", st.q);
      if (st.sort !== "featured") u.searchParams.set("sort", st.sort);
      if (st.view !== "grid") u.searchParams.set("view", st.view);
      history.replaceState(null, "", u.pathname + u.search);
    }
    function tok(label, kind, val) {
      return '<button type="button" class="tok" data-tok="' + kind + '" data-val="' + esc(val) + '" aria-label="remove ' + esc(label) + '">' + esc(label) + ICON.close + "</button>";
    }
    function apply(animate) {
      var shown = data.filter(matches).sort(sorter);
      var all = data.slice().sort(sorter);
      all.forEach(function (it) { grid.appendChild(it.el); });
      var k = 0;
      data.forEach(function (it) {
        var on = shown.indexOf(it) > -1;
        it.el.classList.toggle("is-hidden", !on);
      });
      if (animate && !reduce) {
        shown.forEach(function (it) { it.el.style.setProperty("--k", k++); it.el.classList.remove("pop"); void it.el.offsetWidth; it.el.classList.add("pop"); });
      }
      $$("[data-count-out]").forEach(function (el) { el.textContent = shown.length; });
      var noun = $("[data-count-noun]");
      if (noun) noun.textContent = shown.length === 1 ? "compound" : "compounds";
      if (empty) empty.hidden = shown.length > 0;
      grid.hidden = shown.length === 0;

      catBtns.forEach(function (b) {
        var on = b.getAttribute("data-fcat") === st.cat;
        b.classList.toggle("is-active", on);
        if (b.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      tagBtns.forEach(function (b) { b.setAttribute("aria-pressed", st.tags.indexOf(b.getAttribute("data-ftag")) > -1 ? "true" : "false"); });
      viewBtns.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-view") === st.view ? "true" : "false"); });
      grid.classList.toggle("is-list", st.view === "list");

      var toks = "";
      if (st.cat !== "all") toks += tok(catLabel[st.cat] || st.cat, "cat", st.cat);
      st.tags.forEach(function (t) { toks += tok(t, "tag", t); });
      if (st.q) toks += tok("“" + st.q + "”", "q", st.q);
      var n = (st.cat !== "all" ? 1 : 0) + st.tags.length + (st.q ? 1 : 0);
      if (n > 1) toks += '<button type="button" class="tok tok--clear" data-tok="all">clear all</button>';
      activeEl.innerHTML = toks;
      if (fcount) { fcount.hidden = n === 0; fcount.textContent = n; }
      syncUrl();
    }

    catBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        st.cat = b.getAttribute("data-fcat");
        apply(true);
        if (b.classList.contains("qcat")) b.scrollIntoView({ inline: "center", block: "nearest", behavior: reduce ? "auto" : "smooth" });
      });
    });
    tagBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-ftag"), i = st.tags.indexOf(t);
        if (i > -1) st.tags.splice(i, 1); else st.tags.push(t);
        apply(true);
      });
    });
    var qT = null;
    if (fq) fq.addEventListener("input", function () {
      clearTimeout(qT);
      qT = setTimeout(function () { st.q = fq.value.trim().toLowerCase(); apply(true); }, 90);
    });
    if (sortSel) sortSel.addEventListener("change", function () { st.sort = sortSel.value; apply(true); });
    viewBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        st.view = b.getAttribute("data-view");
        try { localStorage.setItem("hlix-view", st.view); } catch (e) {}
        apply(false);
      });
    });
    activeEl.addEventListener("click", function (e) {
      var t = e.target.closest("[data-tok]");
      if (!t) return;
      var kind = t.getAttribute("data-tok"), val = t.getAttribute("data-val");
      if (kind === "cat") st.cat = "all";
      else if (kind === "tag") st.tags = st.tags.filter(function (x) { return x !== val; });
      else if (kind === "q") { st.q = ""; if (fq) fq.value = ""; }
      else { st.cat = "all"; st.tags = []; st.q = ""; if (fq) fq.value = ""; }
      apply(true);
    });
    bind("[data-reset]", function () { st.cat = "all"; st.tags = []; st.q = ""; if (fq) fq.value = ""; apply(true); });
    bind("[data-filters-open]", function () { open("filters"); });
    bind("[data-filters-close]", function () { close("filters"); });

    // live prices: re-sort by what's actually charged
    d.addEventListener("hlix:prices", function () {
      if (!window.HLIXPrices) return;
      data.forEach(function (it) {
        var min = null;
        it.skus.forEach(function (s) { var p = window.HLIXPrices.get(s); if (p && (min === null || p.powder < min)) min = p.powder; });
        if (min !== null) it.price = min;
      });
      if (st.sort.indexOf("price") === 0) apply(false);
    });

    apply(false);
  })();

  // ------------------------------------------------------------------
  // product page: size + form, price, photos, add to cart, sticky buy bar
  // ------------------------------------------------------------------
  // Stock from the admin's Inventory (v2-prices.js): a tag on every product card ("in stock" when
  // any size is, "on the way", or "out of stock", in red) and the same words on each size button.
  // Everything stays orderable; nothing shows until the live stock has loaded.
  var CARD_STOCK = { in_stock: "in stock", on_the_way: "on the way", to_order: "out of stock" };
  function decorateStock() {
    var P = window.HLIXPrices;
    if (!P || !P.stock) return;
    var S = function (sku) { return P.stock(sku); };
    $$("[data-card]").forEach(function (card) {
      var tag = $("[data-card-stock]", card);
      if (!tag) return;
      var all = (card.getAttribute("data-skus") || "").split(",").map(S);
      var st = all.indexOf("in_stock") >= 0 ? "in_stock"
        : all.indexOf("on_the_way") >= 0 ? "on_the_way"
        : all.length && all.every(function (x) { return x === "to_order"; }) ? "to_order" : null;
      tag.hidden = !st;
      if (!st) return;
      tag.className = "tag-stock is-" + st;
      tag.textContent = CARD_STOCK[st];
    });
    $$("[data-variant]").forEach(function (b) {
      var label = $("[data-tile-stock]", b), st = S(b.getAttribute("data-sku"));
      if (!label) return;
      label.hidden = !st;
      label.className = "size__stock" + (st ? " is-" + st : "");
      label.textContent = st ? CARD_STOCK[st] : "";
    });
  }
  d.addEventListener("hlix:prices", decorateStock);

  var pdp = $("[data-pdp]");
  if (pdp) (function () {
    var sizes = $$("[data-variant]", pdp);
    var forms = $$(".forms [data-form]", pdp);
    var thumbs = $$("[data-form-thumb]", pdp);
    var mainImg = $("[data-main-img]", pdp);
    var badge = $("[data-form-badge]", pdp);
    var qtyIn = $("[data-qty-input]", pdp);
    var addBtn = $("[data-add]", pdp);
    var name = $(".pdp__name", pdp).textContent;
    var priceMain = $(".pdp__price [data-price-out]", pdp);
    var shownPrice = null;
    // the page starts on the form it was built with (powder)
    var startForm = forms.filter(function (b) { return b.classList.contains("is-active"); })[0];
    var st = { btn: sizes.filter(function (b) { return b.classList.contains("is-active"); })[0] || sizes[0], form: startForm ? startForm.getAttribute("data-form") : "powder" };

    function num(b, a) { return parseFloat(b.getAttribute(a)) || 0; }
    function unit(b, form) { return num(b, form === "recon" ? "data-price-recon" : "data-price"); }
    function qty() { return Math.max(1, parseInt(qtyIn.value, 10) || 1); }
    function formLabel(f) { return f === "recon" ? "ready to use" : "powder"; }
    function setAll(sel, text) { $$(sel).forEach(function (el) { el.textContent = text; }); }

    function swapImg(img, url, alt) {
      if (!img) return;
      var pre = new Image();
      pre.onload = function () {
        img.src = url;
        if (alt) img.alt = alt;
        if (!reduce && img === mainImg) { img.classList.remove("swap"); void img.offsetWidth; img.classList.add("swap"); }
      };
      pre.src = url;
    }
    function images() {
      if (!mainImg) return;
      var base = mainImg.getAttribute("data-base"), sku = st.btn.getAttribute("data-img");
      swapImg(mainImg, base + sku + "-" + st.form + ".webp", name + " " + st.btn.getAttribute("data-dose") + " research vial, " + formLabel(st.form));
      thumbs.forEach(function (t) { swapImg($("img", t), base + sku + "-" + t.getAttribute("data-form-thumb") + "-s.webp"); });
    }
    function perMg(price) {
      var amt = num(st.btn, "data-amt");
      return st.btn.getAttribute("data-dunit") === "mg" && amt > 0 ? "$" + (price / amt).toFixed(2) + " / mg" : "";
    }
    // family & friends pricing (v3-cart.js): hlix's cost by the vial or the pack of 10,
    // for accounts an admin marked as family & friends; the regular price shows crossed out
    var fam = $("[data-family]", pdp);
    var regular = $("[data-regular]", pdp);
    var buyBy = "pack"; // family & friends start on the pack of 10
    function famPrice(unitName) {
      return window.HLIXCart && window.HLIXCart.familyPrice ? window.HLIXCart.familyPrice(st.btn.getAttribute("data-sku"), unitName || buyBy) : null;
    }
    function renderFamily() {
      if (!fam) return;
      var on = famPrice("vial") !== null;
      fam.hidden = !on;
      if (regular) regular.classList.toggle("is-regular", on);
      if (!on) return;
      $$("[data-unit]", fam).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-unit") === buyBy ? "true" : "false"); });
      $("[data-family-price]", fam).textContent = window.HLIXCart.money(famPrice());
      $("[data-family-per]", fam).textContent = buyBy === "pack" ? "/ pack of 10" : "/ vial";
    }
    if (fam) $$("[data-unit]", fam).forEach(function (b) {
      b.addEventListener("click", function () { buyBy = b.getAttribute("data-unit") === "pack" ? "pack" : "vial"; render(); });
    });
    // what one of what's being added costs: the family price when there is one
    function charge() {
      var f = famPrice();
      return f !== null ? { unit: buyBy, price: f } : { unit: "vial", price: unit(st.btn, st.form) };
    }

    // stock for the selected size, from the admin's Inventory (v2-prices.js); every size can
    // be ordered, the line just says when it would ship
    var stockLine = $("[data-stock]", pdp);
    var STOCK_TEXT = { in_stock: "in stock", on_the_way: "on the way", to_order: "out of stock \u00b7 ships in 1\u20132 weeks, ordered for you" };
    function stockOf(sku) { return window.HLIXPrices && window.HLIXPrices.stock ? window.HLIXPrices.stock(sku) : null; }
    // a size that's out of stock is ordered for the customer: the buttons say "pre-order"
    function buyLabel() { return stockOf(st.btn.getAttribute("data-sku")) === "to_order" ? "pre-order " : "add to cart "; }
    function renderStock() {
      var s = stockOf(st.btn.getAttribute("data-sku"));
      if (!addBtn.classList.contains("is-done")) addBtn.firstChild.textContent = buyLabel();
      var proxyBtn = $("[data-add-proxy]");
      if (proxyBtn) proxyBtn.firstChild.textContent = s === "to_order" ? "pre-order \u00b7 " : "add \u00b7 ";
      if (!stockLine) return;
      stockLine.hidden = !s;
      if (!s) return;
      stockLine.className = "stockline is-" + s;
      $("[data-stock-text]", stockLine).textContent = STOCK_TEXT[s];
    }

    function render() {
      renderFamily();
      var p = unit(st.btn, st.form);
      if (priceMain) {
        var from = shownPrice === null ? p : shownPrice;
        tween(from, p, 600, function (v) { priceMain.textContent = money(Math.round(v * 100) / 100); }, function () { priceMain.textContent = money(p); });
        shownPrice = p;
      }
      $$("[data-price-out]").forEach(function (el) { if (el !== priceMain) el.textContent = money(p); });
      setAll("[data-permg]", perMg(p));
      setAll("[data-dose-out]", st.btn.getAttribute("data-dose"));
      setAll("[data-sku-out]", st.btn.getAttribute("data-sku"));
      setAll("[data-form-out]", formLabel(st.form));
      sizes.forEach(function (b) { var tp = $("[data-tile-price]", b); if (tp) tp.textContent = money(unit(b, st.form)); });
      $$("[data-form-price]").forEach(function (el) { el.textContent = money(unit(st.btn, el.getAttribute("data-form-price"))); });
      var c = charge(), m = window.HLIXCart ? window.HLIXCart.money : money;
      var sum = $("[data-add-sum]");
      if (sum) sum.textContent = "· " + m(c.price * qty());
      if (c.price !== p) $$("[data-buybar] [data-price-out]").forEach(function (el) { el.textContent = m(c.price); });
      if (badge) { badge.textContent = formLabel(st.form); badge.classList.toggle("is-powder", st.form === "powder"); }
      renderStock();
      $$("[data-pick]").forEach(function (r) { r.classList.toggle("is-active", r.getAttribute("data-pick") === st.btn.getAttribute("data-sku")); });
    }
    function pickSize(b) {
      if (!b) return;
      st.btn = b;
      sizes.forEach(function (x) { var on = x === b; x.classList.toggle("is-active", on); x.setAttribute("aria-checked", on ? "true" : "false"); });
      images();
      render();
    }
    function pickForm(f) {
      st.form = f;
      forms.forEach(function (x) { var on = x.getAttribute("data-form") === f; x.classList.toggle("is-active", on); x.setAttribute("aria-checked", on ? "true" : "false"); });
      thumbs.forEach(function (x) { var on = x.getAttribute("data-form-thumb") === f; x.classList.toggle("is-active", on); x.setAttribute("aria-pressed", on ? "true" : "false"); });
      images();
      render();
    }
    sizes.forEach(function (b) { b.addEventListener("click", function () { pickSize(b); }); });
    forms.forEach(function (b) { b.addEventListener("click", function () { pickForm(b.getAttribute("data-form")); }); });
    thumbs.forEach(function (b) { b.addEventListener("click", function () { pickForm(b.getAttribute("data-form-thumb")); }); });
    // radio groups: arrow keys move the choice
    [sizes, forms].forEach(function (list) {
      list.forEach(function (b, i) {
        b.addEventListener("keydown", function (e) {
          var dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          var n = list[(i + dir + list.length) % list.length];
          n.focus(); n.click();
        });
      });
    });
    $$("[data-pick]").forEach(function (r) {
      r.addEventListener("click", function () {
        var sku = r.getAttribute("data-pick");
        pickSize(sizes.filter(function (b) { return b.getAttribute("data-sku") === sku; })[0]);
        var panel = $(".pdp__panel", pdp);
        if (panel) panel.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      });
    });

    $("[data-qty-dec]", pdp).addEventListener("click", function () { qtyIn.value = Math.max(1, qty() - 1); render(); });
    $("[data-qty-inc]", pdp).addEventListener("click", function () { qtyIn.value = qty() + 1; render(); });
    qtyIn.addEventListener("input", render);
    qtyIn.addEventListener("blur", function () { qtyIn.value = qty(); render(); });

    var doneT = null;
    addBtn.addEventListener("click", function () {
      if (!window.HLIXCart) return;
      var sku = st.btn.getAttribute("data-sku");
      var live = window.HLIXPrices ? window.HLIXPrices.unit(sku, st.form) : null;
      var c = charge();
      var n = qty();
      window.HLIXCart.add({
        sku: sku,
        name: addBtn.getAttribute("data-name"),
        category: addBtn.getAttribute("data-category"),
        slug: addBtn.getAttribute("data-slug"),
        dose: st.btn.getAttribute("data-dose"),
        form: st.form,
        unit: c.unit,
        unitPrice: famPrice() !== null ? c.price : live !== null ? live : c.price,
        qty: n
      });
      toast("added " + esc(name.toLowerCase()) + " · " + esc(st.btn.getAttribute("data-dose")) + (c.unit === "pack" ? " · pack of 10" : "") + (n > 1 ? " ×" + n : ""), { label: "view cart", run: function () { open("cart"); } });
      addBtn.classList.add("is-done");
      addBtn.firstChild.textContent = "added ";
      clearTimeout(doneT);
      doneT = setTimeout(function () { addBtn.classList.remove("is-done"); addBtn.firstChild.textContent = buyLabel(); }, 1600);
      qtyIn.value = 1;
      render();
    });
    var proxy = $("[data-add-proxy]");
    if (proxy) proxy.addEventListener("click", function () { addBtn.click(); });

    // mobile: a buy bar once the real button has scrolled away
    var buy = $("[data-buy]", pdp);
    var bar = $("[data-buybar]");
    if (buy && bar) {
      var barQueued = false;
      var barCheck = function () {
        barQueued = false;
        var on = buy.getBoundingClientRect().bottom < 0;
        if (on === root.classList.contains("buybar-on")) return;
        root.classList.toggle("buybar-on", on);
        bar.setAttribute("aria-hidden", on ? "false" : "true");
        if (proxy) proxy.tabIndex = on ? 0 : -1;
      };
      window.addEventListener("scroll", function () { if (!barQueued) { barQueued = true; requestAnimationFrame(barCheck); } }, { passive: true });
      window.addEventListener("resize", barCheck);
      barCheck();
    }

    // live prices (v2-prices.js rewrites each size's data-price / data-price-recon)
    d.addEventListener("hlix:prices", function () {
      if (!window.HLIXPrices) return;
      $$("[data-cell]").forEach(function (td) {
        var parts = td.getAttribute("data-cell").split("|"), u = window.HLIXPrices.unit(parts[0], parts[1]);
        if (u !== null) td.textContent = money(u);
      });
      $$("[data-cell-mg]").forEach(function (td) {
        var b = sizes.filter(function (x) { return x.getAttribute("data-sku") === td.getAttribute("data-cell-mg"); })[0];
        var amt = b ? num(b, "data-amt") : 0;
        if (b && b.getAttribute("data-dunit") === "mg" && amt > 0) td.textContent = "$" + (unit(b, "powder") / amt).toFixed(2) + " / mg";
      });
      render();
    });

    d.addEventListener("hlix:account", function () { render(); });
    if (window.HLIXAccount && window.HLIXAccount.ready) window.HLIXAccount.ready.then(function () { render(); });

    // recently viewed, for the search palette
    try {
      var slug = pdp.getAttribute("data-slug");
      var list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter(function (s) { return s !== slug; });
      list.unshift(slug);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
    } catch (e) {}

    render();
  })();

  // ------------------------------------------------------------------
  // contact form — posts to /api/contact (Resend), only live once deployed
  // ------------------------------------------------------------------
  var cform = $("[data-contact-form]");
  if (cform) {
    var cstatus = $("[data-contact-status]", cform);
    var csubmit = $('button[type="submit"]', cform);
    cform.addEventListener("submit", function (e) {
      e.preventDefault();
      var body = { name: cform.name.value.trim(), email: cform.email.value.trim(), message: cform.message.value.trim() };
      if (!body.name || !body.email || !body.message) return;
      csubmit.disabled = true;
      cstatus.hidden = false;
      cstatus.classList.remove("is-error");
      cstatus.textContent = "sending…";
      fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (res) {
          if (res.ok) {
            cstatus.textContent = "message sent. we'll get back to you within 1–2 business days.";
            cform.reset();
            csubmit.disabled = false;
          } else {
            cstatus.classList.add("is-error");
            cstatus.textContent = res.data.error || "something went wrong. try again in a moment.";
            csubmit.disabled = false;
          }
        })
        .catch(function () {
          cstatus.classList.add("is-error");
          cstatus.textContent = "couldn't reach the server. this only works once the site is deployed.";
          csubmit.disabled = false;
        });
    });
  }

  // calculator page: the "calculator / dose planner" jump pills follow the scroll
  var jump = $$(".jump a");
  if (jump.length === 2) {
    var plannerEl = $("#planner");
    var onJ = function () {
      var inPlanner = plannerEl && plannerEl.getBoundingClientRect().top < window.innerHeight * 0.4;
      jump[0].classList.toggle("is-on", !inPlanner);
      jump[1].classList.toggle("is-on", !!inPlanner);
    };
    window.addEventListener("scroll", onJ, { passive: true });
    onJ();
  }
})();
