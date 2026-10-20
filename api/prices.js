// Vercel serverless function — GET /api/prices returns the current price of
// every product, keyed by SKU, for assets/js/v2-prices.js to swap into the
// page. Prices come from the hlix admin's Inventory page (see
// api/_lib/prices.js). Vercel's edge caches the answer for a few seconds, so
// a price saved in the admin is on the site within about a minute.

const { getPrices, powderPrice, reconPrice } = require("./_lib/prices");

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { prices, live } = await getPrices();
  const out = {};
  for (const [sku, base] of prices) out[sku] = { powder: powderPrice(base), recon: reconPrice(base) };

  // Only Vercel's edge caches the answer; browsers ask the edge every page
  // load, so they never hold on to an old price themselves. A fallback answer
  // (Supabase unreachable) isn't cached anywhere, so the site picks the live
  // prices back up on the very next request.
  if (live) {
    res.setHeader("Vercel-CDN-Cache-Control", "max-age=15, stale-while-revalidate=30");
    res.setHeader("Cache-Control", "no-cache");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  res.status(200).json({ live, prices: out });
};
