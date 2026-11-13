#!/usr/bin/env python3
"""
Generates the v2 design, archived at /v2/ since the v3 design (scripts/build_v3.py)
became the main site: minimal, bold, lowercase, scroll-driven. Kept working and
reachable at /v2/, but noindex and linked from nowhere, like /v1/.

    python3 scripts/build_v2.py

Writes v2/ and, at the repo root, planner-embed.html: the dose planner the admin's
Calendar page frames (planner_app(), assets/css/planner.css), which stays at the root
whatever design the site has. planner_app() is also the planner on the main site's
/planner page (build_v3.py) and on /v2/calculator.

Every link in v2/ is written root-absolute (/v2/catalog, /assets/...): the site drops
trailing slashes (vercel.json), so /v2/ is served as /v2, where relative links would
resolve against the site root and lead into the main site.
"""
import json
import shutil
import time
from collections import Counter
from pathlib import Path

import build as b
from vial_svg import render_vial, CATEGORY_COLORS

ROOT = b.ROOT
OUT = ROOT / "v2"
SITE_PATH = "/v2/"             # where OUT is served
UP = "../" * len(OUT.relative_to(ROOT).parts)  # from OUT up to the site root, where assets/ is
VER = str(int(time.time()))
CONTACT_EMAIL = b.CONTACT_EMAIL
COA = json.loads((ROOT / "data" / "coa.json").read_text())

ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
ARROW_UR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>'
SEARCH = b.icon("search")
SPARK = b.icon("sparkles")
CLOSE = b.icon("close")
SUN = b.icon("sun")
MOON = b.icon("moon")
CART = b.icon("cart")
USER = b.icon("user")

esc = b.html_escape
money = b.money
recon_price = b.recon_price


# ------------------------------------------------------------------ svg ---

def syringe_svg(uid):
    ticks = ""
    for i in range(21):
        x = 75 + 13 * i
        y1, y2 = (34, 66) if i % 5 == 0 else (40, 60)
        ticks += f'<line x1="{x}" y1="{y1}" x2="{x}" y2="{y2}"/>'
    labels = "".join(
        f'<text class="tick" x="{75 + 65 * i}" y="92">{v}</text>' for i, v in enumerate(["0", "25", "50", "75", "100"])
    )
    return f'''<svg viewBox="0 0 440 100" aria-hidden="true">
  <defs>
    <clipPath id="{uid}-clip"><rect x="75" y="31" width="260" height="38" rx="6"/></clipPath>
    <linearGradient id="{uid}-liq" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1fd39c"/><stop offset="1" stop-color="#33e6b0"/></linearGradient>
  </defs>
  <line class="needle" x1="6" y1="50" x2="50" y2="50"/>
  <polygon class="hub" points="50,42 72,46 72,54 50,58"/>
  <rect class="barrel" x="75" y="30" width="260" height="40" rx="8"/>
  <g clip-path="url(#{uid}-clip)"><rect class="fill" x="75" y="30" width="260" height="40" fill="url(#{uid}-liq)"/></g>
  <g class="ticks">{ticks}</g>
  <g class="plunger"><rect class="rod" x="75" y="45" width="70" height="10" rx="3"/><rect class="flange" x="131" y="35" width="14" height="30" rx="4"/><rect class="cap" x="71" y="24" width="8" height="52" rx="3"/></g>
  {labels}
</svg>'''


CHEV_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>'
CHEV_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>'


VIALS = ROOT / "assets" / "img" / "vials"
HERO_CUTOUTS = VIALS / "hero-cutout"


def has_photo(v):
    return (VIALS / f"{v['sku'].lower()}-recon.webp").exists()


def hero_cutout_path(v):
    """Background-removed (true alpha) version of a vial photo, used only for
    the homepage hero where the bottle floats over the page background with
    no card behind it. Falls back to the regular studio photo (solid backdrop)
    everywhere else, where a dark stage card sits behind the image anyway."""
    p = HERO_CUTOUTS / f"{v['sku'].lower()}-recon-cut.webp"
    return p if p.exists() else None


def vial_media(v, uid, size, root, alt=None, eager=False, form="recon"):
    """Photoreal composited bottle when assets/img/vials/<sku>-<form>.webp exists, else the coded SVG.

    size 's' = 480x600 thumbnail, 'l' = 1280x1600. root = relative path to the site root.
    form 'recon' (mint pill, shows bac-water volume) or 'powder' (white pill, plain dose).
    """
    if has_photo(v):
        sku = v["sku"].lower()
        f = f"{sku}-{form}-s.webp" if size == "s" else f"{sku}-{form}.webp"
        w, h = (480, 600) if size == "s" else (1280, 1600)
        alt = alt or f"{v['name']} {v['dose']} research vial"
        load = "" if eager else ' loading="lazy"'
        decoding = "sync" if eager else "async"
        return (f'<img src="{root}assets/img/vials/{f}" data-base="{root}assets/img/vials/" '
                f'data-sku="{sku}" data-form="{form}" alt="{esc(alt)}" '
                f'width="{w}" height="{h}" decoding="{decoding}"{load}>')
    return render_vial(v, gradient_id_suffix=uid)


# ---------------------------------------------------------------- shell ---

def nav(p, page):
    def a(href, label, key):
        cur = ' aria-current="page"' if key == page else ""
        return f'<a href="{p}{href}"{cur}>{label}</a>'

    links = a("about", "about", "about") + a("catalog", "catalog", "catalog") + a("calculator", "calculator", "calculator")
    return f'''<div class="progress" aria-hidden="true"><i></i></div>
<header class="nav" data-nav>
  <a class="nav__brand" href="{p or './'}" aria-label="hlix home">hlix<i></i></a>
  <nav class="nav__links" aria-label="primary">{links}</nav>
  <div class="nav__right">
    <button class="nav__search" data-search-open aria-label="search">{SEARCH}<span>search</span><kbd>/</kbd></button>
    <button class="nav__theme" data-theme-toggle aria-label="switch to light theme"><span class="nav__theme-sun">{SUN}</span><span class="nav__theme-moon">{MOON}</span></button>
    <a class="nav__account" href="{p}account" aria-label="your account"{' aria-current="page"' if page == "account" else ""}>{USER}<i aria-hidden="true"></i></a>
    <button class="nav__cart" data-cart-open aria-label="view cart">{CART}<span class="nav__cart-count" data-cart-count hidden>0</span></button>
    <a class="btn btn--sm" href="{p}contact" data-magnetic>contact</a>
    <button class="nav__burger" data-menu-toggle aria-label="menu" aria-expanded="false"><i></i><i></i></button>
  </div>
</header>
<div class="menu">
  <nav class="menu__links">
    <a style="--i:0" href="{p}about"><span>01</span>about</a>
    <a style="--i:1" href="{p}catalog"><span>02</span>catalog</a>
    <a style="--i:2" href="{p}calculator"><span>03</span>calculator</a>
    <a style="--i:3" href="{p}contact"><span>04</span>contact</a>
    <a style="--i:4" href="{p}account"><span>05</span>account</a>
  </nav>
  <div class="menu__foot"><button data-search-open class="link-arrow">search products {SEARCH}</button><span>{CONTACT_EMAIL}</span></div>
</div>
<div class="search" data-search role="dialog" aria-label="search">
  <button class="x" data-search-close aria-label="close search">{CLOSE}</button>
  <div class="search__in">
    <div class="search__field">{SEARCH}<input data-search-input type="text" placeholder="search by name, keyword, or topic" autocomplete="off" spellcheck="false"></div>
    <div data-search-hint>
      <p class="search__hint">start typing a name, or search by keyword or topic</p>
      <div class="search__try"><button data-try="hair">hair</button><button data-try="sleep">sleep</button><button data-try="fat loss">fat loss</button><button data-try="muscle growth">muscle growth</button><button data-try="recovery">recovery</button><button data-try="skin">skin</button></div>
    </div>
    <div data-search-list></div>
  </div>
</div>
<div class="cart" data-cart role="dialog" aria-label="cart">
  <div class="cart__head"><h2>cart</h2><button class="x" data-cart-close aria-label="close cart">{CLOSE}</button></div>
  <div class="cart__list" data-cart-list></div>
  <p class="cart__empty" data-cart-empty hidden>your cart is empty.</p>
  <div class="cart__foot" data-cart-foot hidden>
    <div class="cart__subtotal"><span>subtotal</span><b data-cart-subtotal>$0</b></div>
    <a class="btn btn--solid btn--block" href="{p}checkout" data-magnetic>checkout {ARROW}</a>
    <p class="cart__note">no payment is collected here — we'll follow up by email with next steps.</p>
  </div>
</div>'''


