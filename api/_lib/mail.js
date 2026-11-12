// Emails to customers, sent through Resend from the hlixlabs.com domain. (The leading
// underscore keeps Vercel from serving this folder as a function.)
//
// Off until CUSTOMER_EMAILS=on is set in the Vercel project: hlixlabs.com has to be a
// verified domain in Resend first, and RESEND_FROM_EMAIL an address on it.
//
// Anyone can type any email address at checkout, so an order confirmation could be
// aimed at a stranger. To keep that from being worth anything to a spammer:
//   - nothing typed into the form goes in the email except a first name that reads
//     as a name (otherwise "there"): no notes, no address, and every product name
//     and price comes from the catalog or the database, never from the browser;
//   - a guest address gets at most one confirmation a day (Resend idempotency key);
//   - /api/order already limits how often one visitor can order.

const crypto = require("crypto");
const catalog = require("../../data/products.json");

const ON = process.env.CUSTOMER_EMAILS === "on";
const FROM = process.env.RESEND_FROM_EMAIL || "hlix <onboarding@resend.dev>";
const REPLY_TO = process.env.REPLY_TO_EMAIL || "contact@hlixlabs.com";
const SITE_URL = (process.env.SITE_URL || "https://hlixlabs.com").replace(/\/+$/, "");
const BY_SKU = new Map(catalog.map((p) => [p.sku, p]));

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function money(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return "$" + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}
function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

