// Vercel serverless function — emails an order *request* via Resend when a
// guest submits the checkout page. There is no payment processor wired up:
// this only records the request and notifies hlix, matching the site's
// "request first, payment follows by email" checkout flow.
//
// Requires a RESEND_API_KEY environment variable set in the deployment's
// project settings — never commit a real key to this repo. Optionally set
// NOTIFY_EMAIL (where orders are delivered) and RESEND_FROM_EMAIL (the
// "from" address — must be on a domain verified in Resend, otherwise leave
// it on the resend.dev sandbox sender below).

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
function money(n) {
  return "$" + Math.ceil(Number(n) - 1e-9);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
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

  const body = req.body || {};
  const c = body.customer || {};
  const customer = {
    name: str(c.name, MAX_LEN),
    email: str(c.email, MAX_LEN),
    address1: str(c.address1, MAX_LEN),
    address2: str(c.address2, MAX_LEN),
    city: str(c.city, MAX_LEN),
    state: str(c.state, MAX_LEN),
    zip: str(c.zip, MAX_LEN),
    country: str(c.country, MAX_LEN),
    notes: str(c.notes, MAX_NOTES),
  };
  if (!customer.name || !customer.email || !customer.address1 || !customer.city || !customer.state || !customer.zip || !customer.country) {
    res.status(400).json({ error: "Please fill in every required field." });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    res.status(400).json({ error: "That email address doesn't look right." });
    return;
  }

  const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const items = rawItems
    .map((it) => ({
      name: str(it && it.name, MAX_LEN),
      dose: str(it && it.dose, MAX_LEN),
      form: str(it && it.form, 20),
      sku: str(it && it.sku, MAX_LEN),
      qty: Math.max(1, Math.min(999, parseInt(it && it.qty, 10) || 0)),
      unitPrice: Math.max(0, Number(it && it.unitPrice) || 0),
    }))
    .filter((it) => it.name && it.qty > 0);
  if (!items.length) {
    res.status(400).json({ error: "Your cart is empty." });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is not configured (missing API key)." });
    return;
  }

  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
  const itemRows = items
    .map((it) => `<tr><td>${esc(it.name)}</td><td>${esc(it.dose)}</td><td>${it.form === "recon" ? "ready to use" : "powder"}</td><td>${esc(it.sku)}</td><td>${it.qty}</td><td>${money(it.unitPrice * it.qty)}</td></tr>`)
    .join("");
  const html = `
    <h2>New order request</h2>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><th align="left">item</th><th align="left">dose</th><th align="left">form</th><th align="left">sku</th><th align="left">qty</th><th align="left">line total</th></tr>
      ${itemRows}
    </table>
    <p><strong>subtotal:</strong> ${money(subtotal)}</p>
    <h3>customer</h3>
    <p>${esc(customer.name)}<br>${esc(customer.email)}</p>
    <p>${esc(customer.address1)}${customer.address2 ? "<br>" + esc(customer.address2) : ""}<br>${esc(customer.city)}, ${esc(customer.state)} ${esc(customer.zip)}<br>${esc(customer.country)}</p>
    ${customer.notes ? `<h3>notes</h3><p>${esc(customer.notes).replace(/\n/g, "<br>")}</p>` : ""}
    <p style="color:#888">No payment was collected. Follow up with the customer to arrange payment.</p>
  `;

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
        reply_to: customer.email,
        subject: `hlix order request — ${customer.name} — ${money(subtotal)}`,
        html,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Resend API error", response.status, errText);
      res.status(502).json({ error: "Upstream error." });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong." });
  }
};
