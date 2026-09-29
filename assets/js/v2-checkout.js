// hlix v2 — checkout page. Reads the cart from localStorage (v2-cart.js),
// renders an order summary, and on submit posts the whole thing to
// /api/order (Resend) as an order *request* — no payment is collected or
// processed anywhere on this page.
(function () {
  "use strict";
  var d = document;
  function $(s, c) { return (c || d).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function moneyStr(n) { return "$" + Math.ceil(n - 1e-9); }

  var checkout = $("[data-checkout]");
  if (!checkout || !window.HLIXCart) return;

  var cart = window.HLIXCart.get();
  var list = $("[data-checkout-list]");
  var empty = $("[data-checkout-empty]");
  var subRow = $("[data-checkout-subtotal-row]");
  var subEl = $("[data-checkout-subtotal]");
  var form = $("[data-checkout-form]");

  if (!cart.length) {
    if (empty) empty.hidden = false;
    if (form) form.hidden = true;
    return;
  }

  list.innerHTML = cart.map(function (it) {
    return (
      '<div class="cart__item">' +
        '<div class="cart__item-info"><b>' + esc(it.name) + '</b><span>' + esc(it.dose) + ' · ' + esc(it.form === "recon" ? "ready to use" : "powder") + ' · qty ' + it.qty + '</span></div>' +
        '<b class="cart__item-price">' + moneyStr(it.unitPrice * it.qty) + '</b>' +
      '</div>'
    );
  }).join("");
  if (subRow) subRow.hidden = false;
  if (subEl) subEl.textContent = moneyStr(window.HLIXCart.subtotal());

  var status = $("[data-checkout-status]");
  var submitBtn = $("[data-checkout-submit]");
  var done = $("[data-checkout-done]");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = form;
    var customer = {
      name: f.name.value.trim(),
      email: f.email.value.trim(),
      address1: f.address1.value.trim(),
      address2: f.address2.value.trim(),
      city: f.city.value.trim(),
      state: f.state.value.trim(),
      zip: f.zip.value.trim(),
      country: f.country.value.trim(),
      notes: f.notes.value.trim(),
    };
    if (!customer.name || !customer.email || !customer.address1 || !customer.city || !customer.state || !customer.zip || !customer.country) return;

    submitBtn.disabled = true;
    status.hidden = false;
    status.classList.remove("is-error");
    status.textContent = "submitting…";

    fetch("/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customer: customer, items: cart, subtotal: window.HLIXCart.subtotal() }),
    })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        if (res.ok) {
          window.HLIXCart.clear();
          checkout.hidden = true;
          if (done) {
            done.hidden = false;
            var emailOut = $("[data-checkout-done-email]", done);
            if (emailOut) emailOut.textContent = customer.email;
          }
        } else {
          status.classList.add("is-error");
          status.textContent = res.data.error || "something went wrong. try again in a moment.";
          submitBtn.disabled = false;
        }
      })
      .catch(function () {
        status.classList.add("is-error");
        status.textContent = "couldn't reach the server. this only works once the site is deployed.";
        submitBtn.disabled = false;
      });
  });
})();
