// hlix v2 — dose planner: a month calendar that tracks what's left in one vial
// (pure client-side; the plan is kept in this browser's localStorage)
(function () {
  "use strict";
  var root = document.querySelector("[data-planner]");
  if (!root) return;

  var H = window.HLIX2 || {};
  var tween = H.tween || function (a, b, d, u, done) { u(b); if (done) done(); };
  var calc = H.calc || {};
  var STORE = "hlix-plan";
  var EPS = 1e-9;
  var MAX_REPEAT = 400; // safety cap on how many doses one "repeat" can lay down
  var MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  var DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  var $ = function (s, c) { return (c || root).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || root).querySelectorAll(s)); };

  function fmt(n, dec) {
    if (!isFinite(n)) return "···";
    return n.toFixed(dec == null ? 2 : dec).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  }
  function mg(n) { return fmt(n, 2) + " mg"; }
  function clone(o) { var c = {}; Object.keys(o).forEach(function (k) { c[k] = o[k]; }); return c; }

  // ---- dates: local midnights, keyed "yyyy-mm-dd" so keys sort as plain strings ----
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function key(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function mon(d) { return MONTHS[d.getMonth()].slice(0, 3); }
  function dayLabel(d) { return DOW[d.getDay()] + ", " + mon(d) + " " + d.getDate(); }
  function rangeLabel(a, b) { return mon(a) + " " + a.getDate() + "–" + (a.getMonth() === b.getMonth() ? "" : mon(b) + " ") + b.getDate(); }
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var todayKey = key(today);

  // ---- state ----
  var state = { vial: calc.vial > 0 ? calc.vial : 5, doses: {} };
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (saved && saved.vial > 0) state.vial = +saved.vial;
    if (saved && saved.doses && typeof saved.doses === "object") {
      Object.keys(saved.doses).forEach(function (k) {
        var v = +saved.doses[k];
        if (/^\d{4}-\d\d-\d\d$/.test(k) && v > 0) state.doses[k] = v;
      });
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }

  var view = new Date(today.getFullYear(), today.getMonth(), 1); // month on screen
  var focus = todayKey;  // the day the "left in vial" panel describes
  var editing = null;    // day open in the editor
  var snapshot = null;   // doses as they were when the editor opened; every choice re-applies over this
  var edDose = 0, edRep = 0, edCustom = false, edClear = false;

  // ---- plan math ----
  // every dose in date order, with the running total drawn from the vial
  function ledger() {
    var cum = 0;
    return Object.keys(state.doses).sort().map(function (k) { cum += state.doses[k]; return { k: k, mg: state.doses[k], cum: cum }; });
  }
  function usedThrough(L, k) { var u = 0; for (var i = 0; i < L.length && L[i].k <= k; i++) u = L[i].cum; return u; }
  function usedIn(L, a, b) { var u = 0; L.forEach(function (e) { if (e.k >= a && e.k <= b) u += e.mg; }); return u; }

  // ---- calendar ----
  var cal = $("[data-cal]");
  var grid = $("[data-cal-grid]");
  var titleEl = $("[data-cal-title]");
  var sumEl = $("[data-cal-sum]");
  var clearBtn = $("[data-cal-clear]");
  var slots = []; // one per grid square: { el, k } (k is null for the blanks around the month)

  function build(dir) {
    detachEditor();
    grid.innerHTML = "";
    slots = [];
    var y = view.getFullYear(), m = view.getMonth();
    var lead = view.getDay(), days = new Date(y, m + 1, 0).getDate();
    var total = Math.ceil((lead + days) / 7) * 7;
    for (var i = 0; i < total; i++) {
      var n = i - lead + 1, el, k = null;
      if (n < 1 || n > days) {
        el = document.createElement("span");
        el.className = "cal__d is-blank";
      } else {
        k = key(new Date(y, m, n));
        el = document.createElement("button");
        el.type = "button";
        el.className = "cal__d";
        el.setAttribute("data-k", k);
        el.innerHTML = '<span class="cal__n">' + n + '</span><span class="cal__v"></span>';
      }
      grid.appendChild(el);
      slots.push({ el: el, k: k });
    }
    titleEl.innerHTML = MONTHS[m] + " <span>" + y + "</span>";
    if (dir) {
      grid.style.setProperty("--dir", dir);
      grid.classList.remove("is-in");
      void grid.offsetWidth; // restart the slide-in, and let the liquid rise in from empty
      grid.classList.add("is-in");
    }
  }

  // fromKey: the day just edited, so the change ripples forward from it instead of from the 1st
  function paint(fromKey) {
    var L = ledger(), vial = state.vial;
    var first = L.length ? L[0].k : "", last = L.length ? L[L.length - 1].k : "";
    var step = 0;
    slots.forEach(function (s, i) {
      if (!s.k) return;
      var k = s.k, el = s.el, dose = state.doses[k] || 0;
      var after = vial - usedThrough(L, k), before = after + dose;
      var inPlan = L.length > 0 && k >= first && k <= last;
      el.style.setProperty("--lvl", inPlan ? Math.max(0, Math.min(1, after / vial)).toFixed(4) : "0");
      el.style.setProperty("--i", fromKey == null ? i : k > fromKey ? ++step : 0);
      el.classList.toggle("has-dose", dose > 0);
      el.classList.toggle("is-short", dose > 0 && before < dose - EPS);
      el.classList.toggle("is-today", k === todayKey);
      el.classList.toggle("is-past", k < todayKey);
      el.classList.toggle("is-sel", k === editing);
      el.querySelector(".cal__v").innerHTML = dose > 0 ? fmt(dose, 2) + "<small>mg</small>" : "";
      el.setAttribute("aria-label", dayLabel(parse(k)) + (dose > 0 ? ", " + mg(dose) : ", no dose") + (inPlan ? ", " + mg(Math.max(0, after)) + " left" : ""));
    });

    var y = view.getFullYear(), m = view.getMonth();
    var a = key(view), b = key(new Date(y, m + 1, 0));
    var count = L.filter(function (e) { return e.k >= a && e.k <= b; }).length;
    sumEl.textContent = count ? MONTHS[m] + ": " + count + (count === 1 ? " dose · " : " doses · ") + mg(usedIn(L, a, b)) : "no doses in " + MONTHS[m] + " yet";
    clearBtn.hidden = !L.length;
  }

  // ---- "left in vial" panel ----
  var shown = {};
  function tile(name, sub, used, left) {
    var t = $('[data-pl-t="' + name + '"]'), v = $("[data-pl-v]", t), vial = state.vial;
    var short = left < -EPS, to = Math.max(0, left), from = shown[name] == null ? to : shown[name];
    shown[name] = to;
    $("[data-pl-d]", t).textContent = sub;
    t.style.setProperty("--lvl", Math.max(0, Math.min(1, left / vial)).toFixed(4));
    t.classList.toggle("is-short", short);
    $("[data-pl-u]", t).textContent = short ? mg(-left) + " short" : used > EPS ? mg(used) + " used" : "nothing used";
    tween(from, to, 650, function (x) { v.textContent = fmt(x, 2); }, function () { v.textContent = fmt(to, 2); });
  }

  function summarize() {
    var L = ledger(), vial = state.vial, f = parse(focus);
    var ws = addDays(f, -f.getDay()), we = addDays(f, 6 - f.getDay());
    var ms = new Date(f.getFullYear(), f.getMonth(), 1), me = new Date(f.getFullYear(), f.getMonth() + 1, 0);
    tile("day", focus === todayKey ? "today" : mon(f) + " " + f.getDate(), usedIn(L, focus, focus), vial - usedThrough(L, focus));
    tile("week", rangeLabel(ws, we), usedIn(L, key(ws), key(we)), vial - usedThrough(L, key(we)));
    tile("month", MONTHS[f.getMonth()], usedIn(L, key(ms), key(me)), vial - usedThrough(L, key(me)));
    $("[data-pl-size]").textContent = mg(vial) + " vial";

    var total = L.length ? L[L.length - 1].cum : 0, dry = null, over = null;
    L.forEach(function (e) {
      if (!dry && e.cum >= vial - EPS) dry = e;
      if (!over && e.cum > vial + EPS) over = e;
    });
    var outK = $("[data-pl-out-k]"), outEl = $("[data-pl-out]"), planEl = $("[data-pl-plan]"), warn = $("[data-pl-warn]");
    outK.textContent = dry || !L.length ? "runs dry" : "spare after plan";
    if (!L.length) {
      outEl.textContent = "—";
      planEl.textContent = "tap a day to add one";
    } else {
      if (dry) {
        var days = Math.round((parse(dry.k) - today) / 864e5);
        outEl.textContent = dayLabel(parse(dry.k)) + (days === 0 ? " · today" : days === 1 ? " · tomorrow" : days > 1 ? " · in " + days + " days" : "");
      } else {
        outEl.textContent = mg(vial - total);
      }
      planEl.textContent = L.length + (L.length === 1 ? " dose · " : " doses · ") + mg(total);
    }
    warn.hidden = !over;
    if (over) warn.textContent = "this plan uses " + mg(total) + ", " + mg(total - vial) + " more than one " + mg(vial) + " vial holds. the amber days come after it runs dry, so you'd open a second vial on " + dayLabel(parse(over.k)) + ".";
  }

  // ---- day editor (slides open under the tapped day's week) ----
  var ed = $("[data-cal-ed]");
  var edDate = $("[data-ed-date]", ed), edMeta = $("[data-ed-meta]", ed), edHint = $("[data-ed-hint]", ed);
  var doseBtns = $$("[data-ed-dose] .opt", ed), doseIn = $("[data-ed-dose] .opt-in", ed);
  var repBtns = $$("[data-ed-rep] .opt", ed);
  var closeT = 0;

  function indexOf(k) { for (var i = 0; i < slots.length; i++) if (slots[i].k === k) return i; return -1; }
  function cellOf(k) { var i = indexOf(k); return i < 0 ? null : slots[i].el; }

  function openEditor(k) {
    if (editing === k) { closeEditor(); return; }
    var idx = indexOf(k), row = Math.floor(idx / 7);
    var wasRow = editing && ed.parentNode === grid ? Math.floor(indexOf(editing) / 7) : -1;
    editing = k;
    focus = k;
    snapshot = clone(state.doses);
    edDose = state.doses[k] || 0;
    edRep = 0;
    edClear = false;
    edCustom = edDose > 0 && !doseBtns.some(function (b) { return parseFloat(b.getAttribute("data-val")) === edDose; });
    clearTimeout(closeT);
    ed.style.setProperty("--col", idx % 7);
    if (row !== wasRow) {
      ed.classList.remove("is-open");
      ed.hidden = false;
      grid.insertBefore(ed, slots[row * 7 + 6].el.nextSibling);
      void ed.offsetHeight;
      ed.classList.add("is-open");
    }
    paint(k);
    summarize();
    syncEditor();
  }

  function closeEditor() {
    if (!editing) return;
    editing = null;
    snapshot = null;
    ed.classList.remove("is-open");
    clearTimeout(closeT);
    closeT = setTimeout(detachEditor, 460);
    paint();
  }

  function detachEditor() {
    clearTimeout(closeT);
    editing = null;
    ed.classList.remove("is-open");
    ed.hidden = true;
    if (ed.parentNode !== cal) cal.appendChild(ed);
  }

  function syncEditor() {
    if (!editing) return;
    var d = parse(editing);
    edDate.textContent = editing === todayKey ? "today, " + mon(d) + " " + d.getDate() : dayLabel(d);
    doseBtns.forEach(function (b) {
      var v = b.getAttribute("data-val");
      b.classList.toggle("is-active", v === "custom" ? edCustom : !edCustom && parseFloat(v) === edDose);
    });
    doseIn.hidden = !edCustom;
    if (edCustom && document.activeElement !== doseIn) doseIn.value = edDose > 0 ? edDose : "";
    repBtns.forEach(function (b) { b.classList.toggle("is-active", +b.getAttribute("data-val") === edRep); });

    var L = ledger(), dose = state.doses[editing] || 0, left = state.vial - usedThrough(L, editing);
    var water = +calc.water || 0;
    edMeta.classList.toggle("is-warn", dose > 0 && left < -EPS);
    if (dose > 0 && left < -EPS) edMeta.textContent = "not enough left: " + mg(-left) + " short";
    else if (dose > 0) edMeta.textContent = mg(left) + " left after this dose" + (water > 0 ? " · draw " + fmt(dose * water * 100 / state.vial, 1) + " units" : "");
    else edMeta.textContent = L.length && editing >= L[0].k ? mg(Math.max(0, left)) + " in the vial" : "no dose yet";
    edHint.hidden = !edRep;
    edHint.textContent = edDose > 0 ? "repeats from this day until the vial runs dry." : edClear ? "clears this day and every dose after it." : "pick a dose to repeat from this day.";
  }

  function apply() {
    var k = editing, d = clone(snapshot);
    if (edRep && (edDose > 0 || edClear)) Object.keys(d).forEach(function (x) { if (x > k) delete d[x]; });
    if (edDose > 0) {
      d[k] = edDose;
      if (edRep) {
        var left = state.vial, day = parse(k), n = 0;
        Object.keys(d).forEach(function (x) { left -= d[x]; }); // only days up to k are left in d
        while (left >= edDose - EPS && n++ < MAX_REPEAT) {
          day = addDays(day, edRep);
          d[key(day)] = edDose;
          left -= edDose;
        }
      }
    } else delete d[k];
    state.doses = d;
    save();
    paint(k);
    summarize();
    syncEditor();
  }

  grid.addEventListener("click", function (e) {
    var c = e.target.closest && e.target.closest("button.cal__d");
    if (c) openEditor(c.getAttribute("data-k"));
  });
  doseBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.getAttribute("data-val");
      if (v === "custom") {
        edCustom = true;
        syncEditor();
        doseIn.focus();
        return;
      }
      edCustom = false;
      edDose = parseFloat(v) || 0;
      edClear = edDose === 0;
      apply();
    });
  });
  doseIn.addEventListener("input", function () {
    var v = parseFloat(doseIn.value);
    edDose = isNaN(v) || v <= 0 ? 0 : v;
    edClear = false;
    apply();
  });
  repBtns.forEach(function (b) {
    b.addEventListener("click", function () { edRep = +b.getAttribute("data-val"); apply(); });
  });
  function closeAndRefocus() {
    var k = editing;
    closeEditor();
    var c = k && cellOf(k);
    if (c) c.focus({ preventScroll: true });
  }
  $("[data-ed-close]", ed).addEventListener("click", closeAndRefocus);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && editing) closeAndRefocus(); });

  // ---- month navigation ----
  function go(month, dir) {
    view = month;
    build(dir);
    paint();
  }
  $$("[data-cal-nav]").forEach(function (b) {
    b.addEventListener("click", function () {
      var dir = +b.getAttribute("data-cal-nav");
      go(new Date(view.getFullYear(), view.getMonth() + dir, 1), dir);
    });
  });
  $("[data-cal-today]").addEventListener("click", function () {
    var home = new Date(today.getFullYear(), today.getMonth(), 1);
    focus = todayKey;
    go(home, home > view ? 1 : home < view ? -1 : 0);
    summarize();
  });

  // ---- clear (tap twice) ----
  var armT = 0;
  function disarm() { clearTimeout(armT); clearBtn.classList.remove("is-armed"); clearBtn.textContent = "clear plan"; }
  clearBtn.addEventListener("click", function () {
    if (!clearBtn.classList.contains("is-armed")) {
      clearBtn.classList.add("is-armed");
      clearBtn.textContent = "tap again to clear";
      armT = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    closeEditor();
    state.doses = {};
    save();
    paint();
    summarize();
  });

  // ---- vial size (its own chips, and it follows the calculator's step 01 when that changes) ----
  var vialBtns = $$("[data-pl-vial] .opt"), vialIn = $("[data-pl-vial] .opt-in"), echo = $("[data-pl-echo]");
  var vialCustom = false;
  function syncVial() {
    if (!vialBtns.some(function (b) { return parseFloat(b.getAttribute("data-val")) === state.vial; })) vialCustom = true;
    vialBtns.forEach(function (b) {
      var v = b.getAttribute("data-val");
      b.classList.toggle("is-active", v === "custom" ? vialCustom : !vialCustom && parseFloat(v) === state.vial);
    });
    vialIn.hidden = !vialCustom;
    if (vialCustom && document.activeElement !== vialIn) vialIn.value = state.vial;
    echo.textContent = mg(state.vial);
  }
  function setVial(v) {
    state.vial = v;
    save();
    syncVial();
    paint();
    summarize();
    syncEditor();
  }
  vialBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.getAttribute("data-val");
      if (v === "custom") {
        vialCustom = true;
        syncVial();
        vialIn.focus();
        return;
      }
      vialCustom = false;
      setVial(parseFloat(v));
    });
  });
  vialIn.addEventListener("input", function () {
    var v = parseFloat(vialIn.value);
    if (v > 0) setVial(v);
  });

  var calcVial = calc.vial;
  document.addEventListener("hlix:calc", function (e) {
    var c = e.detail || {};
    if (c.vial > 0 && c.vial !== calcVial) {
      calcVial = c.vial;
      vialCustom = false;
      setVial(c.vial);
    } else syncEditor(); // water may have changed the editor's "draw N units"
  });

  build(0);
  syncVial();
  paint();
  summarize();
})();
