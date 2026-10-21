// hlix v2 — dose planner: a month calendar that tracks what's left in each of up to six vials
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
  var MAX_VIALS = 6;    // one per vial color, --v0 … --v5 in v2.css
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

  // ---- state: a list of vials, one of them active (the one the calendar, editor and tiles show) ----
  var state = { vials: [], active: null };

  function cleanDoses(src) {
    var d = {};
    if (src && typeof src === "object") {
      Object.keys(src).forEach(function (k) {
        var v = +src[k];
        if (/^\d{4}-\d\d-\d\d$/.test(k) && v > 0) d[k] = v;
      });
    }
    return d;
  }
  function freeColor() {
    for (var c = 0; c < MAX_VIALS; c++) if (!state.vials.some(function (v) { return v.color === c; })) return c;
    return 0;
  }
  function nextName() {
    for (var n = 1; ; n++) if (!state.vials.some(function (v) { return v.name === "vial " + n; })) return "vial " + n;
  }
  function newId() {
    var id;
    do id = Math.random().toString(36).slice(2, 8); while (find(id));
    return id;
  }
  function addVialObj(size, name, doses, color, id) {
    var v = { id: id && !find(id) ? id : newId(), name: name, size: size, color: 0, doses: doses || {} };
    v.color = color >= 0 && color < MAX_VIALS && !state.vials.some(function (x) { return x.color === color; }) ? color : freeColor();
    state.vials.push(v);
    return v;
  }
  function find(id) { for (var i = 0; i < state.vials.length; i++) if (state.vials[i].id === id) return state.vials[i]; return null; }
  function V() { return find(state.active); }
  function label(v) { return v.name.trim() || "vial " + (state.vials.indexOf(v) + 1); }

  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (saved && Array.isArray(saved.vials)) {
      saved.vials.slice(0, MAX_VIALS).forEach(function (v) {
        if (v && +v.size > 0) addVialObj(+v.size, String(v.name || "").slice(0, 28), cleanDoses(v.doses), +v.color, String(v.id || ""));
      });
      state.active = saved.active;
    } else if (saved && +saved.vial > 0) {
      addVialObj(+saved.vial, "vial 1", cleanDoses(saved.doses)); // plans saved before there were several vials
    }
  } catch (e) {}
  if (!state.vials.length) addVialObj(calc.vial > 0 ? calc.vial : 5, "vial 1");
  if (!V()) state.active = state.vials[0].id;
  function save() { try { localStorage.setItem(STORE, JSON.stringify({ v: 2, active: state.active, vials: state.vials })); } catch (e) {} }

  var view = new Date(today.getFullYear(), today.getMonth(), 1); // month on screen
  var focus = todayKey;  // the day the "left in vial" panel describes
  var editing = null;    // day open in the editor
  var snapshot = null;   // the active vial's doses when the editor opened (or switched vials); every choice re-applies over this
  var edDose = 0, edRep = 0, edCustom = false, edClear = false;

  // ---- plan math (per vial) ----
  // every dose in date order, with the running total drawn from the vial
  function ledger(v) {
    var cum = 0;
    return Object.keys(v.doses).sort().map(function (k) { cum += v.doses[k]; return { k: k, mg: v.doses[k], cum: cum }; });
  }
  function usedThrough(L, k) { var u = 0; for (var i = 0; i < L.length && L[i].k <= k; i++) u = L[i].cum; return u; }
  function usedIn(L, a, b) { var u = 0; L.forEach(function (e) { if (e.k >= a && e.k <= b) u += e.mg; }); return u; }
  function dryEntry(v, L) { for (var i = 0; i < L.length; i++) if (L[i].cum >= v.size - EPS) return L[i]; return null; }

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
        el.innerHTML = '<span class="cal__n">' + n + '</span><span class="cal__v"></span><span class="cal__dots"></span>';
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
    var v = V(), L = ledger(v), size = v.size, many = state.vials.length > 1;
    var others = state.vials.filter(function (o) { return o !== v; });
    var first = L.length ? L[0].k : "", last = L.length ? L[L.length - 1].k : "";
    var step = 0;
    slots.forEach(function (s, i) {
      if (!s.k) return;
      var k = s.k, el = s.el, dose = v.doses[k] || 0;
      var after = size - usedThrough(L, k), before = after + dose;
      var inPlan = L.length > 0 && k >= first && k <= last;
      el.style.setProperty("--lvl", inPlan ? Math.max(0, Math.min(1, after / size)).toFixed(4) : "0");
      el.style.setProperty("--i", fromKey == null ? i : k > fromKey ? ++step : 0);
      el.classList.toggle("has-dose", dose > 0);
      el.classList.toggle("is-short", dose > 0 && before < dose - EPS);
      el.classList.toggle("is-today", k === todayKey);
      el.classList.toggle("is-past", k < todayKey);
      el.classList.toggle("is-sel", k === editing);
      el.querySelector(".cal__v").innerHTML = dose > 0 ? fmt(dose, 2) + "<small>mg</small>" : "";
      // the other vials' doses that day, as dots in their colors
      var dots = "", also = [];
      others.forEach(function (o) {
        if (!o.doses[k]) return;
        dots += '<i data-c="' + o.color + '"></i>';
        also.push(label(o) + " " + mg(o.doses[k]));
      });
      el.querySelector(".cal__dots").innerHTML = dots;
      el.setAttribute("aria-label", dayLabel(parse(k)) + (many ? ", " + label(v) : "") + (dose > 0 ? ", " + mg(dose) : ", no dose") +
        (inPlan ? ", " + mg(Math.max(0, after)) + " left" : "") + (also.length ? "; also " + also.join(", ") : ""));
    });

    var y = view.getFullYear(), m = view.getMonth();
    var a = key(view), b = key(new Date(y, m + 1, 0));
    var count = L.filter(function (e) { return e.k >= a && e.k <= b; }).length;
    sumEl.textContent = (many ? label(v) + " · " : "") + (count ? MONTHS[m] + ": " + count + (count === 1 ? " dose · " : " doses · ") + mg(usedIn(L, a, b)) : "no doses in " + MONTHS[m] + " yet");
    clearBtn.hidden = !L.length;
    if (!clearBtn.classList.contains("is-armed")) clearBtn.textContent = many ? "clear " + label(v) : "clear plan";
  }

  // ---- "left in vial" panel ----
  var shown = {};
  function tile(name, sub, used, left) {
    var t = $('[data-pl-t="' + name + '"]'), el = $("[data-pl-v]", t), size = V().size;
    var short = left < -EPS, to = Math.max(0, left), from = shown[name] == null ? to : shown[name];
    shown[name] = to;
    $("[data-pl-d]", t).textContent = sub;
    t.style.setProperty("--lvl", Math.max(0, Math.min(1, left / size)).toFixed(4));
    t.classList.toggle("is-short", short);
    $("[data-pl-u]", t).textContent = short ? mg(-left) + " short" : used > EPS ? mg(used) + " used" : "nothing used";
    tween(from, to, 650, function (x) { el.textContent = fmt(x, 2); }, function () { el.textContent = fmt(to, 2); });
  }

  function summarize() {
    var v = V(), L = ledger(v), size = v.size, f = parse(focus);
    var ws = addDays(f, -f.getDay()), we = addDays(f, 6 - f.getDay());
    var ms = new Date(f.getFullYear(), f.getMonth(), 1), me = new Date(f.getFullYear(), f.getMonth() + 1, 0);
    tile("day", focus === todayKey ? "today" : mon(f) + " " + f.getDate(), usedIn(L, focus, focus), size - usedThrough(L, focus));
    tile("week", rangeLabel(ws, we), usedIn(L, key(ws), key(we)), size - usedThrough(L, key(we)));
    tile("month", MONTHS[f.getMonth()], usedIn(L, key(ms), key(me)), size - usedThrough(L, key(me)));
    $("[data-pl-size]").textContent = label(v) + " · " + mg(size);

    var total = L.length ? L[L.length - 1].cum : 0, dry = dryEntry(v, L), over = null;
    L.forEach(function (e) { if (!over && e.cum > size + EPS) over = e; });
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
        outEl.textContent = mg(size - total);
      }
      planEl.textContent = L.length + (L.length === 1 ? " dose · " : " doses · ") + mg(total);
    }
    warn.hidden = !over;
    if (over) warn.textContent = (state.vials.length > 1 ? label(v) + ": " : "") + "this plan uses " + mg(total) + ", " + mg(total - size) + " more than one " + mg(size) + " vial holds. the amber days come after it runs dry, so you'd open a second vial on " + dayLabel(parse(over.k)) + ".";
    allVials();
  }

  // every vial at a glance (only with two or more); tap a row to switch to that vial
  var allEl = $("[data-pl-all]"), allList = $("[data-pl-all-list]");
  function allVials() {
    allEl.hidden = state.vials.length < 2;
    if (allEl.hidden) return;
    var f = parse(focus);
    $("[data-pl-all-day]").textContent = "after " + (focus === todayKey ? "today" : mon(f) + " " + f.getDate());
    allList.innerHTML = "";
    state.vials.forEach(function (v) {
      var L = ledger(v), left = v.size - usedThrough(L, focus), dry = dryEntry(v, L);
      var row = document.createElement("button");
      row.type = "button";
      row.className = "pl-row" + (v.id === state.active ? " is-active" : "") + (left < -EPS ? " is-short" : "");
      row.setAttribute("data-c", v.color);
      row.setAttribute("data-vial", v.id);
      row.style.setProperty("--lvl", Math.max(0, Math.min(1, left / v.size)).toFixed(4));
      row.innerHTML = '<i class="pl-row__dot"></i><span class="pl-row__name"></span><span class="pl-row__left"></span><span class="pl-row__bar"><i></i></span><span class="pl-row__dry"></span>';
      $(".pl-row__name", row).textContent = label(v);
      $(".pl-row__left", row).textContent = left < -EPS ? mg(-left) + " short" : mg(left) + " of " + fmt(v.size, 2);
      $(".pl-row__dry", row).textContent = dry ? "dry " + mon(parse(dry.k)) + " " + parse(dry.k).getDate() : L.length ? "lasts the plan" : "no doses yet";
      allList.appendChild(row);
    });
  }
  allList.addEventListener("click", function (e) {
    var r = e.target.closest && e.target.closest("[data-vial]");
    if (r) setActive(r.getAttribute("data-vial"));
  });

  // ---- day editor (slides open under the tapped day's week) ----
  var ed = $("[data-cal-ed]");
  var edDate = $("[data-ed-date]", ed), edMeta = $("[data-ed-meta]", ed), edHint = $("[data-ed-hint]", ed);
  var edVialRow = $("[data-ed-vial-row]", ed), edVials = $("[data-ed-vials]", ed);
  var doseBtns = $$("[data-ed-dose] .opt", ed), doseIn = $("[data-ed-dose] .opt-in", ed);
  var repBtns = $$("[data-ed-rep] .opt", ed);
  var closeT = 0;

  function indexOf(k) { for (var i = 0; i < slots.length; i++) if (slots[i].k === k) return i; return -1; }
  function cellOf(k) { var i = indexOf(k); return i < 0 ? null : slots[i].el; }

  // (re)start editing day k on the active vial
  function startEdit(k) {
    var v = V();
    snapshot = clone(v.doses);
    edDose = v.doses[k] || 0;
    edRep = 0;
    edClear = false;
    edCustom = edDose > 0 && !doseBtns.some(function (b) { return parseFloat(b.getAttribute("data-val")) === edDose; });
  }

  function openEditor(k) {
    if (editing === k) { closeEditor(); return; }
    var idx = indexOf(k), row = Math.floor(idx / 7);
    var wasRow = editing && ed.parentNode === grid ? Math.floor(indexOf(editing) / 7) : -1;
    editing = k;
    focus = k;
    startEdit(k);
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
    var v = V(), d = parse(editing);
    edDate.textContent = editing === todayKey ? "today, " + mon(d) + " " + d.getDate() : dayLabel(d);
    edVialRow.hidden = state.vials.length < 2;
    if (!edVialRow.hidden) {
      edVials.innerHTML = "";
      state.vials.forEach(function (o) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "opt ed-vial" + (o === v ? " is-active" : "");
        b.setAttribute("data-c", o.color);
        b.setAttribute("data-vial", o.id);
        b.innerHTML = "<i></i><span></span>";
        $("span", b).textContent = label(o) + (o.doses[editing] ? " · " + fmt(o.doses[editing], 2) : "");
        edVials.appendChild(b);
      });
    }
    doseBtns.forEach(function (b) {
      var val = b.getAttribute("data-val");
      b.classList.toggle("is-active", val === "custom" ? edCustom : !edCustom && parseFloat(val) === edDose);
    });
    doseIn.hidden = !edCustom;
    if (edCustom && document.activeElement !== doseIn) doseIn.value = edDose > 0 ? edDose : "";
    repBtns.forEach(function (b) { b.classList.toggle("is-active", +b.getAttribute("data-val") === edRep); });

    var L = ledger(v), dose = v.doses[editing] || 0, left = v.size - usedThrough(L, editing);
    var water = +calc.water || 0;
    edMeta.classList.toggle("is-warn", dose > 0 && left < -EPS);
    if (dose > 0 && left < -EPS) edMeta.textContent = "not enough left: " + mg(-left) + " short";
    else if (dose > 0) edMeta.textContent = mg(left) + " left after this dose" + (water > 0 ? " · draw " + fmt(dose * water * 100 / v.size, 1) + " units with " + fmt(water, 2) + " ml water" : "");
    else edMeta.textContent = L.length && editing >= L[0].k ? mg(Math.max(0, left)) + " in the vial" : "no dose yet";
    edHint.hidden = !edRep;
    edHint.textContent = edDose > 0 ? "repeats from this day until the vial runs dry." : edClear ? "clears this day and every dose after it." : "pick a dose to repeat from this day.";
  }

  function apply() {
    var v = V(), k = editing, d = clone(snapshot);
    if (edRep && (edDose > 0 || edClear)) Object.keys(d).forEach(function (x) { if (x > k) delete d[x]; });
    if (edDose > 0) {
      d[k] = edDose;
      if (edRep) {
        var left = v.size, day = parse(k), n = 0;
        Object.keys(d).forEach(function (x) { left -= d[x]; }); // only days up to k are left in d
        while (left >= edDose - EPS && n++ < MAX_REPEAT) {
          day = addDays(day, edRep);
          d[key(day)] = edDose;
          left -= edDose;
        }
      }
    } else delete d[k];
    v.doses = d;
    save();
    paint(k);
    summarize();
    syncEditor();
  }

  grid.addEventListener("click", function (e) {
    var c = e.target.closest && e.target.closest("button.cal__d");
    if (c) openEditor(c.getAttribute("data-k"));
  });
  edVials.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-vial]");
    if (b) setActive(b.getAttribute("data-vial"));
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

  // ---- clear the active vial's doses (tap twice) ----
  var armT = 0;
  function disarm() { clearTimeout(armT); clearBtn.classList.remove("is-armed"); }
  clearBtn.addEventListener("click", function () {
    if (!clearBtn.classList.contains("is-armed")) {
      clearBtn.classList.add("is-armed");
      clearBtn.textContent = "tap again to clear";
      armT = setTimeout(function () { disarm(); paint(); }, 3000);
      return;
    }
    disarm();
    closeEditor();
    V().doses = {};
    save();
    paint();
    summarize();
  });

  // ---- vials: tabs to switch and add, plus the active vial's name, size and remove ----
  var tabsEl = $("[data-pl-tabs]"), nameIn = $("[data-pl-name]"), removeBtn = $("[data-pl-remove]");
  var vialBtns = $$("[data-pl-vial] .opt"), vialIn = $("[data-pl-vial] .opt-in"), echo = $("[data-pl-echo]");
  var vialCustom = false, removeT = 0;

  function renderTabs() {
    tabsEl.innerHTML = "";
    state.vials.forEach(function (v) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pl-tab" + (v.id === state.active ? " is-active" : "");
      b.setAttribute("data-c", v.color);
      b.setAttribute("data-vial", v.id);
      b.setAttribute("aria-pressed", v.id === state.active ? "true" : "false");
      b.innerHTML = "<i></i><span></span><small></small>";
      $("span", b).textContent = label(v);
      $("small", b).textContent = mg(v.size);
      tabsEl.appendChild(b);
    });
    if (state.vials.length < MAX_VIALS) {
      var add = document.createElement("button");
      add.type = "button";
      add.className = "pl-tab pl-tab--add";
      add.setAttribute("data-vial-add", "");
      add.innerHTML = "<b>+</b>add vial";
      tabsEl.appendChild(add);
    }
  }

  function syncVial() {
    var v = V();
    root.setAttribute("data-c", v.color);
    if (!vialBtns.some(function (b) { return parseFloat(b.getAttribute("data-val")) === v.size; })) vialCustom = true;
    vialBtns.forEach(function (b) {
      var val = b.getAttribute("data-val");
      b.classList.toggle("is-active", val === "custom" ? vialCustom : !vialCustom && parseFloat(val) === v.size);
    });
    vialIn.hidden = !vialCustom;
    if (vialCustom && document.activeElement !== vialIn) vialIn.value = v.size;
    if (document.activeElement !== nameIn) nameIn.value = v.name;
    echo.textContent = mg(v.size);
    removeBtn.hidden = state.vials.length < 2;
    renderTabs();
  }

  function refresh() {
    save();
    syncVial();
    paint();
    summarize();
    syncEditor();
  }

  function setActive(id) {
    if (!find(id) || id === state.active) return;
    state.active = id;
    vialCustom = false;
    shown = {}; // a different vial: tiles jump straight to its numbers instead of counting from the last one's
    if (editing) startEdit(editing);
    disarmRemove();
    refresh();
  }

  tabsEl.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-vial-add")) {
      if (state.vials.length >= MAX_VIALS) return;
      var v = addVialObj(calc.vial > 0 ? calc.vial : V().size, nextName());
      setActive(v.id);
      nameIn.focus();
      nameIn.select();
      return;
    }
    setActive(b.getAttribute("data-vial"));
  });

  nameIn.addEventListener("input", function () {
    V().name = nameIn.value.slice(0, 28);
    save();
    renderTabs();
    paint();
    summarize();
    syncEditor();
  });

  function disarmRemove() { clearTimeout(removeT); removeBtn.classList.remove("is-armed"); removeBtn.textContent = "remove vial"; }
  removeBtn.addEventListener("click", function () {
    if (state.vials.length < 2) return;
    if (!removeBtn.classList.contains("is-armed")) {
      removeBtn.classList.add("is-armed");
      removeBtn.textContent = "tap again to remove " + label(V());
      removeT = setTimeout(disarmRemove, 3000);
      return;
    }
    disarmRemove();
    var i = state.vials.indexOf(V());
    state.vials.splice(i, 1);
    state.active = state.vials[Math.min(i, state.vials.length - 1)].id;
    vialCustom = false;
    shown = {};
    if (editing) startEdit(editing);
    refresh();
  });

  function setSize(size) {
    V().size = size;
    refresh();
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
      setSize(parseFloat(v));
    });
  });
  vialIn.addEventListener("input", function () {
    var v = parseFloat(vialIn.value);
    if (v > 0) setSize(v);
  });

  // catalog names as suggestions for the vial name
  var names = $("#pl-names");
  if (names && Array.isArray(window.HLIX_SEARCH_INDEX)) {
    names.innerHTML = window.HLIX_SEARCH_INDEX.map(function (p) { return p && p.name; }).filter(Boolean).sort()
      .map(function (n) { return '<option value="' + String(n).replace(/[&"<>]/g, "") + '"></option>'; }).join("");
  }

  // with a single vial, its size follows the calculator's step 01 (with several, each keeps its own)
  var calcVial = calc.vial;
  document.addEventListener("hlix:calc", function (e) {
    var c = e.detail || {};
    if (c.vial > 0 && c.vial !== calcVial) {
      calcVial = c.vial;
      if (state.vials.length === 1) {
        vialCustom = false;
        setSize(c.vial);
        return;
      }
    }
    syncEditor(); // water may have changed the editor's "draw N units"
  });

  build(0);
  syncVial();
  paint();
  summarize();
})();
