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
INK_DARK = (14, 16, 18)        # ink for white paper
DEEP_MINT = (8, 150, 110)      # mint darkened so it stays legible on white

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


def render_art(name, dose, sku, k, paper="black", upper=False):
    """Flat label art, unrolled around the cylinder: width = pi*R (180deg).

    paper: "black" (light ink) or "white" (dark ink, deeper mint). upper: ALL CAPS.
    """
    on_white = paper == "white"
    FG = INK_DARK if on_white else WHITE
    ACC = DEEP_MINT if on_white else MINT
    T = (lambda t: t.upper()) if upper else (lambda t: t.lower())
    name_track = 0.0 if upper else -0.028
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
    brand = T("hlix")
    bw = tracked_width(brand, f_brand, U(-1.5))
    draw_tracked(d, cx - U(6), U(78), brand, f_brand, FG + (255,), U(-1.5))
    d.ellipse([cx - U(6) + bw / 2 + U(5), U(78) - U(10), cx - U(6) + bw / 2 + U(15), U(78)], fill=(MINT if not on_white else DEEP_MINT) + (255,))

    # thin rule + descriptor
    d.rectangle([cx - U(20), U(104), cx + U(20), U(105.6)], fill=ACC + (255,))
    f_tag = font(FONT_MONO, U(12.5), 500)
    draw_tracked(d, cx, U(132), T("research peptide"), f_tag, FG + (150 if on_white else 120,), U(3.4))

    # --- peptide name (auto-fit) ------------------------------------------
    label = T(re.sub(r"(?<=\S)\(", " (", name))  # natural break before a parenthetical
    max_w = U(292)
    top, bot = U(168), U(382)
    chosen = None
    for allow_break in (False, True):
        for size in range(96, 27, -2):
            f = font(FONT_DISPLAY, U(size), 800)
            tr = U(size * name_track)
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
        draw_tracked(d, cx, y, line, f, FG + (255,), tr)
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
        d.text((xx, base_y), c, font=f_num, fill=ACC + (255,), anchor="ls")
        xx += f_num.getlength(c) + U(-1)
    if unit_txt:
        d.text((x0 + wn + gap, base_y), T(unit_txt), font=f_unit, fill=ACC + (190,), anchor="ls")

    # --- footer ------------------------------------------------------------
    d.rectangle([cx - U(70), U(486), cx + U(70), U(487.2)], fill=FG + (70 if on_white else 46,))
    f_ruo = font(FONT_MONO, U(12), 500)
    draw_tracked(d, cx, U(512), T("for research use only"), f_ruo, FG + (170 if on_white else 140,), U(2.6))
    f_small = font(FONT_MONO, U(10.5), 400)
    draw_tracked(d, cx, U(532), T("not for human consumption"), f_small, FG + (120 if on_white else 84,), U(1.6))
    draw_tracked(d, cx, U(553), T(sku), f_small, ACC + (190 if on_white else 150,), U(2.4))
    return art


