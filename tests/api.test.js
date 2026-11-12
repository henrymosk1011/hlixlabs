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
const visitOf = (jar) => JSON.parse(Buffer.from(jar["__Host-hlix_cv"], "base64url").toString());

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

test("OWNER_ALERTS=off: nothing goes to hlix", async () => {
  reset();
  process.env.OWNER_ALERTS = "off";
  db.signup = { id: USER, email: "jane@example.com", identities: [{ id: "x" }] };
  await call("POST", { action: "signup", email: "jane@example.com", password: "a-good-password-1", name: "Jane" });
  const r = await call("POST", { action: "cart", cart: [line("HLX-RT10", 2)] }, signedIn());
  assert.equal(r.status, 200);
  assert.equal(resendCalls().length, 0);
  delete process.env.OWNER_ALERTS;
});

test("cart visit: one email, held until the visit ends, saying what was added", async () => {
  reset();
  const jar = signedIn();
  const t0 = nowS();
  // first add of the visit: their cart as it was is read before saving
  let r = await call("POST", { action: "cart", cart: [db.cart[0], line("HLX-RT10", 2)] }, jar);
  assert.equal(r.status, 200);
  const order = calls.filter((c) => /rpc\/shop_(me|save_cart)/.test(c.url)).map((c) => c.url.split("/").pop());
  assert.deepEqual(order, ["shop_me", "shop_save_cart"]);
  assert.equal(resendSent.length, 1);
  let m = resendSent[0];
  assert.equal(m.subject, "hlix: Jane Doe added 2 items to their cart");
  assert.deepEqual(m.to, ["owner@example.com"]);
  assert.equal(m.reply_to, "jane@example.com");
  const due = Date.parse(m.scheduled_at) / 1000;
  assert.ok(due >= t0 + 15 * 60 - 2 && due <= t0 + 15 * 60 + 5, "held for 15 minutes");
  assert.match(m.html, /Added on this visit/);
  const addedPart = m.html.split("Their cart now")[0];
  assert.doesNotMatch(addedPart, /BPC 157/, "what was already in the cart isn't 'added'");
  assert.match(m.html.split("Their cart now")[1], /BPC 157/);
  assert.equal(jar.hlix_cv, "1", "pages know a cart email is held");
  assert.equal(visitOf(jar).id, m.id);

  // another add: the held email is replaced (not a second one), no new read of the old cart
  calls.length = 0;
  r = await call("POST", { action: "cart", cart: [db.cart[0], line("HLX-RT10", 2), line("HLX-SM5", 1)] }, jar);
  assert.equal(r.status, 200);
  assert.ok(!calls.some((c) => /rpc\/shop_me/.test(c.url)));
  assert.ok(calls.some((c) => c.url.endsWith(`/emails/${m.id}/cancel`)), "old held email cancelled");
  assert.equal(resendSent.length, 2);
  assert.equal(resendSent[1].subject, "hlix: Jane Doe added 3 items to their cart");
  const firstId = m.id;
  m = resendSent[1];
  assert.equal(visitOf(jar).id, m.id);

  // the same cart saved again: the held email just waits longer
  calls.length = 0;
  await call("POST", { action: "cart", cart: [db.cart[0], line("HLX-RT10", 2), line("HLX-SM5", 1)] }, jar);
  assert.equal(resendSent.length, 2);
  assert.ok(resendCalls().every((c) => c.method === "PATCH" && c.url.endsWith(m.id)));

  // they take out what they added: nothing to tell, the held email is cancelled
  calls.length = 0;
  await call("POST", { action: "cart", cart: [db.cart[0]] }, jar);
  assert.ok(calls.some((c) => c.url.endsWith(`/emails/${m.id}/cancel`)));
  assert.equal(resendSent.length, 2);
  assert.equal(visitOf(jar).id, null);
  assert.equal(jar.hlix_cv, undefined, "nothing held, so pages stop reporting");
  assert.notEqual(firstId, m.id);
});

