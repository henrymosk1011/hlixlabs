// Vercel serverless function — proxies chat messages to the Claude API
// server-side so the API key never reaches the browser. This file only
// runs once the site is deployed to Vercel (or an equivalent Node
// serverless host); it does nothing during local static preview.
//
// Requires an ANTHROPIC_API_KEY environment variable set in the
// deployment's project settings — never commit a real key to this repo.

const catalog = require("../data/products.json");

const MODEL = "claude-haiku-4-5-20251001";
const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 2000;

// Naive per-instance rate limit. Serverless functions can run as
// multiple concurrent instances and reset on cold start, so this is a
// speed bump against casual abuse, not a real limiter. If this site
// gets real traffic, replace with Vercel KV / Upstash-backed limiting.
const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 30;

function buildCatalogSummary() {
  const groups = new Map();
  for (const p of catalog) {
    if (!groups.has(p.name)) {
      groups.set(p.name, { name: p.name, category: p.category_label, doses: [], prices: [] });
    }
    const g = groups.get(p.name);
    g.doses.push(p.dose);
    g.prices.push(p.price);
  }
  const lines = [];
  for (const g of groups.values()) {
    const min = Math.min(...g.prices);
    const max = Math.max(...g.prices);
    const priceStr = min === max ? `$${min}` : `$${min}–$${max}`;
    lines.push(`- ${g.name} (${g.category}): sizes ${g.doses.join(", ")} — ${priceStr} per vial`);
  }
  return lines.join("\n");
}

const CATALOG_SUMMARY = buildCatalogSummary();

const SYSTEM_PROMPT = `You are the hlix site assistant, embedded on a personal research-peptide catalog website (hlix.io).

What you're for:
- General, factual research-level background on peptides: what they are, what they're studied for, how they're typically categorized. Educational tone, not promotional.
- Factual questions about this site: what's in the catalog, categories, vial sizes, pricing, how the dosage calculator works, site navigation.

Hard limits:
- Never give personalized dosing instructions, medical advice, or tell a specific person what to take or how much. If asked, say you can't give personal medical or dosing guidance, point them to the site's dosage calculator for the math only, and suggest a licensed professional for anything medical.
- Everything in this catalog is for laboratory research use only, not for human consumption — keep that framing when it's relevant, don't contradict or undercut it.
- If asked something unrelated to peptides or this site, briefly redirect back to what you can help with.
- Keep answers short — a few sentences, not essays.

Current catalog (name, category, available vial sizes, price per vial):
${CATALOG_SUMMARY}`;

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
    res.status(429).json({ error: "Too many requests — try again in a bit." });
    return;
  }

  const body = req.body || {};
  const message = body.message;
  if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: "Invalid message." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is not configured (missing API key)." });
    return;
  }

  const priorTurns = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_MESSAGES) : [];
  const messages = priorTurns
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));
  messages.push({ role: "user", content: message });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error", response.status, errText);
      res.status(502).json({ error: "Upstream error." });
      return;
    }

    const data = await response.json();
    const text = (data.content || []).map((b) => b.text || "").join("").trim();
    res.status(200).json({ reply: text || "Sorry, I didn't catch that." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong." });
  }
};
