// Emails to hlix (NOTIFY_EMAIL) about what customers do on hlixlabs.com. (The leading
// underscore keeps Vercel from serving this folder as a function.)
//
//   accountCreated    someone made an account                        (api/account.js signup)
//   accountDeleted    someone deleted their own account               (api/account.js delete)
//   the cart visit    what a signed-in customer added to their cart on a visit, sent once
//                     the visit is over                (api/account.js, api/order.js, below)
//   paymentReceived   a payment came in. Nothing sends it yet: there's no payment processor.
//                     When one is wired up, its webhook calls alertPaid() once it has checked
//                     the payment is real (README, "Emails to you").
//
// New orders already email hlix from api/order.js.
//
// On whenever RESEND_API_KEY is set; OWNER_ALERTS=off in Vercel turns them all off. They
// reply to the customer, and never hold up or fail what the customer was doing.
//
// The cart email waits for the visit to end. A browser can't reliably say when someone
// leaves (closing a tab on a phone often sends nothing, and opening another page of the
// site looks the same as leaving), so the email is held in Resend (scheduled) and goes out
// once the customer has been quiet for 15 minutes: every page they open and every cart
// change pushes it back, and leaving the site (closing the tab, switching to another app or
// tab) brings it forward to 3 minutes. Placing an order cancels it (the order email says it
// all), and so does deleting the account. What's pending lives in an HttpOnly cookie on
// their browser: the held email's id, when it's due, their name, and their cart as the
// visit began (so the email says what they added, not what was already there). Guests'
// carts stay in their browser, so there's nothing to send for them.

const crypto = require("crypto");
const M = require("./mail");
const S = require("./session");

const NOTIFY = process.env.NOTIFY_EMAIL || "henrymm@gmail.com";
const ADMIN_URL = (process.env.ADMIN_URL || "https://admin.hlixlabs.com").replace(/\/+$/, "");
const IDLE = 15 * 60; // seconds of quiet that end a visit
const AWAY = 3 * 60; // ... once they've left the site
const VISIT = "__Host-hlix_cv"; // the visit (HttpOnly)
const HELD = "hlix_cv"; // "1" while a cart email is held: pages then say when they're left
const UUID = /^[0-9a-f-]{36}$/i;

const key = () => process.env.RESEND_API_KEY || "";
const on = () => process.env.OWNER_ALERTS !== "off" && !!key();
const nowS = () => Math.floor(Date.now() / 1000);
const iso = (s) => new Date(s * 1000).toISOString();
const { esc, money } = M;
const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, n);

