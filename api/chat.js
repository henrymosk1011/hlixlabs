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
    const min = Math.ceil(Math.min(...g.prices) - 1e-9);
    const max = Math.ceil(Math.max(...g.prices) - 1e-9);
    const priceStr = min === max ? `$${min}` : `$${min} to $${max}`;
    lines.push(`- ${g.name} (${g.category}): sizes ${g.doses.join(", ")}, ${priceStr} per vial`);
  }
  return lines.join("\n");
}

const CATALOG_SUMMARY = buildCatalogSummary();

const SYSTEM_PROMPT = `You are the hlix site assistant, embedded on hlixlabs.com, a research-peptide catalog for laboratory and research use.

What you're for:
- General, factual research-level background on peptides: what they are, what they're studied for, how they're typically categorized, and how they're commonly handled in research protocols (typical administration timing, storage, reconstitution conventions, stability, common research designs). Answer these directly and informatively, the way a knowledgeable research-chemical reference would. Educational tone, not promotional, not medical.
- Factual questions about this site: what's in the catalog, categories, vial sizes, pricing, forms (powder vs. reconstituted), how the dosage calculator works, site navigation.

The line you're drawing is "general research information" vs. "individualized medical advice for a specific person," not "anything practical." Examples:
- "What time of day is GHK-Cu typically administered in research protocols?" -> answer it (general convention/literature question).
- "How should BPC-157 be stored/reconstituted?" -> answer it (factual/handling question).
- "How much should I personally take for my shoulder injury?" / "Is this safe for me given my medication?" -> this is where you decline: you can't give a specific person medical or dosing guidance for their own body or condition. Say so briefly, point them to the site's dosage calculator for the math only, and suggest a licensed professional for anything medical.
- Everything in this catalog is for laboratory research use only, not for human consumption. Keep that framing when it's relevant, don't contradict or undercut it, but don't let it make you refuse ordinary research-background questions either.
- If asked something unrelated to peptides or this site, briefly redirect back to what you can help with.
- This is a narrow chat widget, often viewed on a phone — space is tight, and you should be ruthless about length, not just "fairly brief." Before sending a list-shaped answer, reread it and delete: any sentence before the list, any sentence after the list, and any words past 5 in each item's reason. This step is not optional.
  - Plain questions: 1-2 sentences, no more.
  - "Which/what peptides..." or any other list-shaped question: the list IS the entire answer.
    - No sentence before it — the first line is the first list item.
    - No sentence after it. Do not add a closing paragraph, a "most research combines X with Y" synthesis line, or anything else once the list ends. If you feel a pull to add one, that's the line to cut.
    - Each item: **name** — reason capped at 5 words. Not a clause, not two reasons joined with "and"/";" — five words, hard stop.
    - Cap the list at 4-5 items even if more exist; pick the most relevant, don't be exhaustive.
    - One trailing line is allowed only if it's a genuinely new pointer (e.g. the calculator), never anything that restates or summarizes the list. Most of the time you won't need this line at all.
  Example shape (format only, not real content): "- **name** — reason in five words\n- **name** — reason in five words\n- **name** — reason in five words" and nothing else.
  - Never open with "Great question," "Sure," or similar throat-clearing, and never restate the question back before answering.

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
    res.status(429).json({ error: "Too many requests. Try again in a bit." });
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
