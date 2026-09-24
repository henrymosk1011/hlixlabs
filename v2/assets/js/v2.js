// hlix v2 — motion engine + ui (no dependencies)
(function () {
  "use strict";

  var d = document;
  var root = d.documentElement;
  root.classList.add("ready");
  var reduce = root.classList.contains("no-motion");
  var cfg = window.HLIX2 || { base: "", root: "../" };

  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;

  var vw = window.innerWidth;
  var vh = window.innerHeight;
  var sy = window.pageYOffset;
  var lastY = sy;

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------
  function tween(from, to, dur, onUpdate, onDone) {
    if (reduce || dur <= 0 || from === to) { onUpdate(to); if (onDone) onDone(); return; }
    var start = null, finished = false;
    function finish() { if (finished) return; finished = true; onUpdate(to); if (onDone) onDone(); }
    function step(t) {
      if (finished) return;
      if (start === null) start = t;
      var p = clamp((t - start) / dur, 0, 1);
      var e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      onUpdate(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step); else finish();
    }
    requestAnimationFrame(step);
    setTimeout(finish, dur + 80); // guarantees the final value even if rAF is throttled
  }
  window.HLIX2 = window.HLIX2 || {};
  window.HLIX2.tween = tween;

  function walkWords(el, make) {
    var i = 0, out = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = d.createDocumentFragment();
          n.nodeValue.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(d.createTextNode(" ")); return; }
            var made = make(part, i++);
            out.push(made.word);
            frag.appendChild(made.node);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== "BR") {
          walk(n);
        }
      });
    })(el);
    return out;
  }

  // ------------------------------------------------------------------
  // split headings into masked words
  // ------------------------------------------------------------------
  $$("[data-split]").forEach(function (el) {
    walkWords(el, function (text, i) {
      var w = d.createElement("span"); w.className = "w";
      var wi = d.createElement("span"); wi.className = "wi"; wi.textContent = text; wi.style.setProperty("--i", i);
      w.appendChild(wi);
      return { node: w, word: wi };
    });
    el.classList.add("is-split");
  });

  // scrubbed paragraphs
  var scrubs = $$("[data-scrub]").map(function (el) {
    var words = walkWords(el, function (text) {
      var s = d.createElement("span"); s.className = "sw"; s.textContent = text;
      return { node: s, word: s };
    });
    return { el: el, words: words, lit: -1 };
  });

  // stagger children
  $$("[data-stagger]").forEach(function (parent) {
    Array.prototype.slice.call(parent.children).forEach(function (c, i) {
      if (!c.hasAttribute("data-reveal")) c.setAttribute("data-reveal", "");
      c.style.setProperty("--d", i);
    });
  });

  // ------------------------------------------------------------------
  // reveal + counters (IntersectionObserver)
  // ------------------------------------------------------------------
  var revealTargets = $$("[data-reveal], [data-split], .rule");
  var pending = revealTargets.slice();
  var ioFired = false;
  var t0 = performance.now();
  // backup path: if IntersectionObserver is unavailable or stalls, reveal by scroll position
  function revealByPosition() {
    pending = pending.filter(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < vh * 0.94 && r.bottom > 0) { el.classList.add("in"); return false; }
      return true;
    });
  }
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      ioFired = true;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    revealTargets.forEach(function (el) { io.observe(el); });
    setTimeout(function () { if (!ioFired) revealByPosition(); }, 900);
  } else {
    revealTargets.forEach(function (el) { el.classList.add("in"); });
    pending = [];
  }

  function fmtCount(n, el) {
    var dec = parseInt(el.getAttribute("data-dec") || "0", 10);
    return n.toFixed(dec);
  }
  var counters = $$("[data-count]");
  if ("IntersectionObserver" in window && !reduce) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target, to = parseFloat(el.getAttribute("data-count"));
        tween(0, to, 1800, function (v) { el.textContent = fmtCount(v, el); });
        cio.unobserve(el);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { el.textContent = fmtCount(0, el); cio.observe(el); });
  }

  // ------------------------------------------------------------------
  // scroll-driven layer: progress bar, nav, parallax, scrub text, hscroll
  // ------------------------------------------------------------------
  var nav = $("[data-nav]");
  var bar = $(".progress i");
  var parallax = $$("[data-parallax]").map(function (el) {
    return { el: el, parent: el.parentElement, speed: parseFloat(el.getAttribute("data-parallax")), rot: parseFloat(el.getAttribute("data-rot") || "0") };
  });
  var hscrolls = $$("[data-hscroll]").map(function (sec) {
    return { sec: sec, track: $("[data-htrack]", sec), bar: $(".lineup__bar i", sec), dist: 0, on: false };
  });
  var syrScrubs = $$("[data-syringe-scrub]");

  function measureH() {
    hscrolls.forEach(function (h) {
      var on = vw >= 900 && !reduce;
      h.on = on;
      h.sec.classList.toggle("is-h", on);
      if (!on) { h.sec.style.height = ""; h.track.style.transform = ""; return; }
      h.track.style.transform = "";
      h.dist = Math.max(0, h.track.scrollWidth - vw);
      h.sec.style.height = (h.dist + vh) + "px";
    });
  }

  function update() {
    sy = window.pageYOffset;
    var max = root.scrollHeight - vh;
    if (bar) bar.style.transform = "scaleX(" + (max > 0 ? clamp(sy / max, 0, 1) : 0) + ")";

    if (nav) {
      nav.classList.toggle("is-scrolled", sy > 12);
      if (sy > lastY + 6 && sy > 140) nav.classList.add("is-hidden");
      else if (sy < lastY - 6 || sy < 140) nav.classList.remove("is-hidden");
    }
    lastY = sy;

    if (reduce) return;
    if (!ioFired && pending.length && performance.now() - t0 > 900) revealByPosition();

    for (var i = 0; i < parallax.length; i++) {
      var p = parallax[i];
      var r = p.parent.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      var off = (r.top + r.height / 2) - vh / 2;
      var t = "translate3d(0," + (-off * p.speed).toFixed(1) + "px,0)";
      if (p.rot) t += " rotate(" + (off / vh * p.rot).toFixed(2) + "deg)";
      p.el.style.transform = t;
    }

    for (var j = 0; j < scrubs.length; j++) {
      var s = scrubs[j];
      var sr = s.el.getBoundingClientRect();
      if (sr.bottom < -100 || sr.top > vh + 100) { if (sr.top > vh) { /* below: keep dim */ } }
      var prog = clamp((vh * 0.88 - sr.top) / (sr.height + vh * 0.34), 0, 1);
      var n = Math.round(prog * s.words.length);
      if (n !== s.lit) {
        for (var k = 0; k < s.words.length; k++) s.words[k].classList.toggle("lit", k < n);
        s.lit = n;
      }
    }

    for (var m = 0; m < hscrolls.length; m++) {
      var h = hscrolls[m];
      if (!h.on) continue;
      var hr = h.sec.getBoundingClientRect();
      var hp = h.dist > 0 ? clamp(-hr.top / h.dist, 0, 1) : 0;
      h.track.style.transform = "translate3d(" + (-hp * h.dist).toFixed(1) + "px,0,0)";
      if (h.bar) h.bar.style.transform = "scaleX(" + hp.toFixed(4) + ")";
    }

    for (var q = 0; q < syrScrubs.length; q++) {
      var el = syrScrubs[q];
      var er = el.getBoundingClientRect();
      var ep = clamp((vh - er.top) / (vh + er.height * 0.4), 0, 1);
      el.style.setProperty("--fill", (0.06 + ep * 0.8).toFixed(3));
      var labels = $$(".tick", el);
      labels.forEach(function (lab, idx) { lab.textContent = Math.round(100 * idx / 4 * 1); });
    }
  }
  window.HLIX2.update = update;
  window.HLIX2.measure = function () { vw = window.innerWidth; vh = window.innerHeight; measureH(); update(); };

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", function () { vw = window.innerWidth; vh = window.innerHeight; measureH(); update(); });
  window.addEventListener("load", function () { measureH(); update(); });
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { measureH(); update(); });
  measureH();
  update();

  // ------------------------------------------------------------------
  // marquee (time based, speeds up with scroll velocity)
  // ------------------------------------------------------------------
  var marqs = $$("[data-marq]").map(function (el) {
    var track = $(".marq__track", el);
    return { track: track, dir: parseFloat(el.getAttribute("data-marq")) || -1, x: 0, half: 0 };
  });
  if (marqs.length && !reduce) {
    var vel = 0, prevY = sy, prevT = performance.now();
    var measureM = function () { marqs.forEach(function (m) { m.half = m.track.scrollWidth / 2; }); };
    measureM();
    window.addEventListener("resize", measureM);
    window.addEventListener("load", measureM);
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(measureM);
    var loop = function (t) {
      var dt = Math.min(64, t - prevT); prevT = t;
      var dy = Math.abs(window.pageYOffset - prevY); prevY = window.pageYOffset;
      vel += (Math.min(dy, 90) - vel) * 0.1;
      marqs.forEach(function (m) {
        if (!m.half) return;
        m.x += m.dir * (0.05 + vel * 0.045) * dt;
        if (m.x <= -m.half) m.x += m.half;
        if (m.x >= 0) m.x -= m.half;
        m.track.style.transform = "translate3d(" + m.x.toFixed(1) + "px,0,0)";
      });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------
  // pointer effects (desktop only)
  // ------------------------------------------------------------------
  if (fine && !reduce) {
    $$("[data-magnetic]").forEach(function (el) {
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        el.style.transform = "translate(" + ((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1) + "px," + ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + "px)";
      });
      el.addEventListener("mouseleave", function () { el.style.transform = ""; });
    });
    var hero = $("[data-hero]");
    if (hero) {
      hero.addEventListener("mousemove", function (e) {
        hero.style.setProperty("--mx", ((e.clientX / vw) * 2 - 1).toFixed(3));
        hero.style.setProperty("--my", ((e.clientY / vh) * 2 - 1).toFixed(3));
      });
    }
    $$("[data-tilt]").forEach(function (el) {
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        var svg = $("svg, img", el);
        if (svg) { svg.style.setProperty("--ry", (x * 16).toFixed(2) + "deg"); svg.style.setProperty("--rx", (-y * 12).toFixed(2) + "deg"); }
      });
      el.addEventListener("mouseleave", function () {
        var svg = $("svg, img", el);
        if (svg) { svg.style.setProperty("--ry", "0deg"); svg.style.setProperty("--rx", "0deg"); }
      });
    });
  }
  $$(".pcard").forEach(function (c) {
    var st = $(".pcard__stage", c);
    if (!st) return;
    c.addEventListener("mousemove", function (e) {
      var r = st.getBoundingClientRect();
      st.style.setProperty("--mx", (e.clientX - r.left) + "px");
      st.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });

  // ------------------------------------------------------------------
  // mobile menu
  // ------------------------------------------------------------------
  var burger = $("[data-menu-toggle]");
  function setMenu(open) {
    root.classList.toggle("menu-open", open);
    d.body.classList.toggle("is-locked", open);
    if (burger) burger.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (burger) burger.addEventListener("click", function () { setMenu(!root.classList.contains("menu-open")); });
  $$(".menu a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });

  // ------------------------------------------------------------------
  // search overlay
  // ------------------------------------------------------------------
  var searchEl = $("[data-search]");
  var sInput = $("[data-search-input]");
  var sList = $("[data-search-list]");
  var sHint = $("[data-search-hint]");
  var idx = window.HLIX_SEARCH_INDEX || [];
  var selIdx = -1;

  function renderSearch(q) {
    q = q.trim().toLowerCase();
    selIdx = -1;
    if (!q) { sList.innerHTML = ""; sHint.hidden = false; return; }
    sHint.hidden = true;
    var res = idx.filter(function (it) { return it.name.toLowerCase().indexOf(q) > -1 || it.category.toLowerCase().indexOf(q) > -1; }).slice(0, 9);
    if (!res.length) { sList.innerHTML = '<p class="search__hint">no matches for “' + esc(q) + '”.</p>'; return; }
    sList.innerHTML = res.map(function (r, i) {
      return '<a class="sr" style="--i:' + i + '" href="' + cfg.base + "peptides/" + r.slug + '.html">' +
        '<span class="sr__n">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<span class="sr__t">' + esc(r.name) + "</span>" +
        '<span class="sr__c">' + esc(r.category) + "</span>" +
        '<span class="sr__p">' + (r.multi ? "from " : "") + "$" + r.priceFrom + "</span></a>";
    }).join("");
  }
  function openSearch() {
    if (!searchEl) return;
    setMenu(false);
    root.classList.add("search-open");
    d.body.classList.add("is-locked");
    renderSearch(sInput.value);
    setTimeout(function () { sInput.focus(); }, 60);
  }
  function closeSearch() {
    root.classList.remove("search-open");
    d.body.classList.remove("is-locked");
    sInput.blur();
  }
  if (searchEl) {
    $$("[data-search-open]").forEach(function (b) { b.addEventListener("click", openSearch); });
    $$("[data-search-close]").forEach(function (b) { b.addEventListener("click", closeSearch); });
    sInput.addEventListener("input", function () { renderSearch(sInput.value); });
    $$("[data-try]", searchEl).forEach(function (b) {
      b.addEventListener("click", function () { sInput.value = b.getAttribute("data-try"); renderSearch(sInput.value); sInput.focus(); });
    });
    sInput.addEventListener("keydown", function (e) {
      var links = $$(".sr", sList);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!links.length) return;
        selIdx = (selIdx + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
        links.forEach(function (l, i) { l.classList.toggle("is-sel", i === selIdx); });
      } else if (e.key === "Enter") {
        var target = links[selIdx >= 0 ? selIdx : 0];
        if (target) window.location.href = target.getAttribute("href");
      }
    });
    d.addEventListener("keydown", function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(d.activeElement.tagName);
      if (e.key === "Escape") { closeSearch(); closeLb(); setMenu(false); }
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); openSearch(); }
    });
  }

  // ------------------------------------------------------------------
  // lightbox
  // ------------------------------------------------------------------
  var lb = $("[data-lb]");
  var lbIn = lb ? $(".lb__in", lb) : null;
  function closeLb() { if (lb) lb.classList.remove("is-open"); }
  $$("[data-zoom]").forEach(function (z) {
    z.addEventListener("click", function () {
      if (!lb) return;
      lbIn.innerHTML = $("svg, img", z).outerHTML;
      lb.classList.add("is-open");
    });
  });
  if (lb) lb.addEventListener("click", closeLb);

  // ------------------------------------------------------------------
  // variant selector (segmented control with sliding thumb)
  // ------------------------------------------------------------------
  $$("[data-seg]").forEach(function (seg) {
    var btns = $$("[data-variant]", seg);
    var thumb = $(".seg__thumb", seg);
    var stageImg = $("[data-zoom] img");
    var stage = stageImg || $("[data-zoom] svg");
    var doseText = !stageImg && stage ? $('[data-role="dose-text"]', stage) : null;
    var skuText = stage ? $('[data-role="sku-text"]', stage) : null;
    var priceEl = $(".price__n");
    var current = parseFloat(priceEl ? priceEl.getAttribute("data-price") : "0") || 0;

    function place(b) {
      seg.style.setProperty("--x", b.offsetLeft + "px");
      seg.style.setProperty("--y", b.offsetTop + "px");
      seg.style.setProperty("--w", b.offsetWidth + "px");
      seg.style.setProperty("--h", b.offsetHeight + "px");
    }
    function active() { return btns.filter(function (b) { return b.classList.contains("is-active"); })[0] || btns[0]; }
    place(active());
    window.addEventListener("resize", function () { place(active()); });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { place(active()); });
    window.addEventListener("load", function () { place(active()); });

    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (x) { x.classList.remove("is-active"); x.setAttribute("aria-checked", "false"); });
        b.classList.add("is-active"); b.setAttribute("aria-checked", "true");
        place(b);
        var dose = b.getAttribute("data-dose"), sku = b.getAttribute("data-sku"), price = parseFloat(b.getAttribute("data-price"));
        $$("[data-dose-out]").forEach(function (el) { el.textContent = dose; });
        $$("[data-sku-out]").forEach(function (el) { el.textContent = sku; });
        if (doseText) doseText.textContent = dose;
        if (skuText) skuText.textContent = sku;
        if (priceEl) {
          tween(current, price, 700, function (v) { priceEl.textContent = "$" + Math.round(v); }, function () { priceEl.textContent = "$" + Math.round(price); });
          current = price;
        }
        var imgId = b.getAttribute("data-img");
        if (stageImg && imgId) {
          var url = stageImg.getAttribute("data-base") + imgId + ".webp";
          var pre = new Image();
          pre.onload = function () {
            stageImg.src = url;
            stageImg.alt = ($(".pdp__name") ? $(".pdp__name").textContent : "") + " " + dose + " research vial";
            if (!reduce) { stageImg.classList.remove("bump"); void stageImg.getBoundingClientRect(); stageImg.classList.add("bump"); }
          };
          pre.src = url;
        } else if (stage && !reduce) { stage.classList.remove("bump"); void stage.getBoundingClientRect(); stage.classList.add("bump"); }
      });
    });
  });

  // ------------------------------------------------------------------
  // accordion
  // ------------------------------------------------------------------
  $$("[data-acc] .acc__h").forEach(function (h) {
    h.addEventListener("click", function () {
      var item = h.parentElement;
      var open = item.classList.toggle("is-open");
      h.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  // ------------------------------------------------------------------
  // catalog: filter tabs + live search + sliding indicator
  // ------------------------------------------------------------------
  var tabs = $("[data-tabs]");
  if (tabs) {
    var cards = $$(".pcard");
    var ind = $(".tabs__ind", tabs);
    var empty = $("[data-empty]");
    var countEl = $("[data-shown]");
    var qInput = $("[data-catalog-search]");
    var state = { cat: "all", q: "" };
    var tabBtns = $$("button[data-filter]", tabs);

    var moveInd = function () {
      var a = tabBtns.filter(function (b) { return b.classList.contains("is-active"); })[0];
      if (!a || !ind) return;
      tabs.style.setProperty("--x", a.offsetLeft + "px");
      tabs.style.setProperty("--w", a.offsetWidth + "px");
    };
    var apply = function (animate) {
      var n = 0;
      cards.forEach(function (c) {
        var show = (state.cat === "all" || c.getAttribute("data-cat") === state.cat) && (!state.q || c.getAttribute("data-name").indexOf(state.q) > -1);
        if (show) {
          c.classList.remove("is-hidden");
          c.classList.add("in");
          if (animate && !reduce) { c.style.setProperty("--d", n); c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop"); }
          n++;
        } else {
          c.classList.add("is-hidden");
        }
      });
      if (empty) empty.classList.toggle("is-on", n === 0);
      if (countEl) countEl.textContent = n;
    };
    tabBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        state.cat = b.getAttribute("data-filter");
        tabBtns.forEach(function (x) { x.classList.toggle("is-active", x === b); });
        moveInd();
        history.replaceState(null, "", state.cat === "all" ? location.pathname : "#" + state.cat);
        apply(true);
      });
    });
    if (qInput) qInput.addEventListener("input", function () { state.q = qInput.value.trim().toLowerCase(); apply(true); });
    var startCat = location.hash ? location.hash.slice(1) : "all";
    if (tabBtns.some(function (b) { return b.getAttribute("data-filter") === startCat; })) {
      state.cat = startCat;
      tabBtns.forEach(function (x) { x.classList.toggle("is-active", x.getAttribute("data-filter") === startCat); });
    }
    moveInd();
    apply(false);
    window.addEventListener("resize", moveInd);
    window.addEventListener("load", moveInd);
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(moveInd);
  }

  // ------------------------------------------------------------------
  // typing mock (home ai section)
  // ------------------------------------------------------------------
  $$("[data-typing]").forEach(function (box) {
    var bubs = $$(".bub", box);
    if (reduce || !("IntersectionObserver" in window)) return;
    bubs.forEach(function (b) { b.setAttribute("data-full", b.textContent); b.textContent = ""; b.hidden = true; });
    var started = false;
    var tio = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting || started) return;
      started = true; tio.disconnect();
      var i = 0;
      (function next() {
        if (i >= bubs.length) return;
        var b = bubs[i++], text = b.getAttribute("data-full"), n = 0;
        b.hidden = false; b.classList.add("is-typing");
        var speed = b.classList.contains("bub--u") ? 34 : 16;
        (function type() {
          n += 1;
          b.textContent = text.slice(0, n);
          if (n < text.length) { setTimeout(type, speed); }
          else { b.classList.remove("is-typing"); setTimeout(next, 420); }
        })();
      })();
    }, { threshold: 0.5 });
    tio.observe(box);
  });

  // chat triggers
  $$("[data-open-chat]").forEach(function (b) {
    b.addEventListener("click", function () { if (window.HLIX2 && window.HLIX2.openChat) window.HLIX2.openChat(); });
  });
})();
