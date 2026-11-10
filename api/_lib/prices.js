// Live prices, shared by /api/prices, /api/order and /api/chat. (The leading
// underscore keeps Vercel from serving this folder as a function.)
//
// The source of truth for what a product sells for is the Inventory page of
// the hlix admin (Supabase project "hlix"). This reads it through
// public.storefront_prices(), which returns only SKU + price, so a price
// changed in the admin shows on the site, in order emails and in the chat
// assistant without a rebuild.
//
// The key below is the project's *publishable* key: public by design (the
// admin site ships it to every browser). The database only lets it call
// keepalive() and storefront_prices(); every table stays admin-only. Set
// SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY in Vercel to point somewhere else.
//
// If Supabase can't be reached, every SKU falls back to its built-in price
// from data/products.json, the same price the static pages were built with.

const catalog = require("../../data/products.json");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ewfyqdkctzswghkreyqa.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_61YrbU2g5vDsmKb-C8IIEQ_CMSERhsS";
const TTL_MS = 15 * 1000;
const TIMEOUT_MS = 4000;

let cache = null;

// Same rules as money() / recon_price() in scripts/build.py: every price is
// shown as a whole dollar rounded up, and Reconstituted is Powder + 20%.
function powderPrice(base) {
  return Math.ceil(Number(base) - 1e-9);
}
function reconPrice(base) {
  return Math.ceil(Number(base) * 1.2 - 1e-9);
}
function unitPrice(base, form) {
  return form === "recon" ? reconPrice(base) : powderPrice(base);
}

async function fetchLive() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/storefront_prices`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`storefront_prices returned HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("storefront_prices returned an unexpected body");
  return rows;
}

// Map of SKU -> base (Powder) price for every product on the website, plus
// whether the prices came from the admin (live) or the built-in fallback.
// Admin-only SKUs that aren't on the site are ignored, and so is a price of
// $0, which would only ever be a placeholder.
async function getPrices() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const prices = new Map(catalog.map((p) => [p.sku, Number(p.price)]));
  let live = false;
  try {
    for (const row of await fetchLive()) {
      const price = Number(row.price);
      if (prices.has(row.sku) && Number.isFinite(price) && price > 0) prices.set(row.sku, price);
    }
    live = true;
  } catch (err) {
    console.error("Live prices unavailable, using built-in prices:", err.message);
  }
  cache = { at: Date.now(), prices, live };
  return cache;
}

// Stock per SKU from the admin's Inventory page, through public.storefront_stock()
// (admin migration 0030): "in_stock", "on_the_way" or "to_order", never a number.
// null when it can't be read, so the site says nothing rather than something wrong.
let stockCache = null;
const STOCK = new Set(["in_stock", "on_the_way", "to_order"]);
async function getStock() {
  if (stockCache && Date.now() - stockCache.at < TTL_MS) return stockCache.stock;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/storefront_stock`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`storefront_stock returned HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error("storefront_stock returned an unexpected body");
    const known = new Set(catalog.map((p) => p.sku));
    const stock = {};
    for (const r of rows) if (r && known.has(r.sku) && STOCK.has(r.status)) stock[r.sku] = r.status;
    stockCache = { at: Date.now(), stock };
    return stock;
  } catch (err) {
    console.error("stock unavailable", err && err.message);
    return null;
  }
}

module.exports = { getPrices, getStock, powderPrice, reconPrice, unitPrice, SUPABASE_URL, SUPABASE_KEY };
