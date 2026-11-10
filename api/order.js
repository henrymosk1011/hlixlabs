// Vercel serverless function — places an order *request* from the checkout
// page. There is no payment processor wired up, matching the site's "request
// first, payment follows by email" checkout flow.
//
// Signed in (an account on the site, see api/account.js): the order goes
// straight into the hlix admin as a pending Customer Order, priced by the
// database (shop_place_order in the admin's migration 0026), and hlix is also
// emailed. As a guest: the request is emailed to hlix, as before.
//
// Requires a RESEND_API_KEY environment variable set in the deployment's
// project settings — never commit a real key to this repo. Optionally set
// NOTIFY_EMAIL (where orders are delivered) and RESEND_FROM_EMAIL (the
// "from" address — must be on a domain verified in Resend, otherwise leave
// it on the resend.dev sandbox sender below).
//
// With CUSTOMER_EMAILS=on, the customer also gets a confirmation (api/_lib/mail.js):
// an account's order once it's saved, a guest's once hlix's copy has gone out.

const { getPrices, unitPrice } = require("./_lib/prices");
const S = require("./_lib/session");
const M = require("./_lib/mail");

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || "henrymm@gmail.com";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "hlix <onboarding@resend.dev>";

const MAX_LEN = 300;
const MAX_ITEMS = 50;
const MAX_NOTES = 2000;

