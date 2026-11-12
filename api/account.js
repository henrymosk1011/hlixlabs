// Vercel serverless function — customer accounts on hlixlabs.com.
//
//   GET  /api/account                     who's signed in: email, saved details, cart, orders
//   POST /api/account { action, ... }     signup, signin, signout, forgot, link, password,
//                                         profile, cart, presence, delete
//
// Sessions are HttpOnly cookies set here (see api/_lib/session.js); page scripts never see
// a token. The database decides what a customer can read or change (the admin's
// supabase/migrations/0026_shop_accounts.sql): only their own account.

const S = require("./_lib/session");
const A = require("./_lib/alerts"); // emails to hlix: new and deleted accounts, cart visits

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,190}\.[^\s@<>()[\]\\,;:"]{2,63}$/;
const PROFILE = { name: 120, phone: 40, address1: 200, address2: 200, city: 120, state: 120, zip: 40, country: 120 };

function str(v, max) {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "";
}
const email = (v) => str(v, 254).toLowerCase();

// 10 to 72 characters (72 is the most Supabase's password hashing uses), not just the email.
function passwordProblem(pw, mail) {
  if (typeof pw !== "string" || pw.length < 10) return "Use at least 10 characters for your password.";
  if (Buffer.byteLength(pw, "utf8") > 72) return "That password is too long (72 characters at most).";
  if (mail && pw.toLowerCase().includes(mail.split("@")[0]) && mail.split("@")[0].length >= 4) return "Your password shouldn't contain your email.";
  if (/^(.)\1+$/.test(pw)) return "Choose a password that isn't one character repeated.";
  return "";
}

function send(res, status, data) {
  res.status(status).json(data);
}

// A Supabase Auth error as [status, sentence]. `signingIn`: a plain 400 means wrong password.
function authError(r, fallback, signingIn = false) {
  const d = r.data || {};
  const code = d.error_code || d.code || "";
  const msg = String(d.msg || d.message || d.error_description || "");
  if (r.status === 503) return [503, "We couldn't reach our servers. Try again in a moment."];
  if (r.status === 429 || /rate_limit/.test(code)) return [429, "Too many tries. Wait a few minutes and try again."];
  if (code === "signup_disabled" || /signups? not allowed/i.test(msg)) return [403, "Making an account isn't open yet. Check back soon, or order as a guest."];
  if (code === "user_already_exists" || code === "email_exists" || /already registered/i.test(msg)) return [409, "There's already an account with that email. Sign in instead."];
  if (code === "weak_password") return [400, "Choose a stronger password: at least 10 characters, with letters and numbers."];
  if (code === "email_address_invalid" || code === "validation_failed") return [400, "That email address doesn't look right."];
  if (code === "email_not_confirmed") return [403, "Confirm your email first: open the link we sent you."];
  if (code === "user_banned" || /banned/i.test(msg)) return [403, "This account is turned off. Write to contact@hlixlabs.com if you think that's a mistake."];
  if (code === "same_password") return [400, "That's your current password. Choose a new one."];
  if (code === "invalid_credentials" || (signingIn && r.status === 400)) return [401, "Email or password is incorrect."];
  if (r.status >= 400 && r.status < 500) return [400, fallback];
  return [502, fallback];
}

// Admin logins belong on admin.hlixlabs.com only: never keep one signed in here.
async function refuseAdmin(token) {
  const r = await S.rpc("am_admin", {}, token);
  if (r.ok && r.data === true) {
    await S.auth("logout?scope=local", { token });
    return true;
  }
  return false;
}

async function me(req, res) {
  const token = await S.session(req, res);
  if (!token) return send(res, 200, { signedIn: false, emails: S.EMAILS_ON });
  const r = await S.rpc("shop_me", {}, token);
  if (r.status === 401 || r.status === 403) {
    S.clearSession(res);
    const off = /turned off/i.test(String((r.data && r.data.message) || ""));
    return send(res, 200, { signedIn: false, emails: S.EMAILS_ON, ...(off ? { disabled: true } : {}) });
  }
  if (!r.ok || !r.data) return send(res, 502, { error: S.friendly(r, "Your account couldn't be loaded. Try again in a moment.") });
  const d = r.data;
  // Membership (the admin's migrations 0027 and 0031): "regular" (website prices),
  // "silver" / "gold" (discount: percent off the website price), "family" (their cost).
  const tier = ["silver", "gold", "family"].includes(d.tier) ? d.tier : "regular";
  const off = Number(d.discount);
  const discount = (tier === "silver" || tier === "gold") && off > 0 && off < 100 ? off : 0;
  // Family & friends: their prices (a pack of 10, by SKU). The database only answers for them.
  let prices = null;
  if (tier === "family") {
    const fp = await S.rpc("shop_family_prices", {}, token);
    if (fp.ok && fp.data && typeof fp.data === "object" && !Array.isArray(fp.data)) prices = fp.data;
  }
  await A.visit(req, res, token, "seen"); // they're still here: their cart visit goes on
  return send(res, 200, {
    signedIn: true, emails: S.EMAILS_ON,
    email: d.email, tier, discount, prices, profile: d.profile, cart: d.cart, orders: d.orders,
    tempPassword: d.temp_password === true,
    reset: !!S.cookies(req)[S.RS],
  });
}

const actions = {
  async signup(req, res, b, ip) {
    if (S.limited(`signup:${ip}`, 5, 60 * 60 * 1000)) return send(res, 429, { error: "Too many new accounts from here. Try again later." });
    const mail = email(b.email);
    if (!EMAIL.test(mail)) return send(res, 400, { error: "That email address doesn't look right." });
    const bad = passwordProblem(b.password, mail);
    if (bad) return send(res, 400, { error: bad });
    const name = str(b.name, PROFILE.name);
    // account.html: the address on Supabase's allow list; Vercel forwards it to /account (the #tokens come along).
    // The name rides along with the login (Supabase keeps it as user metadata) until they
    // open the confirm link, which saves it to their account (link, below).
    const r = await S.auth(`signup?redirect_to=${encodeURIComponent(S.SITE_URL + "/account.html")}`, { body: { email: mail, password: b.password, data: name ? { name } : {} } });
    if (!r.ok) {
      const [status, error] = authError(r, "Your account couldn't be made. Check your email and password and try again.");
      return send(res, status, { error });
    }
    const s = r.data && r.data.access_token ? r.data : null;
    // Tell hlix. An email that already has an account gets the same answer as a new one
    // (so nobody can find out who has an account), with no identities: no new account.
    const user = (s ? s.user : r.data) || {};
    if (!(Array.isArray(user.identities) && user.identities.length === 0)) {
      await A.created({ name, email: mail, userId: user.id, confirm: !s });
    }
    if (!s) return send(res, 200, { ok: true, confirm: true }); // they confirm by email first
    if (await refuseAdmin(s.access_token)) return send(res, 403, { error: "That login can't be used here." });
    S.setSession(res, s);
    if (name) await S.rpc("shop_save_profile", { p: { name } }, s.access_token);
    return send(res, 200, { ok: true });
  },

  async signin(req, res, b, ip) {
    const mail = email(b.email);
    if (S.limited(`signin:${ip}`, 20, 15 * 60 * 1000) || S.limited(`signin:${mail}`, 8, 15 * 60 * 1000)) {
      return send(res, 429, { error: "Too many tries. Wait a few minutes and try again." });
    }
    if (!EMAIL.test(mail) || typeof b.password !== "string" || !b.password || b.password.length > 200) {
      return send(res, 401, { error: "Email or password is incorrect." });
    }
    const r = await S.auth("token?grant_type=password", { body: { email: mail, password: b.password } });
    if (!r.ok) {
      const [status, error] = authError(r, "You couldn't be signed in. Try again in a moment.", true);
      return send(res, status, { error });
    }
    if (await refuseAdmin(r.data.access_token)) return send(res, 403, { error: "That login can't be used here." });
    S.setSession(res, r.data);
    return send(res, 200, { ok: true });
  },

  async signout(req, res, b) {
    const token = await S.session(req, res);
    if (token) await A.visit(req, res, token, "away"); // their visit is over
    A.forget(res);
    // "everywhere": every device this account is signed in on.
    if (token) await S.auth(`logout?scope=${b.everywhere === true ? "global" : "local"}`, { token });
    S.clearSession(res);
    return send(res, 200, { ok: true });
  },

  async forgot(req, res, b, ip) {
    if (!S.EMAILS_ON) return send(res, 503, { error: "Password reset emails aren't set up yet. Write to contact@hlixlabs.com and we'll help." });
    if (S.limited(`forgot:${ip}`, 5, 60 * 60 * 1000)) return send(res, 429, { error: "Too many tries. Wait a while and try again." });
    const mail = email(b.email);
    if (!EMAIL.test(mail)) return send(res, 400, { error: "That email address doesn't look right." });
    // Same answer whether or not there's an account, so this can't be used to find out.
    await S.auth(`recover?redirect_to=${encodeURIComponent(S.SITE_URL + "/account.html")}`, { body: { email: mail } });
    return send(res, 200, { ok: true });
  },

  // The tokens from an email link (confirm email, or reset password), turned into a session.
  async link(req, res, b, ip) {
    if (S.limited(`link:${ip}`, 10, 15 * 60 * 1000)) return send(res, 429, { error: "Too many tries. Wait a few minutes and try again." });
    const at = typeof b.access_token === "string" ? b.access_token : "";
    const rt = typeof b.refresh_token === "string" ? b.refresh_token : "";
    if (!S.TOKEN.test(at) || !S.TOKEN.test(rt)) return send(res, 400, { error: "That link didn't work. Ask for a new one." });
    const r = await S.auth("user", { method: "GET", token: at }); // Supabase checks the token
    if (!r.ok) return send(res, 400, { error: "That link has expired or was already used. Ask for a new one." });
    if (await refuseAdmin(at)) return send(res, 403, { error: "That login can't be used here." });
    S.setSession(res, { access_token: at, refresh_token: rt });
    // A reset link lets them choose a password without the current one. Supabase records
    // a sign-in from an emailed link as "otp" ("recovery" in its newer flow), and only
    // someone who opened the email can have those tokens: the same proof a reset needs.
    // The link's type (from the page) only says which link it was; the session must be
    // that fresh link sign-in, so an ordinary sign-in can't skip the current password.
    const amr = Array.isArray(S.claims(at).amr) ? S.claims(at).amr : [];
    const now = Date.now() / 1000;
    const fromLink = (m) => m && (m.method === "recovery" || m.method === "otp") && now - Number(m.timestamp) < 15 * 60;
    const recovery = amr.some((m) => m && m.method === "recovery" && fromLink(m))
      || (b.type === "recovery" && amr.some(fromLink));
    if (recovery) S.setCookie(res, S.RS, "1", 15 * 60);
    // A confirm-email link: save the name they typed at sign-up, if their account has no
    // details yet (shop_save_profile sets every field, so never over anything they saved).
    const meta = r.data && r.data.user_metadata;
    const typed = str(meta && meta.name, PROFILE.name);
    if (b.type === "signup" && typed) {
      const m = await S.rpc("shop_me", {}, at);
      const prof = m.ok && m.data && m.data.profile && typeof m.data.profile === "object" ? m.data.profile : null;
      if (prof && Object.keys(PROFILE).every((k) => !prof[k])) await S.rpc("shop_save_profile", { p: { name: typed } }, at);
    }
    return send(res, 200, { ok: true, reset: recovery });
  },

  async password(req, res, b, ip) {
    const token = await S.session(req, res);
    if (!token) return send(res, 401, { error: "Sign in first." });
    if (S.limited(`password:${ip}`, 10, 15 * 60 * 1000)) return send(res, 429, { error: "Too many tries. Wait a few minutes and try again." });
    const who = await S.auth("user", { method: "GET", token });
    const mail = who.ok && who.data ? String(who.data.email || "") : "";
    if (!mail) return send(res, 401, { error: "Sign in again first." });
    const bad = passwordProblem(b.password, mail);
    if (bad) return send(res, 400, { error: bad });

    // Changing it needs the current password, unless they just came from a reset link.
    let use = token;
    if (!S.cookies(req)[S.RS]) {
      if (typeof b.current !== "string" || !b.current || b.current.length > 200) return send(res, 400, { error: "Enter your current password." });
      const check = await S.auth("token?grant_type=password", { body: { email: mail, password: b.current } });
      if (!check.ok) {
        const [status, error] = authError(check, "Your password couldn't be changed. Try again in a moment.", true);
        return send(res, status === 401 ? 400 : status, { error: status === 401 ? "Your current password isn't right." : error });
      }
      // Carry on with the fresh session, and end the old one.
      await S.auth("logout?scope=local", { token });
      S.setSession(res, check.data);
      use = check.data.access_token;
    }
    const r = await S.auth("user", { method: "PUT", body: { password: b.password }, token: use });
    if (!r.ok) {
      const [status, error] = authError(r, "Your password couldn't be changed. Try again in a moment.");
      return send(res, status === 401 ? 400 : status, { error });
    }
    // Every other device signs in again with the new password.
    await S.auth("logout?scope=others", { token: use });
    await S.rpc("shop_password_changed", {}, use); // no longer on a temporary password from hlix
    S.setCookie(res, S.RS, "", 0);
    return send(res, 200, { ok: true });
  },

  async profile(req, res, b) {
    const token = await S.session(req, res);
    if (!token) return send(res, 401, { error: "Sign in first." });
    const src = b.profile && typeof b.profile === "object" ? b.profile : {};
    const p = {};
    for (const [k, max] of Object.entries(PROFILE)) p[k] = str(src[k], max);
    const r = await S.rpc("shop_save_profile", { p }, token);
    if (!r.ok) return send(res, r.status === 401 ? 401 : 400, { error: S.friendly(r, "Your details couldn't be saved. Try again in a moment.") });
    return send(res, 200, { ok: true });
  },

  async cart(req, res, b, ip) {
    const token = await S.session(req, res);
    if (!token) return send(res, 401, { error: "Sign in first." });
    if (S.limited(`cart:${ip}`, 240, 10 * 60 * 1000)) return send(res, 429, { error: "Too many changes. Wait a moment." });
    if (!Array.isArray(b.cart) || b.cart.length > 50) return send(res, 400, { error: "That cart couldn't be saved." });
    const cart = [];
    for (const it of b.cart) {
      if (!it || typeof it !== "object") continue;
      const qty = Number(it.qty);
      const line = {
        sku: str(it.sku, 40), form: it.form === "powder" ? "powder" : "recon", unit: it.unit === "pack" ? "pack" : "vial",
        qty: Number.isInteger(qty) ? Math.max(1, Math.min(999, qty)) : 1,
        name: str(it.name, 160), dose: str(it.dose, 40), slug: str(it.slug, 120), category: str(it.category, 80),
      };
      const unit = Number(it.unitPrice);
      if (Number.isFinite(unit) && unit >= 0 && unit <= 1000000) line.unitPrice = unit;
      if (line.sku) cart.push(line);
    }
    // Before saving: the database opens their visit with the cart as it is now (so hlix
    // hears what they add on it, not what was already there), or notes they're still here.
    await A.visit(req, res, token, "cart");
    const r = await S.rpc("shop_save_cart", { p_cart: cart }, token);
    if (!r.ok) return send(res, r.status === 401 ? 401 : 400, { error: S.friendly(r, "Your cart couldn't be saved.") });
    return send(res, 200, { ok: true });
  },

  // The page says they left the site (closed the tab, switched away) or came back, while
  // their cart visit is open (alerts.js).
  async presence(req, res, b, ip) {
    const token = await S.session(req, res);
    if (!token) return send(res, 200, { ok: true });
    if (S.limited(`presence:${ip}`, 120, 10 * 60 * 1000)) return send(res, 429, { error: "Too many requests." });
    await A.visit(req, res, token, b.away === true ? "away" : "seen");
    return send(res, 200, { ok: true });
  },

  // Delete their own account for good, after typing their password again. The database
  // (the admin's 0033_shop_delete_account.sql) only does it for a session that began with
  // a password in the last 5 minutes: the one made here from what they just typed.
  async delete(req, res, b, ip) {
    const token = await S.session(req, res);
    if (!token) return send(res, 401, { error: "Sign in first." });
    if (S.limited(`delete:${ip}`, 6, 15 * 60 * 1000)) return send(res, 429, { error: "Too many tries. Wait a few minutes and try again." });
    const who = await S.auth("user", { method: "GET", token });
    const mail = who.ok && who.data ? String(who.data.email || "") : "";
    if (!mail) return send(res, 401, { error: "Sign in again first." });
    if (typeof b.password !== "string" || !b.password || b.password.length > 200) return send(res, 400, { error: "Enter your password to delete your account." });
    const check = await S.auth("token?grant_type=password", { body: { email: mail, password: b.password } });
    if (!check.ok) {
      const [status, error] = authError(check, "Your account couldn't be deleted. Try again in a moment.", true);
      return send(res, status === 401 ? 400 : status, { error: status === 401 ? "That password isn't right." : error });
    }
    const r = await S.rpc("shop_delete_account", {}, check.data.access_token);
    if (!r.ok || !r.data) {
      await S.auth("logout?scope=local", { token: check.data.access_token }); // the session made just for this
      return send(res, r.status === 401 || r.status === 403 ? 403 : 400, { error: S.friendly(r, "Your account couldn't be deleted. Write to contact@hlixlabs.com and we'll do it for you.") });
    }
    A.forget(res); // their open cart visit went with the account: no cart email, this one says it all
    S.clearSession(res);
    await A.deleted({ name: r.data.name, email: r.data.email || mail, orders: r.data.orders, tier: r.data.tier });
    return send(res, 200, { ok: true });
  },
};

module.exports = async (req, res) => {
  S.noStore(res);
  if (req.method === "GET") return me(req, res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed" });
  }
  if (!S.sameSite(req)) return send(res, 403, { error: "Not allowed." });
  const b = S.body(req);
  const fn = typeof b.action === "string" && Object.prototype.hasOwnProperty.call(actions, b.action) ? actions[b.action] : null;
  if (!fn) return send(res, 400, { error: "Unknown request." });
  try {
    return await fn(req, res, b, S.clientIp(req));
  } catch (err) {
    console.error("account", b.action, err && err.message);
    return send(res, 500, { error: "Something went wrong. Try again in a moment." });
  }
};