test("cart visit: opening pages pushes the email back, leaving brings it forward", async () => {
  reset();
  const jar = signedIn();
  await call("POST", { action: "cart", cart: [line("HLX-RT10", 1)] }, jar);
  const id = resendSent[0].id;

  // a page right away: nothing to move (it's already 15 minutes off)
  calls.length = 0;
  await call("GET", undefined, jar);
  assert.equal(resendCalls().length, 0);

  // they leave the site: due in 3 minutes
  let t = nowS();
  await call("POST", { action: "presence", away: true }, jar);
  let patch = resendCalls().find((c) => c.method === "PATCH");
  assert.ok(patch && patch.url.endsWith(id));
  let due = Date.parse(patch.body.scheduled_at) / 1000;
  assert.ok(due >= t + 3 * 60 - 2 && due <= t + 3 * 60 + 5);
  assert.ok(visitOf(jar).at <= t + 3 * 60 + 5);

  // leaving again changes nothing
  calls.length = 0;
  await call("POST", { action: "presence", away: true }, jar);
  assert.equal(resendCalls().length, 0);

  // they come back (a page): 15 minutes again
  t = nowS();
  await call("GET", undefined, jar);
  patch = resendCalls().find((c) => c.method === "PATCH");
  due = Date.parse(patch.body.scheduled_at) / 1000;
  assert.ok(due >= t + 15 * 60 - 2);
});

test("cart visit: a visit cookie from someone else is ignored", async () => {
  reset();
  const jar = signedIn();
  await call("POST", { action: "cart", cart: [line("HLX-RT10", 1)] }, jar);
  const theirs = jar["__Host-hlix_cv"];
  const other = signedIn({ sub: OTHER, email: "sam@example.com" });
  other["__Host-hlix_cv"] = theirs;
  calls.length = 0;
  await call("POST", { action: "cart", cart: [line("HLX-SM5", 1)] }, other);
  assert.ok(!calls.some((c) => /\/cancel$/.test(c.url)), "never cancels someone else's email");
  assert.ok(calls.some((c) => /rpc\/shop_me/.test(c.url)), "starts its own visit");
  assert.equal(visitOf(other).u, OTHER);
});

test("cart visit: an account order cancels the held email; signing out sends it in 3 minutes", async () => {
  reset();
  let jar = signedIn();
  await call("POST", { action: "cart", cart: [line("HLX-RT10", 1)] }, jar);
  const id = resendSent[0].id;
  // what api/order.js does once the order is placed
  calls.length = 0;
  await new Promise((resolve) => {
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, getHeader: (k) => headers[k.toLowerCase()] };
    const req = { headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") } };
    A.cartEnd(req, res, jar["__Host-hlix_at"], true).then(() => {
      assert.ok(calls.some((c) => c.url.endsWith(`/emails/${id}/cancel`)));
      assert.ok([].concat(headers["set-cookie"]).some((c) => /^__Host-hlix_cv=;/.test(c)));
      resolve();
    });
  });

  reset();
  jar = signedIn();
  await call("POST", { action: "cart", cart: [line("HLX-RT10", 1)] }, jar);
  calls.length = 0;
  const t = nowS();
  await call("POST", { action: "signout" }, jar);
  const patch = resendCalls().find((c) => c.method === "PATCH");
  assert.ok(patch, "held email brought forward");
  assert.ok(Date.parse(patch.body.scheduled_at) / 1000 <= t + 3 * 60 + 5);
  assert.equal(jar["__Host-hlix_cv"], undefined);
});

test("delete my account: needs the right password, then tells hlix", async () => {
  reset();
  const jar = signedIn();
  await call("POST", { action: "cart", cart: [line("HLX-RT10", 1)] }, jar);
  const held = resendSent[0].id;

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
  assert.ok(calls.some((c) => c.url.endsWith(`/emails/${held}/cancel`)), "no cart email after it");
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