def footer(p, groups):
    cats = "".join(
        f'<a href="{p}catalog#{s}">{l}</a>' for s, l, _ in b.CATEGORY_ORDER if s != "supplies"
    )
    return f'''<footer class="foot">
  <div class="wrap foot__top">
    <div><p class="kicker">// hlix</p><p class="foot__lede">a research peptide catalog. every compound in stock, logged with its dose, spec and price.</p></div>
    <div class="foot__col"><h4>catalog</h4>{cats}</div>
    <div class="foot__col"><h4>site</h4><a href="{p}about">about</a><a href="{p}calculator">calculator</a><a href="{p}contact">contact</a></div>
    <div class="foot__col"><h4>contact</h4><a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a><span>research use only</span></div>
  </div>
  <div class="wrap foot__legal">
    <p>© 2026 hlix. for laboratory research use only. not for human or animal consumption. nothing on this site is medical advice, and nothing here is an offer to sell a controlled or prescription substance.</p>
  </div>
</footer>'''


FONTS = '''<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">'''


def shell(*, title, desc, page, body, depth=0, groups=(), scripts=(), body_class="", noindex=False, css=()):
    p = "../" * depth          # this design's root, for pages
    a = p + UP                 # the site root, for files (assets/)
    js = "".join(f'<script src="{a}assets/js/{s}?v={VER}" defer></script>' for s in scripts)
    links = "".join(f'<link rel="stylesheet" href="{a}assets/css/{c}?v={VER}">' for c in css)  # a page's own, after v2.css
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#050607">
<title>{title} · hlix</title>
<meta name="description" content="{esc(desc)}">{'\n<meta name="robots" content="noindex, nofollow">' if noindex or OUT != ROOT else ''}
{FONTS}
<link rel="stylesheet" href="{a}assets/css/v2.css?v={VER}">{links}
<script src="{a}assets/js/v2-boot.js?v={VER}" data-base="{p}"></script>
</head>
<body class="{body_class}" data-page="{page}">
{nav(p, page)}
<main>
{body}
</main>
{footer(p, groups)}
<div class="lb" data-lb aria-hidden="true"><button class="x" aria-label="close">{CLOSE}</button><div class="lb__in"></div></div>
<script src="{a}assets/js/search-index.js?v={VER}"></script>
<script src="{a}assets/js/v2-prices.js?v={VER}"></script>
<script src="{a}assets/js/v2.js?v={VER}"></script>
<script src="{a}assets/js/v2-cart.js?v={VER}"></script>
{js}
<script src="{a}assets/js/v2-chat.js?v={VER}"></script>
</body>
</html>'''


# ---------------------------------------------------------------- cards ---

def live_price_attrs(g):
    """Marks a "from $X" / "$X" price so assets/js/v2-prices.js can swap in the live (admin) price."""
    skus = ",".join(v["sku"] for v in g["variants"])
    return f' data-live-price="{esc(skus)}"' + (" data-live-from" if len(g["variants"]) > 1 else "")


def card(g, p, uid_prefix="c"):
    d = g["default"]
    svg = vial_media(d, f"{uid_prefix}-{g['slug']}", "s", p + "../")
    multi = len(g["variants"]) > 1
    price = f"from {money(g['min_price'])}" if multi else money(d["price"])
    meta = f"{g['category_label']} · {len(g['variants'])} sizes" if multi else f"{g['category_label']} · {d['dose']}"
    color = CATEGORY_COLORS.get(g["category"], "#33e6b0")
    tags_attr = esc(",".join(t.lower() for t in g["tags"]))
    return f'''<a class="pcard" href="{p}peptides/{g['slug']}" data-cat="{g['category']}" data-name="{esc(g['name'].lower())}" data-tags="{tags_attr}" style="--c:{color}" data-reveal>
  <div class="pcard__stage">{svg}</div>
  <div class="pcard__row"><h3>{esc(g['name'])}</h3><span class="pcard__price"{live_price_attrs(g)}>{price}</span></div>
  <p class="pcard__meta">{esc(meta)}</p>
</a>'''


# ----------------------------------------------------------------- home ---

def page_home(groups):
    by_name = {g["name"]: g for g in groups}
    wanted = ["GLP1-S", "GLP2-T", "GLP3-R", "BPC 157", "Semax", "Epithalon", "Ipamorelin", "NAD"]
    featured = [by_name[n] for n in wanted if n in by_name][:8]
    hero_names = ["GLP1-S", "BPC 157", "Ipamorelin"]
    hero = [by_name[n] for n in hero_names if n in by_name]
    while len(hero) < 3:
        hero.append(groups[len(hero)])

    def hv(g, cls, sp, rot, uid):
        cutout = hero_cutout_path(g["default"])
        if cutout:
            alt = f"{g['default']['name']} {g['default']['dose']} research vial"
            svg = (f'<img src="../assets/img/vials/hero-cutout/{cutout.name}" alt="{esc(alt)}" '
                   f'width="1280" height="1600">')
            photo = " hv--photo hv--cut"
        else:
            svg = vial_media(g["default"], f"hero-{uid}", "l", "../", eager=True)
            photo = " hv--photo" if has_photo(g["default"]) else ""
        return f'<div class="hv {cls}{photo}" data-parallax="{sp}" data-rot="{rot}"><div class="hv__in">{svg}</div></div>'

    hero_vials = hv(hero[0], "hv--a", "-0.10", "0", "a") + hv(hero[1], "hv--b", "0.06", "0", "b") + hv(hero[2], "hv--c", "0.14", "0", "c")

    lcards = ""
    for i, g in enumerate(featured):
        d = g["default"]
        svg = vial_media(d, f"ln-{g['slug']}", "s", "../")
        multi = len(g["variants"]) > 1
        price = f"from {money(g['min_price'])}" if multi else money(d["price"])
        color = CATEGORY_COLORS.get(g["category"], "#33e6b0")
        lcards += f'''<a class="lcard" href="peptides/{g['slug']}" style="--c:{color}">
      <div class="lcard__stage">{svg}</div>
      <div class="lcard__meta"><span class="lcard__n">{i + 1:02d}</span><h3>{esc(g['name'])}</h3><span{live_price_attrs(g)}>{price}</span></div>
    </a>'''

    words = ["metabolic", "recovery", "growth", "cognitive", "longevity", "hormonal"]
    group_html = "".join(f'<span class="marq__item">{w}</span>' for w in words)
    marq1 = f'<div class="marq" data-marq="-1" aria-hidden="true"><div class="marq__track">{group_html}{group_html}</div></div>'
    words2 = list(reversed(words))
    group2 = "".join(f'<span class="marq__item">{w}</span>' for w in words2)
    marq2 = f'<div class="marq" data-marq="1" aria-hidden="true"><div class="marq__track">{group2}{group2}</div></div>'

    crows = ""
    for i, (slug, label, _) in enumerate([c for c in b.CATEGORY_ORDER if c[0] != "supplies"]):
        n = sum(1 for g in groups if g["category"] == slug)
        crows += f'''<a class="crow" href="catalog#{slug}" style="--c:{CATEGORY_COLORS[slug]};--d:{i}" data-reveal>
      <span class="crow__n">{i + 1:02d}</span><span class="crow__t">{esc(label)}</span><span class="crow__c">{n} compounds</span><span class="crow__a">{ARROW}</span>
    </a>'''

    # sample conversation built from real catalog data so the mock never lies
    sample = by_name.get("DSIP") or next(g for g in groups if len(g["variants"]) > 2)
    parts = [f'{esc(v["dose"])} (<span data-live-price="{esc(v["sku"])}">{money(v["price"])}</span>)' for v in sample["variants"]]
    answer = f"{esc(sample['name'].lower())} comes in {len(parts)} sizes: " + ", ".join(parts[:-1]) + f" and {parts[-1]}, priced per vial."
    question = f"what sizes does {sample['name'].lower()} come in?"

    total = len(groups)
    variants = sum(len(g["variants"]) for g in groups)
    cats = len({g["category"] for g in groups if g["category"] != "supplies"})

    body = f'''
