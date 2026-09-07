#!/usr/bin/env python3
"""
Writes data/image-prompts.txt — one ready-to-paste image-generation prompt
per category, for a BLANK vial (no text) in that category's cap color.

Why per-category and blank, not one unique photoreal prompt per product:
AI image generators render small precise label text badly (smudged,
misspelled, inconsistent across regenerations) — asking for 67 unique
legible labels will not look like fntn's crisp printed labels. The
approach that actually works: generate one clean product photo per
category (8 photos total), then let the existing HTML/CSS label — which
is already pixel-perfect text — sit on top of it. See README "Product
images" for the full workflow.
"""
from pathlib import Path
from vial_svg import CATEGORY_COLORS

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "image-prompts.txt"

CATEGORY_NAMES = {
    "metabolic": "Metabolic Research",
    "growth": "Growth & GH Secretagogues",
    "recovery": "Healing & Recovery",
    "cognitive": "Cognitive & Neuro Health",
    "longevity": "Longevity & Anti-Aging",
    "hormonal": "Hormonal & Sexual Health",
    "specialty": "Specialty Research",
    "supplies": "Supplies",
}

BASE_PROMPT = (
    "Studio product photograph of a small pharmaceutical glass vial standing upright, "
    "centered, on a seamless dark charcoal background. Clear glass body, aluminum crimp cap "
    "in {color} colored anodized metal, visible rubber stopper under the cap. Soft "
    "three-point studio lighting with a subtle rim light, gentle reflection beneath the vial, "
    "shallow depth of field. The vial has NO visible label, NO text, NO printing of any kind — "
    "completely blank glass, so a label can be added afterward. Photorealistic, high detail, "
    "8k product photography, similar in style to a premium supplement or pharma brand shoot."
)


def main():
    lines = []
    for slug, hex_color in CATEGORY_COLORS.items():
        name = CATEGORY_NAMES.get(slug, slug)
        lines.append(f"# {name}  (cap color: {hex_color})")
        lines.append(BASE_PROMPT.format(color=hex_color))
        lines.append("")
    OUT.write_text("\n".join(lines))
    print(f"Wrote {len(CATEGORY_COLORS)} prompts to {OUT}")


if __name__ == "__main__":
    main()
