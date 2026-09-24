#!/usr/bin/env python3
"""
Composites a printed label for every catalog variant onto the real product
photo (data/photo/base-black.webp) and writes web-ready images to
assets/img/vials/.

    ./.venv/bin/python scripts/photo_labels.py            # all variants
    ./.venv/bin/python scripts/photo_labels.py --only glp1-s   # proof for one product

How it looks real, not pasted-on:
  * the label artwork is typeset as flat art, then wrapped around the
    bottle's cylinder (x = R*sin(theta)) so type foreshortens toward the edges
  * the white-label photo of the same bottle is used as a lighting map, so the
    ink picks up the same soft falloff and highlights as the paper
  * ink is blended over the black photo's own paper grain

Requires Pillow + numpy (see .venv).
"""
import argparse
import json
import math
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PHOTO = ROOT / "data" / "photo"
OUT = ROOT / "assets" / "img" / "vials"

# --- geometry of the label in the 1024x1536 base photo (measured) ---------
LX0, LX1 = 284, 738          # label left/right edge (full visible diameter)
LY0, LY1 = 618, 1194         # label top/bottom
CX = (LX0 + LX1) / 2         # cylinder centre line
R = (LX1 - LX0) / 2          # cylinder radius in px
CROP_Y0, CROP_Y1 = 128, 1408  # 4:5 crop of the 1024x1536 frame

SCALE = 1.25                 # working/export scale over the source photo
SS = 3                       # supersampling for the label artwork

MINT = (51, 230, 176)
WHITE = (244, 245, 243)

FONT_DISPLAY = PHOTO / "fonts" / "InterTight.ttf"
FONT_MONO = PHOTO / "fonts" / "JetBrainsMono.ttf"


def font(path, size, weight):
    f = ImageFont.truetype(str(path), max(1, int(round(size))))
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def tracked_width(text, f, tracking):
    return sum(f.getlength(c) + tracking for c in text) - (tracking if text else 0)


def draw_tracked(draw, cx, y, text, f, fill, tracking, anchor_y="ls"):
    """Draw text centered on cx with manual letter-spacing (no raqm kerning)."""
    total = tracked_width(text, f, tracking)
    x = cx - total / 2
    for c in text:
        draw.text((x, y), c, font=f, fill=fill, anchor=anchor_y)
        x += f.getlength(c) + tracking


def wrap_lines(text, f, max_w, tracking, allow_break=False):
    """Word wrap with natural break points (spaces, and after '+' or '/').

    Returns None if some unbreakable piece is wider than max_w and allow_break
    is False, so the caller can shrink the type instead of splitting a word.
    """
    lines, cur = [], ""
    for word in text.split():
        pieces = re.findall(r"[^+/]+[+/]?|[+/]", word)
        for i, piece in enumerate(pieces):
            glue = " " if (i == 0 and cur) else ""
            cand = cur + glue + piece
            if tracked_width(cand, f, tracking) <= max_w:
                cur = cand
                continue
            if cur:
                lines.append(cur)
                cur = ""
            if tracked_width(piece, f, tracking) <= max_w:
                cur = piece
                continue
            if not allow_break:
                return None
            while tracked_width(piece, f, tracking) > max_w and len(piece) > 1:
                cut = len(piece) - 1
                while cut > 1 and tracked_width(piece[:cut], f, tracking) > max_w:
                    cut -= 1
                lines.append(piece[:cut])
                piece = piece[cut:]
            cur = piece
    if cur:
        lines.append(cur)
    return lines


def split_dose(dose):
    m = re.match(r"^\s*([\d.,]+)\s*([a-zA-Z]+)\s*$", dose)
    return (m.group(1), m.group(2).lower()) if m else (dose, "")