<section class="hero" data-hero>
  <div class="hero__bg"><span class="blob blob--a"></span><span class="blob blob--b"></span></div>
  <div class="hero__vials" aria-hidden="true">{hero_vials}</div>
  <div class="wrap">
    <p class="hero__label" data-reveal="fade">research peptide catalog</p>
    <h1 class="hero__title" data-split><span>research-grade.</span><br><span class="ol">cataloged.</span><br><span class="ac">clearly priced.</span></h1>
    <div class="hero__bar" data-reveal style="--d:6">
      <p class="hero__sub">every research peptide in stock: dose, spec and price in one place.</p>
      <div class="hero__cta"><a class="btn btn--solid" href="catalog" data-magnetic>explore the catalog {ARROW}</a><a class="btn" href="calculator" data-magnetic>open calculator</a></div>
    </div>
  </div>
  <div class="cue" aria-hidden="true">scroll</div>
</section>

{marq1}{marq2}

<section class="statement">
  <div class="wrap"><p data-scrub>every peptide in stock, logged with its <span class="hl">dose</span>, its <span class="hl">spec</span> and its <span class="hl">price</span>. no guessing what's on hand. no guessing what it cost.</p></div>
</section>

<div class="wrap"><div class="stats">
  <div class="stat" data-reveal><div class="stat__n"><span data-count="{total}">{total}</span></div><p class="stat__l">compounds logged</p></div>
  <div class="stat" data-reveal style="--d:1"><div class="stat__n"><span data-count="{variants}">{variants}</span></div><p class="stat__l">vial sizes</p></div>
  <div class="stat" data-reveal style="--d:2"><div class="stat__n"><span data-count="{cats}">{cats}</span></div><p class="stat__l">research categories</p></div>
</div></div>

<section class="lineup" id="lineup" data-hscroll>
  <div class="lineup__pin">
    <div class="wrap lineup__head"><h2 class="lineup__title" data-split>the lineup.</h2><span class="lineup__count" data-reveal="fade">{len(featured):02d} of {total}, keep scrolling</span></div>
    <div class="lineup__track" data-htrack>{lcards}
      <a class="lcard" href="catalog"><div class="lcard__stage" style="--c:#33e6b0"><span class="btn btn--solid">view all {total} {ARROW}</span></div><div class="lcard__meta"><h3>the full catalog</h3></div></a>
    </div>
    <div class="lineup__bar"><i></i></div>
  </div>
</section>

<section class="sec" id="categories">
  <div class="wrap">
    <div class="sec__head"><h2 class="sec__title" data-split>browse by category.</h2></div>
    <div class="crows">{crows}</div>
  </div>
</section>

<section class="sec ai" id="ai">
  <div class="wrap ai__grid">
    <div>
      <p class="kicker" data-reveal="fade">// ai assistant</p>
      <h2 class="ai__title" data-split>ask the hlix ai <span class="sp">{SPARK}</span></h2>
      <p class="ai__copy" data-reveal>it knows the whole catalog (every compound, size and price) plus general research background on peptides.</p>
      <button class="btn btn--solid" data-open-chat data-reveal data-magnetic>{SPARK} open the assistant</button>
    </div>
    <div class="mock" data-typing data-reveal="scale">
      <div class="mock__bar">{SPARK} hlix ai</div>
      <div class="bub bub--u">{esc(question)}</div>
      <div class="bub bub--a">{answer}</div>
    </div>
  </div>
</section>

<section class="sec calcband" id="calc">
  <div class="wrap">
    <p class="kicker" data-reveal="fade">// dosage calculator</p>
    <h2 class="calcband__title" data-split>know your draw.</h2>
    <div class="syr no-tr" data-syr data-syringe-scrub style="--fill:.1">{syringe_svg("tease")}</div>
    <p data-reveal>concentration, draw-to units, syringe capacity and how many vials you'll need, instantly, right in your browser.</p>
    <a class="btn btn--solid" href="calculator" data-reveal data-magnetic>open the calculator {ARROW}</a>
  </div>
</section>'''
    return shell(title="hlix: research-grade, cataloged", desc=b.BASE_DESCRIPTION, page="home", body=body, groups=groups)


# -------------------------------------------------------------- catalog ---

def page_catalog(groups):
    cats = [(s, l) for s, l, _ in b.CATEGORY_ORDER if any(g["category"] == s for g in groups)]
    tabs = f'<button class="is-active" data-filter="all">all<sup>{len(groups)}</sup></button>' + "".join(
        f'<button data-filter="{s}">{esc(l)}<sup>{sum(1 for g in groups if g["category"] == s)}</sup></button>' for s, l in cats
    )
    cards = "".join(card(g, "", "cat") for g in groups)

    tag_counts = Counter()
    for g in groups:
        for t in g["tags"]:
            tag_counts[t.lower()] += 1
    all_tags = sorted(tag_counts, key=lambda t: (-tag_counts[t], t))
    TOP_N = 14
    more_count = max(0, len(all_tags) - TOP_N)
    tag_chips = "".join(
        f'<button type="button" class="tag-chip" data-tag-chip="{esc(t)}"{" hidden" if i >= TOP_N else ""}>{esc(t)}</button>'
        for i, t in enumerate(all_tags)
    )
    more_btn = f'<button type="button" class="tagfilter__more" data-tagfilter-more>+{more_count} more</button>' if more_count else ""

    body = f'''
<section class="phead">
  <div class="wrap">
    <p class="kicker" data-reveal="fade">// the catalog</p>
    <h1 class="phead__title" data-split>catalog<sup><span data-shown>{len(groups)}</span></sup></h1>
    <p class="phead__sub" data-reveal>every compound, every size, priced per single vial. filter by category or find one by name.</p>
  </div>
</section>
<div class="wrap">
  <div class="ctrl">
    <div class="tabs" data-tabs>{tabs}<i class="tabs__ind"></i></div>
    <label class="find">{SEARCH}<input data-catalog-search type="text" placeholder="filter by name" autocomplete="off"></label>
  </div>
  <div class="tagfilter" data-tagfilter>
    <span class="tagfilter__label">browse by keyword</span>
    <div class="tagfilter__list" data-tagfilter-list>{tag_chips}</div>
    {more_btn}
    <button type="button" class="tagfilter__clear" data-tagfilter-clear hidden>clear keywords ×</button>
  </div>
  <div class="pgrid">{cards}</div>
  <p class="empty" data-empty>nothing matches that. try another name or category.</p>
