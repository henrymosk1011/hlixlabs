#!/usr/bin/env python3
"""
Reads data/price_list_source.xlsx (no external deps — parses the raw
OOXML) and writes data/products.json: one catalog entry per SKU row,
priced at "1 vial = the full pack price", per the site owner's own
pricing rule (a $50/10-vial pack is listed as 1 vial for $50).

Re-run this any time price_list_source.xlsx is replaced, then run
build.py to regenerate the HTML pages.
"""
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "price_list_source.xlsx"
OUT = ROOT / "data" / "products.json"

NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

# Base peptide name -> (category slug, category label)
CATEGORY_MAP = {
    "tirzepatide": ("metabolic", "Metabolic Research"),
    "retatrutide": ("metabolic", "Metabolic Research"),
    "semaglutide": ("metabolic", "Metabolic Research"),
    "cagrilintide": ("metabolic", "Metabolic Research"),
    "survodutide": ("metabolic", "Metabolic Research"),
    "mazdutide": ("metabolic", "Metabolic Research"),
    "aod9604": ("metabolic", "Metabolic Research"),
    "5-amino-1mq": ("metabolic", "Metabolic Research"),
    "slu-pp-332": ("metabolic", "Metabolic Research"),
    "aicar": ("metabolic", "Metabolic Research"),

    "cjc-1295 whitout dac": ("growth", "Growth & GH Secretagogues"),
    "cjc-1295 without dac": ("growth", "Growth & GH Secretagogues"),
    "cjc-1295 with dac": ("growth", "Growth & GH Secretagogues"),
    "cjc-1295  without dac 5mg + ipa 5mg": ("growth", "Growth & GH Secretagogues"),
    "ipamorelin": ("growth", "Growth & GH Secretagogues"),
    "sermorelin acetate": ("growth", "Growth & GH Secretagogues"),
    "hexarelin acetate": ("growth", "Growth & GH Secretagogues"),
    "ghrp-2 acetate": ("growth", "Growth & GH Secretagogues"),
    "ghrp-6 acetate": ("growth", "Growth & GH Secretagogues"),
    "tesamorelin": ("growth", "Growth & GH Secretagogues"),
    "hgh 191aa(somatropin）": ("growth", "Growth & GH Secretagogues"),
    "hcg": ("growth", "Growth & GH Secretagogues"),
    "hmg": ("growth", "Growth & GH Secretagogues"),
    "mgf": ("growth", "Growth & GH Secretagogues"),
    "peg mgf": ("growth", "Growth & GH Secretagogues"),
    "igf-1lr3": ("growth", "Growth & GH Secretagogues"),
    "igf-des": ("growth", "Growth & GH Secretagogues"),
    "gdf-8": ("growth", "Growth & GH Secretagogues"),
    "follistatin": ("growth", "Growth & GH Secretagogues"),

    "bpc 157": ("recovery", "Healing & Recovery"),
    "tb500(thymosin b4 acetate）": ("recovery", "Healing & Recovery"),
    "bpc 5mg + tb 5mg": ("recovery", "Healing & Recovery"),
    "bpc 10mg + tb 10mg": ("recovery", "Healing & Recovery"),
    "ghk-cu": ("recovery", "Healing & Recovery"),
    "ahk-cu": ("recovery", "Healing & Recovery"),
    "kpv": ("recovery", "Healing & Recovery"),
    "ara-290": ("recovery", "Healing & Recovery"),
    "snap-8": ("recovery", "Healing & Recovery"),
    "vip": ("recovery", "Healing & Recovery"),
    "bpc 157 10mg+ghk-cu 50mg+tb500    10mg": ("recovery", "Healing & Recovery"),
    "cu50mg+tb10mg+bc10mg+kpv10mg": ("recovery", "Healing & Recovery"),

    "selank": ("cognitive", "Cognitive & Neuro Health"),
    "semax": ("cognitive", "Cognitive & Neuro Health"),
    "kisspeptin-10": ("cognitive", "Cognitive & Neuro Health"),
    "oxytocin acetate": ("cognitive", "Cognitive & Neuro Health"),
    "dsip": ("cognitive", "Cognitive & Neuro Health"),

    "epithalon": ("longevity", "Longevity & Anti-Aging"),
    "nad": ("longevity", "Longevity & Anti-Aging"),
    "ss-31": ("longevity", "Longevity & Anti-Aging"),
    "mots-c": ("longevity", "Longevity & Anti-Aging"),
    "foxo4": ("longevity", "Longevity & Anti-Aging"),
    "humanin": ("longevity", "Longevity & Anti-Aging"),
    "thymosin alpha-1": ("longevity", "Longevity & Anti-Aging"),
    "thymalin": ("longevity", "Longevity & Anti-Aging"),
    "glutathione": ("longevity", "Longevity & Anti-Aging"),
    "l-carnitine": ("longevity", "Longevity & Anti-Aging"),

    "pt-141": ("hormonal", "Hormonal & Sexual Health"),
    "gonadorelin acetate": ("hormonal", "Hormonal & Sexual Health"),
    "triptorelin acetate/gnrh triptorelin": ("hormonal", "Hormonal & Sexual Health"),
    "alprostadil": ("hormonal", "Hormonal & Sexual Health"),
    "mt-1": ("hormonal", "Hormonal & Sexual Health"),
    "mt-2 (melanotan 2 acetate)": ("hormonal", "Hormonal & Sexual Health"),

    "b12": ("specialty", "Specialty Research"),
    "lemon bottle": ("specialty", "Specialty Research"),
    "adipotide": ("specialty", "Specialty Research"),
    "ace-031": ("specialty", "Specialty Research"),
    "ll37": ("recovery", "Healing & Recovery"),
    "bac.water": ("supplies", "Supplies"),
}