def render_art_badge(name, dose, sku, k, form="recon", wordmark="dot-center"):
    """'Badge' layout: big wordmark, bold UPPERCASE name, dose in a rounded pill, purity line.

    form: "recon" (mint pill, shows suggested bac-water volume e.g. "10MG/2ML")
          or "powder" (white pill, plain dose only e.g. "10MG" — as-shipped, unmixed).
    """
    unit = k * SS
    Wa = int(round(math.pi * R * unit))
    Ha = int(round((LY1 - LY0) * unit))
    art = Image.new("RGBA", (Wa, Ha), (0, 0, 0, 0))
    d = ImageDraw.Draw(art)
    cx = Wa / 2

    def U(v):
        return v * unit

    # --- wordmark + tagline (tagline: "hlixlabs.com", "labs" in mint) --------
    draw_wordmark(d, art, cx, U(112), wordmark, U)
    f_tag = font(FONT_MONO, U(12), 500)
    tagline = "hlixlabs.com"
    tr_t = U(3.6)
    tw = tracked_width(tagline, f_tag, tr_t)
    tx = cx - tw / 2
    for i, ch in enumerate(tagline):
        mint_hit = 4 <= i <= 7  # "labs" within "hlixlabs.com"
        fill = (MINT + (210,)) if mint_hit else (WHITE + (135,))
        d.text((tx, U(142)), ch, font=f_tag, fill=fill, anchor="ls")
        tx += f_tag.getlength(ch) + tr_t

    # --- name (auto-fit, UPPERCASE) ---------------------------------------
    label = re.sub(r"(?<=\S)\(", " (", name).upper()
    max_w = U(296)
    top, bot = U(172), U(338)
    chosen = None
    for allow_break in (False, True):
        for size in range(104, 27, -2):
            f = font(FONT_DISPLAY, U(size), 800)
            tr = U(size * 0.004)
            lines = wrap_lines(label, f, max_w, tr, allow_break)
            if lines is None:
                continue
            lh = U(size * 1.04)
            block = lh * (len(lines) - 1) + U(size * 0.72)
            if block <= (bot - top) and len(lines) <= 4:
                chosen = (f, tr, lines, lh, size)
                break
        if chosen:
            break
    if chosen is None:
        size = 28
        f = font(FONT_DISPLAY, U(size), 800)
        tr = U(0)
        chosen = (f, tr, wrap_lines(label, f, max_w, tr, True), U(size * 1.05), size)
    f, tr, lines, lh, size = chosen
    block = lh * (len(lines) - 1) + U(size * 0.72)
    y = (top + bot) / 2 - block / 2 + U(size * 0.72)
    for line in lines:
        draw_tracked(d, cx, y, line, f, WHITE + (255,), tr)
        y += lh

    # --- dose / concentration pill -----------------------------------------
    num, unit_txt = split_dose(dose)
    unit_up = unit_txt.upper()
    ml = recon_ml(num, unit_txt.lower()) if form == "recon" else None
    if ml is not None:
        dose_txt = f"{num}{unit_up}/{ml}ML"  # e.g. 10MG/2ML — suggested reconstitution volume
    else:
        dose_txt = f"{num}{unit_up}"  # powder form, or already-liquid items: no recon note
    pill_size = 44
    f_dose = font(FONT_DISPLAY, U(pill_size), 800)
    tw = tracked_width(dose_txt, f_dose, U(0.5))
    while tw > U(272) and pill_size > 24:
        pill_size -= 2
        f_dose = font(FONT_DISPLAY, U(pill_size), 800)
        tw = tracked_width(dose_txt, f_dose, U(0.5))
    pw = max(U(178), min(U(320), tw + U(64)))
    ph = U(72)
    py = U(374)
    fill = (MINT if form == "recon" else WHITE) + (255,)
    d.rounded_rectangle([cx - pw / 2, py, cx + pw / 2, py + ph], radius=U(20), fill=fill)
    draw_tracked(d, cx, py + ph / 2 + U(15.5) * (pill_size / 44), dose_txt, f_dose, (10, 12, 12, 255), U(0.5))

    # --- vial / RUO ----------------------------------------------------------
    f_meta = font(FONT_MONO, U(10.5), 500)
    draw_tracked(d, cx, U(504), "3ML MULTIPLE USE VIAL", f_meta, WHITE + (110,), U(2.2))
    f_ruo = font(FONT_MONO, U(11.5), 500)
    draw_tracked(d, cx, U(532), "FOR RESEARCH USE ONLY", f_ruo, WHITE + (160,), U(2.4))
    return art