</div>'''
    return shell(title="catalog", desc="the complete hlix research peptide catalog.", page="catalog", body=body, groups=groups)


# -------------------------------------------------------------- product ---

MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split()
COA_FALLBACK = '<p>a certificate of analysis is kept on file for this compound and available on request via the <a href="../contact" style="color:var(--accent)">contact page</a>.</p>'


def coa_blocks(g):
    """Lab reports from data/coa.json for the whole product, whatever vial
    size is picked: (line under the product name for the newest report,
    certificate of analysis section listing them all, newest first)."""
    certs = sorted((c for c in COA if c["product"] == g["slug"]), key=lambda c: c["date"], reverse=True)
    if not certs:
        return "", COA_FALLBACK

    def when(c):
        y, m, day = (int(x) for x in c["date"].split("-"))
        return f"{MONTHS[m - 1]} {day}, {y}"

    c = certs[0]
    more = f'<a href="#coa" data-coa-jump>all {len(certs)} reports</a>' if len(certs) > 1 else ""
    top = (
        f'<p class="coa-line" data-reveal><span>{esc(c["purity"])} purity · {esc(c["lab"].lower())} · {when(c)}</span>'
        f'<span class="coa-line__links"><a href="../{UP}assets/coa/{c["file"]}" target="_blank" rel="noopener">view certificate {ARROW_UR}</a>{more}</span></p>'
    )
    items = "".join(
        f'<li><div class="coa__top"><b>{when(c)}</b><span>{esc(c["lab"].lower())}</span></div>'
        f'<div class="coa__nums"><span>purity <b>{esc(c["purity"])}</b></span></div>'
        f'<div class="coa__links"><a href="../{UP}assets/coa/{c["file"]}" target="_blank" rel="noopener">view report (pdf) {ARROW_UR}</a>'
        f'<a href="https://www.finnrick.com/verify" target="_blank" rel="noopener">verify on finnrick · id {esc(c["finnrick_id"])}</a></div></li>'
        for c in certs
    )
    body = (
        f'<p>independent lab results for {esc(g["name"])}, tested for finnrick analytics. '
        f'each report covers only the lot it tested.</p><ul class="coa">{items}</ul>'
    )
    return top, body


def page_product(g, groups):
    d = g["default"]
    svg = vial_media(d, f"pdp-{g['slug']}", "l", "../../", eager=True)
    tags_html = (
        '<div class="pdp__tags">' +
        "".join(f'<a class="tag-pill" href="../catalog?tag={esc(t.lower().replace(" ", "+"))}">{esc(t)}</a>' for t in g["tags"]) +
        "</div>"
    ) if g["tags"] else ""
    variants = g["variants"]
    multi = len(variants) > 1
    color = CATEGORY_COLORS.get(g["category"], "#33e6b0")
    seg = ""
    if multi:
        btns = "".join(
            f'<button role="radio" aria-checked="{"true" if v is d else "false"}" class="{"is-active" if v is d else ""}" data-variant '
            f'data-dose="{esc(v["dose"])}" data-price="{v["price"]:.2f}" data-price-recon="{recon_price(v["price"]):.2f}" '
            f'data-sku="{esc(v["sku"])}" data-img="{v["sku"].lower()}">{esc(v["dose"])}</button>'
            for v in variants
        )
        seg = f'<span class="field-l">vial size</span><div class="seg" data-seg="size" role="radiogroup" aria-label="vial size"><span class="seg__thumb"></span>{btns}</div>'
    form_btns = (
        '<button role="radio" aria-checked="false" data-form="powder">powder</button>'
        '<button role="radio" aria-checked="true" class="is-active" data-form="recon">ready to use</button>'
    )
    seg += f'<span class="field-l">form</span><div class="seg" data-seg="form" role="radiogroup" aria-label="shipping form"><span class="seg__thumb"></span>{form_btns}</div>'
    coa_top, coa_body = coa_blocks(g)
    related = [x for x in groups if x["category"] == g["category"] and x["slug"] != g["slug"]][:4]
    rel = ""
    if related:
        rel = f'''<section class="related"><div class="wrap">
  <div class="sec__head"><h2 class="sec__title" data-split>more in {esc(g['category_label'].lower())}.</h2></div>
  <div class="pgrid">{"".join(card(x, "../", "rel") for x in related)}</div></div></section>'''
    body = f'''
<div class="pdp" style="--c:{color}">
  <div class="wrap">
    <nav class="crumbs" aria-label="breadcrumb"><a href="../">home</a> / <a href="../catalog">catalog</a> / <a href="../catalog#{g['category']}">{esc(g['category_label'])}</a> / <span>{esc(g['name'])}</span></nav>
    <div class="pdp__grid">
      <div class="pdp__media" data-reveal="scale"><div class="stage" data-zoom>{svg}<span class="stage__hint">click to enlarge</span></div></div>
      <div class="pdp__info">
        <p class="kicker" style="color:var(--c)" data-reveal="fade">// {esc(g['category_label'].lower())}</p>
        <h1 class="pdp__name" data-split>{esc(g['name'])}</h1>{coa_top}
        {tags_html}
        <div class="price" data-reveal><span class="price__n" data-price="{d['price']:.2f}" data-price-recon="{recon_price(d['price']):.2f}">{money(recon_price(d['price']))}</span><span class="price__u">/ vial</span></div>
        <div class="fam" data-family hidden>
          <p class="fam__label">family &amp; friends price</p>
          <p class="fam__price"><b data-family-price></b> <span data-family-per>/ vial</span></p>
          <div class="fam__units" role="group" aria-label="buy by the vial or the pack">
            <button type="button" data-unit="vial" aria-pressed="true">single vial</button>
            <button type="button" data-unit="pack" aria-pressed="false">pack of 10</button>
          </div>
        </div>
        <div data-reveal>{seg}</div>
        <div class="pdp__buy" data-reveal>
          <div class="qty" data-qty>
            <button type="button" data-qty-dec aria-label="decrease quantity">−</button>
            <input type="number" min="1" step="1" value="1" data-qty-input aria-label="quantity">
            <button type="button" data-qty-inc aria-label="increase quantity">+</button>
          </div>
          <button class="btn btn--solid" type="button" data-add-to-cart data-name="{esc(g['name'])}" data-slug="{g['slug']}" data-category="{esc(g['category_label'])}" data-magnetic>add to cart</button>
        </div>
        <p class="pdp__added" data-added hidden>added to cart — <a href="../checkout">checkout</a> or keep browsing.</p>
        <p class="stock" data-reveal>in stock</p>
        <dl class="specs" data-reveal>
          <div><dt>category</dt><dd>{esc(g['category_label'])}</dd></div>
          <div><dt>dose per vial</dt><dd data-dose-out>{esc(d['dose'])}</dd></div>
          <div><dt>sku</dt><dd data-sku-out>{esc(d['sku'])}</dd></div>
          <div><dt>purity</dt><dd>≥99% · hplc verified</dd></div>
        </dl>
        <div class="ruo" data-reveal><b>research use only</b>for laboratory research use only. not intended for human or animal consumption, and not evaluated by the fda to diagnose, treat, cure or prevent any disease. nothing on this page is medical advice.</div>
        <div class="acc" data-acc data-reveal>
          <div class="acc__i is-open"><button class="acc__h" aria-expanded="true">overview<i></i></button><div class="acc__b"><div><p>{esc(g['name'])}, cataloged under {esc(g['category_label'].lower())}, available in {len(variants)} vial size{'s' if multi else ''}. logged at ≥99% purity per the standard applied across this catalog.</p></div></div></div>
          <div class="acc__i"><button class="acc__h" aria-expanded="false">research use only<i></i></button><div class="acc__b"><div><p>this entry is for research and record-keeping purposes only. it is not intended for human consumption, clinical use, or as a drug, food, cosmetic or medical device, and has not been evaluated by the fda.</p></div></div></div>
          <div class="acc__i" id="coa"><button class="acc__h" aria-expanded="false">certificate of analysis<i></i></button><div class="acc__b"><div>{coa_body}</div></div></div>
        </div>
      </div>
    </div>
  </div>
  {rel}
</div>'''
    return shell(title=g["name"], desc=f"{g['name']}: {g['category_label']} research compound.", page="catalog", body=body, depth=1, groups=groups)


# ---------------------------------------------------------------- about ---

def page_about(groups):
    rows = [
        ("01", "precision", "every entry gets a real dose, a real price and a real category. no vague listings."),
        ("02", "transparency", "pricing is always shown per single vial, with no bundled minimums or hidden markups."),
        ("03", "rigor", "≥99% purity is the floor for anything that makes it into the catalog, not the ceiling."),
    ]
    prin = "".join(f'<div class="prin__r" data-reveal><span class="prin__n">{n}</span><h3>{t}</h3><p>{d}</p></div>' for n, t, d in rows)
    body = f'''