const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function str(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
// Website prices are whole dollars; family & friends prices (your cost) can have cents.
function money(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return "$" + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  // Only from a page on this site (another site can't place orders in someone's name).
  if (!S.sameSite(req)) {
    res.status(403).json({ error: "Not allowed." });
    return;
  }

  const ip = S.clientIp(req);
  const now = Date.now();
  const record = hits.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + WINDOW_MS;
  }
  record.count += 1;
  hits.set(ip, record);
  if (record.count > MAX_PER_WINDOW) {
    res.status(429).json({ error: "Too many requests. Try again in a bit." });
    return;
  }

  const body = S.body(req);
  const c = body.customer && typeof body.customer === "object" ? body.customer : {};
  const customer = {
    name: str(c.name, MAX_LEN),
    email: str(c.email, MAX_LEN),
    phone: str(c.phone, 40),
    address1: str(c.address1, MAX_LEN),
    address2: str(c.address2, MAX_LEN),
    city: str(c.city, MAX_LEN),
    state: str(c.state, MAX_LEN),
    zip: str(c.zip, MAX_LEN),
    country: str(c.country, MAX_LEN),
    notes: str(c.notes, MAX_NOTES),
  };
  const token = await S.session(req, res);
  if (!customer.name || (!token && !customer.email) || !customer.address1 || !customer.city || !customer.state || !customer.zip || !customer.country) {
    res.status(400).json({ error: "Please fill in every required field." });
    return;
  }
  if (!token && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    res.status(400).json({ error: "That email address doesn't look right." });
    return;
  }

  const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const items = rawItems
    .map((it) => ({
      name: str(it && it.name, MAX_LEN),
      dose: str(it && it.dose, MAX_LEN),
      form: str(it && it.form, 20),
      unit: it && it.unit === "pack" ? "pack" : "vial",
      sku: str(it && it.sku, MAX_LEN),
      qty: Math.max(1, Math.min(999, parseInt(it && it.qty, 10) || 0)),
    }))
    .filter((it) => it.name && it.qty > 0);
  if (!items.length) {
    res.status(400).json({ error: "Your cart is empty." });
    return;
  }

  // Packs of 10 are only for signed-in family & friends accounts (the database checks).
  if (!token && items.some((it) => it.unit === "pack")) {
    res.status(400).json({ error: "Packs of 10 are for family & friends accounts. Sign in, or order by the vial." });
    return;
  }

  // Signed in: the database places it (and prices it), then hlix gets the email.
  let placed = null;
  if (token) {
    const r = await S.rpc("shop_place_order", {
      p: {
        items: items.map((it) => ({ sku: it.sku, form: it.form === "powder" ? "powder" : "recon", unit: it.unit, qty: it.qty })),
        ship: {
          name: customer.name, phone: customer.phone, address1: customer.address1, address2: customer.address2,
          city: customer.city, state: customer.state, zip: customer.zip, country: customer.country,
        },
        notes: customer.notes,
        save: body.save === true,
      },
    }, token);
    if (!r.ok || !r.data) {
      const status = r.status === 401 || r.status === 403 ? 401 : r.status === 503 ? 503 : 400;
      res.status(status).json({ error: status === 401 ? "Sign in again, then place your order." : S.friendly(r, "Your order couldn't be placed. Try again in a moment.") });
      return;
    }
    placed = r.data;
    if (placed.duplicate) {
      res.status(200).json({ ok: true, account: true, ref: placed.ref });
      return;
    }
    customer.email = String(placed.email || "");
    items.length = 0;
    for (const it of placed.items || []) {
      items.push({ name: str(it.name, MAX_LEN), dose: str(it.dose, MAX_LEN), form: it.form === "powder" ? "powder" : "recon", unit: it.unit === "pack" ? "pack" : "vial", sku: str(it.sku, MAX_LEN), qty: Number(it.qty) || 0, unitPrice: Number(it.price) || 0 });
    }
  }

  // Price every line from the current catalog (the admin's prices), never
  // from what the browser sent: a cart can be days old, and the request can
  // be edited.
  const { prices } = await getPrices();
  if (!placed) {
    if (items.some((it) => !prices.has(it.sku))) {
      res.status(400).json({ error: "Something in your cart is no longer in the catalog. Remove it and try again." });
      return;
    }
    for (const it of items) it.unitPrice = unitPrice(prices.get(it.sku), it.form);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // An account's order is already saved in the admin; only the email is missing.
    if (placed) {
      console.error("Order", placed.ref, "saved, but RESEND_API_KEY is missing so no email was sent");
      res.status(200).json({ ok: true, account: true, ref: placed.ref });
      return;
    }
    res.status(500).json({ error: "Server is not configured (missing API key)." });
    return;
  }

  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
  const itemRows = items
    .map((it) => `<tr><td>${esc(it.name)}</td><td>${esc(it.dose)}</td><td>${it.form === "recon" ? "ready to use" : "powder"}</td><td>${esc(it.sku)}</td><td>${it.qty}${it.unit === "pack" ? (it.qty === 1 ? " pack of 10" : " packs of 10") : ""}</td><td>${money(it.unitPrice * it.qty)}</td></tr>`)
    .join("");
  const html = `
    <h2>${placed ? `New website order #${esc(placed.ref)}` : "New order request"}</h2>
    ${placed ? "<p>Placed by a signed-in account. It's in the admin under Customer Orders (pending).</p>" : ""}
    ${placed && placed.family ? "<p><strong>Family &amp; friends pricing</strong> (your cost).</p>" : ""}
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><th align="left">item</th><th align="left">dose</th><th align="left">form</th><th align="left">sku</th><th align="left">qty</th><th align="left">line total</th></tr>
      ${itemRows}
    </table>
    <p><strong>subtotal:</strong> ${money(subtotal)}</p>
    <h3>customer</h3>
    <p>${esc(customer.name)}<br>${esc(customer.email)}${customer.phone ? "<br>" + esc(customer.phone) : ""}</p>
    <p>${esc(customer.address1)}${customer.address2 ? "<br>" + esc(customer.address2) : ""}<br>${esc(customer.city)}, ${esc(customer.state)} ${esc(customer.zip)}<br>${esc(customer.country)}</p>
    ${customer.notes ? `<h3>notes</h3><p>${esc(customer.notes).replace(/\n/g, "<br>")}</p>` : ""}
    <p style="color:#888">No payment was collected. Follow up with the customer to arrange payment.</p>
  `;

  // The customer's own copy (only when CUSTOMER_EMAILS=on; never fails the order).
  const confirm = () => M.confirmOrder(apiKey, {
    email: customer.email, name: customer.name, items, subtotal,
    ref: placed ? placed.ref : null, family: !!(placed && placed.family), account: !!placed,
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [NOTIFY_EMAIL],
        reply_to: customer.email || undefined,
        subject: `hlix ${placed ? `order #${placed.ref}` : "order request"} — ${customer.name} — ${money(subtotal)}`,
        html,
      }),
    });

    if (!response.ok) {
      // Resend's own reason (e.g. "The hlixlabs.com domain is not verified"), without the email itself.
      let why = "";
      try { const e = await response.json(); why = `${e.name || ""}: ${e.message || ""}`.slice(0, 300); } catch (e) { why = ""; }
      console.error("Resend API error", response.status, why);
      if (placed) {
        await confirm();
        return void res.status(200).json({ ok: true, account: true, ref: placed.ref });
      }
      res.status(502).json({ error: "Upstream error." });
      return;
    }

    await confirm();
    res.status(200).json(placed ? { ok: true, account: true, ref: placed.ref } : { ok: true });
  } catch (err) {
    console.error("order email failed", err && err.name);
    if (placed) {
      await confirm();
      return void res.status(200).json({ ok: true, account: true, ref: placed.ref });
    }
    res.status(500).json({ error: "Something went wrong." });
  }
};