def _glyph_vextent(f, ch):
    """(top, bottom) of a glyph's ink relative to its own baseline, via a scratch render.

    The scratch canvas is sized off the font's own pixel size so a tall ascender at a
    large em-size can't clip off the top before it's even measured.
    """
    fs = getattr(f, "size", 100)
    pad = int(fs * 2.2)
    origin_y = int(fs * 1.3)
    scratch = Image.new("L", (pad, pad), 0)
    ImageDraw.Draw(scratch).text((pad // 4, origin_y), ch, font=f, fill=255, anchor="ls")
    arr = np.asarray(scratch)
    rows = np.where(arr.max(axis=1) > 10)[0]
    if len(rows) == 0:
        return (0, 0)
    return (int(rows.min()) - origin_y, int(rows.max()) - origin_y)


def _dot_mask(f):
    """Exact alpha mask of the 'i' tittle ONLY — no synthetic shape, the real glyph's
    own antialiased dot pixels. Isolated by rendering 'i' and dotless-i (U+0131,
    Turkish 'i') at the same anchor and subtracting: dotless-i is 'i' minus its dot,
    with the identical stem, so whatever's left over is exactly the tittle. ('l' seems
    like a natural substitute but its ascender can extend higher than 'i''s stem in
    some fonts, canceling part of the dot along with the stem.)

    The scratch canvas is sized off the font's own pixel size — undersizing it clips
    the very top of the glyph (dot included) before it can be measured at all.

    Returns (mask 2D uint8 array, dx, dy) where (dx, dy) is the mask's top-left
    corner relative to the glyph's own drawing anchor (x, baseline).
    """
    fs = getattr(f, "size", 100)
    pad = int(fs * 2.2)
    ox, oy = pad // 4, int(fs * 1.3)

    def render(ch):
        scratch = Image.new("L", (pad, pad), 0)
        ImageDraw.Draw(scratch).text((ox, oy), ch, font=f, fill=255, anchor="ls")
        return np.asarray(scratch).astype(np.int16)

    diff = np.clip(render("i") - render("ı"), 0, 255).astype(np.uint8)
    ys, xs = np.where(diff > 8)
    if len(ys) == 0:
        return None
    pad_m = 2
    y0, y1 = max(0, ys.min() - pad_m), min(pad, ys.max() + 1 + pad_m)
    x0, x1 = max(0, xs.min() - pad_m), min(pad, xs.max() + 1 + pad_m)
    return (diff[y0:y1, x0:x1], x0 - ox, y0 - oy)


def _recolor_dot(img, x, baseline_y, f, color):
    """Repaints exactly the existing 'i' tittle pixels at (x, baseline_y) to `color`.

    Nothing is added or removed — this blends the new color into the real glyph's own
    antialiased dot using its exact mask, so the shape is untouched, only the color.
    """
    found = _dot_mask(f)
    if not found:
        return
    mask, dx, dy = found
    px, py = int(round(x + dx)), int(round(baseline_y + dy))
    h, w = mask.shape
    if px < 0 or py < 0 or px + w > img.width or py + h > img.height:
        return
    arr = np.array(img)
    region = arr[py:py + h, px:px + w].astype(np.float32)
    a = (mask.astype(np.float32) / 255.0)[..., None]
    col = np.array([color[0], color[1], color[2], 255], dtype=np.float32)
    arr[py:py + h, px:px + w] = (region * (1 - a) + col * a).astype(np.uint8)
    img.paste(Image.fromarray(arr, "RGBA"), (0, 0))


def draw_wordmark(d, img, cx, baseline_y, style, U):
    """Draws the label wordmark. style: 'dot-center', 'dot-baseline' or 'hlixlabs'."""
    f_brand = font(FONT_DISPLAY, U(92), 800)
    tr_b = U(-4)

    if style == "hlixlabs":
        word1, word2 = "hlix", "labs"
        full = word1 + word2
        total_w = tracked_width(full, f_brand, tr_b)
        x = cx - total_w / 2
        for i, ch in enumerate(full):
            w = f_brand.getlength(ch)
            color = WHITE if i < len(word1) else MINT
            d.text((x, baseline_y), ch, font=f_brand, fill=color + (255,), anchor="ls")
            if ch == "i" and i < len(word1):
                _recolor_dot(img, x, baseline_y, f_brand, MINT)
            x += w + tr_b
        return

    brand = "hlix"
    bw = tracked_width(brand, f_brand, tr_b)
    left = cx - U(11) - bw / 2
    draw_tracked(d, cx - U(11), baseline_y, brand, f_brand, WHITE + (255,), tr_b)
    if style == "dot-baseline":
        r = U(7)
        center_y = baseline_y - r
    else:  # dot-center: true visual middle of the "x" itself (x-height, not cap-height)
        top, bottom = _glyph_vextent(f_brand, "x")
        center_y = baseline_y + (top + bottom) / 2
        r = U(9.5)
    dx = left + bw + U(6)
    d.ellipse([dx, center_y - r, dx + 2 * r, center_y + r], fill=MINT + (255,))


def recon_ml(amount, unit):
    """Suggested bac-water reconstitution volume printed on the label, in mL.

    Roughly a 10mg-per-mL rule with practical rounding to common bac-water fill
    sizes (1/2/3/5/10 mL), per the site owner's explicit anchors: 5mg->1mL,
    10-20mg->2mL, 30mg->3mL. Returns None for already-liquid items (mL doses).
    """
    amount = float(amount)
    if unit == "mg":
        if amount <= 5:
            return 1
        if amount <= 20:
            return 2
        if amount <= 30:
            return 3
        if amount <= 100:
            return 5
        return 10
    if unit == "iu":
        return 1 if amount <= 100 else 2
    return None



def label_box(k):
    """Integer label rectangle (x0, y0, width, height) at scale k — single source of truth."""
    return (int(round(LX0 * k)), int(round(LY0 * k)), int(round((LX1 - LX0) * k)), int(round((LY1 - LY0) * k)))


# The photo is shot from slightly above the label, so horizontal rings on the glass
# appear as shallow arcs: measured label edges rise ~22px at the silhouette vs. the centre
# (fits rise = B * (1 - sqrt(1 - s^2)), B ~= 33px at the 1024px base scale).
CURVE_B = 33.0


def wrap_to_cylinder(art, k, curve=True):
    """Map unrolled art to the bottle: x = R*sin(theta) around the cylinder, and every
    line bows along the same perspective ellipse as the label's real edges."""
    _, _, Wl, Hl = label_box(k)
    arr = np.asarray(art).astype(np.float32) / 255.0  # (Ha, Wa, 4)
    Ha, Wa, _ = arr.shape
    arr[..., :3] *= arr[..., 3:4]  # premultiply so antialiased edges don't halo

    sub = 3
    n = Wl * sub
    xs = (np.arange(n) + 0.5) / n * 2.0 - 1.0          # -1..1 across the diameter
    theta = np.arcsin(np.clip(xs, -0.9999, 0.9999))     # -pi/2..pi/2
    src = (Wa / 2.0) + theta / (math.pi / 2.0) * (Wa / 2.0)
    src = np.clip(src, 0, Wa - 1.001)
    i0 = np.floor(src).astype(int)
    fr = (src - i0)[None, :, None]

    # content near the edges is sampled from lower rows, so it appears higher on screen
    shift = CURVE_B * k * (1.0 - np.sqrt(1.0 - np.clip(xs, -0.9999, 0.9999) ** 2)) if curve else np.zeros(n)
    base_rows = np.arange(Hl, dtype=np.float32)[:, None] + shift[None, :].astype(np.float32)

    acc = np.zeros((Hl, n, 4), dtype=np.float32)
    ic = i0[None, :]
    for m in range(SS):  # SS vertical sub-samples per output row, each bilinear in x and y
        rf = np.clip(base_rows * SS + m, 0, Ha - 1.001)
        r0 = np.floor(rf).astype(int)
        wy = (rf - r0)[..., None]
        top = arr[r0, ic] * (1 - fr) + arr[r0, ic + 1] * fr
        bot = arr[r0 + 1, ic] * (1 - fr) + arr[r0 + 1, ic + 1] * fr
        acc += top * (1 - wy) + bot * wy
    strip = (acc / SS).reshape(Hl, Wl, sub, 4).mean(axis=2)
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


def composite(photo, shade, rgb, alpha, k, paper="black"):
    x0, y0, Wl, Hl = label_box(k)
    base = np.asarray(photo).astype(np.float32) / 255.0
    region = base[y0:y0 + Hl, x0:x0 + Wl, :]
    if paper == "white":
        # dark ink on white paper: multiply, so the photo's own shading and grain show through the ink
        out = region * (1 - alpha) + region * rgb * alpha
    else:
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
    ap.add_argument("--paper", choices=["black", "white"], default="black")
    ap.add_argument("--case", choices=["lower", "upper"], default="lower", dest="case")
    ap.add_argument("--flat", action="store_true", help="disable the perspective curve (for comparison)")
    ap.add_argument("--layout", choices=["classic", "badge"], default="badge")
    ap.add_argument("--form", choices=["powder", "recon", "both"], default="both", help="badge layout, --outdir proofs only; the real run always writes both")
    ap.add_argument("--wordmark", choices=["dot-center", "dot-baseline", "hlixlabs"], default="dot-center")
    ap.add_argument("--outdir", help="write proofs here (full size only, tagged with the style) instead of assets/img/vials")
    args = ap.parse_args()
    k = args.scale

    products = json.loads((ROOT / "data" / "products.json").read_text())
    if args.only:
        key = args.only.lower()
        products = [p for p in products if p["sku"].lower() == key or p["slug"].lower().startswith(key)]
        if not products:
            raise SystemExit(f"no product matches {args.only!r}")

    out_dir = Path(args.outdir) if args.outdir else OUT
    out_dir.mkdir(parents=True, exist_ok=True)
    black, white = load_bases(k)
    shade = lighting_map(white, k)

    photo = white if args.paper == "white" else black

    def render_one(p, form):
        if args.layout == "badge":
            art = render_art_badge(p["name"], p["dose"], p["sku"], k, form=form, wordmark=args.wordmark)
        else:
            art = render_art(p["name"], p["dose"], p["sku"], k, paper=args.paper, upper=(args.case == "upper"))
        rgb, alpha = wrap_to_cylinder(art, k, curve=not args.flat)
        return crop_export(composite(photo, shade, rgb, alpha, k, args.paper), k)

    forms = ["powder", "recon"] if args.form == "both" else [args.form]

    for i, p in enumerate(products, 1):
        sku = p["sku"].lower()

        if args.layout != "badge":
            img = render_one(p, None)
            if args.outdir:
                tag = f"{args.paper}-{args.case}" + ("-flat" if args.flat else "")
                img.save(out_dir / f"{sku}-{tag}.png")
                print(f"[{i}/{len(products)}] {p['name']} {p['dose']} -> {sku}-{tag}.png")
                continue
            img.save(out_dir / f"{sku}.webp", "WEBP", quality=args.quality, method=6)
            small = img.resize((480, int(round(480 * img.height / img.width))), Image.LANCZOS)
            small.save(out_dir / f"{sku}-s.webp", "WEBP", quality=args.quality - 4, method=6)
            print(f"[{i}/{len(products)}] {p['name']} {p['dose']} -> {sku}.webp")
            continue

        run_forms = forms if args.outdir else ["powder", "recon"]  # real run: always write both
        for form in run_forms:
            img = render_one(p, form)
            if args.outdir:
                tag = f"badge-{form}-{args.wordmark}" + ("-flat" if args.flat else "")
                img.save(out_dir / f"{sku}-{tag}.png")
                print(f"[{i}/{len(products)}] {p['name']} {p['dose']} -> {sku}-{tag}.png")
                continue
            img.save(out_dir / f"{sku}-{form}.webp", "WEBP", quality=args.quality, method=6)
            small = img.resize((480, int(round(480 * img.height / img.width))), Image.LANCZOS)
            small.save(out_dir / f"{sku}-{form}-s.webp", "WEBP", quality=args.quality - 4, method=6)
            print(f"[{i}/{len(products)}] {p['name']} {p['dose']} -> {sku}-{form}.webp")

    print(f"done: {len(products)} images in {out_dir}")


if __name__ == "__main__":
    main()