<section class="phead"><div class="wrap">
  <p class="kicker" data-reveal="fade">// about</p>
  <h1 class="phead__title" data-split>a catalog, built like it matters.</h1>
</div></section>
<section class="statement statement--wide" style="padding-top:0"><div class="wrap"><p data-scrub>hlix exists to bring order to research peptide sourcing. every compound is logged, priced and organized to one consistent standard, so nothing about the catalog is ever a guess.</p></div></section>
<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="split2">
    <h2 data-split>straightforward pricing.</h2>
    <p data-reveal>every listing is priced per single vial, with no bundled minimums and no hidden markups. the price shown is the price paid, batch after batch.</p>
  </div>
</div></section>
<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="sec__head"><h2 class="sec__title" data-split>the standard.</h2></div>
  <div class="prin">{prin}</div>
</div></section>
<section class="sec calcband"><div class="wrap">
  <h2 class="calcband__title" data-split>see the catalog.</h2>
  <a class="btn btn--solid" href="catalog" data-reveal data-magnetic>explore {len(groups)} compounds {ARROW}</a>
</div></section>'''
    return shell(title="about", desc="about hlix: a research peptide catalog for laboratory and research use.", page="about", body=body, groups=groups)


# -------------------------------------------------------------- contact ---

def page_contact(groups):
    body = f'''
<section class="phead"><div class="wrap">
  <p class="kicker" data-reveal="fade">// contact</p>
  <h1 class="phead__title" data-split>say hello.</h1>
  <a class="mail" href="mailto:{CONTACT_EMAIL}" data-reveal>{CONTACT_EMAIL}</a>
</div></section>
<section class="sec" style="padding-top:20px"><div class="wrap">
  <div class="split2">
    <div>
      <h2 data-split>questions about a compound, a batch, or the catalog?</h2>
      <dl class="meta3" style="grid-template-columns:1fr 1fr;margin-top:48px">
        <div data-reveal><dt>response time</dt><dd>usually 1–2 business days</dd></div>
        <div data-reveal style="--d:1"><dt>based in</dt><dd>united states</dd></div>
      </dl>
    </div>
    <form class="cform" data-contact-form data-reveal>
      <label><span>name</span><input name="name" type="text" required autocomplete="name"></label>
      <label><span>email</span><input name="email" type="email" required autocomplete="email"></label>
      <label><span>message</span><textarea name="message" rows="4" required></textarea></label>
      <div><button class="btn btn--solid" type="submit" data-magnetic>send message {ARROW}</button></div>
      <p class="cform__status" data-contact-status hidden></p>
    </form>
  </div>
