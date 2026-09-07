// hlix — peptide reconstitution & dosage calculator
// Pure client-side math. No data leaves the browser, nothing is stored.
(function () {
  "use strict";

  var root = document.querySelector("[data-calculator]");
  if (!root) return;

  var state = {
    vial: 5,          // mg (or IU) of peptide in the vial
    water: 2,          // mL of bacteriostatic water added
    dose: 0.25,        // mg (or IU) per injection
    frequency: "daily", // "daily" | "weekly"
    syringe: 1,         // mL capacity of the syringe (100 units = 1 mL)
    customSyringe: 1,
    supplyUnit: "days",  // "days" | "weeks" | "months" | "years"
    planAmount: 3,
    planUnit: "months"
  };

  function num(el) {
    var v = parseFloat(el.value);
    return isNaN(v) || v <= 0 ? 0 : v;
  }

  // ---- wire up chip groups ----
  root.querySelectorAll("[data-calc]").forEach(function (group) {
    var key = group.getAttribute("data-calc");
    group.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var value = chip.getAttribute("data-value");
        group.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("is-active"); });
        chip.classList.add("is-active");

        if (value === "custom") {
          var customInput = group.querySelector("[data-custom-input]");
          if (customInput) {
            customInput.style.display = "";
            customInput.focus();
          }
        } else {
          var hiddenCustom = group.querySelector("[data-custom-input]");
          if (hiddenCustom) hiddenCustom.style.display = "none";
          state[key] = isNaN(parseFloat(value)) ? value : parseFloat(value);
        }
        render();
      });
    });

    var customInput = group.querySelector("[data-custom-input]");
    if (customInput) {
      customInput.addEventListener("input", function () {
        state[key] = num(customInput);
        render();
      });
    }
  });

  // ---- plan-for stepper ----
  var planInput = root.querySelector("[data-plan-amount]");
  if (planInput) {
    planInput.addEventListener("input", function () {
      state.planAmount = num(planInput) || 1;
      render();
    });
  }

  function fmt(n, decimals) {
    if (!isFinite(n)) return "—";
    var f = n.toFixed(decimals == null ? 2 : decimals);
    return f.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  }

  // Syringe SVG geometry — must match the coordinates in the markup.
  var SYR_BARREL_X = 75;
  var SYR_BARREL_W = 260;
  var SYR_CAP_W = 8;
  var SYR_ROD_LEN = 70;
  var SYR_FLANGE_W = 14;

  function render() {
    var vial = state.vial;
    var water = state.water;
    var dose = state.dose;
    var syringeMl = state.syringe === "custom" ? state.customSyringe : state.syringe;

    var concentration = water > 0 ? vial / water : 0;
    var drawVolumeMl = concentration > 0 ? dose / concentration : 0;
    var drawUnits = drawVolumeMl * 100;
    var syringeMaxUnits = syringeMl * 100;

    var set = function (id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    set("vialEcho", fmt(vial, 2) + " mg");
    set("waterEcho", fmt(water, 2) + " mL");
    set("calcConcentration", concentration > 0 ? fmt(concentration, 2) : "—");
    set("calcDrawUnits", drawUnits > 0 ? fmt(drawUnits, 1) : "—");
    set("calcDrawVolume", drawVolumeMl > 0 ? fmt(drawVolumeMl, 3) : "—");

    var fillRect = document.getElementById("syringeFillRect");
    var plungerCap = document.getElementById("syringePlungerCap");
    var rod = document.getElementById("syringeRod");
    var flange = document.getElementById("syringeFlange");
    var warn = document.getElementById("syringeWarn");

    var pct = syringeMaxUnits > 0 ? Math.min(100, (drawUnits / syringeMaxUnits) * 100) : 0;
    var fillW = (pct / 100) * SYR_BARREL_W;
    var capX = SYR_BARREL_X + fillW - SYR_CAP_W / 2;
    var rodX = capX + SYR_CAP_W / 2;
    var flangeX = rodX + SYR_ROD_LEN - SYR_FLANGE_W;

    if (fillRect) fillRect.setAttribute("width", fillW.toFixed(1));
    if (plungerCap) plungerCap.setAttribute("x", capX.toFixed(1));
    if (rod) { rod.setAttribute("x", rodX.toFixed(1)); rod.setAttribute("width", SYR_ROD_LEN); }
    if (flange) flange.setAttribute("x", flangeX.toFixed(1));

    if (warn) {
      var overCapacity = drawUnits > syringeMaxUnits && syringeMaxUnits > 0;
      warn.classList.toggle("is-visible", overCapacity);
      if (overCapacity) {
        warn.textContent = "This draw (" + fmt(drawUnits, 1) + " units) exceeds your " + fmt(syringeMl, 2) + " mL syringe's " + fmt(syringeMaxUnits, 0) + "-unit capacity. Use a larger syringe, or add less water to concentrate the mix.";
      }
    }

    // supply
    var injectionsPerVial = dose > 0 ? Math.floor(vial / dose) : 0;
    var daysPerVial = state.frequency === "daily" ? injectionsPerVial : injectionsPerVial * 7;

    var supplyConverted = daysPerVial;
    var unitLabel = state.supplyUnit;
    if (unitLabel === "weeks") supplyConverted = daysPerVial / 7;
    if (unitLabel === "months") supplyConverted = daysPerVial / 30;
    if (unitLabel === "years") supplyConverted = daysPerVial / 365;

    set("calcSupplyValue", injectionsPerVial > 0 ? fmt(supplyConverted, 1) : "—");
    set("calcSupplyUnit", unitLabel);
    set("calcInjectionsPerVial", injectionsPerVial > 0 ? injectionsPerVial : "—");
    set("calcFrequencyLabel", state.frequency === "daily" ? "injections / day" : "injections / week");

    // plan for
    var targetDays = state.planAmount * (state.planUnit === "weeks" ? 7 : state.planUnit === "months" ? 30 : 365);
    var injectionsNeeded = state.frequency === "daily" ? targetDays : targetDays / 7;
    var totalNeeded = injectionsNeeded * dose;
    var vialsNeeded = vial > 0 ? Math.ceil(totalNeeded / vial) : 0;
    set("calcVialsNeeded", vialsNeeded > 0 ? vialsNeeded : "—");
    set("calcPlanAmountEcho", state.planAmount);
    set("calcPlanUnitEcho", state.planUnit);
  }

  render();
})();