def render_art(name, dose, sku, k):
    """Flat label art, unrolled around the cylinder: width = pi*R (180deg)."""
    unit = k * SS
    Wa = int(round(math.pi * R * unit))
    Ha = int(round((LY1 - LY0) * unit))
    art = Image.new("RGBA", (Wa, Ha), (0, 0, 0, 0))
    d = ImageDraw.Draw(art)
    cx = Wa / 2
    H = LY1 - LY0  # 576 units

    def U(v):  # label units -> art px
        return v * unit

    # --- brand wordmark ---------------------------------------------------
    f_brand = font(FONT_DISPLAY, U(50), 800)
    brand = "hlix"
    bw = tracked_width(brand, f_brand, U(-1.5))
    draw_tracked(d, cx - U(6), U(78), brand, f_brand, WHITE + (255,), U(-1.5))
    d.ellipse([cx - U(6) + bw / 2 + U(5), U(78) - U(10), cx - U(6) + bw / 2 + U(15), U(78)], fill=MINT + (255,))

    # thin rule + descriptor
    d.rectangle([cx - U(20), U(104), cx + U(20), U(105.6)], fill=MINT + (255,))
    f_tag = font(FONT_MONO, U(12.5), 500)
    draw_tracked(d, cx, U(132), "research peptide", f_tag, WHITE + (120,), U(3.4))

    # --- peptide name (auto-fit) ------------------------------------------
    label = re.sub(r"(?<=\S)\(", " (", name.lower())  # natural break before a parenthetical
    max_w = U(292)
    top, bot = U(168), U(382)
    chosen = None
    for allow_break in (False, True):
        for size in range(96, 27, -2):
            f = font(FONT_DISPLAY, U(size), 800)
            tr = U(-size * 0.028)
            lines = wrap_lines(label, f, max_w, tr, allow_break)
            if lines is None:
                continue
            lh = U(size * 1.02)
            block = lh * (len(lines) - 1) + U(size * 0.72)
            if block <= (bot - top) and len(lines) <= 4:
                chosen = (f, tr, lines, lh, size)
                break
        if chosen:
            break
    if chosen is None:
        size = 28
        f = font(FONT_DISPLAY, U(size), 800)
        tr = U(-size * 0.02)
        chosen = (f, tr, wrap_lines(label, f, max_w, tr, True), U(size * 1.05), size)
    f, tr, lines, lh, size = chosen
    block = lh * (len(lines) - 1) + U(size * 0.72)
    y = (top + bot) / 2 - block / 2 + U(size * 0.72)
    for line in lines:
        draw_tracked(d, cx, y, line, f, WHITE + (255,), tr)
        y += lh

    # --- dose ------------------------------------------------------------
    num, unit_txt = split_dose(dose)
    f_num = font(FONT_MONO, U(54), 500)
    f_unit = font(FONT_MONO, U(26), 400)
    wn = tracked_width(num, f_num, U(-1))
    wu = tracked_width(unit_txt, f_unit, 0) if unit_txt else 0
    gap = U(8) if unit_txt else 0
    x0 = cx - (wn + gap + wu) / 2
    base_y = U(452)
    xx = x0
    for c in num:
        d.text((xx, base_y), c, font=f_num, fill=MINT + (255,), anchor="ls")
        xx += f_num.getlength(c) + U(-1)
    if unit_txt:
        d.text((x0 + wn + gap, base_y), unit_txt, font=f_unit, fill=MINT + (190,), anchor="ls")

    # --- footer ------------------------------------------------------------
    d.rectangle([cx - U(70), U(486), cx + U(70), U(487.2)], fill=WHITE + (46,))
    f_ruo = font(FONT_MONO, U(12), 500)
    draw_tracked(d, cx, U(512), "for research use only", f_ruo, WHITE + (140,), U(2.6))
    f_small = font(FONT_MONO, U(10.5), 400)
    draw_tracked(d, cx, U(532), "not for human consumption", f_small, WHITE + (84,), U(1.6))
    draw_tracked(d, cx, U(553), sku.lower(), f_small, MINT + (150,), U(2.4))
    return art


def label_box(k):
    """Integer label rectangle (x0, y0, width, height) at scale k — single source of truth."""
    return (int(round(LX0 * k)), int(round(LY0 * k)), int(round((LX1 - LX0) * k)), int(round((LY1 - LY0) * k)))


