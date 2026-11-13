// hlix — checkout (main site). Reads the cart (v3-cart.js), shows the order summary, and on
// submit posts it to /api/order as an order *request*: no payment is collected or processed
// anywhere on this page. Signed in (window.HLIXAccount), the shipping details are filled in
// from the account, the order goes straight into the hlix admin and shows in the account;
// as a guest, it's emailed to hlix. Same request as the archived /v2/ checkout.
(function () {
  "use strict";
  var d = document;
  function $(s, c) { return (c || d).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var checkout = $("[data-checkout]");
  var Cart = window.HLIXCart;
  if (!checkout || !Cart) return;
  var money = Cart.money;

  var list = $("[data-checkout-list]");
  var subEl = $("[data-checkout-subtotal]");
  var empty = $("[data-checkout-empty]");
  var form = $("[data-checkout-form]");
  var status = $("[data-checkout-status]");
  var submitBtn = $("[data-checkout-submit]");
  var done = $("[data-checkout-done]");
  var sent = false;

  // The cart can arrive after the page does (from the account), so this runs again then.
  function render() {
    if (sent) return;
    var cart = Cart.get();
    checkout.hidden = cart.length === 0;
    if (empty) empty.hidden = cart.length > 0;
    if (!cart.length) return;
    list.innerHTML = cart.map(function (it) {
      var q = Number(it.qty) || 0;
      var qty = it.unit === "pack" ? q + (q === 1 ? " pack of 10" : " packs of 10") : "qty " + q;
      return '<div class="line"><img class="line__img" src="' + Cart.photo(it) + '" alt="" width="56" height="70">' +
        '<div class="line__info"><a href="' + Cart.url(it) + '">' + esc(it.name) + "</a><span>" + esc(it.dose) + " · " + Cart.formLabel(it.form) + " · " + qty + "</span></div>" +
        '<div class="line__end"><b class="line__price">' + money(Number(it.unitPrice) * q || 0) + "</b></div></div>";
    }).join("");
    subEl.textContent = money(Cart.subtotal());
  }
  render();
  d.addEventListener("hlix:cart", render);
  d.addEventListener("hlix:prices", render);

  // ---- signed in: who, and their saved details --------------------------------
  var acctOut = $("[data-checkout-acct-out]");
  var acctIn = $("[data-checkout-acct-in]");
  var saveBox = $("[data-checkout-save]");
  var account = null;
  function useAccount(data) {
    account = data && data.signedIn ? data : null;
    if (acctOut) acctOut.hidden = !!account;
    if (acctIn) acctIn.hidden = !account;
    if (saveBox) saveBox.hidden = !account;
    var emailInput = form.email;
    if (!account) { emailInput.readOnly = false; return; }
    $("[data-checkout-acct-email]").textContent = account.email || "";
    emailInput.value = account.email || "";
    emailInput.readOnly = true; // the order goes to the account's email
    var p = account.profile || {};
    ["name", "phone", "address1", "address2", "city", "state", "zip", "country"].forEach(function (k) {
      var input = form.elements[k];
      if (input && !input.value.trim() && typeof p[k] === "string" && p[k]) input.value = p[k];
    });
    if (form.country && !form.country.value.trim()) form.country.value = "United States";
  }
  if (window.HLIXAccount) {
    window.HLIXAccount.ready.then(useAccount);
    d.addEventListener("hlix:account", function (e) { useAccount(e.detail); });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = form;
    var customer = {
      name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone ? f.phone.value.trim() : "",
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
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customer: customer, items: Cart.get(), subtotal: Cart.subtotal(), save: !!(account && f.save && f.save.checked) })
    })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, status: r.status, data: data || {} }; }); })
      .then(function (res) {
        if (res.ok) {
          sent = true;
          Cart.clear();
          checkout.hidden = true;
          if (empty) empty.hidden = true;
          done.hidden = false;
          var out = $("[data-checkout-done-email]", done);
          if (out) out.textContent = customer.email;
          var ref = $("[data-checkout-done-ref]", done);
          if (ref && res.data.ref) { ref.textContent = " as order #" + res.data.ref; ref.hidden = false; }
          if (res.data.account) {
            var a = $("[data-checkout-done-acct]", done), c = $("[data-checkout-done-cat]", done);
            if (a) a.hidden = false;
            if (c) c.hidden = true;
          }
          window.scrollTo(0, 0);
        } else {
          status.classList.add("is-error");
          status.textContent = String(res.data.error || "something went wrong. try again in a moment.").toLowerCase();
          submitBtn.disabled = false;
          if (res.status === 401 && window.HLIXAccount) window.HLIXAccount.reload();
        }
      })
      .catch(function () {
        status.classList.add("is-error");
        status.textContent = "couldn't reach the server. this only works once the site is deployed.";
        submitBtn.disabled = false;
      });
  });
})();
