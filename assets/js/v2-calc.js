// hlix v2 — reconstitution & dosage calculator (pure client-side math)
(function () {
  "use strict";
  var root = document.querySelector("[data-calc]");
  if (!root) return;

  var tween = (window.HLIX2 && window.HLIX2.tween) || function (a, b, d, u, done) { u(b); if (done) done(); };

  var state = { vial: 5, water: 2, dose: 0.25, freq: 1, syringe: 1, supplyUnit: "days", planAmount: 3, planUnit: "months" };
  var units = { vial: "mg", water: "mL", dose: "mg", syringe: "mL" };
  var shown = { units: 0, conc: 0, vol: 0 };

  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var outs = {};
  $$("[data-o]").forEach(function (el) { (outs[el.getAttribute("data-o")] = outs[el.getAttribute("data-o")] || []).push(el); });
  function put(name, text) { (outs[name] || []).forEach(function (el) { el.textContent = text; }); }

  function fmt(n, dec) {
    if (!isFinite(n)) return "···";
    return n.toFixed(dec == null ? 2 : dec).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  }

  // ---- option groups ----
  $$("[data-group]").forEach(function (g) {
    var key = g.getAttribute("data-group");
    var btns = $$(".opt", g);
    var custom = g.querySelector(".opt-in");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        var v = b.getAttribute("data-val");
        if (v === "custom") {
          if (custom) { custom.hidden = false; custom.focus(); }
          return;
        }
        if (custom) custom.hidden = true;
        state[key] = isNaN(parseFloat(v)) ? v : parseFloat(v);
        render();
      });
    });
    if (custom) {
      custom.addEventListener("input", function () {
        var v = parseFloat(custom.value);
        state[key] = isNaN(v) || v <= 0 ? 0 : v;
        render();
      });
    }
  });

  // ---- frequency (presets + custom "every N days/weeks/months") ----
  var freqPresets = root.querySelector("[data-freq-presets]");
  var freqCustomWrap = root.querySelector("[data-freq-custom]");
  var freqN = root.querySelector("[data-freq-n]");
  var freqUnitRoot = root.querySelector("[data-freq-unit]");

  function updateFreqFromCustom() {
    var n = freqN ? parseFloat(freqN.value) : 1;
    if (isNaN(n) || n <= 0) n = 1;
    var activeUnitBtn = freqUnitRoot ? freqUnitRoot.querySelector(".opt.is-active") : null;
    var unit = activeUnitBtn ? activeUnitBtn.getAttribute("data-val") : "days";
    var mult = unit === "weeks" ? 7 : unit === "months" ? 30 : 1;
    state.freq = n * mult;
    render();
  }

  if (freqPresets) {
    var freqBtns = $$(".opt", freqPresets);
    freqBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        freqBtns.forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        var v = b.getAttribute("data-val");
        if (v === "custom") {
          if (freqCustomWrap) { freqCustomWrap.hidden = false; }
          updateFreqFromCustom();
          return;
        }
        if (freqCustomWrap) freqCustomWrap.hidden = true;
        state.freq = parseFloat(v);
        render();
      });
    });
  }
  if (freqN) freqN.addEventListener("input", updateFreqFromCustom);
  if (freqUnitRoot) {
    $$(".opt", freqUnitRoot).forEach(function (b) {
      b.addEventListener("click", function () {
        $$(".opt", freqUnitRoot).forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        updateFreqFromCustom();
      });
    });
  }

  function freqLabel() {
    var f = state.freq;
    if (f === 1) return "injections, one a day";
    if (f === 7) return "injections, one a week";
    if (f === 30) return "injections, one a month";
    return "injections, one every " + fmt(f, 0) + " days";
  }

  var plan = root.querySelector("[data-plan]");
  if (plan) plan.addEventListener("input", function () {
    var v = parseFloat(plan.value);
    state.planAmount = isNaN(v) || v <= 0 ? 1 : v;
    render();
  });

  function animateNumber(name, to, dec) {
    var from = shown[name];
    shown[name] = to;
    tween(from, to, 650, function (v) { put(name, fmt(v, dec)); }, function () { put(name, fmt(to, dec)); });
  }

  function render() {
    var vial = state.vial, water = state.water, dose = state.dose;
    var syrMl = state.syringe;

    var conc = water > 0 ? vial / water : 0;
    var volMl = conc > 0 ? dose / conc : 0;
    var drawUnits = volMl * 100;
    var maxUnits = syrMl * 100;

    ["vial", "water", "dose"].forEach(function (k) {
      var el = root.querySelector('[data-echo="' + k + '"]');
      if (el) el.textContent = fmt(state[k], 2) + " " + units[k];
    });
    var se = root.querySelector('[data-echo="syringe"]');
    if (se) se.textContent = fmt(syrMl, 2) + " mL · " + fmt(maxUnits, 0) + " units";

    if (drawUnits > 0) animateNumber("units", drawUnits, 1); else { shown.units = 0; put("units", "···"); }
    if (conc > 0) animateNumber("conc", conc, 2); else { shown.conc = 0; put("conc", "···"); }
    if (volMl > 0) animateNumber("vol", volMl, 3); else { shown.vol = 0; put("vol", "···"); }
    put("dock", drawUnits > 0 ? fmt(drawUnits, 1) : "···");

    // syringe
    var pct = maxUnits > 0 ? Math.min(1, drawUnits / maxUnits) : 0;
    root.querySelectorAll("[data-syr]").forEach(function (s) {
      s.style.setProperty("--fill", pct.toFixed(4));
      Array.prototype.forEach.call(s.querySelectorAll(".tick"), function (t, i) {
        t.textContent = fmt(maxUnits * i / 4, maxUnits < 40 ? 1 : 0);
      });
    });

    var warn = root.querySelector("[data-warn]");
    if (warn) {
      var over = maxUnits > 0 && drawUnits > maxUnits;
      warn.hidden = !over;
      if (over) warn.textContent = "this draw (" + fmt(drawUnits, 1) + " units) is more than your " + fmt(syrMl, 2) + " ml syringe holds (" + fmt(maxUnits, 0) + " units). use a bigger syringe, or add less water.";
    }

    // supply
    var inj = dose > 0 ? Math.floor(vial / dose) : 0;
    var days = inj * state.freq;
    var conv = days;
    if (state.supplyUnit === "weeks") conv = days / 7;
    if (state.supplyUnit === "months") conv = days / 30;
    if (state.supplyUnit === "years") conv = days / 365;
    put("inj", inj > 0 ? String(inj) : "···");
    put("freqlabel", freqLabel());
    put("supply", inj > 0 ? fmt(conv, 1) : "···");
    put("supplyUnit", state.supplyUnit);

    // plan
    var target = state.planAmount * (state.planUnit === "weeks" ? 7 : state.planUnit === "months" ? 30 : 365);
    var need = target / state.freq;
    var vials = vial > 0 ? Math.ceil(need * dose / vial) : 0;
    put("vials", vials > 0 ? String(vials) : "···");
    put("planN", fmt(state.planAmount, 2));
    put("planU", state.planUnit);
  }

  render();

  // ---- mobile dock: hide once the static "draw to" card scrolls into view ----
  var dock = document.querySelector("[data-dock]");
  var out = root.querySelector(".calc__out");
  if (dock && out && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { dock.classList.toggle("is-hidden", e.isIntersecting); });
    }, { rootMargin: "0px 0px -40% 0px" });
    io.observe(out);
  }
})();