def wrap_to_cylinder(art, k):
    """Map unrolled art (x = R*theta) to screen columns (x = R*sin theta)."""
    _, _, Wl, Hl = label_box(k)
    arr = np.asarray(art).astype(np.float32) / 255.0  # (Ha, Wa, 4)
    Ha, Wa, _ = arr.shape
    # premultiply so antialiased edges don't halo
    arr[..., :3] *= arr[..., 3:4]
    # vertical: average SS rows -> Hl
    arr = arr[: Hl * SS].reshape(Hl, SS, Wa, 4).mean(axis=1)
    # horizontal: sample at 3x sub-columns, then average
    sub = 3
    n = Wl * sub
    xs = (np.arange(n) + 0.5) / n * 2.0 - 1.0          # -1..1 across the diameter
    theta = np.arcsin(np.clip(xs, -0.9999, 0.9999))     # -pi/2..pi/2
    src = (Wa / 2.0) + theta / (math.pi / 2.0) * (Wa / 2.0)
    src = np.clip(src, 0, Wa - 1.001)
    i0 = np.floor(src).astype(int)
    fr = (src - i0)[None, :, None]
    strip = arr[:, i0, :] * (1 - fr) + arr[:, i0 + 1, :] * fr
    strip = strip.reshape(Hl, Wl, sub, 4).mean(axis=2)
    a = strip[..., 3:4]
    rgb = np.where(a > 1e-4, strip[..., :3] / np.maximum(a, 1e-4), 0)
    return rgb, a  # rgb 0..1 (straight), alpha 0..1


def load_bases(k):
    black = Image.open(PHOTO / "base-black.webp").convert("RGB")
    white = Image.open(PHOTO / "base-white.webp").convert("RGB")
    size = (int(round(1024 * k)), int(round(1536 * k)))
    return black.resize(size, Image.LANCZOS), white.resize(size, Image.LANCZOS)


def lighting_map(white, k):
    x0, y0, Wl, Hl = label_box(k)
    crop = white.crop((x0, y0, x0 + Wl, y0 + Hl)).convert("L").filter(ImageFilter.GaussianBlur(3 * k))
    a = np.asarray(crop).astype(np.float32)
    ref = np.percentile(a, 92)
    return np.clip(a / ref, 0.35, 1.08)[..., None]


def composite(black, shade, rgb, alpha, k):
    x0, y0, Wl, Hl = label_box(k)
    base = np.asarray(black).astype(np.float32) / 255.0
    region = base[y0:y0 + Hl, x0:x0 + Wl, :]
    ink = np.clip(rgb * (shade ** 0.95), 0, 1)
    # ink is slightly matte: let a touch of the paper grain show through
    out = region * (1 - alpha) + ink * alpha
    base[y0:y0 + Hl, x0:x0 + Wl, :] = out
    return Image.fromarray((np.clip(base, 0, 1) * 255 + 0.5).astype(np.uint8))


def crop_export(img, k):
    box = (0, int(round(CROP_Y0 * k)), img.width, int(round(CROP_Y1 * k)))
    return img.crop(box)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="product slug (e.g. glp1-s) or sku (e.g. HLX-104); default: all")
    ap.add_argument("--scale", type=float, default=SCALE)
    ap.add_argument("--quality", type=int, default=82)
    args = ap.parse_args()
    k = args.scale

    products = json.loads((ROOT / "data" / "products.json").read_text())
    if args.only:
        key = args.only.lower()
        products = [p for p in products if p["sku"].lower() == key or p["slug"].lower().startswith(key)]
        if not products:
            raise SystemExit(f"no product matches {args.only!r}")

    OUT.mkdir(parents=True, exist_ok=True)
    black, white = load_bases(k)
    shade = lighting_map(white, k)

    for i, p in enumerate(products, 1):
        art = render_art(p["name"], p["dose"], p["sku"], k)
        rgb, alpha = wrap_to_cylinder(art, k)
        img = crop_export(composite(black, shade, rgb, alpha, k), k)
        sku = p["sku"].lower()
        img.save(OUT / f"{sku}.webp", "WEBP", quality=args.quality, method=6)
        small = img.resize((480, int(round(480 * img.height / img.width))), Image.LANCZOS)
        small.save(OUT / f"{sku}-s.webp", "WEBP", quality=args.quality - 4, method=6)
        print(f"[{i}/{len(products)}] {p['name']} {p['dose']} -> {sku}.webp")

    print(f"done: {len(products)} images in {OUT}")


if __name__ == "__main__":
    main()