// ------------------------------------------------------------------ emails ---

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
function page(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:24px 16px;background:#f5f5f3;font-family:${FONT};color:#0e0f10">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e0;border-radius:12px;padding:24px">
    <h2 style="margin:0 0 14px;font-size:20px;letter-spacing:-0.01em">${esc(title)}</h2>
    ${body}
  </div>
</body></html>`;
}
const p = (html) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${html}</p>`;
const muted = (html) => `<p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:#5c6166">${html}</p>`;
const button = (href, label) => `<p style="margin:18px 0 0"><a href="${esc(href)}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#0e0f10;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">${esc(label)}</a></p>`;
const who = (name, email) => (name ? `<b>${esc(name)}</b><br>` : "") + `<a href="mailto:${esc(email)}" style="color:#0a7f5d">${esc(email)}</a>`;
const userUrl = (id) => (UUID.test(String(id || "")) ? `${ADMIN_URL}/#/users/${id}` : `${ADMIN_URL}/#/users`);
const TIER = { regular: "website prices", silver: "silver member (25% off)", gold: "gold member (50% off)", family: "family & friends" };

function accountCreated({ name, email, userId, confirm }) {
  const nm = clip(name, 120), mail = clip(email, 254);
  const subject = `hlix: new account, ${nm || mail}`;
  const later = confirm ? "They still have to open the link in the confirm-email message before they can sign in." : "";
  return {
    subject,
    html: page("New account on hlixlabs.com", p(who(nm, mail)) + (later ? p(esc(later)) : "") + button(userUrl(userId), "See them in the admin")),
    text: [`New account on hlixlabs.com`, "", nm, mail, later ? `\n${later}` : "", "", userUrl(userId)].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
  };
}

function accountDeleted({ name, email, orders, tier }) {
  const nm = clip(name, 120), mail = clip(email, 254), n = Math.max(0, Number(orders) | 0);
  const subject = `hlix: account deleted, ${nm || mail}`;
  const kept = n ? `Their ${n === 1 ? "order stays" : `${n} orders stay`} in the admin with everything on ${n === 1 ? "it" : "them"}, and so does their client.` : "They had no orders. Their client, if they had one, stays in the admin.";
  const lines = [
    "They deleted their own account on hlixlabs.com: their login, saved address, cart and membership are gone.",
    kept,
    tier && tier !== "regular" && TIER[tier] ? `Their membership was ${TIER[tier]}.` : "",
    "The same email can sign up again as a new account.",
  ].filter(Boolean);
  return {
    subject,
    html: page("A customer deleted their account", p(who(nm, mail)) + lines.map((l) => p(esc(l))).join("") + button(`${ADMIN_URL}/#/users`, "Open Users")),
    text: ["A customer deleted their account", "", nm, mail, "", ...lines, "", `${ADMIN_URL}/#/users`].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
  };
}

const formOf = (it) => (it.form === "powder" ? "powder" : "ready to use");
const unitOf = (it) => (it.unit === "pack" ? "pack" : "vial");
function cartTable(lines) {
  const rows = lines.map((it) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e4e4e0;font-size:14px;line-height:1.4">${esc(M.lineLabel(it))}<br><span style="color:#5c6166;font-size:13px">${esc(formOf(it))} · ${esc(M.lineQty(it))}</span></td>
        <td align="right" style="padding:8px 0;border-bottom:1px solid #e4e4e0;font-size:14px;white-space:nowrap">${Number.isFinite(it.unitPrice) ? esc(money(it.unitPrice * it.qty)) : ""}</td>
      </tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px">${rows}</table>`;
}
const textLines = (lines) => lines.map((it) => `- ${M.lineLabel(it)} (${formOf(it)}), ${M.lineQty(it)}${Number.isFinite(it.unitPrice) ? `: ${money(it.unitPrice * it.qty)}` : ""}`);
const subtotal = (lines) => lines.reduce((s, it) => s + (Number.isFinite(it.unitPrice) ? it.unitPrice * it.qty : 0), 0);

// added: what they put in on this visit (the extra amount, for a line they already had).
function cartVisit({ name, email, userId, added, cart }) {
  const nm = clip(name, 120), mail = clip(email, 254);
  const count = added.reduce((s, it) => s + it.qty, 0);
  const subject = `hlix: ${nm || mail} added ${count === 1 ? "1 item" : `${count} items`} to their cart`;
  const total = subtotal(cart);
  const note = "No order yet. Prices are what the site showed them (with any membership discount).";
  return {
    subject,
    html: page("Cart activity on hlixlabs.com", p(who(nm, mail)) + p("Added on this visit:") + cartTable(added)
      + p("<b>Their cart now</b>") + cartTable(cart)
      + (total ? p(`<b>Subtotal: ${esc(money(total))}</b>`) : "")
      + muted(esc(note)) + button(userUrl(userId), "See them in the admin")),
    text: ["Cart activity on hlixlabs.com", "", nm, mail, "", "Added on this visit:", ...textLines(added), "", "Their cart now:", ...textLines(cart),
      total ? `Subtotal: ${money(total)}` : "", "", note, "", userUrl(userId)].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
  };
}

// For a payment processor's webhook, once it has verified the payment. amount: this
// payment; total: the order's total; paid: everything paid on it so far, this included.
function paymentReceived({ ref, name, email, amount, total, paid, method, txn }) {
  const nm = clip(name, 120), mail = clip(email, 254), r = clip(ref, 40), how = clip(method, 60), id = clip(txn, 120);
  const amt = Number(amount) || 0, tot = Number(total), sofar = Number(paid);
  const subject = `hlix: payment received${r ? `, order #${r}` : ""}, ${money(amt)}`;
  const left = Number.isFinite(tot) && Number.isFinite(sofar) ? (sofar >= tot - 0.005 ? "Paid in full." : `${money(sofar)} of ${money(tot)} paid, ${money(tot - sofar)} to go.`) : "";
  const lines = [
    `${money(amt)}${how ? ` by ${how}` : ""}${r ? ` for order #${r}` : ""}.`,
    left,
    id ? `Transaction: ${id}` : "",
  ].filter(Boolean);
  return {
    subject,
    html: page("Payment received", (nm || mail ? p(who(nm, mail)) : "") + lines.map((l) => p(esc(l))).join("") + button(`${ADMIN_URL}/#/orders`, "Open Orders")),
    text: ["Payment received", "", nm, mail, "", ...lines, "", `${ADMIN_URL}/#/orders`].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
  };
}

// Send one to hlix. Never throws; logs a failure without who it was about.
async function alert(kind, mail, opts = {}) {
  if (!on()) return { ok: false, skipped: true };
  const r = await M.send(key(), { to: NOTIFY, ...mail, tag: `alert_${kind}`, replyTo: opts.replyTo, idempotencyKey: opts.idempotencyKey, scheduledAt: opts.scheduledAt });
  if (!r.ok && r.status !== 409) console.error(`alert ${kind} not sent`, r.status, r.why);
  return r;
}
const day = () => new Date().toISOString().slice(0, 10);
const hash = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 32);
const replyTo = (email) => (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(email || "")) ? String(email) : undefined);