</div></section>'''
    return shell(title="contact", desc="contact hlix.", page="contact", body=body, groups=groups)


# ----------------------------------------------------------- calculator ---

def opts(group, values, unit, default, *, custom=True, unit_small=None):
    out = ""
    for v in values:
        label = f"{v} {unit}" if unit else str(v)
        if unit_small:
            label += f"<small>/ {unit_small(v)}</small>"
        active = " is-active" if str(v) == str(default) else ""
        out += f'<button type="button" class="opt{active}" data-val="{v}">{label}</button>'
    if custom:
        out += f'<button type="button" class="opt" data-val="custom">custom</button><input class="opt-in" type="number" inputmode="decimal" min="0" step="any" placeholder="{unit or "n"}" hidden>'
    return out



# ------------------------------------------------------------ the admin's calendar ---

IC = {
    "plus": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    "left": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    "right": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    "down": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    "x": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    "sun": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    "moon": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
}


def planner_app(embed=True):
    """The dose planner as the admin dashboard's Calendar page (planner-embed.html, embed=True) and the main
    site's calculator page (build_v3.py, embed=False: the plan kept in the browser) show it, styled by
    assets/css/planner.css: three cards. Vials: every vial as a row (pick, drag to reorder, add one). Calendar:
    the month (or three), the day editor, each week's totals. The vial: what's left in the one picked, its
    dates, and its settings. The Vials and vial cards sit together (.pc-side): beside the calendar when
    there's room, around it when there isn't; the admin can frame each part on its own (see "part" in
    v2-planner.js). The /v2/ calculator shows it too, under that design's own heading."""
    sizes = [2, 5, 10, 15, 20, 30, 50, 100, 1000]
    def size_opts(default):
        out = "".join(f'<button type="button" class="opt{" is-active" if v == default else ""}" data-val="{v}">{v} mg</button>' for v in sizes)
        return out + '<button type="button" class="opt" data-val="custom">Custom</button><input class="opt-in" type="number" inputmode="decimal" min="0" step="any" placeholder="mg" aria-label="Size in mg" hidden>'
    every = "".join(f'<button type="button" class="opt" data-val="{v}">{t}</button>' for v, t in [(1, "Daily"), (2, "Every other day"), (7, "Weekly")])
    def dates(pre):
        return (f'<div class="pl-dates pc-field"><span class="pc-label">Start → end</span><div class="pl-dates__row">'
                f'<input type="date" data-{pre}-start aria-label="Start: the first dose"><span class="pl-dates__to" aria-hidden="true">→</span>'
                f'<input type="date" data-{pre}-end aria-label="End: the last day it\'s used"><button type="button" class="pl-auto" data-{pre}-end-auto hidden>Auto</button></div>'
                f'<small class="pl-dates__hint" data-{pre}-hint></small></div>')
    doses = ("".join(f'<button type="button" class="opt" data-val="{v}">{v} mg</button>' for v in [0.5, 1, 2, 2.5, 3, 5, 10])
             + '<button type="button" class="opt" data-val="custom">Custom</button><input class="opt-in" type="number" inputmode="decimal" min="0" step="any" placeholder="mg" aria-label="Dose in mg" hidden>'
             + '<button type="button" class="opt" data-val="0">None</button><button type="button" class="opt opt--stop" data-ed-stop>Stop here</button>')
    repeat = "".join(f'<button type="button" class="opt{" is-active" if v == 0 else ""}" data-val="{v}">{t}</button>'
                     for v, t in [(0, "Just this day"), (1, "Daily"), (2, "Every other day"), (7, "Weekly")])
    swatches = "".join(f'<button type="button" class="pl-sw" data-c="{i}" data-color="{i}" aria-label="{c}"></button>'
                       for i, c in enumerate(["Green", "Blue", "Violet", "Pink", "Lime", "Silver"]))
    stats = "".join(
        f'<div class="pc-stat" data-pl-t="{k}"><span class="pc-stat__k" data-pl-d>&nbsp;</span>'
        f'<span class="pc-stat__v"><b data-pl-v>0</b> mg</span><span class="pc-stat__bar" aria-hidden="true"><i></i></span>'
        f'<span class="pc-stat__u" data-pl-u>Nothing used</span></div>'
        for k in ("day", "week", "month")
    )
    return f'''<div class="pc-host"><div class="pc" data-planner{" data-embed" if embed else ""}>
  <div class="pc-side">

  <section class="pc-card pc-vials" aria-labelledby="pc-vials-h">
    <header class="pc-head">
      <div><h2 class="pc-h" id="pc-vials-h">Vials</h2><p class="pc-sub">Left <span data-pl-all-day>after today</span></p></div>
      <b class="pc-hidden" data-pl-echo></b>
    </header>
    <div class="pl-tabs pc-list" data-pl-tabs></div>
    <div class="pl-new pc-new" data-pl-new role="group" aria-label="New vial" hidden>
      <p class="pc-new__t">New vial</p>
      <label class="pc-field"><span class="pc-label">Name</span><input type="text" class="pc-input" data-new-name maxlength="28" placeholder="e.g. BPC-157 #2" list="pl-names" autocomplete="off" spellcheck="false"></label>
      <div class="pc-field"><span class="pc-label">Size</span><div class="opts" data-new-size>{size_opts(None)}</div></div>
      <div class="pc-field"><span class="pc-label">Doses</span>
        <div class="opts" data-new-how><button type="button" class="opt" data-how="same">Same as <span data-new-same></span></button><button type="button" class="opt" data-how="set">A dose</button><button type="button" class="opt" data-how="none">None yet</button></div>
        <div class="pl-new__dose" data-new-dose-row hidden><input class="opt-in" type="number" inputmode="decimal" min="0" step="any" placeholder="mg" data-new-dose aria-label="Dose in mg"><div class="opts" data-new-every>{every}</div></div>
      </div>
      {dates("new")}
      <div class="pc-acts"><button type="button" class="pc-btn pc-btn--primary" data-new-ok>Add vial</button><button type="button" class="pc-btn" data-new-x>Cancel</button></div>
    </div>
    <datalist id="pl-names"></datalist>
    <div class="pc-hidden" data-pl-all hidden><div data-pl-all-list></div></div>
  </section>

  <section class="pc-card pc-vial" aria-label="The vial picked">
    <header class="pc-head pc-vial__head">
      <i class="pc-dot" aria-hidden="true"></i>
      <div class="pc-vial__name" data-pl-set-sum>&nbsp;</div>
      <button type="button" class="pc-btn pc-btn--sm pl-set__go" data-pl-set-toggle aria-expanded="false" aria-controls="pl-set-body"><span data-pl-set-word>Edit vial</span>{IC["down"]}</button>
      <b class="pc-hidden" data-pl-size></b>
    </header>
    <div class="pl-set pc-set" data-pl-set>
      <div class="pl-set__body pc-set__body" id="pl-set-body" data-pl-set-body hidden>
        <label class="pc-field"><span class="pc-label">Name</span><input type="text" class="pc-input" data-pl-name maxlength="28" placeholder="e.g. BPC-157" list="pl-names" autocomplete="off" spellcheck="false"></label>
        <div class="pc-field"><span class="pc-label">Color</span><div class="pl-swatches" data-pl-colors>{swatches}<button type="button" class="pl-sw pl-sw--custom" data-pl-custom-open aria-label="Custom color" aria-expanded="false" aria-controls="pl-cpick"></button></div></div>
        <div class="pl-cpick pc-field" id="pl-cpick" data-pl-cpick role="group" aria-label="Custom color" hidden><span class="pc-label">Custom color</span><div class="pl-cpick__row"><input type="color" data-pl-custom value="#33e6b0" aria-label="Pick a color"><input type="text" class="pc-input pl-cpick__hex" data-pl-hex maxlength="7" autocomplete="off" spellcheck="false" aria-label="Color code, like #33e6b0"><button type="button" class="pc-btn pc-btn--primary pl-cpick__ok" data-pl-cpick-ok>Apply</button><button type="button" class="pc-btn" data-pl-cpick-x>Cancel</button></div></div>
        <div class="pc-field"><span class="pc-label">Size</span><div class="opts" data-pl-vial>{size_opts(5)}</div></div>
        {dates("pl")}
        <button type="button" class="pc-link pc-link--danger pl-remove" data-pl-remove hidden>Remove vial</button>
      </div>
    </div>
    <div class="pc-stats">{stats}</div>
    <dl class="pc-rows">
      <div><dt data-pl-out-k>Runs dry</dt><dd data-pl-out>—</dd></div>
      <div><dt>Planned</dt><dd data-pl-plan>No doses yet</dd></div>
    </dl>
    <p class="pc-warn" data-pl-warn hidden></p>
  </section>
  </div>

  <section class="pc-card pc-cal" data-cal aria-label="Calendar">
    <header class="pc-cal__head">
      <h2 class="pc-cal__title" data-cal-title>&nbsp;</h2>
      <div class="pc-cal__tools">
        <div class="pc-seg" role="group" aria-label="Months shown"><button type="button" data-cal-span="1" aria-pressed="true">Month</button><button type="button" data-cal-span="3" aria-pressed="false">3 months</button></div>
        <div class="pc-nav"><button type="button" class="pc-icon" data-cal-nav="-1" aria-label="Previous month">{IC["left"]}</button><button type="button" class="pc-btn pc-btn--sm" data-cal-today>Today</button><button type="button" class="pc-icon" data-cal-nav="1" aria-label="Next month">{IC["right"]}</button></div>
        <button type="button" class="pc-icon pc-look" data-cal-look title="Light or dark">{IC["moon"]}{IC["sun"]}<span class="pc-hidden">Dark</span></button>
      </div>
    </header>
    <div class="cal__months" data-cal-months></div>
    <footer class="pc-cal__foot"><span data-cal-sum>&nbsp;</span><button type="button" class="pc-link cal__clear" data-cal-clear hidden>Clear plan</button></footer>
    <div class="cal__ed" data-cal-ed hidden><div class="cal__ed-in"><div class="cal__ed-box" role="group" aria-label="Dose for this day">
      <div class="ed__head"><b data-ed-date></b><span class="ed__meta" data-ed-meta></span><button type="button" class="pc-icon ed__x" data-ed-close aria-label="Close">{IC["x"]}</button></div>
      <div class="ed__row" data-ed-vial-row hidden><span class="ed__k">Vial</span><div class="opts" data-ed-vials></div></div>
      <div class="ed__row"><span class="ed__k">Dose</span><div class="opts" data-ed-dose>{doses}</div></div>
      <div class="ed__row"><span class="ed__k">Repeat</span><div class="opts" data-ed-rep>{repeat}</div></div>
      <p class="ed__hint" data-ed-hint hidden></p>
    </div></div></div>
  </section>

</div></div>'''


def page_calculator(groups):
    vial = opts("vial", [2, 5, 10, 20, 30, 50, 100], "mg", 5)
    water = opts("water", [0.5, 1, 2, 2.5, 3, 5, 10], "ml", 2)
    dose = opts("dose", [0.25, 0.5, 1, 2, 2.5, 3, 4, 5, 10], "mg", 0.25)
    freq_presets = [("1", "daily"), ("2", "every other day"), ("7", "weekly"), ("30", "monthly")]
    freq_btns = "".join(
        f'<button type="button" class="opt{" is-active" if v == "1" else ""}" data-val="{v}">{label}</button>'
        for v, label in freq_presets
    )
    freq_units = "".join(
        f'<button type="button" class="opt{" is-active" if u == "days" else ""}" data-val="{u}">{u}</button>'
        for u in ["days", "weeks", "months"]
    )
    freq = f'''{freq_btns}<button type="button" class="opt" data-val="custom">custom</button>'''
    freq_custom = f'''<div class="freq-custom" data-freq-custom hidden>
        <span>every</span>
        <input type="number" min="1" step="1" value="1" data-freq-n aria-label="interval amount">
        <div class="opts" data-freq-unit>{freq_units}</div>
      </div>'''
    syr = opts("syringe", [0.3, 0.5, 1, 2], "ml", 1, custom=False, unit_small=lambda v: f"{int(v * 100)}u")
    supply = "".join(
        f'<button type="button" class="opt{" is-active" if u == "days" else ""}" data-val="{u}">{u}</button>' for u in ["days", "weeks", "months", "years"]
    )
    planu = "".join(
        f'<button type="button" class="opt{" is-active" if u == "months" else ""}" data-val="{u}">{u}</button>' for u in ["weeks", "months", "years"]
    )
    planner = f'''<section class="planner">
    <div class="planner__head">
      <div><p class="kicker" data-reveal="fade">// dose planner</p><h2 class="planner__title" data-split>map the vial.</h2></div>
      <p class="planner__lede" data-reveal>add a vial for each peptide you're running, then tap any day to log a dose. each day shows what's left in the vial, so you can see it run down by the day, week or month. sign in and it's saved to your account, where we can see it to keep track of your refills (keep it private on the <a href="../planner">dose planner</a> page).</p>
    </div>
    {planner_app(embed=False)}
  </section>'''
    body = f'''
