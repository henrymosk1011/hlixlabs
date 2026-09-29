// Vercel serverless function — sends contact-form submissions via Resend,
// server-side, so the API key never reaches the browser. This file only
// runs once the site is deployed to Vercel (or an equivalent Node
// serverless host); it does nothing during local static preview.
//
// Requires a RESEND_API_KEY environment variable set in the deployment's
// project settings — never commit a real key to this repo. Optionally set
// NOTIFY_EMAIL (where submissions are delivered) and RESEND_FROM_EMAIL
// (the "from" address — must be on a domain verified in Resend, otherwise
// leave it on the resend.dev sandbox sender below).

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || "henrymm@gmail.com";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "hlix <onboarding@resend.dev>";

const MAX_LEN = { name: 200, email: 320, message: 5000 };

const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || !email || !message || name.length > MAX_LEN.name || email.length > MAX_LEN.email || message.length > MAX_LEN.message) {
    res.status(400).json({ error: "Please fill in every field." });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "That email address doesn't look right." });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is not configured (missing API key)." });
    return;
  }

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
        reply_to: email,
        subject: `hlix contact form — ${name}`,
        html: `<p><strong>Name:</strong> ${esc(name)}</p><p><strong>Email:</strong> ${esc(email)}</p><p><strong>Message:</strong></p><p>${esc(message).replace(/\n/g, "<br>")}</p>`,
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
