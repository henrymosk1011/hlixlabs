// hlix v3 — checkout. Reads the cart (v3-cart.js), shows the order summary, and
// on submit posts it to /api/order (Resend) as an order *request*, the same
// payload as the main site's checkout. No payment is collected or processed.
(function () {
  "use strict";
  var d = document;
  function $(s, c) { return (c || d).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(n) { return "$" + Math.ceil(n - 1e-9).toLocaleString("en-US"); }

  var checkout = $("[data-checkout]");
  var Cart = window.HLIXCart;
  if (!checkout || !Cart) return;

  var list = $("[data-checkout-list]");
  var subEl = $("[data-checkout-subtotal]");
  var empty = $("[data-checkout-empty]");
  var form = $("[data-checkout-form]");
  var status = $("[data-checkout-status]");
  var submitBtn = $("[data-checkout-submit]");
  var done = $("[data-checkout-done]");
  var sent = false;

  function render() {
    if (sent) return;
    var cart = Cart.get();
    checkout.hidden = cart.length === 0;
    if (empty) empty.hidden = cart.length > 0;
    if (!cart.length) return;
    list.innerHTML = cart.map(function (it) {
      return '<div class="line"><img class="line__img" src="' + Cart.photo(it) + '" alt="" width="56" height="70">' +
        '<div class="line__info"><a href="' + Cart.url(it) + '">' + esc(it.name) + "</a><span>" + esc(it.dose) + " · " + (it.form === "recon" ? "ready to use" : "powder") + " · qty " + it.qty + "</span></div>" +
        '<div class="line__end"><b class="line__price">' + money(it.unitPrice * it.qty) + "</b></div></div>";
    }).join("");
    subEl.textContent = money(Cart.subtotal());
  }
  render();
  d.addEventListener("hlix:cart", render);
  d.addEventListener("hlix:prices", render);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = form;
    var customer = {
      name: f.name.value.trim(), email: f.email.value.trim(),
      address1: f.address1.value.trim(), address2: f.address2.value.trim(),
      city: f.city.value.trim(), state: f.state.value.trim(), zip: f.zip.value.trim(), country: f.country.value.trim(),
      notes: f.notes.value.trim()
    };
    if (!customer.name || !customer.email || !customer.address1 || !customer.city || !customer.state || !customer.zip || !customer.country) return;
    submitBtn.disabled = true;
    status.hidden = false;
    status.classList.remove("is-error");
    status.textContent = "submitting…";
    fetch("/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customer: customer, items: Cart.get(), subtotal: Cart.subtotal() })
    })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        if (res.ok) {
          sent = true;
          Cart.clear();
          checkout.hidden = true;
          if (empty) empty.hidden = true;
          done.hidden = false;
          var out = $("[data-checkout-done-email]", done);
          if (out) out.textContent = customer.email;
          window.scrollTo(0, 0);
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