<section class="phead"><div class="wrap">
  <p class="kicker" data-reveal="fade">// dosage calculator</p>
  <h1 class="phead__title" data-split>know your draw.</h1>
</div></section>
<div class="wrap">
  <div class="calc" data-calc>
    <div class="calc__in">
      <fieldset class="step" data-group="vial" data-reveal><legend><span class="step__n">01</span><span class="step__t">peptide in vial</span><b class="step__e" data-echo="vial">5 mg</b></legend><div class="opts">{vial}</div></fieldset>
      <fieldset class="step" data-group="water" data-reveal><legend><span class="step__n">02</span><span class="step__t">bacteriostatic water added</span><b class="step__e" data-echo="water">2 mL</b></legend><div class="opts">{water}</div></fieldset>
      <fieldset class="step" data-group="dose" data-reveal><legend><span class="step__n">03</span><span class="step__t">dose per injection</span><b class="step__e" data-echo="dose">0.25 mg</b></legend><div class="opts">{dose}</div></fieldset>
      <fieldset class="step" data-reveal><legend><span class="step__n">04</span><span class="step__t">how often</span></legend><div class="opts" data-freq-presets>{freq}</div>{freq_custom}</fieldset>
      <fieldset class="step" data-group="syringe" data-reveal><legend><span class="step__n">05</span><span class="step__t">syringe size</span><b class="step__e" data-echo="syringe">1 mL · 100 units</b></legend><div class="opts">{syr}</div></fieldset>
    </div>
    <aside class="calc__out" data-reveal="fade">
      <p class="out__k">draw to</p>
      <div class="out__big"><b data-o="units">10</b><small>units</small></div>
      <div class="syr" data-syr>{syringe_svg("calc")}</div>
      <dl class="rows">
        <div><dt>concentration</dt><dd><span data-o="conc">2.5</span> mg/ml</dd></div>
        <div><dt>volume</dt><dd><span data-o="vol">0.1</span> ml</dd></div>
      </dl>
      <p class="warn" data-warn hidden></p>
    </aside>
  </div>
  <div class="calc-extra">
    <div class="sub" data-group="supplyUnit" data-reveal>
      <h3>supply</h3>
      <div class="opts">{supply}</div>
      <p>this vial covers about <b data-o="inj">20</b> <span data-o="freqlabel">injections, one a day</span>: roughly <b><span data-o="supply">20</span> <span data-o="supplyUnit">days</span></b>.</p>
    </div>
    <div class="sub" data-reveal>
      <h3>plan for</h3>
      <div class="plan"><input type="number" min="1" step="1" value="3" data-plan aria-label="amount"><div class="opts" data-group="planUnit">{planu}</div></div>
      <p>you'll need about <b><span data-o="vials">5</span> vials</b> to cover <span data-o="planN">3</span> <span data-o="planU">months</span>.</p>
    </div>
  </div>
  {planner}
</div>
<div class="dock" data-dock aria-hidden="true">
  <div class="dock__row"><span>draw to</span><span class="dock__val"><b data-o="dock">10</b>units</span></div>
  <div class="syr syr--dock" data-syr>{syringe_svg("dock")}</div>
</div>'''
    return shell(title="dosage calculator", desc="peptide reconstitution and dosage calculator.", page="calculator", body=body, groups=groups, scripts=("v2-calc.js", "v2-planner.js"), body_class="calc-page", css=("planner.css",))


def page_planner_embed():
    """The dose planner alone, for the admin dashboard's Calendar page (admin.hlixlabs.com) to show in a
    frame; vercel.json lets only the admin frame it. Always dark like the admin, with no nav, footer, cart or
    chat. It keeps no plan of its own: the admin sends the plan in and saves every change (v2-planner.js)."""
    return f'''<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="robots" content="noindex, nofollow">
<title>Dose planner · hlix</title>
{FONTS}
<link rel="stylesheet" href="assets/css/planner.css?v={VER}">
<script src="assets/js/v2-boot-embed.js?v={VER}"></script>
</head>
<body class="pc-page">
{planner_app()}
<script src="assets/js/search-index.js?v={VER}"></script>
<script src="assets/js/v2-planner.js?v={VER}" defer></script>
</body>
</html>'''


# ---------------------------------------------------------------- checkout ---

def page_checkout():
    body = f'''
<section class="phead"><div class="wrap">
  <p class="kicker" data-reveal="fade">// checkout</p>
  <h1 class="phead__title" data-split>review &amp; request.</h1>
  <p class="phead__sub" data-reveal>no payment happens here — submit your order request and we'll follow up by email with next steps.</p>
</div></section>
<div class="wrap checkout" data-checkout>
  <div class="checkout__items">
    <div class="cart__list" data-checkout-list></div>
    <p class="cart__empty" data-checkout-empty hidden>your cart is empty. <a href="catalog">browse the catalog</a>.</p>
    <div class="checkout__subtotal" data-checkout-subtotal-row hidden><span>subtotal</span><b data-checkout-subtotal>$0</b></div>
  </div>
  <form class="checkout__form" data-checkout-form>
    <p class="checkout__acct" data-checkout-acct-out>have an account? <a href="account?next=checkout">sign in</a> to save your address and follow this order. or just order as a guest.</p>
    <p class="checkout__acct" data-checkout-acct-in hidden>signed in as <b data-checkout-acct-email></b>. this order will show in <a href="account">your account</a>.</p>
    <fieldset>
      <legend>contact</legend>
      <label><span>full name</span><input name="name" type="text" required autocomplete="name" maxlength="120"></label>
      <label><span>email</span><input name="email" type="email" required autocomplete="email" maxlength="254"></label>
      <label><span>phone (optional)</span><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
    </fieldset>
    <fieldset>
      <legend>shipping address</legend>
      <label><span>address line 1</span><input name="address1" type="text" required autocomplete="address-line1"></label>
      <label><span>address line 2 (optional)</span><input name="address2" type="text" autocomplete="address-line2"></label>
      <div class="checkout__row">
        <label><span>city</span><input name="city" type="text" required autocomplete="address-level2"></label>
        <label><span>state / region</span><input name="state" type="text" required autocomplete="address-level1"></label>
      </div>
      <div class="checkout__row">
        <label><span>zip / postal code</span><input name="zip" type="text" required autocomplete="postal-code"></label>
        <label><span>country</span><input name="country" type="text" required autocomplete="country-name" value="United States"></label>
      </div>
    </fieldset>
    <label class="checkout__save" data-checkout-save hidden><input type="checkbox" name="save" checked> <span>save this address to my account</span></label>
    <fieldset>
      <legend>notes (optional)</legend>
      <label><span>anything we should know?</span><textarea name="notes" rows="3" maxlength="2000"></textarea></label>
    </fieldset>
    <div><button class="btn btn--solid" type="submit" data-checkout-submit data-magnetic>submit order request {ARROW}</button></div>
    <p class="cform__status" data-checkout-status hidden></p>
    <p class="checkout__legal">submitting sends your request and cart contents to hlix. no payment method is collected or charged on this page. for laboratory research use only.</p>
  </form>
</div>
<div class="checkout__done" data-checkout-done hidden>
  <div class="wrap">
    <p class="kicker" data-reveal="fade">// request received</p>
    <h1 class="phead__title" data-split>got it.</h1>
    <p class="phead__sub">your order request is in<span data-checkout-done-ref hidden></span>. we'll reply by email at <b data-checkout-done-email></b> with next steps, usually within 1–2 business days.</p>
    <a class="btn btn--solid" href="account" data-checkout-done-acct hidden data-magnetic>see it in your account {ARROW}</a>
    <a class="btn btn--solid" href="catalog" data-checkout-done-cat data-magnetic>back to catalog {ARROW}</a>
  </div>