function created(info) {
  return alert("account_created", accountCreated(info), { replyTo: replyTo(info.email), idempotencyKey: `hlix/alert-signup/${hash(String(info.email).toLowerCase())}/${day()}` });
}
function deleted(info) {
  return alert("account_deleted", accountDeleted(info), { replyTo: replyTo(info.email), idempotencyKey: `hlix/alert-deleted/${hash(String(info.email).toLowerCase())}/${day()}` });
}
// txn: the processor's id for the payment, so a webhook retried for the same payment
// sends one email.
function alertPaid(info) {
  return alert("payment", paymentReceived(info), { replyTo: replyTo(info.email), idempotencyKey: info.txn ? `hlix/alert-paid/${hash(info.txn)}` : undefined });
}

// ------------------------------------------------------------- cart visits ---

const lineKey = (it) => `${it.sku}~${it.form === "powder" ? "p" : "r"}~${it.unit === "pack" ? "p" : "v"}`;
function amounts(cart) {
  const m = new Map();
  for (const it of Array.isArray(cart) ? cart : []) {
    if (!it || typeof it.sku !== "string" || !it.sku) continue;
    const q = Math.max(0, Math.min(999, Number(it.qty) | 0));
    m.set(lineKey(it), (m.get(lineKey(it)) || 0) + q);
  }
  return m;
}
// What's in `cart` beyond `before` (a Map from amounts()): new lines, and the extra on
// lines whose amount went up.
function addedLines(before, cart) {
  const out = [];
  for (const it of Array.isArray(cart) ? cart : []) {
    if (!it || typeof it.sku !== "string" || !it.sku) continue;
    const extra = (Number(it.qty) | 0) - (before.get(lineKey(it)) || 0);
    if (extra > 0) out.push({ ...it, qty: extra });
  }
  return out;
}

function readVisit(req, userId) {
  const raw = S.cookies(req)[VISIT];
  if (!raw || raw.length > 3500 || !userId) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!v || v.u !== userId || !Array.isArray(v.b) || v.b.length > 60) return null;
    if (v.id !== null && !UUID.test(String(v.id))) return null;
    const b = new Map();
    for (const e of v.b) {
      const m = /^(.{1,40})~([pr])~([pv])~(\d{1,3})$/.exec(String(e));
      if (m) b.set(`${m[1]}~${m[2]}~${m[3]}`, Number(m[4]));
    }
    return { u: v.u, id: v.id, at: Number(v.at) || 0, h: String(v.h || "").slice(0, 32), n: clip(v.n, 120), b };
  } catch (e) {
    return null;
  }
}
function writeVisit(res, v) {
  if (!v) {
    S.setCookie(res, VISIT, "", 0);
    S.setCookie(res, HELD, "", 0, false);
    return;
  }
  const b = [...v.b].slice(0, 50).map(([k, q]) => `${k}~${q}`);
  const raw = Buffer.from(JSON.stringify({ u: v.u, id: v.id, at: v.at, h: v.h, n: v.n, b })).toString("base64url");
  S.setCookie(res, VISIT, raw, 6 * 60 * 60);
  const left = v.id ? v.at - nowS() : 0;
  S.setCookie(res, HELD, left > 0 ? "1" : "", left > 0 ? left + 60 : 0, false);
}

