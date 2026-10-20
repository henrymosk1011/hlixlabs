#!/usr/bin/env python3
"""
Copies the current prices from the hlix admin (its Inventory page, via the
Supabase function public.storefront_prices) into data/products.json.

The live site already shows the admin's prices without this (see
api/prices.js). Run it before a rebuild so the prices baked into the static
pages match too: they're what visitors see for a split second before the live
prices load, and what the site falls back to if the admin's database is down.

    python3 scripts/pull_prices.py
    python3 scripts/build_v2.py
    python3 scripts/build.py

No dependencies. Uses the same public key and URL as api/_lib/prices.js
(override with SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY).
"""
import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRODUCTS = ROOT / "data" / "products.json"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://ewfyqdkctzswghkreyqa.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_61YrbU2g5vDsmKb-C8IIEQ_CMSERhsS")


def fetch_prices():
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/storefront_prices",
        data=b"{}",
        headers={"apikey": SUPABASE_KEY, "content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        return {row["sku"]: float(row["price"]) for row in json.load(res) if row.get("sku")}


def main():
    live = fetch_prices()
    products = json.loads(PRODUCTS.read_text())
    changed = 0
    for p in products:
        price = live.get(p["sku"])
        # $0 is only ever a placeholder in the admin; keep the existing price.
        if price and price > 0 and price != p["price"]:
            print(f"  {p['sku']:<18} {p['name']} {p['dose']}: ${p['price']:g} -> ${price:g}")
            p["price"] = price
            changed += 1
    missing = [p["sku"] for p in products if p["sku"] not in live]
    PRODUCTS.write_text(json.dumps(products, indent=2))
    print(f"Updated {changed} price(s) in {PRODUCTS.relative_to(ROOT)}.")
    if missing:
        print(f"Not in the admin (kept the existing price): {', '.join(missing)}")


if __name__ == "__main__":
    main()