</div>'''
    return shell(title="checkout", desc="review your cart and submit an order request.", page="checkout", body=body, groups=(), scripts=("v2-checkout.js",), body_class="checkout-page")


# ---------------------------------------------------------------- account ---

def page_account():
    """Sign in or make an account, then: your orders, saved shipping details, password.
    Run by assets/js/v2-account.js against /api/account; the session is in cookies no
    script can read (api/_lib/session.js)."""
    status = '<p class="cform__status" data-acct-status hidden role="status" aria-live="polite"></p>'
    body = f'''
<section class="phead acct-head"><div class="wrap">
  <p class="kicker" data-reveal="fade">// account</p>
  <h1 class="phead__title" data-split>your account.</h1>
  <p class="phead__sub" data-reveal>keep your cart on every device, save your shipping address and follow your orders.</p>
</div></section>
<div class="wrap acct" data-acct>
  <p class="acct__loading" data-acct-loading>loading…</p>

  <div class="acct__out" data-acct-out hidden>
    <div class="acct__tabs" role="tablist" aria-label="sign in or make an account">
      <button type="button" role="tab" id="tab-signin" aria-controls="form-signin" aria-selected="true" data-acct-tab="signin">sign in</button>
      <button type="button" role="tab" id="tab-signup" aria-controls="form-signup" aria-selected="false" data-acct-tab="signup">create account</button>
    </div>
    <form class="checkout__form acct__form" id="form-signin" role="tabpanel" aria-labelledby="tab-signin" data-acct-form="signin">
      <label><span>email</span><input name="email" type="email" required autocomplete="username" maxlength="254" spellcheck="false"></label>
      <label><span>password</span><input name="password" type="password" required autocomplete="current-password" maxlength="200"></label>
      <div class="acct__actions"><button class="btn btn--solid" type="submit" data-magnetic>sign in {ARROW}</button><button type="button" class="acct__link" data-acct-go="forgot">forgot your password?</button></div>
      {status}
    </form>
    <form class="checkout__form acct__form" id="form-signup" role="tabpanel" aria-labelledby="tab-signup" data-acct-form="signup" hidden>
      <label><span>name</span><input name="name" type="text" autocomplete="name" maxlength="120"></label>
      <label><span>email</span><input name="email" type="email" required autocomplete="username" maxlength="254" spellcheck="false"></label>
      <label><span>password (at least 10 characters)</span><input name="password" type="password" required minlength="10" maxlength="72" autocomplete="new-password"></label>
      <div class="acct__actions"><button class="btn btn--solid" type="submit" data-magnetic>create account {ARROW}</button></div>
      {status}
      <p class="checkout__legal">your password is stored scrambled (hashed): nobody at hlix can see it. we use your email only for your orders.</p>
    </form>
    <form class="checkout__form acct__form" data-acct-form="forgot" hidden>
      <p class="acct__note">enter your email and we'll send you a link to set a new password.</p>
      <label><span>email</span><input name="email" type="email" required autocomplete="username" maxlength="254" spellcheck="false"></label>
      <div class="acct__actions"><button class="btn btn--solid" type="submit">send the link {ARROW}</button><button type="button" class="acct__link" data-acct-go="signin">back to sign in</button></div>
      {status}
    </form>
  </div>

  <div class="acct__in" data-acct-in hidden>
    <div class="acct__who">
      <p>signed in as <b data-acct-email></b><span class="acct__tier" data-acct-tier hidden>family &amp; friends pricing</span></p>
      <button class="btn btn--sm" type="button" data-acct-signout>sign out</button>
    </div>
    <form class="checkout__form acct__form acct__reset" data-acct-form="reset" hidden>
      <fieldset>
        <legend>set a new password</legend>
        <label><span>new password (at least 10 characters)</span><input name="password" type="password" required minlength="10" maxlength="72" autocomplete="new-password"></label>
      </fieldset>
      <div class="acct__actions"><button class="btn btn--solid" type="submit">save password {ARROW}</button></div>
      {status}
    </form>
    <div class="acct__grid">
      <section class="acct__orders" aria-labelledby="acct-orders-h">
        <h2 class="acct__h" id="acct-orders-h">your orders</h2>
        <div data-acct-orders></div>
        <p class="acct__empty" data-acct-orders-empty hidden>no orders yet. <a href="catalog">browse the catalog</a>.</p>
      </section>
      <div class="acct__side">
        <form class="checkout__form acct__form" data-acct-form="profile">
          <fieldset>
            <legend>shipping details</legend>
            <label><span>full name</span><input name="name" type="text" autocomplete="name" maxlength="120"></label>
            <label><span>phone</span><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
            <label><span>address line 1</span><input name="address1" type="text" autocomplete="address-line1" maxlength="200"></label>
            <label><span>address line 2</span><input name="address2" type="text" autocomplete="address-line2" maxlength="200"></label>
            <div class="checkout__row">
              <label><span>city</span><input name="city" type="text" autocomplete="address-level2" maxlength="120"></label>
              <label><span>state / region</span><input name="state" type="text" autocomplete="address-level1" maxlength="120"></label>
            </div>
            <div class="checkout__row">
              <label><span>zip / postal code</span><input name="zip" type="text" autocomplete="postal-code" maxlength="40"></label>
              <label><span>country</span><input name="country" type="text" autocomplete="country-name" maxlength="120"></label>
            </div>
          </fieldset>
          <div class="acct__actions"><button class="btn btn--sm" type="submit">save details</button></div>
          {status}
        </form>
        <form class="checkout__form acct__form" data-acct-form="password">
          <p class="acct__temp" data-acct-temp hidden>you're signed in with a temporary password from hlix. choose your own here: enter the temporary one as your current password.</p>
          <fieldset>
            <legend>change password</legend>
            <label><span>current password</span><input name="current" type="password" required autocomplete="current-password" maxlength="200"></label>
            <label><span>new password (at least 10 characters)</span><input name="password" type="password" required minlength="10" maxlength="72" autocomplete="new-password"></label>
          </fieldset>
          <div class="acct__actions"><button class="btn btn--sm" type="submit">change password</button></div>
          {status}
        </form>
        <p class="acct__fine"><button type="button" class="acct__link" data-acct-signout-all>sign out on every device</button></p>
      </div>
    </div>
  </div>
</div>'''
    return shell(title="account", desc="sign in to your hlix account: your orders, cart and shipping details.", page="account", body=body, groups=(), scripts=("v2-account.js",), body_class="account-page", noindex=True)


# ----------------------------------------------------------------- main ---

absolutize = b.absolutize   # every link root-absolute (shared with v1, see build.py)


def write(rel, html):
    """A page into OUT, its links made absolute when OUT is a subfolder (see the docstring)."""
    if OUT != ROOT:
        name = rel[:-len(".html")]
        html = absolutize(html, SITE_PATH + ("" if name == "index" else name))
    (OUT / rel).write_text(html)


def main():
    products = b.load_products()
    # Members-only products (bac water) are on the main site only, for the accounts they're
    # for; this archived design leaves them out (its cart can't tell who's a member).
    groups = b.public(b.group_products(products))

    for d in (OUT / "peptides",):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)

    write("index.html", page_home(groups))
    write("catalog.html", page_catalog(groups))
    write("about.html", page_about(groups))
    write("contact.html", page_contact(groups))
    write("calculator.html", page_calculator(groups))
    write("checkout.html", page_checkout())
    write("account.html", page_account())
    for g in groups:
        write(f"peptides/{g['slug']}.html", page_product(g, groups))
    # the admin's Calendar frames /planner-embed (vercel.json): always at the root
    (ROOT / "planner-embed.html").write_text(page_planner_embed())
    print(f"v2: 7 core pages + {len(groups)} product pages -> {OUT.relative_to(ROOT).as_posix() or '.'}/, planner-embed.html -> the repo root")


if __name__ == "__main__":
    main()
