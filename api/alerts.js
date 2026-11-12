// Vercel serverless function: the cart visits that are over, posted every minute by the
// database (the admin's 0034_cart_visit_alerts.sql), become emails to hlix
// (api/_lib/alerts.js).
//
//   POST /api/alerts   Authorization: Bearer <ALERTS_SECRET>
//                      { visits: [{ id, user_id, email, name, baseline, cart, ... }] }
//
// Only the database knows the secret (Vault: hlix_alerts_secret) besides this project
// (ALERTS_SECRET). Anything else gets a 401 and sends nothing; even with the secret, the
// emails only ever go to hlix.

const crypto = require("crypto");
const S = require("./_lib/session");
const A = require("./_lib/alerts");

const digest = (s) => crypto.createHash("sha256").update(String(s)).digest();

function authorized(req) {
  const secret = process.env.ALERTS_SECRET || "";
  if (secret.length < 32) return false; // not set up: refuse everything
  // Same length either way, so the comparison takes the same time whatever was sent.
  return crypto.timingSafeEqual(digest(req.headers.authorization || ""), digest(`Bearer ${secret}`));
}

module.exports = async (req, res) => {
  S.noStore(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!authorized(req)) return res.status(401).json({ error: "Not allowed." });
  const b = S.body(req);
  const visits = Array.isArray(b.visits) ? b.visits.slice(0, 100) : [];
  if (!A.on()) return res.status(200).json({ ok: true, sent: 0, off: true });
  const sent = await A.sendVisits(visits);
  return res.status(200).json({ ok: true, sent });
};
