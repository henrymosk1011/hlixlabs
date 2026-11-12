// Tests for api/account.js and api/_lib/alerts.js, with Supabase and Resend faked.
// Run: npm test   (node --test tests/*.test.js)

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.RESEND_API_KEY = "re_test_key";
process.env.NOTIFY_EMAIL = "owner@example.com";
process.env.ACCOUNT_EMAILS = "on";
delete process.env.OWNER_ALERTS;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowS = () => Math.floor(Date.now() / 1000);
const USER = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
function jwt(claims) {
  return `${b64({ alg: "HS256" })}.${b64({ sub: USER, email: "jane@example.com", exp: nowS() + 3600, ...claims })}.c2lnbmF0dXJlLXNpZ25hdHVyZQ`;
}

// ------------------------------------------------------------ fake servers ---
let db, calls, resendSent, nextId;
function reset() {
  db = {
    cart: [{ sku: "HLX-BC5", form: "powder", unit: "vial", qty: 1, name: "BPC 157", dose: "5mg", unitPrice: 30 }],
    profile: { name: "Jane Doe", phone: "", address1: "", address2: "", city: "", state: "", zip: "", country: "" },
    signup: null, // response to /auth/v1/signup
    metadata: {},
    savedProfile: null,
    deleted: false,
    visitOpen: false,
    visitEvents: [],
  };
  calls = [];
  resendSent = [];
  nextId = 1;
}
const reply = (status, data) => ({ ok: status < 300, status, text: async () => (data === undefined ? "" : JSON.stringify(data)), json: async () => data });
global.fetch = async (url, opt = {}) => {
  url = String(url);
  const method = opt.method || "GET";
  const body = opt.body ? JSON.parse(opt.body) : undefined;
  const auth = String((opt.headers || {}).authorization || "");
  calls.push({ url, method, body, auth, headers: opt.headers || {} });
  if (url.startsWith("https://api.resend.com")) {
    if (method === "POST" && /\/emails$/.test(url)) {
      const id = `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
      resendSent.push({ id, ...body, idem: (opt.headers || {})["idempotency-key"] });
      return reply(200, { id });
    }
    if (method === "PATCH") return reply(200, { object: "email", id: url.split("/").pop() });
    if (/\/cancel$/.test(url)) return reply(200, { object: "email", id: url.split("/")[4] });
    return reply(404, { name: "not_found", message: "?" });
  }
  if (/\/auth\/v1\/signup/.test(url)) return reply(200, db.signup);
  if (/\/auth\/v1\/user$/.test(url) && method === "GET") return reply(200, { id: USER, email: "jane@example.com", user_metadata: db.metadata });
  if (/\/auth\/v1\/user$/.test(url) && method === "PUT") return reply(200, {});
  if (/grant_type=password/.test(url)) {
    if (body.password !== "right-password-1") return reply(400, { error_code: "invalid_credentials" });
    return reply(200, { access_token: jwt({ amr: [{ method: "password", timestamp: nowS() }] }), refresh_token: "fresh-refresh-1" });
  }
  if (/\/auth\/v1\/logout/.test(url)) return reply(204);
  const rpc = (/\/rpc\/([a-z_]+)/.exec(url) || [])[1];
  if (rpc === "am_admin") return reply(200, false);
  if (rpc === "shop_me") return reply(200, { email: "jane@example.com", profile: db.profile, cart: db.cart, orders: [], tier: "regular" });
  if (rpc === "shop_save_cart") { db.cart = body.p_cart; return reply(200, null); }
  if (rpc === "shop_save_profile") { db.savedProfile = body.p; return reply(200, null); }
  if (rpc === "shop_delete_account") { db.deleted = true; return reply(200, { email: "jane@example.com", name: "Jane Doe", orders: 2, tier: "gold" }); }
  if (rpc === "shop_password_changed") return reply(200, null);
  if (rpc === "shop_cart_visit") {
    db.visitEvents.push(body.p_event);
    if (body.p_event === "cart") db.visitOpen = true;
    if (body.p_event === "end") db.visitOpen = false;
    return reply(200, db.visitOpen);
  }
  return reply(404, {});
};

const account = require("../api/account.js");
const A = require("../api/_lib/alerts.js");

// ----------------------------------------------------------- request kit ---
let ipN = 0;
function call(method, body, jar = {}) {
  return new Promise((resolve) => {
    const headers = {};
    let status = 0;
    const res = {
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      getHeader: (k) => headers[k.toLowerCase()],
      status(s) { status = s; return this; },
      json(d) {
        const set = [].concat(headers["set-cookie"] || []);
        for (const c of set) {
          const [nv] = c.split(";");
          const i = nv.indexOf("=");
          const v = nv.slice(i + 1);
          if (v === "" || /Max-Age=0\b/.test(c)) delete jar[nv.slice(0, i)];
          else jar[nv.slice(0, i)] = v;
        }
        resolve({ status, data: d, jar, set });
      },
    };
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    account({
      method,
      body,
      headers: { host: "hlixlabs.com", origin: "https://hlixlabs.com", "sec-fetch-site": "same-origin", "content-type": "application/json", cookie, "x-real-ip": `10.1.0.${ipN++ % 250}` },
    }, res);
  });
}
const signedIn = (claims) => ({ "__Host-hlix_at": jwt(claims), "__Host-hlix_rt": "refresh-token-1", hlix_in: "1" });
const line = (sku, qty, extra = {}) => ({ sku, form: "powder", unit: "vial", qty, name: sku, dose: "", unitPrice: 50, ...extra });
const resendCalls = () => calls.filter((c) => c.url.startsWith("https://api.resend.com"));

// ----------------------------------------------------------------- tests ---

test("sign-up: tells hlix about the new account, and keeps the typed name with the login", async () => {
  reset();
  db.signup = { id: USER, email: "jane@example.com", identities: [{ id: "x" }] };
  const r = await call("POST", { action: "signup", email: "Jane@Example.com", password: "a-good-password-1", name: "Jane <b>Doe</b>" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true, confirm: true });
  const signup = calls.find((c) => /\/auth\/v1\/signup/.test(c.url));
  assert.deepEqual(signup.body.data, { name: "Jane <b>Doe</b>" });
  assert.equal(resendSent.length, 1);
  const m = resendSent[0];
  assert.deepEqual(m.to, ["owner@example.com"]);
  assert.equal(m.reply_to, "jane@example.com");
  assert.equal(m.subject, "hlix: new account, Jane <b>Doe</b>");
  assert.match(m.html, /Jane &lt;b&gt;Doe&lt;\/b&gt;/);
  assert.doesNotMatch(m.html, /<b>Doe<\/b>/);
  assert.match(m.html, /confirm-email/);
  assert.match(m.html, new RegExp(`#/users/${USER}`));
  assert.match(m.idem, /^hlix\/alert-signup\//);
});

test("sign-up with an email that already has an account: no 'new account' email", async () => {
  reset();
  db.signup = { id: OTHER, email: "jane@example.com", identities: [] };
  const r = await call("POST", { action: "signup", email: "jane@example.com", password: "a-good-password-1", name: "Jane" });
  assert.equal(r.status, 200);
  assert.equal(resendSent.length, 0);
});

test("OWNER_ALERTS=off: nothing goes to hlix, and no visits are kept", async () => {
  reset();
  process.env.OWNER_ALERTS = "off";
  db.signup = { id: USER, email: "jane@example.com", identities: [{ id: "x" }] };
  await call("POST", { action: "signup", email: "jane@example.com", password: "a-good-password-1", name: "Jane" });
  const r = await call("POST", { action: "cart", cart: [line("HLX-RT10", 2)] }, signedIn());
  assert.equal(r.status, 200);
  assert.equal(resendCalls().length, 0);
  assert.equal(db.visitEvents.length, 0);
  delete process.env.OWNER_ALERTS;
});

test("cart visit: opened before the cart is saved, kept going by pages, ended by leaving", async () => {
  reset();
  const jar = signedIn();
  // a page before they've added anything: no visit, so nothing to tell
  await call("GET", undefined, jar);
  assert.deepEqual(db.visitEvents, []);

  await call("POST", { action: "cart", cart: [db.cart[0], line("HLX-RT10", 2)] }, jar);
  const order = calls.filter((c) => /rpc\/shop_(cart_visit|save_cart)/.test(c.url)).map((c) => c.url.split("/").pop());
  assert.deepEqual(order, ["shop_cart_visit", "shop_save_cart"], "the visit starts with the cart as it was");
  assert.deepEqual(db.visitEvents, ["cart"]);
  assert.equal(jar.hlix_cv, "1", "pages know a visit is open");
  assert.equal(resendCalls().length, 0, "no email while the visit goes on");

  await call("GET", undefined, jar);
  await call("POST", { action: "presence", away: true }, jar);
  await call("POST", { action: "presence", away: false }, jar);
  assert.deepEqual(db.visitEvents, ["cart", "seen", "away", "seen"]);

  // the database closed it (sent): the next page finds no visit and stops reporting
  db.visitOpen = false;
  await call("GET", undefined, jar);
  assert.equal(jar.hlix_cv, undefined);
  db.visitEvents.length = 0;
  await call("GET", undefined, jar);
  assert.deepEqual(db.visitEvents, [], "nothing more to report");
});

test("cart visit: signing out ends it in 3 minutes; an order ends it with no email", async () => {
  reset();
  let jar = signedIn();
  await call("POST", { action: "cart", cart: [line("HLX-RT10", 1)] }, jar);
  await call("POST", { action: "signout" }, jar);
  assert.deepEqual(db.visitEvents, ["cart", "away"]);
  assert.equal(jar.hlix_cv, undefined);

  // what api/order.js does once an account order is placed
  reset();
  jar = signedIn();
  await call("POST", { action: "cart", cart: [line("HLX-RT10", 1)] }, jar);
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, getHeader: (k) => headers[k.toLowerCase()] };
  await A.visit({ headers: { cookie: "hlix_cv=1" } }, res, jar["__Host-hlix_at"], "end");
  assert.deepEqual(db.visitEvents, ["cart", "end"]);
  assert.ok([].concat(headers["set-cookie"]).some((c) => /^hlix_cv=;/.test(c)));
});

// ------------------------------------------------------------ /api/alerts ---
const alertsApi = require("../api/alerts.js");
function postAlerts(body, authorization) {
  return new Promise((resolve) => {
    let status = 0;
    const res = { setHeader() {}, getHeader() {}, status(s) { status = s; return this; }, json(d) { resolve({ status, data: d }); } };
    alertsApi({ method: "POST", body, headers: authorization ? { authorization } : {} }, res);
  });
}
const SECRET = "a".repeat(64);
// As the database posts them (0035): each line with your cost and their price per unit.
const visitRow = (over = {}) => ({
  id: "abcdef12-2222-4333-8444-555555555555", user_id: USER, email: "jane@example.com", name: "Jane Doe", tier: "gold", discount: 50,
  baseline: [line("HLX-BC5", 1, { name: "BPC 157", dose: "5mg", unitPrice: 30 })],
  cart: [line("HLX-BC5", 1, { name: "BPC 157", dose: "5mg", unitPrice: 30, cost: 9.5, price: 15 }), line("HLX-RT10", 2, { unitPrice: 999, cost: 17.25, price: 35 })],
  ...over,
});

test("/api/alerts: refuses anything without the secret", async () => {
  reset();
  process.env.ALERTS_SECRET = SECRET;
  for (const auth of [undefined, "Bearer wrong", `Bearer ${SECRET}x`, SECRET, `bearer ${SECRET}`]) {
    const r = await postAlerts({ visits: [visitRow()] }, auth);
    assert.equal(r.status, 401, String(auth));
  }
  process.env.ALERTS_SECRET = "";
  assert.equal((await postAlerts({ visits: [visitRow()] }, "Bearer ")).status, 401, "no secret set up: refuses everything");
  assert.equal(resendSent.length, 0);
});

test("/api/alerts: one email per visit, saying what was added", async () => {
  reset();
  process.env.ALERTS_SECRET = SECRET;
  const r = await postAlerts({ visits: [visitRow(), visitRow({ id: "abcdef12-2222-4333-8444-000000000000", baseline: [line("HLX-RT10", 5)], cart: [line("HLX-RT10", 2)] })] }, `Bearer ${SECRET}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.sent, 1, "a visit where nothing was added sends nothing");
  const m = resendSent[0];
  assert.deepEqual(m.to, ["owner@example.com"]);
  assert.equal(m.reply_to, "jane@example.com");
  assert.equal(m.subject, "hlix: Jane Doe added 2 items to their cart");
  assert.equal(m.idem, "hlix/alert-cart/abcdef12-2222-4333-8444-555555555555", "a retried post sends it once");
  const [addedPart, nowPart] = m.html.split("Their cart now");
  assert.doesNotMatch(addedPart, /BPC 157/, "what was already there isn't 'added'");
  assert.match(addedPart, /your cost/);
  assert.match(addedPart, /their price/);
  assert.match(addedPart, /\$34\.50<br><span[^>]*>\$17\.25 each/, "your cost: the line and each vial");
  assert.match(addedPart, /\$70<br><span[^>]*>\$35 each/, "their price, from the database (not the browser's $999)");
  assert.doesNotMatch(m.html, /\$999|\$1998/);
  assert.match(nowPart, /BPC 157/);
  assert.match(nowPart, /total<\/td>\s*<td[^>]*>\$44<\/td>\s*<td[^>]*>\$85<\/td>/, "totals: your cost $9.50 + $34.50, their price $15 + $70");
  assert.match(m.html, /Their pricing: gold member \(50% off\)\./);
  assert.match(m.text, /GLP3-R .*2 vials: your cost \$34\.50 \(\$17\.25 each\), their price \$70 \(\$35 each\)/);
  assert.match(m.html, new RegExp(`#/users/${USER}`));
});

test("/api/alerts: a product with no cost says 'not set'; a pack and family pricing read right", async () => {
  reset();
  process.env.ALERTS_SECRET = SECRET;
  await postAlerts({ visits: [visitRow({ tier: "family", baseline: [], cart: [
    line("HLX-SM5", 1, { name: "GLP1-S", dose: "5mg", price: 45 }),
    line("HLX-RT10", 2, { unit: "pack", cost: 170, price: 170 }),
  ] })] }, `Bearer ${SECRET}`);
  const m = resendSent[0];
  assert.match(m.html, /not set/);
  assert.match(m.html, /\$340<br><span[^>]*>\$170 a pack/);
  assert.match(m.html, /\+ 1 not set/, "the cost total says one line has no cost");
  assert.match(m.html, /Their pricing: family &amp; friends \(your cost\)\./);
  assert.match(m.text, /your cost not set, their price \$45/);
});

test("/api/alerts: junk in a visit is skipped or escaped", async () => {
  reset();
  process.env.ALERTS_SECRET = SECRET;
  const r = await postAlerts({ visits: [null, { id: "not-a-uuid" }, visitRow({ name: "<img src=x onerror=alert(1)>", cart: [line("HLX-RT10", 1, { name: "<b>x</b>", sku: "NOT-IN-CATALOG" })], baseline: "nonsense" })] }, `Bearer ${SECRET}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.sent, 1);
  assert.doesNotMatch(resendSent[0].html, /<img|<b>x/);
  assert.match(resendSent[0].html, /&lt;img src=x/);
});

test("/api/alerts: only POST", async () => {
  const r = await new Promise((resolve) => {
    let status = 0;
    alertsApi({ method: "GET", headers: {} }, { setHeader() {}, getHeader() {}, status(s) { status = s; return this; }, json(d) { resolve({ status, data: d }); } });
  });
  assert.equal(r.status, 405);
});

test("delete my account: needs the right password, then tells hlix", async () => {
  reset();
  const jar = signedIn();
  await call("POST", { action: "cart", cart: [line("HLX-RT10", 1)] }, jar);
  assert.equal(jar.hlix_cv, "1");

  let r = await call("POST", { action: "delete", password: "wrong-password-9" }, jar);
  assert.equal(r.status, 400);
  assert.equal(r.data.error, "That password isn't right.");
  assert.equal(db.deleted, false);

  r = await call("POST", { action: "delete" }, jar);
  assert.equal(r.status, 400);
  assert.equal(db.deleted, false);

  calls.length = 0;
  r = await call("POST", { action: "delete", password: "right-password-1" }, jar);
  assert.equal(r.status, 200);
  assert.equal(db.deleted, true);
  const del = calls.find((c) => /rpc\/shop_delete_account/.test(c.url));
  const used = JSON.parse(Buffer.from(del.auth.split(" ")[1].split(".")[1], "base64url").toString());
  assert.equal(used.amr[0].method, "password", "deleted with the session made from the password just typed");
  assert.equal(jar.hlix_cv, undefined, "their visit went with the account");
  const m = resendSent[resendSent.length - 1];
  assert.equal(m.subject, "hlix: account deleted, Jane Doe");
  assert.match(m.html, /2 orders stay/);
  assert.match(m.html, /gold member/);
  assert.equal(jar["__Host-hlix_at"], undefined, "signed out");
  assert.equal(jar.hlix_in, undefined);
});

test("confirm-email link: saves the name typed at sign-up, only onto an empty account", async () => {
  const link = (type, jar = {}) => call("POST", { action: "link", type, access_token: jwt({ amr: [{ method: "otp", timestamp: nowS() - 5 }] }), refresh_token: "refresh-token-1" }, jar);
  reset();
  db.metadata = { name: "Jane Doe" };
  db.profile = { name: "", phone: "", address1: "", address2: "", city: "", state: "", zip: "", country: "" };
  let r = await link("signup");
  assert.equal(r.status, 200);
  assert.deepEqual(db.savedProfile, { name: "Jane Doe" });

  reset();
  db.metadata = { name: "Jane Doe" };
  db.profile = { name: "", phone: "", address1: "1 Main St", address2: "", city: "", state: "", zip: "", country: "" };
  await link("signup");
  assert.equal(db.savedProfile, null, "never over details they saved");

  reset();
  db.metadata = { name: "Jane Doe" };
  db.profile = { name: "", phone: "", address1: "", address2: "", city: "", state: "", zip: "", country: "" };
  r = await link("recovery");
  assert.equal(r.data.reset, true);
  assert.equal(db.savedProfile, null, "a reset link leaves the account alone");
});

test("reset links: a fresh link sign-in from a reset link skips the current password, nothing else does", async () => {
  const link = (type, amr) => call("POST", { action: "link", type, access_token: jwt({ amr }), refresh_token: "refresh-token-1" });
  reset();
  assert.equal((await link("recovery", [{ method: "otp", timestamp: nowS() - 5 }])).data.reset, true);
  assert.equal((await link(undefined, [{ method: "recovery", timestamp: nowS() - 5 }])).data.reset, true);
  assert.equal((await link("signup", [{ method: "otp", timestamp: nowS() - 5 }])).data.reset, false);
  assert.equal((await link("recovery", [{ method: "password", timestamp: nowS() - 5 }])).data.reset, false);
  assert.equal((await link("recovery", [{ method: "otp", timestamp: nowS() - 16 * 60 }])).data.reset, false);
  assert.equal((await link(["recovery"], [{ method: "otp", timestamp: nowS() - 5 }])).data.reset, false);
  assert.equal((await link("recovery", [null, { method: "otp" }])).data.reset, false);
});

test("payment email (for a future payment processor)", () => {
  const m = A.paymentReceived({ ref: "A1B2C3", name: "Jane Doe", email: "jane@example.com", amount: 120, total: 200, paid: 120, method: "card", txn: "pi_123" });
  assert.equal(m.subject, "hlix: payment received, order #A1B2C3, $120");
  assert.match(m.text, /\$120 of \$200 paid, \$80 to go/);
  assert.match(m.text, /Transaction: pi_123/);
  assert.match(A.paymentReceived({ ref: "A1", amount: 200, total: 200, paid: 200 }).text, /Paid in full/);
});

test("added lines: new lines and the extra on lines that went up", () => {
  const before = A.amounts([line("A", 1), line("B", 2), line("C", 1, { unit: "pack" })]);
  const added = A.addedLines(before, [line("A", 1), line("B", 5), line("C", 1), line("D", 1)]);
  assert.deepEqual(added.map((it) => [it.sku, it.unit, it.qty]), [["B", "vial", 3], ["C", "vial", 1], ["D", "vial", 1]]);
});
