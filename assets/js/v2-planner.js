// hlix v2 — dose planner: a month calendar (or three) that tracks what's left in each vial, any number of them
// (pure client-side; the plan is kept in this browser's localStorage, or, on planner-embed.html inside the
// admin dashboard's Calendar page, by the admin; see "embedded" at the bottom)
(function () {
  "use strict";
  var root = document.querySelector("[data-planner]");
  if (!root) return;

  var H = window.HLIX2 || {};
  var tween = H.tween || function (a, b, d, u, done) { u(b); if (done) done(); };
  var calc = H.calc || {};
  var embed = root.hasAttribute("data-embed");
  // the admin's Calendar, when it's wide, runs two copies of planner-embed.html side by side: the calendar
  // ("calendar": everything but the "left in vial" panel) and the panel on its own ("panel", the page's #panel),
  // which the admin page keeps in sight as you scroll. the admin passes the plan, the day in focus and the vial
  // picked in the panel between them; only the calendar saves. narrow, it runs one copy with both ("all")
  var part = embed && location.hash === "#panel" ? "panel" : "all";
  root.setAttribute("data-part", part);
  var STORE = "hlix-plan";
  var EPS = 1e-9;
  var MAX_REPEAT = 2000; // safety cap on how many doses the repeats can lay down (a 1000 mg vial at 0.5 mg a day)
  var PRESETS = 6;      // preset colors, --v0 … --v5 in v2.css; vials past six get a color of their own
  var MAX_DOTS = 3;     // other vials' dots a day shows before "+n"
  var MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  var DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  var EVERY = { 1: "daily", 2: "every-other-day", 7: "weekly" };

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
  function dayDiff(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function mon(d) { return MONTHS[d.getMonth()].slice(0, 3); }
  function dayLabel(d) { return DOW[d.getDay()] + ", " + mon(d) + " " + d.getDate(); }
  function rangeLabel(a, b) { return mon(a) + " " + a.getDate() + "–" + (a.getMonth() === b.getMonth() ? "" : mon(b) + " ") + b.getDate(); }
  var KEY_RE = /^\d{4}-\d\d-\d\d$/;
  // a date from a date field: only this century (typing a year passes through 0002, 0020, 0202 on the way to 2026)
  function okDate(k) { return typeof k === "string" && KEY_RE.test(k) && k >= "2000-01-01" && k <= "2099-12-31"; }
  function md(k) { var d = parse(k); return mon(d) + " " + d.getDate(); }
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var todayKey = key(today);

  // ---- colors: a preset index (0–5, themed in v2.css) or a custom "#rrggbb" ----
  function isHex(c) { return typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c); }
  function ink(hex) { // readable text on a solid custom color
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#04120d" : "#ffffff";
  }
  function tint(el, v) {
    if (isHex(v.color)) {
      el.removeAttribute("data-c");
      el.style.setProperty("--vc", v.color);
      el.style.setProperty("--vink", ink(v.color));
    } else {
      el.setAttribute("data-c", v.color);
      el.style.removeProperty("--vc");
      el.style.removeProperty("--vink");
    }
  }
  function tintAttr(v) { return isHex(v.color) ? 'style="--vc:' + v.color + '"' : 'data-c="' + v.color + '"'; }
  function hueHex(h) { // a hue (0–360) at a fixed saturation and lightness, as "#rrggbb"
    var s = 0.62, l = 0.5, a = s * Math.min(l, 1 - l);
    function f(n) {
      var k = (n + h / 30) % 12, c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return ("0" + Math.round(c * 255).toString(16)).slice(-2);
    }
    return "#" + f(0) + f(8) + f(4);
  }

  // ---- state: a list of vials, one of them active (the one the calendar, editor and tiles show) ----
  // a vial's doses are the days set by hand (0 = "none" on a day a repeat would fill); its rules are repeats, each
  // going every `every` days after `from` (until the day before `until`, if it has one), all drawing on the vial
  // until it runs dry, so they stretch or shrink whenever the vial size or an earlier dose changes. two weekly
  // repeats a few days apart are a dose split over the week (mon + thu). look (light / dark sheet) and months (1, or 3 with the
  // months before and after) are how it's shown, saved with the plan
  var state = { vials: [], active: null, look: "light", months: 1 };

  function cleanDoses(src) {
    var d = {};
    if (src && typeof src === "object") {
      Object.keys(src).forEach(function (k) {
        var v = +src[k];
        if (KEY_RE.test(k) && v >= 0 && isFinite(v)) d[k] = v;
      });
    }
    return d;
  }
  function cleanRule(r) {
    if (!r || !KEY_RE.test(r.from) || !(+r.dose > 0) || !(+r.every >= 1 && +r.every <= 60)) return null;
    var c = { from: r.from, dose: +r.dose, every: Math.round(+r.every) };
    if (typeof r.until === "string" && KEY_RE.test(r.until)) {
      if (r.until <= r.from) return null; // ended before it began
      c.until = r.until;
    }
    return c;
  }
  // a vial's repeats: `rules` (a list), or the single `rule` plans had before there could be several
  function cleanRules(v) {
    var src = Array.isArray(v.rules) ? v.rules : v.rule ? [v.rule] : [];
    return src.map(cleanRule).filter(Boolean).slice(0, 20);
  }
  function presetUsed(c, except) { return state.vials.some(function (v) { return v !== except && v.color === c; }); }
  var EXTRA = ["#e8833a", "#e5484d", "#c99a06", "#0f9fb5", "#5b5bd6", "#a8743f"]; // after the presets: orange, red, amber, teal, indigo, brown
  function freeColor() {
    for (var c = 0; c < PRESETS; c++) if (!presetUsed(c)) return c;
    for (var i = 0; i < EXTRA.length; i++) if (!presetUsed(EXTRA[i])) return EXTRA[i];
    return hueHex(state.vials.length * 137.508 % 360); // all of those taken: spread around the wheel so neighbours differ
  }
  function nextName() {
    for (var n = 1; ; n++) if (!state.vials.some(function (v) { return v.name === "vial " + n; })) return "vial " + n;
  }
  function newId() {
    var id;
    do id = Math.random().toString(36).slice(2, 8); while (find(id));
    return id;
  }
  // a vial's color can be one another vial wears too (a new bottle of the same thing, say); a new vial without one
  // gets one nobody's using. `end`, if any, is the last day it's used: nothing after it, whatever's left
  function addVialObj(o) {
    var v = { id: o.id && !find(o.id) ? o.id : newId(), name: o.name || "", size: o.size, color: 0, doses: o.doses || {}, rules: o.rules || [] };
    if (okDate(o.end)) v.end = o.end;
    var c = o.color;
    v.color = isHex(c) ? c.toLowerCase() : c >= 0 && c < PRESETS && c === Math.floor(c) ? c : freeColor();
    state.vials.push(v);
    return v;
  }
  function find(id) { for (var i = 0; i < state.vials.length; i++) if (state.vials[i].id === id) return state.vials[i]; return null; }
  function V() { return find(state.active); }
  function label(v) { return v.name.trim() || "vial " + (state.vials.indexOf(v) + 1); }

  // plans saved before repeats were kept as rules held every repeated dose as its own day; turn a trailing run of
  // equal doses a repeat option apart (daily / every other day / weekly) back into a repeat, so it stretches too.
  // a run of two only counts if it left too little for a third, i.e. it was a repeat that ran the vial dry
  function inferRule(v) {
    var keys = Object.keys(v.doses).filter(function (k) { return v.doses[k] > 0; }).sort(), n = keys.length;
    if (n < 2) return;
    var dose = v.doses[keys[n - 1]], every = dayDiff(keys[n - 2], keys[n - 1]), s = n - 1;
    if (!EVERY[every]) return;
    while (s > 0 && Math.abs(v.doses[keys[s - 1]] - dose) < EPS && dayDiff(keys[s - 1], keys[s]) === every) s--;
    var left = v.size - keys.reduce(function (t, k) { return t + v.doses[k]; }, 0);
    if (n - s < 2 || (n - s < 3 && left >= dose - EPS)) return;
    for (var i = s + 1; i < n; i++) delete v.doses[keys[i]];
    v.rules = [{ from: keys[s], dose: dose, every: every }];
  }

  // a saved plan (any format this planner ever wrote) -> state
  function load(saved) {
    state.vials = [];
    state.active = null;
    state.look = saved && saved.look === "dark" ? "dark" : "light";
    state.months = saved && +saved.months === 3 ? 3 : 1;
    try {
      if (saved && Array.isArray(saved.vials)) {
        saved.vials.forEach(function (v) {
          if (!v || !(+v.size > 0)) return;
          var nv = addVialObj({ id: String(v.id || ""), name: String(v.name || "").slice(0, 28), size: +v.size, color: v.color, doses: cleanDoses(v.doses), rules: cleanRules(v), end: v.end });
          if (!(saved.v >= 3) && !nv.rules.length) inferRule(nv);
        });
        state.active = saved.active;
      } else if (saved && +saved.vial > 0) { // the very first format: one vial, { vial, doses }
        inferRule(addVialObj({ name: "vial 1", size: +saved.vial, doses: cleanDoses(saved.doses) }));
      }
    } catch (e) {}
    if (!state.vials.length) addVialObj({ name: "vial 1", size: calc.vial > 0 ? calc.vial : 5 });
    if (!V()) state.active = state.vials[0].id;
  }
  function save() {
    var plan = { v: 3, active: state.active, look: state.look, months: state.months, vials: state.vials };
    if (embed) { if (part !== "panel") tell("save", { plan: plan }); return; }
    try { localStorage.setItem(STORE, JSON.stringify(plan)); } catch (e) {}
  }
  if (!embed) {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) {}
    load(saved);
  }

  var view = new Date(today.getFullYear(), today.getMonth(), 1); // month on screen
  var focus = todayKey;  // the day the "left in vial" panel describes
  var editing = null;    // day open in the editor
  var snapshot = null;   // the active vial's doses + rules when the editor opened (or switched vials); every choice re-applies over this
  var edDose = 0, edRep = 0, edCustom = false, edClear = false;
  var edStop = false; // "stop here": no more doses from this day on, the rest of the vial thrown away

  // ---- plan math (per vial) ----
  // every day that actually has a dose: the hand-set ones plus the repeats, walked together in date order
  // until the vial can't cover the next one (two repeats on the same day add up)
  function schedule(v) {
    var out = {}, end = v.end || null;
    Object.keys(v.doses).forEach(function (k) { if (v.doses[k] > 0 && (!end || k <= end)) out[k] = v.doses[k]; });
    var rs = v.rules || [];
    if (!rs.length) return out;
    var next = rs.map(function (r) { return addDays(parse(r.from), r.every); });
    var hand = Object.keys(out).sort(), i = 0, used = 0;
    for (var n = 0; n < MAX_REPEAT; n++) {
      var ks = next.map(function (d, j) { var x = key(d); return rs[j].until && x >= rs[j].until ? null : x; });
      var k = null, dose = 0;
      ks.forEach(function (x) { if (x !== null && (k === null || x < k)) k = x; });
      if (k === null) break; // every repeat has ended
      ks.forEach(function (x, j) { if (x === k) { dose += rs[j].dose; next[j] = addDays(next[j], rs[j].every); } });
      while (i < hand.length && hand[i] < k) used += out[hand[i++]];
      if (end && k > end) break; // its end date: the repeats stop there
      if (k in v.doses) continue; // set by hand on this day (a different amount, or none)
      if (v.size - used < dose - EPS) break; // dry: the repeats end here
      out[k] = dose;
      used += dose;
    }
    return out;
  }
  // a day the repeat fills (after its first day, which is set by hand), and any of its days at all
  function onRule(r, k) { return !!r && k > r.from && (!r.until || k < r.until) && dayDiff(r.from, k) % r.every === 0; }
  function isDay(r, k) { return k === r.from || onRule(r, k); }
  // started before k and not ended by then: still going on k, whether or not k is one of its days
  function running(r, k) { return r.from < k && (!r.until || r.until > k); }
  function about(r) { // "the weekly 2 mg repeat from mon, nov 2"
    var f = parse(r.from);
    return "the " + (EVERY[r.every] || "every " + r.every + " days") + " " + mg(r.dose) + " repeat from " + DOW[f.getDay()] + ", " + mon(f) + " " + f.getDate();
  }
  function abouts(rs) { return rs.map(about).join(" and "); }
  // every dose in date order, with the running total drawn from the vial
  function ledger(v) {
    var s = schedule(v), cum = 0;
    return Object.keys(s).sort().map(function (k) { cum += s[k]; return { k: k, mg: s[k], cum: cum }; });
  }
  function usedThrough(L, k) { var u = 0; for (var i = 0; i < L.length && L[i].k <= k; i++) u = L[i].cum; return u; }
  function usedIn(L, a, b) { var u = 0; L.forEach(function (e) { if (e.k >= a && e.k <= b) u += e.mg; }); return u; }
  function dryEntry(v, L) { for (var i = 0; i < L.length; i++) if (L[i].cum >= v.size - EPS) return L[i]; return null; }
  function lastKey(sched) { var ks = Object.keys(sched).sort(); return ks.length ? ks[ks.length - 1] : null; }
  // its last dose day without its end date: where it'd run dry (the end date field's "auto")
  function runsTo(v) { return lastKey(schedule({ size: v.size, doses: v.doses, rules: v.rules })); }
  // its first dose day (set by hand, a repeat's first day included); null with none
  function firstDay(v) {
    var a = null;
    Object.keys(v.doses).forEach(function (k) { if (v.doses[k] > 0 && (!a || k < a)) a = k; });
    (v.rules || []).forEach(function (r) { if (!a || r.from < a) a = r.from; });
    return a;
  }
  // the whole vial n days later (or earlier): its doses, repeats and end date
  function shiftVial(v, n) {
    function by(k) { return key(addDays(parse(k), n)); }
    var d = {};
    Object.keys(v.doses).forEach(function (k) { d[by(k)] = v.doses[k]; });
    v.doses = d;
    v.rules.forEach(function (r) { r.from = by(r.from); if (r.until) r.until = by(r.until); });
    if (v.end) v.end = by(v.end);
  }
  // the repeats it's taken on: the ones still going, or, when every one was stopped, the ones stopped last
  function regimen(v) {
    var rs = v.rules || [], live = rs.filter(function (r) { return !r.until; });
    if (live.length || !rs.length) return live;
    var stop = rs.reduce(function (m, r) { return r.until > m ? r.until : m; }, "");
    return rs.filter(function (r) { return r.until === stop; });
  }
  function everyText(n) { return n === 1 ? "daily" : n === 2 ? "every other day" : n === 7 ? "weekly" : "every " + n + " days"; }
  function regimenText(rs) {
    return rs.map(function (r) { return mg(r.dose) + " " + everyText(r.every) + (r.every === 7 && rs.length > 1 ? " (" + DOW[parse(r.from).getDay()] + ")" : ""); }).join(" + ");
  }
  // repeat r's first day after `after` (its own days only: every `every` days from its first)
  function nextOn(r, after) {
    var n = dayDiff(r.from, after), e = r.every;
    if (n < 0) return r.from;
    return key(addDays(parse(r.from), (Math.floor(n / e) + 1) * e));
  }

  // ---- calendar: one month, or three (the month before and the one after around it), each its own grid ----
  var cal = $("[data-cal]");
  var monthsEl = $("[data-cal-months]");
  var titleEl = $("[data-cal-title]");
  var sumEl = $("[data-cal-sum]");
  var clearBtn = $("[data-cal-clear]");
  var slots = [];  // one per day square: { el, k, grid, at } (at: its place in its month's grid; k is null for the blanks)
  var onScreen = []; // per month shown: { a, b, m, sum } its first and last day keys, month index, summary element (three only)

  function monthAt(n) { return new Date(view.getFullYear(), view.getMonth() + n, 1); }
  function build(dir) {
    detachEditor();
    monthsEl.innerHTML = "";
    slots = [];
    onScreen = [];
    var three = state.months === 3;
    for (var off = three ? -1 : 0; off <= (three ? 1 : 0); off++) {
      var md = monthAt(off), y = md.getFullYear(), m = md.getMonth();
      var lead = md.getDay(), days = new Date(y, m + 1, 0).getDate();
      var total = Math.ceil((lead + days) / 7) * 7;
      var sec = document.createElement("div"), g = document.createElement("div"), sum = null;
      sec.className = "cal__mon" + (off === 0 ? " is-center" : "");
      if (three) {
        sec.innerHTML = '<div class="cal__mon-head"><h4 class="cal__mon-t">' + MONTHS[m] + " <span>" + y + '</span></h4><span class="cal__mon-sum"></span></div>';
        sum = $(".cal__mon-sum", sec);
      }
      sec.insertAdjacentHTML("beforeend", '<div class="cal__dow" aria-hidden="true">' + DOW.map(function (d) { return "<span>" + d + "</span>"; }).join("") + "</div>");
      g.className = "cal__grid";
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
        g.appendChild(el);
        slots.push({ el: el, k: k, grid: g, at: i });
      }
      sec.appendChild(g);
      monthsEl.appendChild(sec);
      onScreen.push({ a: key(md), b: key(new Date(y, m + 1, 0)), m: m, sum: sum });
    }
    var f = monthAt(three ? -1 : 0), l = monthAt(three ? 1 : 0), fy = f.getFullYear(), ly = l.getFullYear();
    titleEl.innerHTML = three
      ? mon(f) + " – " + mon(l) + " <span>" + (fy === ly ? ly : fy + "–" + String(ly).slice(2)) + "</span>"
      : MONTHS[f.getMonth()] + " <span>" + fy + "</span>";
    if (dir) {
      monthsEl.style.setProperty("--dir", dir);
      monthsEl.classList.remove("is-in");
      void monthsEl.offsetWidth; // restart the slide-in, and let the liquid rise in from empty
      monthsEl.classList.add("is-in");
    }
  }

  // fromKey: the day just edited, so the change ripples forward from it instead of from the 1st
  function paint(fromKey) {
    var v = V(), L = ledger(v), sched = schedule(v), size = v.size, many = state.vials.length > 1;
    var others = state.vials.filter(function (o) { return o !== v; }).map(function (o) { return { o: o, s: schedule(o) }; });
    var first = L.length ? L[0].k : "", last = L.length ? L[L.length - 1].k : "";
    var step = 0;
    slots.forEach(function (s) {
      if (!s.k) return;
      var k = s.k, el = s.el, dose = sched[k] || 0;
      var after = size - usedThrough(L, k), before = after + dose;
      var inPlan = L.length > 0 && k >= first && k <= last;
      el.style.setProperty("--lvl", inPlan ? Math.max(0, Math.min(1, after / size)).toFixed(4) : "0");
      el.style.setProperty("--i", fromKey == null ? s.at : k > fromKey ? Math.min(++step, 42) : 0);
      el.classList.toggle("has-dose", dose > 0);
      el.classList.toggle("is-short", dose > 0 && before < dose - EPS);
      el.classList.toggle("is-today", k === todayKey);
      el.classList.toggle("is-past", k < todayKey);
      el.classList.toggle("is-sel", k === editing);
      el.classList.toggle("is-end", !!v.end && k === v.end);
      el.querySelector(".cal__v").innerHTML = dose > 0 ? fmt(dose, 2) + "<small>mg</small>" : "";
      // the other vials' doses that day, as dots in their colors (a few, then "+n")
      var dots = "", also = [];
      others.forEach(function (x) {
        if (!x.s[k]) return;
        if (also.length < MAX_DOTS) dots += "<i " + tintAttr(x.o) + "></i>";
        also.push(label(x.o) + " " + mg(x.s[k]));
      });
      if (also.length > MAX_DOTS) dots += "<b>+" + (also.length - MAX_DOTS) + "</b>";
      el.querySelector(".cal__dots").innerHTML = dots;
      el.setAttribute("aria-label", dayLabel(parse(k)) + (many ? ", " + label(v) : "") + (dose > 0 ? ", " + mg(dose) : ", no dose") +
        (inPlan ? ", " + mg(Math.max(0, after)) + " left" : "") + (also.length ? "; also " + also.join(", ") : ""));
    });

    function doses(a, b) {
      var count = L.filter(function (e) { return e.k >= a && e.k <= b; }).length;
      return count ? count + (count === 1 ? " dose · " : " doses · ") + mg(usedIn(L, a, b)) : "";
    }
    var s0 = onScreen[0], s1 = onScreen[onScreen.length - 1];
    var name = onScreen.length > 1 ? MONTHS[s0.m].slice(0, 3) + " – " + MONTHS[s1.m].slice(0, 3) : MONTHS[s0.m];
    var all = doses(s0.a, s1.b);
    sumEl.textContent = (many ? label(v) + " · " : "") + (all ? name + ": " + all : "no doses in " + name + " yet");
    onScreen.forEach(function (s) { if (s.sum) s.sum.textContent = doses(s.a, s.b) || "no doses"; });
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

  var toldFocus = null;
  function summarize() {
    if (embed && part === "calendar" && focus !== toldFocus) { toldFocus = focus; tell("focus", { k: focus }); }
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
    var ends = !dry && L.length && v.end;
    outK.textContent = ends ? "ends" : dry || !L.length ? "runs dry" : "spare after plan";
    if (!L.length) {
      outEl.textContent = "—";
      planEl.textContent = "tap a day to add one";
    } else {
      if (dry) {
        var days = Math.round((parse(dry.k) - today) / 864e5);
        outEl.textContent = dayLabel(parse(dry.k)) + (days === 0 ? " · today" : days === 1 ? " · tomorrow" : days > 1 ? " · in " + days + " days" : "");
      } else if (ends) {
        outEl.textContent = dayLabel(parse(v.end)) + " · " + mg(size - total) + " left over";
      } else {
        outEl.textContent = mg(size - total);
      }
      planEl.textContent = L.length + (L.length === 1 ? " dose · " : " doses · ") + mg(total);
    }
    warn.hidden = !over;
    if (over) warn.textContent = (state.vials.length > 1 ? label(v) + ": " : "") + "this plan uses " + mg(total) + ", " + mg(total - size) + " more than one " + mg(size) + " vial holds. the amber days come after it runs dry, so you'd open a second vial on " + dayLabel(parse(over.k)) + ".";
    allVials();
    syncDates();
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
      tint(row, v);
      row.setAttribute("data-vial", v.id);
      row.style.setProperty("--lvl", Math.max(0, Math.min(1, left / v.size)).toFixed(4));
      row.innerHTML = '<i class="pl-row__dot"></i><span class="pl-row__name"></span><span class="pl-row__left"></span><span class="pl-row__bar"><i></i></span><span class="pl-row__dry"></span>';
      $(".pl-row__name", row).textContent = label(v);
      $(".pl-row__left", row).textContent = left < -EPS ? mg(-left) + " short" : mg(left) + " of " + fmt(v.size, 2);
      $(".pl-row__dry", row).textContent = dry ? "dry " + md(dry.k) : v.end && L.length ? "ends " + md(v.end) : L.length ? "lasts the plan" : "no doses yet";
      allList.appendChild(row);
    });
  }
  allList.addEventListener("click", function (e) {
    var r = e.target.closest && e.target.closest("[data-vial]");
    if (!r) return;
    setActive(r.getAttribute("data-vial"));
    if (embed && part === "panel") tell("active", { id: r.getAttribute("data-vial") });
  });

  // ---- day editor (slides open under the tapped day's week) ----
  var ed = $("[data-cal-ed]");
  var edDate = $("[data-ed-date]", ed), edMeta = $("[data-ed-meta]", ed), edHint = $("[data-ed-hint]", ed);
  var edVialRow = $("[data-ed-vial-row]", ed), edVials = $("[data-ed-vials]", ed);
  var doseBtns = $$("[data-ed-dose] .opt[data-val]", ed), doseIn = $("[data-ed-dose] .opt-in", ed), stopBtn = $("[data-ed-stop]", ed);
  var repBtns = $$("[data-ed-rep] .opt", ed);
  var closeT = 0;

  function slotOf(k) { for (var i = 0; i < slots.length; i++) if (slots[i].k === k) return slots[i]; return null; }
  function cellOf(k) { var s = slotOf(k); return s && s.el; }

  // (re)start editing day k on the active vial
  function startEdit(k) {
    var v = V();
    snapshot = { doses: clone(v.doses), rules: v.rules.map(clone), end: v.end || null };
    edDose = schedule(v)[k] || 0;
    edRep = 0;
    edClear = false;
    edStop = false;
    edCustom = edDose > 0 && !doseBtns.some(function (b) { return parseFloat(b.getAttribute("data-val")) === edDose; });
  }

  function openEditor(k) {
    if (editing === k) { closeEditor(); return; }
    var s = slotOf(k), row = Math.floor(s.at / 7);
    var was = editing && ed.parentNode === s.grid ? slotOf(editing) : null; // same month: it only moves if the week changes
    var wasRow = was ? Math.floor(was.at / 7) : -1;
    editing = k;
    focus = k;
    startEdit(k);
    clearTimeout(closeT);
    ed.style.setProperty("--col", s.at % 7);
    if (row !== wasRow) {
      ed.classList.remove("is-open");
      ed.hidden = false;
      s.grid.insertBefore(ed, slots[slots.indexOf(s) - s.at + row * 7 + 6].el.nextSibling); // after the week's saturday
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
    var v = V(), d = parse(editing), sched = schedule(v);
    edDate.textContent = editing === todayKey ? "today, " + mon(d) + " " + d.getDate() : dayLabel(d);
    edVialRow.hidden = state.vials.length < 2;
    if (!edVialRow.hidden) {
      edVials.innerHTML = "";
      state.vials.forEach(function (o) {
        var b = document.createElement("button"), od = o === v ? sched[editing] : schedule(o)[editing];
        b.type = "button";
        b.className = "opt ed-vial" + (o === v ? " is-active" : "");
        tint(b, o);
        b.setAttribute("data-vial", o.id);
        b.innerHTML = "<i></i><span></span>";
        $("span", b).textContent = label(o) + (od ? " · " + fmt(od, 2) : "");
        edVials.appendChild(b);
      });
    }
    doseBtns.forEach(function (b) {
      var val = b.getAttribute("data-val");
      b.classList.toggle("is-active", !edStop && (val === "custom" ? edCustom : !edCustom && parseFloat(val) === edDose));
    });
    doseIn.hidden = !edCustom;
    if (edCustom && document.activeElement !== doseIn) doseIn.value = edDose > 0 ? edDose : "";
    repBtns.forEach(function (b) { b.classList.toggle("is-active", !edStop && +b.getAttribute("data-val") === edRep); });
    // "stop here" only where there's something to stop: a dose on this day or after it, as the day was opened
    var later = Object.keys(schedule({ size: v.size, doses: snapshot.doses, rules: snapshot.rules, end: snapshot.end })).some(function (x) { return x >= editing; });
    stopBtn.hidden = !later && !edStop;
    stopBtn.classList.toggle("is-active", edStop);

    var L = ledger(v), dose = sched[editing] || 0, left = v.size - usedThrough(L, editing);
    var water = +calc.water || 0;
    edMeta.classList.toggle("is-warn", dose > 0 && left < -EPS);
    if (dose > 0 && left < -EPS) edMeta.textContent = "not enough left: " + mg(-left) + " short";
    else if (dose > 0) edMeta.textContent = mg(left) + " left after this dose" + (water > 0 ? " · draw " + fmt(dose * water * 100 / v.size, 1) + " units with " + fmt(water, 2) + " ml water" : "");
    else edMeta.textContent = L.length && editing >= L[0].k ? mg(Math.max(0, left)) + " in the vial" : "no dose yet";
    // what a repeat picked here would do, against the repeats as they were when this day was opened
    var here = snapshot.rules.filter(function (r) { return isDay(r, editing); });
    var along = snapshot.rules.filter(function (r) { return here.indexOf(r) < 0 && running(r, editing); });
    var goes = along.length ? " " + abouts(along) + " keeps going." : "";
    edHint.hidden = !edRep && !here.length && !edStop;
    var spare = v.size - L.reduce(function (t, e) { return t + e.mg; }, 0);
    var past = !edStop && !edRep && !!snapshot.end && editing > snapshot.end;
    var till = snapshot.end && editing <= snapshot.end ? "up to its end date, " + md(snapshot.end) : "until the vial runs dry";
    if (past) edHint.hidden = false;
    edHint.textContent = edStop ? "no more doses from this day on: the vial ends the day before, and the " + (spare > EPS ? mg(spare) + " left in it is thrown away." : "rest is thrown away.")
      : past ? "after this vial's end date (" + md(snapshot.end) + "). a dose here clears it, and the vial runs on."
      : !edRep ? (here.length ? "part of " + abouts(here) + ". changes here only touch this day." : "")
      : !(edDose > 0) && !edClear ? "pick a dose to repeat from this day."
      : here.length && along.length ? (edClear ? "stops " + abouts(here) + " from this day on." : "repeats from this day in place of " + abouts(here) + ", " + till + ".") + goes
      : edClear ? "clears this day and every dose after it."
      : along.length ? "adds a repeat from this day, alongside " + abouts(along) + ". they share the vial " + till.replace("the vial", "it") + "."
      : "repeats from this day " + till + ".";
  }

  // every choice re-applies over the snapshot, so trying options in a row never stacks them up
  function apply() {
    var v = V(), k = editing, d = clone(snapshot.doses), rules = snapshot.rules.map(clone);
    var here = rules.filter(function (r) { return isDay(r, k); });
    var along = rules.filter(function (r) { return here.indexOf(r) < 0 && running(r, k); });
    function end(r) { if (!r.until || r.until > k) r.until = k; }
    var last = snapshot.end;
    if (edStop) {
      // the vial ends the day before: its end date (doses after it stay in the plan, unused; clear the end to bring them back)
      last = key(addDays(parse(k), -1));
    } else if (edRep && (edDose > 0 || edClear)) {
      if (here.length && along.length) {
        // a dose split over the week, and this day is one of its repeats: only that one changes from here on
        here.forEach(end);
        Object.keys(d).forEach(function (x) {
          if (x > k && here.some(function (r) { return isDay(r, x); }) && !along.some(function (r) { return isDay(r, x); })) delete d[x];
        });
        delete d[k];
      } else if (!here.length && along.length && edDose > 0) {
        // a day off the other repeats' days: one more repeat beside them (mon, then thu: a split dose)
      } else {
        // restart from this day: keep what the plan had before it and drop everything after
        rules.forEach(end);
        Object.keys(d).forEach(function (x) { if (x >= k) delete d[x]; });
      }
      rules = rules.filter(function (r) { return !r.until || r.until > r.from; });
      if (edDose > 0) {
        d[k] = edDose;
        rules.push({ from: k, dose: edDose, every: edRep });
      }
    } else if (edDose > 0) {
      d[k] = edDose;
    } else if (rules.some(function (r) { return onRule(r, k); })) {
      d[k] = 0; // "none" on a day a repeat would fill: skip just that one
    } else {
      delete d[k];
    }
    if (!edStop && edDose > 0 && last && k > last) last = null; // a dose after its end: it runs on
    v.doses = d;
    v.rules = rules;
    if (last) v.end = last; else delete v.end;
    save();
    paint(k);
    summarize();
    syncEditor();
  }

  monthsEl.addEventListener("click", function (e) {
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
      edStop = false;
      edDose = parseFloat(v) || 0;
      edClear = edDose === 0;
      apply();
    });
  });
  doseIn.addEventListener("input", function () {
    var v = parseFloat(doseIn.value);
    edDose = isNaN(v) || v <= 0 ? 0 : v;
    edClear = false;
    edStop = false;
    apply();
  });
  repBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      if (edStop) { edStop = false; edClear = true; } // "stop here", then a repeat: the same as none with a repeat
      edRep = +b.getAttribute("data-val");
      apply();
    });
  });
  stopBtn.addEventListener("click", function () {
    edStop = true;
    edCustom = false;
    edDose = 0;
    edRep = 0;
    edClear = false;
    apply();
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

  // ---- how it's shown, saved with the plan: one month or three, and a light or dark sheet ----
  var spanBtns = $$("[data-cal-span]"), lookBtn = $("[data-cal-look]");
  function syncLook() {
    root.classList.toggle("is-dark", state.look === "dark");
    $("span", lookBtn).textContent = state.look === "dark" ? "light" : "dark"; // what a tap switches to
    spanBtns.forEach(function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-cal-span") === state.months ? "true" : "false"); });
  }
  lookBtn.addEventListener("click", function () {
    state.look = state.look === "dark" ? "light" : "dark";
    syncLook();
    save();
  });
  spanBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var n = +b.getAttribute("data-cal-span");
      if (n === state.months) return;
      state.months = n;
      syncLook();
      save();
      build(0);
      paint();
    });
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
    V().rules = [];
    delete V().end;
    save();
    paint();
    summarize();
  });

  // ---- vials: tabs to switch and add, plus the active vial's name, color, size and remove ----
  var tabsEl = $("[data-pl-tabs]"), nameIn = $("[data-pl-name]"), removeBtn = $("[data-pl-remove]");
  var vialBtns = $$("[data-pl-vial] .opt"), vialIn = $("[data-pl-vial] .opt-in"), echo = $("[data-pl-echo]");
  var swatches = $$("[data-pl-colors] [data-color]"), customSw = $(".pl-sw--custom"), customIn = $("[data-pl-custom]");
  var cPick = $("[data-pl-cpick]"), hexIn = $("[data-pl-hex]");
  var vialCustom = false, removeT = 0;

  function renderTabs() {
    tabsEl.innerHTML = "";
    state.vials.forEach(function (v) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pl-tab" + (v.id === state.active ? " is-active" : "");
      tint(b, v);
      b.setAttribute("data-vial", v.id);
      b.setAttribute("aria-pressed", v.id === state.active ? "true" : "false");
      if (state.vials.length > 1) b.title = "drag to move (or alt + arrow keys)";
      b.innerHTML = "<i></i><span></span><small></small>";
      $("span", b).textContent = label(v);
      $("small", b).textContent = mg(v.size);
      tabsEl.appendChild(b);
    });
    var add = document.createElement("button");
    add.type = "button";
    add.className = "pl-tab pl-tab--add";
    add.setAttribute("data-vial-add", "");
    add.setAttribute("aria-expanded", nw.hidden ? "false" : "true");
    add.innerHTML = "<b>+</b>add vial";
    tabsEl.appendChild(add);
  }

  function syncVial() {
    var v = V();
    tint(root, v);
    if (!vialBtns.some(function (b) { return parseFloat(b.getAttribute("data-val")) === v.size; })) vialCustom = true;
    vialBtns.forEach(function (b) {
      var val = b.getAttribute("data-val");
      b.classList.toggle("is-active", val === "custom" ? vialCustom : !vialCustom && parseFloat(val) === v.size);
    });
    vialIn.hidden = !vialCustom;
    if (vialCustom && document.activeElement !== vialIn) vialIn.value = v.size;
    if (document.activeElement !== nameIn) nameIn.value = v.name;
    swatches.forEach(function (s) { s.classList.toggle("is-active", +s.getAttribute("data-color") === v.color); });
    customSw.classList.toggle("is-active", isHex(v.color));
    if (isHex(v.color)) customSw.style.setProperty("--vc", v.color);
    else customSw.style.removeProperty("--vc");
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
    closePick();
    shown = {}; // a different vial: tiles jump straight to its numbers instead of counting from the last one's
    if (editing) startEdit(editing);
    disarmRemove();
    refresh();
    if (!nw.hidden) openNew(); // the new-vial form follows the vial picked
  }

  tabsEl.addEventListener("click", function (e) {
    if (swallow) { swallow = false; return; } // the click a drag ends with
    var b = e.target.closest && e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-vial-add")) {
      if (nw.hidden) openNew(); else closeNew();
      return;
    }
    setActive(b.getAttribute("data-vial"));
  });

  // ---- reorder: drag a tab where you want it (a line shows where it lands), or alt + arrow keys on it. on a touch
  // screen, press and hold a tab a moment first (a plain swipe over the tabs still scrolls the page) ----
  var drag = null, swallow = false, HOLD = 300;
  function clearMark() { $$(".is-drop-before, .is-drop-after", tabsEl).forEach(function (t) { t.classList.remove("is-drop-before", "is-drop-after"); }); }
  function endDrag() {
    if (!drag) return;
    clearTimeout(drag.holdT);
    drag.b.classList.remove("is-dragging", "is-held");
    drag.b.style.removeProperty("transform");
    tabsEl.classList.remove("is-sorting");
    clearMark();
    drag = null;
  }
  function moveVial(id, toIndex) {
    var v = find(id), from = state.vials.indexOf(v);
    if (!v || toIndex === from) return false;
    state.vials.splice(from, 1);
    state.vials.splice(toIndex, 0, v);
    save();
    renderTabs();
    paint();
    summarize();
    syncEditor();
    return true;
  }
  tabsEl.addEventListener("pointerdown", function (e) {
    swallow = false;
    var b = e.target.closest && e.target.closest("[data-vial]");
    if (!b || e.button > 0 || state.vials.length < 2) return;
    drag = { b: b, id: b.getAttribute("data-vial"), x: e.clientX, y: e.clientY, on: false, pid: e.pointerId, to: null, after: false, touch: e.pointerType === "touch", held: false, holdT: 0 };
    if (drag.touch) {
      var d = drag;
      d.holdT = setTimeout(function () {
        if (drag !== d) return;
        d.held = true;
        d.b.classList.add("is-held");
        if (navigator.vibrate) try { navigator.vibrate(12); } catch (x) {}
      }, HOLD);
    }
  });
  tabsEl.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.pid) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(dx) + Math.abs(dy) < 8) return;
      if (drag.touch && !drag.held) { endDrag(); return; } // moved before the hold: a scroll, not a drag
      drag.on = true;
      try { tabsEl.setPointerCapture(e.pointerId); } catch (x) {}
      drag.b.classList.add("is-dragging");
      tabsEl.classList.add("is-sorting");
    }
    e.preventDefault();
    drag.b.style.transform = "translate(" + dx + "px," + dy + "px)";
    // the tab under the pointer: it lands before it (pointer on its left half) or after it (right half)
    var tabs = $$("[data-vial]", tabsEl), hit = null, after = false;
    tabs.forEach(function (t) {
      if (t === drag.b) return;
      var r = t.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 4 && e.clientY <= r.bottom + 4) { hit = t; after = e.clientX > r.left + r.width / 2; }
    });
    var add = $("[data-vial-add]", tabsEl), ar = add.getBoundingClientRect();
    if (!hit && e.clientX >= ar.left && e.clientY >= ar.top - 4 && e.clientY <= ar.bottom + 4) { hit = tabs[tabs.length - 1] === drag.b ? tabs[tabs.length - 2] : tabs[tabs.length - 1]; after = true; }
    if (!hit) return; // between tabs: keep the last spot
    drag.to = hit.getAttribute("data-vial");
    drag.after = after;
    clearMark();
    hit.classList.add(after ? "is-drop-after" : "is-drop-before");
  });
  tabsEl.addEventListener("pointerup", function (e) {
    if (!drag || e.pointerId !== drag.pid) return;
    var d = drag;
    endDrag();
    if (!d.on) return;
    swallow = true;
    if (!d.to) return;
    var rest = state.vials.filter(function (v) { return v.id !== d.id; });
    var at = rest.indexOf(find(d.to)) + (d.after ? 1 : 0);
    moveVial(d.id, at);
  });
  tabsEl.addEventListener("pointercancel", endDrag);
  // a held tab doesn't scroll the page as it's dragged, or open the long-press menu
  tabsEl.addEventListener("touchmove", function (e) { if (drag && drag.held && e.cancelable) e.preventDefault(); }, { passive: false });
  tabsEl.addEventListener("contextmenu", function (e) { if (drag && drag.touch) e.preventDefault(); });
  tabsEl.addEventListener("keydown", function (e) {
    var b = e.target.closest && e.target.closest("[data-vial]");
    if (!b || !e.altKey) return;
    var dir = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    var id = b.getAttribute("data-vial"), i = state.vials.indexOf(find(id)), to = Math.max(0, Math.min(state.vials.length - 1, i + dir));
    if (moveVial(id, to)) { var t = $('[data-vial="' + id + '"]', tabsEl); if (t) t.focus(); }
  });

  nameIn.addEventListener("input", function () {
    V().name = nameIn.value.slice(0, 28);
    save();
    renderTabs();
    paint();
    summarize();
    syncEditor();
  });

  // any color, even one another vial wears (a new bottle of the same thing): theirs stays as it is
  swatches.forEach(function (s) {
    s.addEventListener("click", function () {
      var v = V(), c = +s.getAttribute("data-color");
      closePick();
      if (v.color === c) return;
      v.color = c;
      refresh();
    });
  });
  // custom color: the rainbow swatch opens a picker with the color's code and "apply". the browser's picker says
  // nothing when you keep the color it opened on, so the color only takes when you press apply (or enter)
  function hexOf(c) { // a preset as it's drawn right now, to start the picker on
    var probe = document.createElement("i");
    probe.setAttribute("data-c", c);
    probe.style.color = "var(--vc)";
    root.appendChild(probe);
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(probe).color);
    root.removeChild(probe);
    return m ? "#" + [m[1], m[2], m[3]].map(function (x) { return ("0" + (+x).toString(16)).slice(-2); }).join("") : "#33e6b0";
  }
  function setPick(hex) {
    customIn.value = hex;
    if (document.activeElement !== hexIn) hexIn.value = hex;
    cPick.style.setProperty("--pick", hex);
    cPick.style.setProperty("--pick-ink", ink(hex));
  }
  function openPick() {
    var c = V().color;
    setPick(isHex(c) ? c.toLowerCase() : hexOf(c));
    cPick.hidden = false;
    customSw.setAttribute("aria-expanded", "true");
  }
  function closePick() {
    if (cPick.hidden) return;
    cPick.hidden = true;
    customSw.setAttribute("aria-expanded", "false");
  }
  function applyPick() {
    var t = hexIn.value.trim().toLowerCase(), hex = isHex(t) ? t : isHex("#" + t) ? "#" + t : customIn.value.toLowerCase();
    closePick();
    if (!isHex(hex)) return;
    V().color = hex;
    refresh();
    customSw.focus({ preventScroll: true });
  }
  customSw.addEventListener("click", function () { if (cPick.hidden) openPick(); else closePick(); });
  customIn.addEventListener("input", function () { if (isHex(customIn.value)) setPick(customIn.value.toLowerCase()); });
  hexIn.addEventListener("input", function () {
    var t = hexIn.value.trim().toLowerCase(), hex = isHex(t) ? t : isHex("#" + t) ? "#" + t : null;
    if (hex) setPick(hex);
  });
  hexIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); applyPick(); } });
  $("[data-pl-cpick-ok]").addEventListener("click", applyPick);
  $("[data-pl-cpick-x]").addEventListener("click", function () { closePick(); customSw.focus({ preventScroll: true }); });
  cPick.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); closePick(); customSw.focus({ preventScroll: true }); } });

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
    closeNew();
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

  // ---- the active vial's start and end: the start moves the whole vial; the end is the last day it's used ----
  // (empty: "auto", the day it runs dry, which moves with its size and doses). nothing after the end is taken from it
  var plStart = $("[data-pl-start]"), plEnd = $("[data-pl-end]"), plAuto = $("[data-pl-end-auto]"), plHint = $("[data-pl-hint]");
  function datesHint(v, a, own, runs) {
    if (!a) return "tap a day on the calendar to add its first dose.";
    var L = ledger(v), spare = v.size - (L.length ? L[L.length - 1].cum : 0), left = spare > EPS ? mg(spare) + " left over" : "nothing left over";
    var dry = v.rules.some(function (r) { return !r.until; }); // a repeat still going: it went until the vial couldn't cover the next dose
    if (!own) return runs ? "auto: " + (dry ? "its last dose before it runs dry" + (spare > EPS ? " (" + mg(spare) + " left, short of a dose)" : "") : "its last dose, " + left) + ". pick a date to end it sooner." : "";
    if (runs && runs < own) return "it runs dry " + md(runs) + ", before this date.";
    return "ends here: " + (spare > EPS ? left + ", thrown away" : left) + ". auto puts it back to the day it runs dry.";
  }
  function syncDates() {
    var v = V(), a = firstDay(v), own = v.end || null, runs = runsTo(v);
    if (document.activeElement !== plStart) plStart.value = a || "";
    plStart.disabled = !a;
    if (document.activeElement !== plEnd) plEnd.value = own || runs || "";
    plEnd.disabled = !a;
    plEnd.min = a || "2000-01-01";
    plEnd.classList.toggle("is-auto", !own);
    plAuto.hidden = !own;
    plHint.textContent = datesHint(v, a, own, runs);
  }
  plStart.min = plEnd.min = "2000-01-01";
  plStart.max = plEnd.max = "2099-12-31";
  plStart.addEventListener("change", function () {
    var v = V(), a = firstDay(v), k = plStart.value;
    if (!a || !okDate(k) || k === a) return;
    shiftVial(v, dayDiff(a, k));
    if (editing) startEdit(editing);
    refresh();
  });
  plEnd.addEventListener("change", function () {
    var v = V(), a = firstDay(v), k = plEnd.value;
    if (!k) { if (v.end) { delete v.end; refresh(); } return; }
    if (!a || !okDate(k)) return;
    if (k < a) k = a; // not before its first dose
    if (k === v.end) return;
    v.end = k;
    if (editing) startEdit(editing);
    refresh();
  });
  [plStart, plEnd].forEach(function (el) { el.addEventListener("blur", syncDates); });
  plAuto.addEventListener("click", function () {
    delete V().end;
    if (editing) startEdit(editing);
    refresh();
    plEnd.focus({ preventScroll: true });
  });

  // ---- a new vial: its name, size, doses (the same as the vial it follows, a dose and how often, or none yet),
  // and its start and end. the start begins on the vial it follows' next dose day after its last one (when it'd
  // need a new vial); the end, left empty, is the day the new one runs dry, and shows as you change the rest ----
  var nw = $("[data-pl-new]"), nwName = $("[data-new-name]", nw);
  var nwSizeBtns = $$("[data-new-size] .opt", nw), nwSizeIn = $("[data-new-size] .opt-in", nw);
  var nwHow = $$("[data-new-how] .opt", nw), nwSame = $("[data-new-same]", nw), nwDoseRow = $("[data-new-dose-row]", nw);
  var nwDose = $("[data-new-dose]", nw), nwEvery = $$("[data-new-every] .opt", nw);
  var nwStart = $("[data-new-start]", nw), nwEnd = $("[data-new-end]", nw), nwAuto = $("[data-new-end-auto]", nw), nwHint = $("[data-new-hint]", nw);
  var nwDates = nwStart.closest(".pl-dates"), nwOk = $("[data-new-ok]", nw);
  var nws = null; // { from: the vial it follows, size, custom, how: "same" | "set" | "none", every, end: typed, or null for auto }
  nwStart.min = nwEnd.min = "2000-01-01";
  nwStart.max = nwEnd.max = "2099-12-31";

  var NUM = /^(.*?)\s*#\s*(\d+)\s*$/;
  function nameAfter(v) { // "GLP3-RT #4" -> "GLP3-RT #5"; "BPC-157" -> "BPC-157 #2" (past any number already taken)
    var t = v.name.trim(), m = NUM.exec(t), base = m ? m[1] : t, top = m ? +m[2] : 1;
    if (!base || /^vial \d+$/.test(t)) return nextName(); // no name of its own: the next "vial n"
    state.vials.forEach(function (o) { var x = NUM.exec(o.name.trim()); if (x && x[1].toLowerCase() === base.toLowerCase()) top = Math.max(top, +x[2]); });
    var n = " #" + (top + 1);
    return base.slice(0, 28 - n.length) + n;
  }
  // when the vial it follows needs a new one: its regimen's next day after its last dose (or its end date)
  function startAfter(v) {
    var R = regimen(v), last = v.end || lastKey(schedule(v));
    if (!last) return todayKey;
    if (!R.length) return key(addDays(parse(last), 1));
    return R.map(function (r) { return nextOn(r, last); }).sort()[0];
  }
  // the new vial as the form has it now
  function draft() {
    var s = nws, S = nwStart.value, d = { size: s.size, doses: {}, rules: [] };
    if (!okDate(S) || !(s.size > 0)) return d;
    if (s.how === "same") {
      // its regimen, moved so the first of its days lands on the start (split doses keep their days apart)
      var R = regimen(s.from), last = s.from.end || lastKey(schedule(s.from)) || S;
      var at = R.map(function (r) { return nextOn(r, last); }), base = at.slice().sort()[0], n = base ? dayDiff(base, S) : 0;
      R.forEach(function (r, i) {
        var f = key(addDays(parse(at[i]), n));
        d.doses[f] = (d.doses[f] || 0) + r.dose;
        d.rules.push({ from: f, dose: r.dose, every: r.every });
      });
    } else if (s.how === "set") {
      var x = parseFloat(nwDose.value);
      if (x > 0) {
        d.doses[S] = x;
        d.rules.push({ from: S, dose: x, every: s.every });
      }
    }
    if (s.end && s.how !== "none") d.end = s.end;
    return d;
  }
  function syncNew() {
    var s = nws;
    if (!s) return;
    nwSizeBtns.forEach(function (b) {
      var val = b.getAttribute("data-val");
      b.classList.toggle("is-active", val === "custom" ? s.custom : !s.custom && parseFloat(val) === s.size);
    });
    nwSizeIn.hidden = !s.custom;
    var R = regimen(s.from);
    nwHow.forEach(function (b) {
      var h = b.getAttribute("data-how");
      b.hidden = h === "same" && !R.length;
      b.classList.toggle("is-active", h === s.how);
    });
    nwSame.textContent = label(s.from);
    nwDoseRow.hidden = s.how !== "set";
    nwEvery.forEach(function (b) { b.classList.toggle("is-active", +b.getAttribute("data-val") === s.every); });
    nwDates.hidden = s.how === "none";
    var S = nwStart.value, d = draft(), sched = schedule(d), ks = Object.keys(sched).sort();
    var runs = runsTo(d), total = ks.reduce(function (t, k) { return t + sched[k]; }, 0), spare = d.size - total;
    if (document.activeElement !== nwEnd) nwEnd.value = s.end || runs || "";
    nwEnd.min = okDate(S) ? S : "2000-01-01";
    nwEnd.classList.toggle("is-auto", !s.end);
    nwAuto.hidden = !s.end;
    var lead = s.how === "same" ? regimenText(R) + ". " : "";
    nwHint.textContent = s.how === "none" ? ""
      : !okDate(S) ? "pick the day of its first dose."
      : s.how === "set" && !ks.length ? "pick a dose and how often."
      : s.end && s.end < S ? "the end is before the start."
      : lead + ks.length + (ks.length === 1 ? " dose" : " doses") + ", " + (s.end
        ? "ends " + md(s.end) + (runs && runs < s.end ? " (it runs dry " + md(runs) + ")" : spare > EPS ? ", " + mg(spare) + " left over" : "")
        : "runs dry after " + md(lastKey(sched)) + (spare > EPS ? " (" + mg(spare) + " left, short of a dose)" : "") + ".");
  }
  function openNew() {
    var v = V(), R = regimen(v);
    closePick();
    disarmRemove();
    nws = { from: v, size: v.size, custom: false, how: R.length ? "same" : "set", every: R.length ? R[0].every : 7, end: null };
    nws.custom = !nwSizeBtns.some(function (b) { return parseFloat(b.getAttribute("data-val")) === v.size; });
    if (nws.custom) nwSizeIn.value = v.size;
    nwName.value = nameAfter(v);
    var lastDose = schedule(v)[lastKey(schedule(v))];
    nwDose.value = R.length ? R[0].dose : lastDose > 0 ? lastDose : "";
    nwStart.value = startAfter(v);
    nw.hidden = false;
    renderTabs();
    syncNew();
    nwName.focus({ preventScroll: true });
    nwName.select();
  }
  function closeNew(refocus) {
    if (nw.hidden) return;
    nw.hidden = true;
    nws = null;
    renderTabs();
    if (refocus) { var a = $("[data-vial-add]", tabsEl); if (a) a.focus({ preventScroll: true }); }
  }
  function addNew() {
    var s = nws, d = draft();
    if (s.how !== "none") {
      if (!okDate(nwStart.value)) { nwStart.focus(); return; }
      if (s.how === "set" && !d.rules.length) { nwDose.focus(); return; }
      if (d.end && d.end < nwStart.value) { nwEnd.focus(); return; }
    }
    if (!(s.size > 0)) { nwSizeIn.focus(); return; }
    var from = s.from;
    var v = addVialObj({ name: nwName.value.trim().slice(0, 28) || nextName(), size: s.size, doses: d.doses, rules: d.rules, end: d.end, color: s.how === "same" ? from.color : undefined });
    if (s.how === "same" && state.vials.indexOf(from) >= 0) { // next to the vial it follows
      state.vials.pop();
      state.vials.splice(state.vials.indexOf(from) + 1, 0, v);
    }
    closeNew();
    setActive(v.id);
    // its first dose on screen
    var a = firstDay(v);
    if (a && onScreen.length && (a < onScreen[0].a || a > onScreen[onScreen.length - 1].b)) {
      var m = new Date(parse(a).getFullYear(), parse(a).getMonth(), 1);
      go(m, m > view ? 1 : -1);
    }
    if (a) { focus = a; summarize(); }
  }
  nwSizeBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var val = b.getAttribute("data-val");
      if (val === "custom") { nws.custom = true; syncNew(); nwSizeIn.focus(); return; }
      nws.custom = false;
      nws.size = parseFloat(val);
      syncNew();
    });
  });
  nwSizeIn.addEventListener("input", function () { var x = parseFloat(nwSizeIn.value); if (x > 0) { nws.size = x; syncNew(); } });
  nwHow.forEach(function (b) {
    b.addEventListener("click", function () {
      var was = nws.how;
      nws.how = b.getAttribute("data-how");
      syncNew();
      if (nws.how === "set" && was !== "set" && !(parseFloat(nwDose.value) > 0)) nwDose.focus();
    });
  });
  nwEvery.forEach(function (b) { b.addEventListener("click", function () { nws.every = +b.getAttribute("data-val"); syncNew(); }); });
  nwDose.addEventListener("input", syncNew);
  nwStart.addEventListener("input", syncNew);
  nwEnd.addEventListener("input", function () {
    if (!nwEnd.value) { nws.end = null; syncNew(); return; }
    if (okDate(nwEnd.value)) { nws.end = nwEnd.value; syncNew(); }
  });
  nwEnd.addEventListener("blur", syncNew);
  nwAuto.addEventListener("click", function () { nws.end = null; syncNew(); nwEnd.focus({ preventScroll: true }); });
  nwOk.addEventListener("click", addNew);
  $("[data-new-x]", nw).addEventListener("click", function () { closeNew(true); });
  nw.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.stopPropagation(); closeNew(true); }
    else if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target !== nwName) { e.preventDefault(); addNew(); }
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

  function start() {
    syncLook();
    build(0);
    syncVial();
    paint();
    summarize();
  }
  if (!embed) { start(); return; }

  // ---- embedded (planner-embed.html, framed by the admin dashboard's Calendar page) ----
  // the admin holds the plan: it sends it in ("load", and again whenever it's saved on another device) and
  // saves every change this sends back ("save"). nothing is read from or kept in this browser. the page's
  // height goes up too, so the admin can size the frame to fit. only the admin may frame this page
  // (vercel.json), and replies only ever go to the window that sent the plan, at its origin.
  if (window.parent === window) { location.replace("calculator.html"); return; }
  var host = null, started = false;
  function tell(type, data) {
    if (!host) return;
    var m = data || {};
    m.type = "hlix-plan:" + type;
    window.parent.postMessage(m, host);
  }
  function sendHeight() { tell("height", { h: Math.ceil(document.body.getBoundingClientRect().height) }); }

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (e.source !== window.parent || !m) return;
    if (m.type === "hlix-plan:part" && e.origin === host && part !== "panel") { // the calendar on its own, or with the panel
      part = m.part === "calendar" ? "calendar" : "all";
      root.setAttribute("data-part", part);
      toldFocus = null;
      if (started) summarize();
      return;
    }
    if (m.type === "hlix-plan:focus" && e.origin === host && started && typeof m.k === "string" && KEY_RE.test(m.k)) { // the day tapped in the calendar
      focus = m.k;
      summarize();
      return;
    }
    if (m.type === "hlix-plan:active" && e.origin === host && started && typeof m.id === "string") { // the vial picked in the panel
      setActive(m.id);
      return;
    }
    if (m.type !== "hlix-plan:load") return;
    host = e.origin;
    load(m.plan);
    if (!started) {
      started = true;
      start();
    } else { // another plan, or this one saved elsewhere: show it as is
      closePick();
      closeNew();
      endDrag();
      disarm();
      disarmRemove();
      vialCustom = false;
      if (part !== "panel") shown = {}; // the panel follows every change in the calendar: its numbers count to the new ones
      start();
    }
    sendHeight();
  });
  if ("ResizeObserver" in window) new ResizeObserver(sendHeight).observe(document.body);
  window.parent.postMessage({ type: "hlix-plan:ready" }, "*"); // carries nothing; the plan comes back from the admin
})();
