// Customer sign-in for hlixlabs.com, shared by api/account.js and api/order.js. (The
// leading underscore keeps Vercel from serving this folder as a function.)
//
// Accounts live in the hlix admin's Supabase project (its Auth). The browser never
// sees a token: this server signs in on the customer's behalf and keeps the session in
// cookies that page scripts can't read, so a script injected into a page can't steal it.
//
//   __Host-hlix_at   access token (a short-lived JWT)            HttpOnly
//   __Host-hlix_rt   refresh token (renews the access token)     HttpOnly
//   __Host-hlix_rs   "just reset your password" (15 minutes)     HttpOnly
//   hlix_in          "1" while signed in, so pages know to show the account and sync the cart
//
// All are Secure and SameSite=Strict (another site can't make the browser send them), and
// the __Host- ones can only be set by this exact host over HTTPS. Requests that change
// anything must also come from this site (sameSite below) and be JSON, which a form on
// another site can't send without the browser asking first.
//
// What a signed-in customer can do in the database is decided there, not here: the
// shop_* functions in the admin's supabase/migrations/0026_shop_accounts.sql only ever
// touch the caller's own account.

const { SUPABASE_URL, SUPABASE_KEY } = require("./prices");

// Where links in account emails (confirm, reset password) send people. Fixed, never taken
// from the request, so a forged Host header can't point a reset link somewhere else.
const SITE_URL = (process.env.SITE_URL || "https://hlixlabs.com").replace(/\/+$/, "");
// Password resets need an email sender on the Supabase project (custom SMTP); until it has
// one, say so instead of promising an email that won't come. Set ACCOUNT_EMAILS=on in
// Vercel once it's set up.
const EMAILS_ON = process.env.ACCOUNT_EMAILS === "on";

const AT = "__Host-hlix_at";
const RT = "__Host-hlix_rt";
const RS = "__Host-hlix_rs";
const IN = "hlix_in";
const MAX_AGE = 60 * 60 * 24 * 30; // stay signed in for 30 days of not visiting
const TIMEOUT_MS = 8000;

// ------------------------------------------------------------------ cookies ---

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) out[k] = part.slice(i + 1).trim();
  }
  return out;
}

function addCookie(res, c) {
  const prev = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", [...(Array.isArray(prev) ? prev : prev ? [String(prev)] : []), c]);
}

function setCookie(res, name, value, maxAge, httpOnly = true) {
  addCookie(res, `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Strict${httpOnly ? "; HttpOnly" : ""}`);
}

const TOKEN = /^[A-Za-z0-9._~-]{10,4096}$/;

function setSession(res, s) {
  if (!s || !TOKEN.test(String(s.access_token || "")) || !TOKEN.test(String(s.refresh_token || ""))) return false;
  setCookie(res, AT, s.access_token, MAX_AGE);
  setCookie(res, RT, s.refresh_token, MAX_AGE);
  setCookie(res, IN, "1", MAX_AGE, false);
  return true;
}

function clearSession(res) {
  for (const [name, httpOnly] of [[AT, true], [RT, true], [RS, true], [IN, false]]) setCookie(res, name, "", 0, httpOnly);
}

// ---------------------------------------------------------------- supabase ---

// Seconds until a JWT expires (0 if it can't be read). Not a check of the token: Supabase
// checks it on every call. This only decides when to renew it.
function claims(token) {
  try {
    const part = String(token).split(".")[1] || "";
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) || {};
  } catch (e) {
    return {};
  }
}

async function call(url, { method = "POST", body, token } = {}) {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${token || SUPABASE_KEY}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error("Supabase unreachable:", err && err.name);
    return { ok: false, status: 503, data: null };
  }
}

const auth = (path, opts) => call(`${SUPABASE_URL}/auth/v1/${path}`, opts);
const rpc = (name, args, token) => call(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { body: args || {}, token });

// The signed-in customer's access token, renewed if it's about to expire, or null.
async function session(req, res) {
  const c = cookies(req);
  const at = TOKEN.test(c[AT] || "") ? c[AT] : null;
  const rt = TOKEN.test(c[RT] || "") ? c[RT] : null;
  if (!at && !rt) {
    if (c[IN]) clearSession(res);
    return null;
  }
  if (at && Number(claims(at).exp || 0) - 60 > Date.now() / 1000) return at;
  if (!rt) {
    clearSession(res);
    return null;
  }
  const r = await auth("token?grant_type=refresh_token", { body: { refresh_token: rt } });
  if (!r.ok || !setSession(res, r.data)) {
    // Signed out elsewhere, or the refresh token was used twice (Supabase then revokes the
    // whole session): start over. A network hiccup doesn't sign anyone out.
    if (r.status !== 503) clearSession(res);
    return null;
  }
  return r.data.access_token;
}

// ------------------------------------------------------------------ guards ---

// A request that changes something must come from a page on this site, as JSON.
function sameSite(req) {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin") return false;
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch (e) {
      return false;
    }
  } else if (!site) {
    return false; // neither header: not a browser on this site
  }
  return /^application\/json\b/i.test(String(req.headers["content-type"] || ""));
}

function clientIp(req) {
  return String(req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress) || "unknown").split(",")[0].trim();
}

// Best effort: each serverless instance counts on its own. The database's own limits
// (orders per account and per hour) and Supabase Auth's are the real ones.
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  const b = buckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > b.resetAt) {
    b.count = 0;
    b.resetAt = now + windowMs;
  }
  b.count += 1;
  buckets.set(key, b);
  return b.count > max;
}

function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
}

function body(req) {
  try {
    const b = req.body;
    if (b && typeof b === "object" && !Array.isArray(b)) return b;
    if (typeof b === "string" && b.length < 100000) {
      const parsed = JSON.parse(b);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    }
  } catch (e) {
    // fall through
  }
  return {};
}

// A Supabase error as a plain sentence for the page. The database's own messages
// (shop_* functions: codes 22023 and P0001) are already written for customers.
function friendly(r, fallback) {
  const d = r.data || {};
  if (r.status === 503) return "We couldn't reach our servers. Try again in a moment.";
  if ((d.code === "22023" || d.code === "P0001") && typeof d.message === "string") return d.message.slice(0, 300);
  if (r.status === 429) return "Too many tries. Wait a few minutes and try again.";
  return fallback;
}

module.exports = {
  SITE_URL, EMAILS_ON, RS, cookies, setCookie, setSession, clearSession, claims, auth, rpc, session,
  sameSite, clientIp, limited, noStore, body, friendly, TOKEN,
};