// The first word of the name, only if it reads as a name. Digits, dots, links or
// symbols fall back to "there", so the greeting can't carry a URL or a pitch.
function greetingName(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return /^[\p{L}\p{M}][\p{L}\p{M}'’-]{0,29}$/u.test(first) ? first.toLowerCase() : "there";
}

// A line as the customer sees it: the catalog's name and dose for the SKU.
function lineLabel(it) {
  const p = BY_SKU.get(it.sku);
  const name = p ? p.name : it.name; // account orders: it.name comes from the database
  const dose = p ? p.dose : it.dose;
  return [name, dose].filter(Boolean).join(" ");
}
function lineQty(it) {
  if (it.unit === "pack") return it.qty === 1 ? "1 pack of 10" : `${it.qty} packs of 10`;
  return it.qty === 1 ? "1 vial" : `${it.qty} vials`;
}

// items: [{ sku, name, dose, form: "powder" | "recon", unit: "vial" | "pack", qty, unitPrice }]
// pricing: the account's membership pricing, e.g. "family & friends pricing" or
// "gold member pricing (50% off)"; "" for website prices.
function orderConfirmation({ name, items, subtotal, ref, pricing, account }) {
  const hi = greetingName(name);
  const subject = ref ? `your hlix order #${ref}` : "your hlix order request";
  const accountUrl = `${SITE_URL}/account`;
  const lines = items.map((it) => ({
    label: lineLabel(it),
    form: it.form === "powder" ? "powder" : "ready to use",
    qty: lineQty(it),
    total: money(it.unitPrice * it.qty),
  }));

  const text = [
    `hi ${hi},`,
    "",
    `we got your order request${ref ? ` #${ref}` : ""}. here's what's in it:`,
    "",
    ...lines.map((l) => `- ${l.label} (${l.form}), ${l.qty}: ${l.total}`),
    "",
    `subtotal: ${money(subtotal)}${pricing ? ` (${pricing})` : ""}`,
    "",
    "no payment has been taken. we'll reply by email with how to pay and the next steps, usually within 1 to 2 business days.",
    account ? `\nyou can follow it on your account page: ${accountUrl}` : "",
    "",
    `questions? just reply to this email, or write to ${REPLY_TO}.`,
    "",
    "hlix",
    "",
    "research use only. not for human or animal consumption.",
    "you're getting this because this address was used for an order on hlixlabs.com. if that wasn't you, you can ignore it.",
  ].join("\n");

  const row = (l) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e4e4e0;font-size:14px;line-height:1.45;color:#0e0f10">${esc(l.label)}<br><span style="color:#5c6166;font-size:13px">${esc(l.form)} · ${esc(l.qty)}</span></td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #e4e4e0;font-size:14px;color:#0e0f10;white-space:nowrap">${esc(l.total)}</td>
        </tr>`;

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f3">
  <div style="display:none;max-height:0;overflow:hidden">we got your order request${ref ? ` #${esc(ref)}` : ""}. no payment has been taken yet.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f3">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e0;border-radius:14px">
        <tr><td style="padding:28px 28px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
          <div style="font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#0e0f10">hlix<span style="color:#0a7f5d">.</span></div>
        </td></tr>
        <tr><td style="padding:12px 28px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0e0f10">
          <h1 style="margin:0 0 10px;font-size:24px;line-height:1.2;letter-spacing:-0.02em">request received.</h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.55">hi ${esc(hi)}, we got your order request${ref ? ` <b>#${esc(ref)}</b>` : ""}. here's what's in it:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lines.map(row).join("")}
            <tr>
              <td style="padding:12px 0 0;font-size:15px;font-weight:700">subtotal${pricing ? `<br><span style="font-weight:400;color:#5c6166;font-size:13px">${esc(pricing)}</span>` : ""}</td>
              <td align="right" style="padding:12px 0 0;font-size:15px;font-weight:700;white-space:nowrap">${esc(money(subtotal))}</td>
            </tr>
          </table>
          <p style="margin:22px 0 0;padding:14px 16px;border-radius:10px;background:#f5f5f3;font-size:14px;line-height:1.55">no payment has been taken. we'll reply by email with how to pay and the next steps, usually within 1 to 2 business days.</p>
          ${account ? `<p style="margin:22px 0 0"><a href="${esc(accountUrl)}" style="display:inline-block;padding:11px 18px;border-radius:999px;background:#0e0f10;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">see it in your account</a></p>` : ""}
          <p style="margin:22px 0 0;font-size:14px;line-height:1.55">questions? just reply to this email, or write to <a href="mailto:${esc(REPLY_TO)}" style="color:#0a7f5d">${esc(REPLY_TO)}</a>.</p>
        </td></tr>
        <tr><td style="padding:24px 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#5c6166">
          research use only. not for human or animal consumption.<br>
          you're getting this because this address was used for an order on hlixlabs.com. if that wasn't you, you can ignore it.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

// Sends one email through Resend. Never throws: returns { ok, status, why }.
async function send(apiKey, { to, subject, html, text, idempotencyKey, tag }) {
  try {
    const headers = { "content-type": "application/json", authorization: `Bearer ${apiKey}` };
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html, text, tags: tag ? [{ name: "type", value: tag }] : undefined }),
    });
    if (r.ok) return { ok: true, status: r.status };
    let why = "";
    try { const e = await r.json(); why = `${e.name || ""}: ${e.message || ""}`.slice(0, 300); } catch (e) { why = ""; }
    return { ok: false, status: r.status, why };
  } catch (err) {
    return { ok: false, status: 0, why: (err && err.name) || "network error" };
  }
}

// The customer's copy of an order. Account orders: one per order (by its #). Guests:
// at most one a day per address. Logs a failure, never the address or the order.
async function confirmOrder(apiKey, { email, name, items, subtotal, ref, pricing, account }) {
  if (!ON || !apiKey || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""))) return { ok: false, skipped: true };
  const mail = orderConfirmation({ name, items, subtotal, ref, pricing, account });
  const day = new Date().toISOString().slice(0, 10);
  const idempotencyKey = ref ? `hlix/order-confirm/${ref}` : `hlix/order-confirm-guest/${sha256(String(email).toLowerCase())}/${day}`;
  const r = await send(apiKey, { to: email, ...mail, idempotencyKey, tag: "order_confirmation" });
  // 409: this guest address already got one today (or a retry of the same order).
  if (!r.ok && r.status !== 409) console.error("customer confirmation not sent", r.status, r.why);
  return r;
}

module.exports = { ON, confirmOrder, orderConfirmation, greetingName, send };