// The visit this browser is on, if it's still going (its email not sent yet).
function liveVisit(req, token) {
  const v = readVisit(req, String(S.claims(token).sub || ""));
  return v && !(v.id && v.at <= nowS()) ? v : null;
}
// Before saving a cart: true when this save starts a visit, so the caller has to read the
// cart as it is now (cartSaved's `before`) first.
function startsVisit(req, token) {
  return on() && !liveVisit(req, token);
}

// After a signed-in customer's cart is saved. before: { cart, name } as they were before
// this save, when startsVisit() said so.
async function cartSaved(req, res, { token, cart, before }) {
  if (!on()) return;
  const c = S.claims(token);
  const userId = String(c.sub || ""), email = clip(c.email, 254);
  if (!UUID.test(userId)) return;
  const now = nowS();
  let v = liveVisit(req, token);
  if (!v) {
    if (!before) return; // can't tell what was already there, so say nothing rather than guess
    v = { u: userId, id: null, at: 0, h: "", n: clip(before.name, 120), b: amounts(before.cart) };
  }
  const added = addedLines(v.b, cart);
  const h = added.length ? hash(JSON.stringify([added, cart].map((l) => l.map((it) => [lineKey(it), it.qty, it.unitPrice])))) : "";
  if (v.id && h && h === v.h) {
    // Same email as the one held: just give it the full quiet time again.
    const r = await M.reschedule(key(), v.id, iso(now + IDLE));
    if (r.ok) v.at = now + IDLE;
  } else {
    if (v.id) await M.cancel(key(), v.id);
    v.id = null; v.at = 0; v.h = "";
    if (added.length) {
      const r = await alert("cart", cartVisit({ name: v.n, email, userId, added, cart }), { replyTo: replyTo(email), scheduledAt: iso(now + IDLE) });
      if (r.ok && r.id) { v.id = r.id; v.at = now + IDLE; v.h = h; }
    }
  }
  writeVisit(res, v);
}

// They opened a page (or came back to the site): the visit goes on. away: they left the
// site, so it ends in 3 minutes unless they come back.
async function cartPresence(req, res, token, away) {
  if (!on() || !S.cookies(req)[VISIT]) return;
  const v = readVisit(req, String(S.claims(token).sub || ""));
  if (!v || !v.id) return;
  const now = nowS();
  if (v.at <= now) return writeVisit(res, { ...v, id: null, at: 0, h: "" });
  const want = now + (away ? AWAY : IDLE);
  // Leaving only brings it forward; a page only pushes it back (by 2 minutes or more, to
  // keep the calls to Resend down).
  if (away ? want >= v.at : want - v.at < 120) return;
  const r = await M.reschedule(key(), v.id, iso(want));
  if (r.ok) v.at = want;
  else if (r.status >= 400 && r.status < 500 && r.status !== 429) { v.id = null; v.at = 0; v.h = ""; } // already sent or gone
  writeVisit(res, v);
}

// The visit is over. cancel: they ordered or deleted the account (that email says it all),
// so the held one never goes; otherwise (signing out) it goes in 3 minutes.
async function cartEnd(req, res, token, cancel) {
  if (!on() || !S.cookies(req)[VISIT]) return;
  const v = readVisit(req, String(S.claims(token).sub || ""));
  if (v && v.id && v.at > nowS()) {
    if (cancel) await M.cancel(key(), v.id);
    else if (v.at > nowS() + AWAY) await M.reschedule(key(), v.id, iso(nowS() + AWAY));
  }
  writeVisit(res, null);
}

module.exports = {
  created, deleted, alertPaid, startsVisit, cartSaved, cartPresence, cartEnd,
  accountCreated, accountDeleted, cartVisit, paymentReceived, addedLines, amounts,
  IDLE, AWAY,
};
