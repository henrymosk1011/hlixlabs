"""
Generates a coded SVG "product photo": a glass research vial with a
custom printed label, styled per category. No raster images, no
external image generation — a consistent vector look across the whole
catalog that is cheap to re-skin later.
"""
import html

CATEGORY_COLORS = {
    "metabolic": "#33e6b0",
    "growth": "#6ea8ff",
    "recovery": "#ff9466",
    "cognitive": "#b48cff",
    "longevity": "#ffd166",
    "hormonal": "#ff6b9d",
    "specialty": "#9aa5b1",
    "supplies": "#8f98a3",
}


def _wrap(text, max_chars, max_lines):
    words = text.split(" ")
    lines = []
    current = ""
    for w in words:
        candidate = (current + " " + w).strip()
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            lines.append(current)
            current = ""
        while len(w) > max_chars:
            cut = max_chars
            plus_idx = w.rfind("+", 0, cut + 1)
            if plus_idx > cut - 6:
                cut = plus_idx + 1 if plus_idx > 0 else cut
            lines.append(w[:cut])
            w = w[cut:]
        current = w
    if current:
        lines.append(current)

    if len(lines) > max_lines:
        overflow = len(lines) > max_lines
        lines = lines[:max_lines]
        last = lines[-1]
        if overflow:
            last = (last[: max_chars - 1] + "…") if len(last) >= max_chars else last + "…"
        lines[-1] = last
    return lines


def _name_typography(name):
    n = len(name)
    if n <= 14:
        return dict(font_size=17, max_chars=12, max_lines=2, line_height=20)
    if n <= 24:
        return dict(font_size=14.5, max_chars=13, max_lines=3, line_height=17)
    if n <= 36:
        return dict(font_size=12.5, max_chars=15, max_lines=3, line_height=15)
    return dict(font_size=11, max_chars=17, max_lines=4, line_height=13)


def render_vial(product, gradient_id_suffix=""):
    name = product["name"]
    dose = product["dose"]
    color = CATEGORY_COLORS.get(product["category"], "#33e6b0")
    sku = product["sku"]
    suffix = gradient_id_suffix or product["slug"]

    typo = _name_typography(name)
    lines = _wrap(name, typo["max_chars"], typo["max_lines"])
    line_height = typo["line_height"]
    label_center_y = 258
    block_height = (len(lines) - 1) * line_height
    start_y = label_center_y - block_height / 2 - 6

    name_tspans = "".join(
        f'<tspan x="130" y="{start_y + i * line_height:.1f}">{html.escape(line)}</tspan>'
        for i, line in enumerate(lines)
    )

    dose_y = start_y + block_height + 34

    glass_id = f"glass-{suffix}"
    cap_id = f"cap-{suffix}"
    shine_id = f"shine-{suffix}"

    return f'''<svg viewBox="0 0 260 460" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="{html.escape(name)} {html.escape(dose)} vial">
  <defs>
    <linearGradient id="{glass_id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3a4750" stop-opacity="0.55"/>
      <stop offset="45%" stop-color="#1c2429" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#0c1113" stop-opacity="0.6"/>
    </linearGradient>
    <linearGradient id="{cap_id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{color}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="{color}" stop-opacity="0.65"/>
    </linearGradient>
    <linearGradient id="{shine_id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <ellipse cx="130" cy="432" rx="70" ry="14" fill="#000" opacity="0.35"/>

  <!-- stopper peeking under cap -->
  <rect x="98" y="66" width="64" height="26" rx="4" fill="#2b2f33"/>

  <!-- crimp cap -->
  <rect x="82" y="58" width="96" height="46" rx="10" fill="url(#{cap_id})"/>
  <ellipse cx="130" cy="58" rx="48" ry="13" fill="{color}"/>
  <ellipse cx="130" cy="58" rx="48" ry="13" fill="#ffffff" opacity="0.12"/>
  <g stroke="#000" stroke-opacity="0.15" stroke-width="1.5">
    <line x1="96" y1="64" x2="96" y2="98"/>
    <line x1="110" y1="62" x2="110" y2="101"/>
    <line x1="150" y1="62" x2="150" y2="101"/>
    <line x1="164" y1="64" x2="164" y2="98"/>
  </g>

  <!-- glass body -->
  <rect x="52" y="100" width="156" height="308" rx="30" fill="url(#{glass_id})" stroke="#ffffff" stroke-opacity="0.14"/>
  <rect x="52" y="100" width="156" height="308" rx="30" fill="url(#{shine_id})"/>

  <!-- label -->
  <rect x="66" y="170" width="128" height="176" rx="14" fill="#f4f5f6"/>
  <rect x="66" y="170" width="128" height="5" rx="2.5" fill="{color}"/>

  <text x="130" y="196" text-anchor="middle" font-family="'Space Grotesk','Inter',sans-serif" font-weight="700" font-size="12" letter-spacing="2" fill="#0a0f0d">HLIX</text>
  <text x="130" y="209" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="7" letter-spacing="1.5" fill="#8a8f94">RESEARCH PEPTIDE</text>
  <line x1="80" y1="218" x2="180" y2="218" stroke="#d8dadc" stroke-width="1"/>

  <text text-anchor="middle" font-family="'Space Grotesk','Inter',sans-serif" font-weight="700" font-size="{typo['font_size']}" fill="#111214">{name_tspans}</text>

  <text data-role="dose-text" x="130" y="{dose_y:.1f}" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-weight="700" font-size="16" fill="{color}">{html.escape(dose)}</text>

  <line x1="80" y1="{dose_y + 14:.1f}" x2="180" y2="{dose_y + 14:.1f}" stroke="#d8dadc" stroke-width="1"/>
  <text x="130" y="{dose_y + 28:.1f}" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="6.5" letter-spacing="1" fill="#9aa0a5">FOR RESEARCH USE ONLY</text>
  <text x="130" y="{dose_y + 39:.1f}" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="6" letter-spacing="0.5" fill="#b7bcc0">NOT FOR HUMAN CONSUMPTION</text>

  <text data-role="sku-text" x="185" y="340" text-anchor="end" font-family="'JetBrains Mono',monospace" font-size="6" fill="#c7cace">{html.escape(sku)}</text>
</svg>'''