UNIT_RE = re.compile(r"^\s*([\d.]+)\s*(mg|mcg|iu|ml|ug)\b", re.IGNORECASE)
VIALS_RE = re.compile(r"(\d+)\s*vials?", re.IGNORECASE)


def load_rows():
    with zipfile.ZipFile(SRC) as z:
        strings = []
        with z.open("xl/sharedStrings.xml") as f:
            root = ET.parse(f).getroot()
            for si in root.findall("a:si", NS):
                texts = si.findall(".//a:t", NS)
                strings.append("".join(t.text or "" for t in texts))
        with z.open("xl/worksheets/sheet1.xml") as f:
            root2 = ET.parse(f).getroot()
    sheet_data = root2.find("a:sheetData", NS)
    rows = []
    for row in sheet_data.findall("a:row", NS):
        cells = {}
        for c in row.findall("a:c", NS):
            ref = c.get("r")
            col = "".join(ch for ch in ref if ch.isalpha())
            t = c.get("t")
            v = c.find("a:v", NS)
            val = v.text if v is not None else None
            if t == "s" and val is not None:
                val = strings[int(val)]
            cells[col] = val
        rows.append(cells)
    return rows


def slugify(text):
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def title_case_name(name):
    # Preserve existing acronym-style casing where the sheet already has it
    return name.strip()


def parse_quantity(qty):
    m = UNIT_RE.match(qty)
    amount, unit = (m.group(1), m.group(2).lower()) if m else ("", "")
    vm = VIALS_RE.search(qty)
    vial_count = int(vm.group(1)) if vm else 10
    return amount, unit, vial_count


def categorize(name):
    key = name.lower().strip()
    if key in CATEGORY_MAP:
        return CATEGORY_MAP[key]
    # loose contains-match fallback
    for k, v in CATEGORY_MAP.items():
        if k in key or key in k:
            return v
    return ("specialty", "Specialty Research")


def main():
    rows = load_rows()
    data_rows = rows[1:]  # skip header

    last_name = None
    products = []
    seen_slugs = set()
    index_by_key = {}  # (name.lower(), dose) -> index into products, for de-duplication

    for r in data_rows:
        name = r.get("B")
        qty = r.get("C")
        price = r.get("D")
        if name:
            last_name = title_case_name(name)
        if not qty or not price:
            continue
        name = last_name
        if not name:
            continue

        name_clean = re.sub(r"\s+", " ", name).strip()
        amount, unit, vial_count = parse_quantity(qty)
        cat_slug, cat_label = categorize(name_clean)

        display_dose = f"{amount}{unit}" if amount else qty.strip()

        # Duplicate (name, dose) rows in the source sheet are treated as a
        # price correction: the later row wins rather than creating a
        # second catalog entry.
        dedupe_key = (name_clean.lower(), display_dose)
        if dedupe_key in index_by_key:
            products[index_by_key[dedupe_key]]["price"] = float(price)
            continue

        slug_base = slugify(f"{name_clean}-{display_dose}")
        slug = slug_base
        i = 2
        while slug in seen_slugs:
            slug = f"{slug_base}-{i}"
            i += 1
        seen_slugs.add(slug)

        index_by_key[dedupe_key] = len(products)
        products.append({
            "slug": slug,
            "name": name_clean,
            "dose": display_dose,
            "dose_amount": amount,
            "dose_unit": unit,
            "pack_vial_count": vial_count,
            "price": float(price),
            "category": cat_slug,
            "category_label": cat_label,
            "sku": f"HLX-{len(products) + 101}",
            "in_stock": True,
        })

    OUT.write_text(json.dumps(products, indent=2))
    print(f"Wrote {len(products)} products to {OUT}")

    # quick category tally
    tally = {}
    for p in products:
        tally[p["category_label"]] = tally.get(p["category_label"], 0) + 1
    for k, v in sorted(tally.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
