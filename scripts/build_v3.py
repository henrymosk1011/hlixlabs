#!/usr/bin/env python3
"""
Generates the main site (the v3 design) at the repo root: a search-first home,
a catalog with a filter sidebar, sort and list view, product pages with a
sticky buy panel, accounts, a mobile tab bar and a command-palette search, in
the minimal, bold, lowercase, dark + mint look.

    python3 scripts/build_v3.py

Pages: index, catalog, about, contact, calculator, planner, checkout, account
and one per product under peptides/. Its own files are assets/css/v3.css and
assets/js/v3-boot.js, v3.js, v3-cart.js, v3-checkout.js. It shares the rest
with the archived v2 design (/v2/, scripts/build_v2.py): the catalog data,
vial photos, lab reports, search index, live prices (v2-prices.js), the chat
(v2-chat.js), the calculator math (v2-calc.js), the dose planner (v2-planner.js,
planner_app() and assets/css/planner.css, the same planner as the admin's
Calendar) and the account page logic (v2-account.js).

Every link is a clean address (/catalog, /peptides/bpc-157): vercel.json's
cleanUrls serves the .html files at them. No inline scripts (the CSP allows
script files from this site only): v3-boot.js is each page's first script.
"""
import json
import shutil
import time
from collections import Counter

import build as b
import build_v2 as v2
from vial_svg import CATEGORY_COLORS

ROOT = b.ROOT
OUT = ROOT
DEPTH = 0                      # how many folders OUT sits below the site root
VER = str(int(time.time()))
CONTACT_EMAIL = b.CONTACT_EMAIL
COA = json.loads((ROOT / "data" / "coa.json").read_text())

esc = b.html_escape
money = b.money
recon_price = b.recon_price


def svg(paths, sw="1.8", fill="none"):
    return (f'<svg viewBox="0 0 24 24" fill="{fill}" stroke="currentColor" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths}</svg>')


ARROW = svg('<path d="M5 12h14M13 6l6 6-6 6"/>', "2")
ARROW_UR = svg('<path d="M7 17 17 7M8 7h9v9"/>', "2")
CHEV = svg('<path d="m6 9 6 6 6-6"/>', "2")
CHECK = svg('<path d="M20 6 9 17l-5-5"/>', "2.2")
PLUS = svg('<path d="M12 5v14M5 12h14"/>', "2")
MINUS = svg('<path d="M5 12h14"/>', "2")
GRID = svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>')
LIST = svg('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".6"/><circle cx="3.5" cy="12" r=".6"/><circle cx="3.5" cy="18" r=".6"/>')
SLIDERS = svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>')
ZOOM = b.icon("zoom")
SEARCH = b.icon("search")
SPARK = b.icon("sparkles")
CLOSE = b.icon("close")
SUN = b.icon("sun")
MOON = b.icon("moon")
CART = b.icon("cart")
CALC = b.icon("calc")
MENU = svg('<path d="M4 8h16M4 16h16"/>', "2")
SHIELD = b.icon("shield")
DOC = b.icon("doc")
MAIL = b.icon("mail")
CLOCK = b.icon("clock")
PIN = b.icon("pin")
TAG = svg('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.3"/>')
FLASK = b.icon("flask")
USER = b.icon("user")
EYE = svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>')
LOCK = svg('<rect x="4.5" y="11" width="15" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>')
CALENDAR = svg('<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>')

ACTIVE_CLS = ' class="is-active"'
MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split()
FEATURED = ["GLP1-S", "GLP2-T", "GLP3-R", "BPC 157", "Semax", "Epithalon", "Ipamorelin", "NAD"]
SPOTLIGHT = ["GLP1-S", "BPC 157", "Ipamorelin"]
POPULAR_GOALS = ["fat loss", "recovery", "sleep", "skin", "muscle growth", "hair"]


# ------------------------------------------------------------------ data ---

def cat_list(groups):
    """(slug, label, count) for every category that has products, in catalog order."""
    out = []
    for slug, label, _ in b.CATEGORY_ORDER:
        n = sum(1 for g in groups if g["category"] == slug)
        if n:
            out.append((slug, label, n))
    return out


def tag_counts(groups):
    c = Counter(t.lower() for g in groups for t in g["tags"])
    return sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))


def certs_for(g):
    return sorted((c for c in COA if c["product"] == g["slug"]), key=lambda c: c["date"], reverse=True)


def when(c):
    y, m, d = (int(x) for x in c["date"].split("-"))
    return f"{MONTHS[m - 1]} {d}, {y}"


def per_mg(price, v):
    """'$4.00 / mg' for mg-dosed vials, '' otherwise (iu, ml)."""
    try:
        amt = float(v["dose_amount"])
    except (TypeError, ValueError):
        return ""
    if v["dose_unit"] != "mg" or amt <= 0:
        return ""
    return f"${price / amt:,.2f} / mg"


def color(g):
    return CATEGORY_COLORS.get(g["category"], "#33e6b0")


def img_src(v, a, form="recon", size="s"):
    sku = v["sku"].lower()
    return f"{a}assets/img/vials/{sku}-{form}{'-s' if size == 's' else ''}.webp"


def live_price_attrs(g):
    return v2.live_price_attrs(g)


def price_from(g):
    multi = len(g["variants"]) > 1
    return f"from {money(g['min_price'])}" if multi else money(g["default"]["price"])


def dose_chips(g, limit=3, limit_m=2):
    """Size chips for a card: the first few doses, then "+n" (a second "+n" for phones, which show fewer)."""
    doses = [v["dose"] for v in g["variants"]]
    shown = "".join(f"<span>{esc(d)}</span>" for d in doses[:limit])
    more = f'<span class="more">+{len(doses) - limit}</span>' if len(doses) > limit else ""
    more_m = f'<span class="more more--m">+{len(doses) - limit_m}</span>' if len(doses) > limit_m else ""
    return shown + more + more_m


# ---------------------------------------------------------------- shell ---

def topbar(p, a, page, groups):
    def link(href, label, key):
        cur = ' aria-current="page"' if key == page else ""
        return f'<a class="top__link" href="{p}{href}"{cur}>{label}</a>'

    cats = cat_list(groups)
    mega_cats = "".join(
        f'<a href="{p}catalog?cat={s}" style="--c:{CATEGORY_COLORS.get(s, "#33e6b0")}"><i></i><span>{esc(l.lower())}</span><b>{n}</b></a>'
        for s, l, n in cats
    )
    goals = "".join(
        f'<a href="{p}catalog?tag={esc(t.replace(" ", "+"))}">{esc(t)}<b>{n}</b></a>' for t, n in tag_counts(groups)[:14]
    )
    by_slug = {g["slug"]: g for g in groups}
    reported = []
    for c in sorted(COA, key=lambda c: c["date"], reverse=True):
        if c["product"] in by_slug and c["product"] not in reported:
            reported.append(c["product"])
    lab = "".join(
        f'<a href="{p}peptides/{s}#coa"><img src="{img_src(by_slug[s]["default"], a)}" alt="" width="48" height="60" loading="lazy"><span>{esc(by_slug[s]["name"].lower())}<small>{len(certs_for(by_slug[s]))} reports</small></span></a>'
        for s in reported[:3]
    )
    shop_cur = ' aria-current="page"' if page in ("catalog", "product") else ""
    return f'''<a class="skip" href="#main">skip to content</a>
<header class="top" data-top>
  <div class="top__in">
    <a class="brand" href="{p or './'}" aria-label="hlix home">hlix<i></i></a>
    <nav class="top__nav" aria-label="primary">
      <button class="top__link top__shop" type="button" data-mega-toggle aria-expanded="false" aria-controls="mega"{shop_cur}>shop {CHEV}</button>
      {link("calculator", "calculator", "calculator")}{link("planner", "planner", "planner")}{link("about", "about", "about")}{link("contact", "contact", "contact")}
    </nav>
    <button class="top__search" type="button" data-search-open aria-label="search the catalog">{SEARCH}<span>search compounds or goals</span><kbd>/</kbd></button>
    <div class="top__act">
      <button class="ibtn" type="button" data-theme-toggle aria-label="switch theme"><span class="i-sun">{SUN}</span><span class="i-moon">{MOON}</span></button>
      <a class="ibtn top__acct" href="{p}account" aria-label="your account"{' aria-current="page"' if page == "account" else ""}>{USER}<i class="top__in-dot" aria-hidden="true"></i></a>
      <button class="ibtn top__cart" type="button" data-cart-open aria-label="open cart">{CART}<b class="count" data-cart-count hidden>0</b></button>
      <button class="ibtn top__menu" type="button" data-menu-open aria-label="open menu" aria-expanded="false">{MENU}</button>
    </div>
  </div>
  <div class="mega" id="mega" data-mega>
    <div class="mega__in">
      <div class="mega__col">
        <p class="label">categories</p>
        <div class="mega__cats">{mega_cats}</div>
        <a class="mega__all" href="{p}catalog">all {len(groups)} compounds {ARROW}</a>
      </div>
      <div class="mega__col">
        <p class="label">research goals</p>
        <div class="mega__goals">{goals}</div>
      </div>
      <div class="mega__col mega__lab">
        <p class="label">published lab reports</p>
        {lab}
        <a class="mega__tool" href="{p}calculator">{CALC}<span>dosage calculator<small>draw-to units, supply, vials needed</small></span></a>
        <a class="mega__tool" href="{p}planner">{CALENDAR}<span>dose planner<small>your vials and doses on a calendar</small></span></a>
      </div>
    </div>
  </div>
</header>'''


def overlays(p, a):
    return f'''<div class="pal" data-pal role="dialog" aria-modal="true" aria-label="search">
  <div class="pal__scrim" data-pal-close></div>
  <div class="pal__box">
    <label class="pal__field">{SEARCH}<input data-pal-input type="text" placeholder="search compounds, categories or goals" autocomplete="off" spellcheck="false" aria-label="search"><button type="button" class="pal__esc" data-pal-close>esc</button></label>
    <div class="pal__body" data-pal-body></div>
    <div class="pal__foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
  </div>
</div>
<div class="sheet" data-menu role="dialog" aria-modal="true" aria-label="menu">
  <div class="sheet__scrim" data-menu-close></div>
  <div class="sheet__box">
    <div class="sheet__head"><span class="label">menu</span><button class="ibtn" type="button" data-menu-close aria-label="close menu">{CLOSE}</button></div>
    <nav class="sheet__links">
      <a href="{p or './'}"><span>01</span>home</a>
      <a href="{p}catalog"><span>02</span>shop</a>
      <a href="{p}calculator"><span>03</span>calculator</a>
      <a href="{p}planner"><span>04</span>dose planner</a>
      <a href="{p}about"><span>05</span>about</a>
      <a href="{p}contact"><span>06</span>contact</a>
      <a href="{p}account"><span>07</span>account</a>
    </nav>
    <div class="sheet__foot">
      <button class="pill" type="button" data-theme-toggle><span class="i-sun">{SUN}</span><span class="i-moon">{MOON}</span><span data-theme-label>light mode</span></button>
      <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>
    </div>
  </div>
</div>
<div class="drawer" data-cart role="dialog" aria-modal="true" aria-label="cart">
  <div class="drawer__scrim" data-cart-close></div>
  <aside class="drawer__box">
    <div class="drawer__head"><h2>cart <span data-cart-n></span></h2><button class="ibtn" type="button" data-cart-close aria-label="close cart">{CLOSE}</button></div>
    <div class="drawer__list" data-cart-list></div>
    <div class="drawer__empty" data-cart-empty hidden>
      <p>your cart is empty.</p>
      <a class="btn btn--ghost" href="{p}catalog">browse the catalog {ARROW}</a>
    </div>
    <div class="drawer__foot" data-cart-foot hidden>
      <div class="drawer__sub"><span>subtotal</span><b data-cart-subtotal>$0</b></div>
      <a class="btn btn--solid btn--block" href="{p}checkout">request this order {ARROW}</a>
      <p class="drawer__note">no payment is taken online. send the request and we'll confirm by email with next steps.</p>
    </div>
  </aside>
</div>
<div class="lb" data-lb aria-hidden="true"><button class="ibtn lb__x" type="button" aria-label="close">{CLOSE}</button><div class="lb__in"></div></div>
<div class="toast" data-toast role="status" aria-live="polite"></div>'''


def tabbar(p, page):
    def cur(k):
        return ' aria-current="page"' if k == page else ""
    return f'''<nav class="tabbar" aria-label="quick actions">
  <a href="{p}catalog"{cur("catalog")}>{GRID}<span>shop</span></a>
  <button type="button" data-search-open>{SEARCH}<span>search</span></button>
  <a href="{p}calculator"{cur("calculator")}>{CALC}<span>calculator</span></a>
  <button type="button" data-open-chat>{SPARK}<span>ask ai</span></button>
  <button type="button" data-cart-open>{CART}<span>cart</span><b class="count" data-cart-count hidden>0</b></button>
</nav>'''


def footer(p, groups):
    cats = "".join(f'<a href="{p}catalog?cat={s}">{esc(l.lower())}</a>' for s, l, _ in cat_list(groups))
    return f'''<footer class="foot">
  <div class="wrap">
    <div class="foot__grid">
      <div class="foot__brand">
        <a class="brand" href="{p or './'}" aria-label="hlix home">hlix<i></i></a>
        <p>a research peptide catalog. every compound logged with its dose, spec and price per vial.</p>
        <button class="btn btn--ghost btn--sm" type="button" data-open-chat>{SPARK} ask the hlix ai</button>
      </div>
      <div class="foot__col"><h4>shop</h4>{cats}</div>
      <div class="foot__col"><h4>tools</h4><a href="{p}calculator">dosage calculator</a><a href="{p}planner">dose planner</a><button type="button" data-search-open>search</button><button type="button" data-open-chat>ai assistant</button></div>
      <div class="foot__col"><h4>hlix</h4><a href="{p}about">about</a><a href="{p}contact">contact</a><a href="{p}account">your account</a><a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a></div>
    </div>
    <div class="foot__legal">
      <p>© 2026 hlix. for laboratory research use only. not for human or animal consumption. nothing on this site is medical advice, and nothing here is an offer to sell a controlled or prescription substance.</p>
    </div>
  </div>
</footer>'''


ROBOTS = '<meta name="robots" content="noindex, nofollow">\n'
FONTS = '''<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">'''


def shell(*, title, desc, page, body, groups, depth=0, scripts=(), body_class="", css=(), noindex=False):
    p = "../" * depth               # site root, for pages
    a = "../" * (depth + DEPTH)     # site root, for files (the same, unless OUT is a subfolder)
    links = "".join(f'<link rel="stylesheet" href="{a}assets/css/{c}?v={VER}">' for c in css)  # after v3.css: a page's own styles win
    js = "".join(f'<script src="{a}assets/js/{s}?v={VER}" defer></script>' for s in scripts)
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#050607">
{ROBOTS if noindex else ""}<title>{title} · hlix</title>
<meta name="description" content="{esc(desc)}">
{FONTS}
<link rel="stylesheet" href="{a}assets/css/v3.css?v={VER}">{links}
<script src="{a}assets/js/v3-boot.js?v={VER}" data-base="{p}" data-assets="{a}"></script>
</head>
<body class="{body_class}" data-page="{page}">
{topbar(p, a, page, groups)}
<main id="main">
{body}
</main>
{footer(p, groups)}
{tabbar(p, page)}
{overlays(p, a)}
<script src="{a}assets/js/search-index.js?v={VER}"></script>
<script src="{a}assets/js/v2-prices.js?v={VER}"></script>
<script src="{a}assets/js/v3-cart.js?v={VER}"></script>
<script src="{a}assets/js/v3.js?v={VER}"></script>
{js}
<script src="{a}assets/js/v2-chat.js?v={VER}"></script>
</body>
</html>'''


def sec_head(n, title, sub="", link=""):
    sub_html = f'<p class="sec__sub">{sub}</p>' if sub else ""
    return f'''<div class="sec__head" data-reveal>
      <div><span class="sec__n">{n}</span><h2 class="sec__title">{title}</h2></div>
      <div class="sec__aside">{sub_html}{link}</div>
    </div>'''


# ---------------------------------------------------------------- cards ---

def card(g, p, a, i=0):
    d = g["default"]
    tags_attr = esc(",".join(t.lower() for t in g["tags"]))
    skus = ",".join(v["sku"] for v in g["variants"])
    media = v2.vial_media(d, f"c-{g['slug']}", "s", a)
    hover = (f'<img class="card__alt" alt="" width="480" height="600" data-hover-src="{img_src(d, a, "powder")}">'
             if v2.has_photo(d) else "")
    return f'''<a class="card" href="{p}peptides/{g['slug']}" style="--c:{color(g)}" data-card data-cat="{g['category']}" data-name="{esc(g['name'].lower())}" data-tags="{tags_attr}" data-skus="{esc(skus)}" data-price="{g['min_price']:.2f}" data-sizes="{len(g['variants'])}" data-order="{i}">
  <div class="card__media">{media}{hover}<span class="tag-stock" data-card-stock hidden></span><span class="card__view">view {ARROW}</span></div>
  <div class="card__body">
    <p class="card__cat"><i></i>{esc(g['category_label'].lower())}</p>
    <h3 class="card__name">{esc(g['name'])}</h3>
    <p class="card__sizes">{dose_chips(g)}</p>
  </div>
  <p class="card__price"><span{live_price_attrs(g)}>{price_from(g)}</span><small>per vial</small></p>
</a>'''


def ordering_steps(p):
    steps = [
        ("01", "build your cart", "pick a size and form on any product page. prices are per single vial, with no minimums."),
        ("02", "send the request", "check out with your contact and shipping details. no card is asked for and nothing is charged online."),
        ("03", "we confirm by email", "we reply with next steps to arrange payment and shipping, usually within 1–2 business days."),
    ]
    cells = "".join(
        f'<li class="step3" data-reveal style="--d:{i}"><span class="step3__n">{n}</span><h3>{t}</h3><p>{d}</p></li>'
        for i, (n, t, d) in enumerate(steps)
    )
    return f'<ol class="steps3">{cells}</ol>'


# ----------------------------------------------------------------- home ---

def page_home(groups):
    p, a = "", "../" * DEPTH
    by_name = {g["name"]: g for g in groups}
    featured = [by_name[n] for n in FEATURED if n in by_name]
    total = len(groups)
    sizes = sum(len(g["variants"]) for g in groups)
    cats = cat_list(groups)

    # spotlight: background-removed bottles, one at a time
    slides, dots = "", ""
    spot = [by_name[n] for n in SPOTLIGHT if n in by_name]
    for i, g in enumerate(spot):
        d = g["default"]
        cut = v2.hero_cutout_path(d)
        src = f"{a}assets/img/vials/hero-cutout/{cut.name}" if cut else img_src(d, a, "recon", "l")
        multi = len(g["variants"]) > 1
        slides += f'''<a class="spot__slide{" is-on" if i == 0 else ""}" href="peptides/{g['slug']}" style="--c:{color(g)}" data-slide aria-hidden="{"false" if i == 0 else "true"}"{"" if i == 0 else ' tabindex="-1"'}>
        <img src="{src}" alt="{esc(g['name'])} research vial" width="1280" height="1600"{"" if i == 0 else ' loading="lazy"'}>
        <span class="spot__meta"><span class="spot__cat"><i></i>{esc(g['category_label'].lower())}</span><b>{esc(g['name'])}</b><span class="spot__sz">{len(g['variants'])} size{"s" if multi else ""} · <span{live_price_attrs(g)}>{price_from(g)}</span></span></span>
      </a>'''
        cur_attr = ' aria-current="true"' if i == 0 else ""
        dots += f'<button type="button" data-dot="{i}" aria-label="show {esc(g["name"].lower())}"{cur_attr}><i></i></button>'

    chips = "".join(f'<a href="catalog?tag={t.replace(" ", "+")}">{t}</a>' for t in POPULAR_GOALS)

    # category bento: metabolic large, then the rest
    order = ["metabolic", "growth", "recovery", "cognitive", "longevity", "hormonal", "specialty", "supplies"]
    first_of = {}
    for g in groups:
        first_of.setdefault(g["category"], g)
    pick = {"metabolic": "GLP3-R", "growth": "Ipamorelin", "recovery": "BPC 157", "longevity": "Epithalon", "cognitive": "Semax"}
    tiles = ""
    for i, slug in enumerate(order):
        meta = next((c for c in cats if c[0] == slug), None)
        if not meta:
            continue
        _, label, n = meta
        g = by_name.get(pick.get(slug, ""), first_of[slug])
        if g["category"] != slug:
            g = first_of[slug]
        desc = next(dsc for s, _, dsc in b.CATEGORY_ORDER if s == slug)
        big = " tile--big" if slug == "metabolic" else ""
        desc_html = f'<p class="tile__d">{esc(desc.lower())}</p>' if big else ""
        tiles += f'''<a class="tile{big}" href="catalog?cat={slug}" style="--c:{CATEGORY_COLORS.get(slug)}" data-reveal>
        <span class="tile__n">{i + 1:02d}</span>
        <span class="tile__t">{esc(label.lower())}</span>{desc_html}
        <span class="tile__c">{n} compound{"s" if n != 1 else ""} {ARROW}</span>
        <img src="{img_src(g['default'], a)}" alt="" width="480" height="600" loading="lazy">
      </a>'''
    tiles += f'''<a class="tile tile--all" href="catalog" data-reveal>
        <span class="tile__n">all</span>
        <span class="tile__t">the full catalog</span>
        <span class="tile__c">{total} compounds · {sizes} sizes {ARROW}</span>
      </a>'''

    goals = "".join(
        f'<a class="goal" href="catalog?tag={esc(t.replace(" ", "+"))}" style="--w:{min(1, n / 21):.2f}">{esc(t)}<sup>{n}</sup></a>'
        for t, n in tag_counts(groups)[:22]
    )

    fcards = "".join(card(g, p, a, i) for i, g in enumerate(featured))

    # ai mock: a real answer built from catalog data, so it never lies
    sample = by_name.get("DSIP") or next(g for g in groups if len(g["variants"]) > 2)
    parts = [f'{esc(v["dose"])} (<span data-live-price="{esc(v["sku"])}">{money(v["price"])}</span>)' for v in sample["variants"]]
    answer = f"{esc(sample['name'].lower())} comes in {len(parts)} sizes: " + ", ".join(parts[:-1]) + f" and {parts[-1]}, priced per vial."

    days = minical_days()

    n_reports = len(COA)
    body = f'''
<section class="hero">
  <div class="wrap hero__grid">
    <div class="hero__copy">
      <p class="label label--dot" data-reveal>research peptide catalog</p>
      <h1 class="hero__title" data-reveal style="--d:1">research-grade.<br><span class="ac">clearly priced.</span></h1>
      <p class="hero__sub" data-reveal style="--d:2">{total} compounds and {sizes} vial sizes, each priced per single vial. search by name, or by what you're researching.</p>
      <form class="hsearch" action="catalog" data-hero-search data-reveal style="--d:3" role="search">
        {SEARCH}<input name="q" type="search" placeholder="try “recovery” or “bpc 157”" autocomplete="off" spellcheck="false" aria-label="search the catalog" data-hero-input>
        <button class="btn btn--solid" type="submit">search</button>
        <div class="hsearch__drop" data-hero-drop hidden></div>
      </form>
      <div class="hero__chips" data-reveal style="--d:4"><span>popular</span>{chips}</div>
    </div>
    <div class="spot" data-spot data-reveal style="--d:2">
      <div class="spot__stage">{slides}</div>
      <div class="spot__bar"><span class="label">spotlight</span><div class="spot__dots">{dots}</div></div>
    </div>
  </div>
  <div class="wrap">
    <dl class="kpis" data-reveal style="--d:5">
      <div><dt>compounds</dt><dd>{total}</dd></div>
      <div><dt>vial sizes</dt><dd>{sizes}</dd></div>
      <div><dt>categories</dt><dd>{len(cats)}</dd></div>
      <div><dt>lab reports published</dt><dd>{n_reports}</dd></div>
    </dl>
  </div>
</section>

<section class="assure">
  <div class="wrap assure__grid">
    <div data-reveal>{SHIELD}<p><b>≥99% purity</b><span>hplc verified, across the catalog</span></p></div>
    <div data-reveal style="--d:1">{DOC}<p><b>lab reports</b><span>coas on file; independent results published</span></p></div>
    <div data-reveal style="--d:2">{TAG}<p><b>priced per vial</b><span>no bundles, no minimums</span></p></div>
    <div data-reveal style="--d:3">{MAIL}<p><b>order by request</b><span>no card online. we confirm by email</span></p></div>
  </div>
</section>

<section class="sec" id="categories">
  <div class="wrap">
    {sec_head("01", "shop by category.", "eight shelves, from metabolic research to bench supplies.", f'<a class="link" href="catalog">view all {ARROW}</a>')}
    <div class="bento">{tiles}</div>
  </div>
</section>

<section class="sec sec--tint" id="goals">
  <div class="wrap">
    {sec_head("02", "what are you researching?", "every compound is tagged with the research areas it's studied for. pick one to see them all.")}
    <div class="goals" data-reveal>{goals}</div>
  </div>
</section>

<section class="sec" id="featured">
  <div class="wrap">
    {sec_head("03", "featured.", "", f'<a class="link" href="catalog">all {total} compounds {ARROW}</a>')}
    <div class="pgrid pgrid--4">{fcards}</div>
  </div>
</section>

<section class="sec" id="tools">
  <div class="wrap">
    {sec_head("04", "tools for the bench.", "free, in your browser, nothing to sign up for.")}
    <div class="tools">
      <a class="tool tool--calc" href="calculator" data-reveal>
        <span class="label">{CALC} dosage calculator</span>
        <h3>know your draw.</h3>
        <p>vial size, water added and dose in; draw-to units, concentration and how long a vial lasts out.</p>
        <div class="syr tool__syr" data-syr-demo>{v2.syringe_svg("home")}</div>
        <span class="link">open the calculator {ARROW}</span>
      </a>
      <a class="tool tool--plan" href="planner" data-reveal style="--d:1">
        <span class="label">{CALENDAR} dose planner</span>
        <h3>plan your doses.</h3>
        <p>list your vials, schedule doses on a calendar and see what's left in each, day by day. sign in to keep it in your account.</p>
        <div class="minical" aria-hidden="true">{days}</div>
        <span class="link">open the planner {ARROW}</span>
      </a>
      <div class="tool tool--ai" data-reveal style="--d:2">
        <span class="label">{SPARK} ai assistant</span>
        <h3>ask the catalog.</h3>
        <div class="bubbles" aria-hidden="true">
          <p class="bub bub--u">what sizes does {esc(sample['name'].lower())} come in?</p>
          <p class="bub bub--a">{answer}</p>
        </div>
        <button class="btn btn--solid" type="button" data-open-chat>{SPARK} ask a question</button>
      </div>
    </div>
  </div>
</section>

<section class="sec sec--tint" id="ordering">
  <div class="wrap">
    {sec_head("05", "how ordering works.", "there's no card form on this site. you send a request; we confirm it with you by email.")}
    {ordering_steps(p)}
  </div>
</section>'''
    return shell(title="research-grade, clearly priced", desc=b.BASE_DESCRIPTION, page="home", body=body, groups=groups, body_class="home")


# -------------------------------------------------------------- catalog ---

def page_catalog(groups):
    p, a = "", "../" * DEPTH
    cats = cat_list(groups)
    radios = f'<button type="button" class="fcat is-active" data-fcat="all" aria-pressed="true"><i style="--c:var(--fg)"></i><span>all compounds</span><b>{len(groups)}</b></button>' + "".join(
        f'<button type="button" class="fcat" data-fcat="{s}" aria-pressed="false"><i style="--c:{CATEGORY_COLORS.get(s, "#33e6b0")}"></i><span>{esc(l.lower())}</span><b>{n}</b></button>'
        for s, l, n in cats
    )
    tags = tag_counts(groups)
    TOP = 16
    chips = "".join(
        f'<button type="button" class="fchip" data-ftag="{esc(t)}" aria-pressed="false"{" data-extra hidden" if i >= TOP else ""}>{esc(t)}<b>{n}</b></button>'
        for i, (t, n) in enumerate(tags)
    )
    more = f'<button type="button" class="fmore" data-ftag-more>show all {len(tags)} goals</button>' if len(tags) > TOP else ""
    quick = f'<button type="button" class="qcat is-active" data-fcat="all">all</button>' + "".join(
        f'<button type="button" class="qcat" data-fcat="{s}" style="--c:{CATEGORY_COLORS.get(s, "#33e6b0")}">{esc(l.lower())}</button>' for s, l, _ in cats
    )
    cards = "".join(card(g, p, a, i) for i, g in enumerate(groups))
    sort = '''<label class="sort"><span class="sr-only">sort by</span><select data-sort>
        <option value="featured">sort: featured</option>
        <option value="price-asc">price: low to high</option>
        <option value="price-desc">price: high to low</option>
        <option value="name">name: a to z</option>
        <option value="sizes">most sizes</option>
      </select>''' + CHEV + "</label>"
    body = f'''
<section class="chead">
  <div class="wrap chead__in">
    <div>
      <p class="label label--dot" data-reveal>shop</p>
      <h1 class="chead__title" data-reveal style="--d:1">catalog<sup data-count-out>{len(groups)}</sup></h1>
    </div>
    <p class="chead__sub" data-reveal style="--d:2">every compound and every size, priced per single vial. filter by category or research goal, or search by name.</p>
  </div>
</section>
<div class="wrap">
  <div class="qcats" data-qcats>{quick}</div>
  <div class="shop" data-shop>
    <div class="fscrim" data-filters-close></div>
    <aside class="filters" data-filters aria-label="filters">
      <div class="filters__head"><h2>filters</h2><button type="button" class="ibtn filters__x" data-filters-close aria-label="close filters">{CLOSE}</button></div>
      <div class="filters__body">
        <label class="fsearch">{SEARCH}<input type="search" data-fq placeholder="name or goal" autocomplete="off" spellcheck="false" aria-label="filter by name or goal"></label>
        <div class="fgroup"><p class="label">category</p><div class="fcats">{radios}</div></div>
        <div class="fgroup"><p class="label">research goal <span class="fgroup__hint">any of</span></p><div class="fchips">{chips}</div>{more}</div>
      </div>
      <div class="filters__foot"><button type="button" class="btn btn--ghost" data-reset>reset</button><button type="button" class="btn btn--solid" data-filters-close>show <span data-count-out>{len(groups)}</span> results</button></div>
    </aside>
    <div class="results">
      <div class="bar" data-bar>
        <button type="button" class="pill bar__filters" data-filters-open>{SLIDERS} filters <b data-fcount hidden></b></button>
        <p class="bar__count"><b data-count-out>{len(groups)}</b> <span data-count-noun>compounds</span></p>
        <div class="bar__active" data-active></div>
        {sort}
        <div class="views" role="group" aria-label="layout"><button type="button" data-view="grid" aria-pressed="true" aria-label="grid view">{GRID}</button><button type="button" data-view="list" aria-pressed="false" aria-label="list view">{LIST}</button></div>
      </div>
      <div class="pgrid" data-grid>{cards}</div>
      <div class="empty" data-empty hidden>
        <p class="empty__t">nothing matches that.</p>
        <p>try fewer filters, another name, or ask the assistant what fits.</p>
        <div><button type="button" class="btn btn--ghost" data-reset>clear filters</button><button type="button" class="btn btn--solid" data-open-chat>{SPARK} ask the ai</button></div>
      </div>
    </div>
  </div>
</div>'''
    return shell(title="catalog", desc="the complete hlix research peptide catalog.", page="catalog", body=body, groups=groups, body_class="catalog")


# -------------------------------------------------------------- product ---

def coa_section(g, a):
    certs = certs_for(g)
    if not certs:
        return ('<p>a certificate of analysis is kept on file for this compound and is available on request. '
                '<a class="link" href="../contact">ask for it ' + ARROW + '</a></p>')
    items = "".join(
        f'''<li class="coa">
          <div class="coa__date"><b>{when(c)}</b><span>{esc(c["lab"].lower())}</span></div>
          <div class="coa__p"><span class="label">purity</span><b>{esc(c["purity"])}</b></div>
          <div class="coa__links"><a href="{a}assets/coa/{c["file"]}" target="_blank" rel="noopener">view report (pdf) {ARROW_UR}</a><a href="https://www.finnrick.com/verify" target="_blank" rel="noopener">verify on finnrick · id {esc(c["finnrick_id"])}</a></div>
        </li>'''
        for c in certs
    )
    return (f'<p>independent lab results for {esc(g["name"])}, tested for finnrick analytics. each report covers only the lot it tested.</p>'
            f'<ul class="coas">{items}</ul>')


def page_product(g, groups):
    p, a = "../", "../" * (1 + DEPTH)
    d = g["default"]
    variants = g["variants"]
    multi = len(variants) > 1
    has_img = v2.has_photo(d)
    rp = recon_price(d["price"])
    pp = d["price"]  # powder: the form a product page starts on

    if has_img:
        main = (f'<img src="{img_src(d, a, "powder", "l")}" alt="{esc(g["name"])} {esc(d["dose"])} research vial" width="1280" height="1600" '
                f'decoding="sync" data-main-img data-base="{a}assets/img/vials/" data-sku="{d["sku"].lower()}" data-form="powder">')
        thumbs = "".join(
            f'<button type="button" class="thumb{" is-active" if f == "powder" else ""}" data-form-thumb="{f}" aria-pressed="{"true" if f == "powder" else "false"}">'
            f'<img src="{img_src(d, a, f)}" alt="" width="480" height="600" data-thumb-img><span>{label}</span></button>'
            for f, label in (("powder", "powder"), ("recon", "ready to use"))
        )
        thumbs = f'<div class="thumbs" role="group" aria-label="show form">{thumbs}</div>'
    else:
        main = v2.vial_media(d, f"pdp-{g['slug']}", "l", a, eager=True)
        thumbs = ""

    tiles = "".join(
        f'<button type="button" role="radio" class="size{" is-active" if v is d else ""}" aria-checked="{"true" if v is d else "false"}" '
        f'data-variant data-sku="{esc(v["sku"])}" data-dose="{esc(v["dose"])}" data-amt="{esc(v["dose_amount"] or "")}" data-dunit="{esc(v["dose_unit"])}" '
        f'data-price="{v["price"]:.2f}" data-price-recon="{recon_price(v["price"]):.2f}" data-img="{v["sku"].lower()}">'
        f'<b>{esc(v["dose"])}</b><span data-tile-price>{money(v["price"])}</span>'
        f'<small class="size__stock" data-tile-stock hidden></small></button>'
        for v in variants
    )
    certs = certs_for(g)
    coa_line = ""
    if certs:
        c = certs[0]
        more = f' · <a href="#coa">all {len(certs)} reports</a>' if len(certs) > 1 else ""
        coa_line = (f'<p class="pdp__coa">{CHECK}<span><b>{esc(c["purity"])} purity</b> · {esc(c["lab"].lower())} · {when(c)} · '
                    f'<a href="{a}assets/coa/{c["file"]}" target="_blank" rel="noopener">view report</a>{more}</span></p>')

    tags = "".join(f'<a class="chip" href="{p}catalog?tag={esc(t.lower().replace(" ", "+"))}">{esc(t)}</a>' for t in g["tags"])
    sizes_all = ", ".join(v["dose"] for v in variants)

    table = ""
    if multi:
        rows = "".join(
            f'<tr data-pick="{esc(v["sku"])}"{ACTIVE_CLS if v is d else ""}><td><b>{esc(v["dose"])}</b></td><td class="mono">{esc(v["sku"])}</td>'
            f'<td data-cell="{esc(v["sku"])}|powder">{money(v["price"])}</td><td data-cell="{esc(v["sku"])}|recon">{money(recon_price(v["price"]))}</td>'
            f'<td class="dim" data-cell-mg="{esc(v["sku"])}">{per_mg(v["price"], v) or "—"}</td><td><button type="button" class="link" data-pick-btn="{esc(v["sku"])}">select</button></td></tr>'
            for v in variants
        )
        table = f'''<div class="srow" id="sizes">
        <h2 class="srow__k">all sizes</h2>
        <div class="srow__v"><div class="tscroll"><table class="stable">
          <thead><tr><th>size</th><th>sku</th><th>powder</th><th>ready to use</th><th>powder / mg</th><th><span class="sr-only">select</span></th></tr></thead>
          <tbody>{rows}</tbody></table></div></div>
      </div>'''

    related = [x for x in groups if x["category"] == g["category"] and x["slug"] != g["slug"]][:8]
    rel = ""
    if related:
        rel = f'''<section class="sec related">
  <div class="wrap">
    {sec_head("", f"more in {esc(g['category_label'].lower())}.", "", f'<a class="link" href="{p}catalog?cat={g["category"]}">see all {ARROW}</a>')}
    <div class="rail">{"".join(card(x, p, a, i) for i, x in enumerate(related))}</div>
  </div>
</section>'''

    body = f'''
<div class="pdp" style="--c:{color(g)}" data-pdp data-slug="{g['slug']}">
  <div class="wrap">
    <nav class="crumbs" aria-label="breadcrumb"><a href="{p or './'}">home</a><span>/</span><a href="{p}catalog">shop</a><span>/</span><a href="{p}catalog?cat={g['category']}">{esc(g['category_label'].lower())}</a><span>/</span><b>{esc(g['name'])}</b></nav>
    <div class="pdp__grid">
      <div class="pdp__gallery">
        <div class="stage" data-zoom>{main}<span class="stage__form is-powder" data-form-badge>powder</span><span class="stage__zoom" aria-hidden="true">{ZOOM}</span></div>
        {thumbs}
      </div>
      <div class="pdp__panel">
        <div class="pdp__sticky">
          <p class="pdp__cat"><i></i>{esc(g['category_label'].lower())}</p>
          <h1 class="pdp__name">{esc(g['name'])}</h1>
          {coa_line}
          <div class="pdp__price" data-regular><b class="price__n" data-price-out>{money(pp)}</b><span>/ vial</span><small data-permg>{per_mg(pp, d)}</small></div>
          <div class="fam" data-family hidden>
            <div class="fam__top"><p class="label">family &amp; friends price</p>
              <div class="fam__units" role="group" aria-label="buy by the vial or the pack"><button type="button" data-unit="pack" aria-pressed="true">pack of 10</button><button type="button" data-unit="vial" aria-pressed="false">single vial</button></div></div>
            <p class="fam__price"><b data-family-price></b> <span data-family-per>/ pack of 10</span></p>
          </div>
          <div class="pick">
            <div class="pick__head"><span class="label">size</span><b data-dose-out>{esc(d['dose'])}</b></div>
            <div class="sizes" role="radiogroup" aria-label="vial size">{tiles}</div>
          </div>
          <div class="pick">
            <div class="pick__head"><span class="label">form</span></div>
            <div class="forms" role="radiogroup" aria-label="form">
              <button type="button" role="radio" class="form is-active" data-form="powder" aria-checked="true"><span><b>powder</b><small>as powder, to reconstitute</small></span><em data-form-price="powder">{money(d['price'])}</em></button>
              <button type="button" role="radio" class="form" data-form="recon" aria-checked="false"><span><b>ready to use</b><small>reconstituted</small></span><em data-form-price="recon">{money(rp)}</em></button>
            </div>
          </div>
          <div class="buy" data-buy>
            <div class="qty" data-qty><button type="button" data-qty-dec aria-label="decrease quantity">{MINUS}</button><input type="number" min="1" step="1" value="1" inputmode="numeric" data-qty-input aria-label="quantity"><button type="button" data-qty-inc aria-label="increase quantity">{PLUS}</button></div>
            <button type="button" class="btn btn--solid buy__btn" data-add data-name="{esc(g['name'])}" data-slug="{g['slug']}" data-category="{esc(g['category_label'])}">add to cart <span class="buy__sum" data-add-sum>· {money(pp)}</span></button>
          </div>
          <ul class="pdp__notes">
            <li class="stockline" data-stock hidden><i class="dot"></i><span data-stock-text></span></li>
            <li>{SHIELD}≥99% purity · hplc verified</li>
            <li>{MAIL}no payment online. we confirm your order by email</li>
          </ul>
        </div>
      </div>
    </div>
  </div>

  <section class="spec">
    <div class="wrap">
      <div class="srow">
        <h2 class="srow__k">overview</h2>
        <div class="srow__v"><p class="lead">{esc(g['name'])}, cataloged under {esc(g['category_label'].lower())}, available in {len(variants)} vial size{'s' if multi else ''}. logged at ≥99% purity per the standard applied across this catalog.</p></div>
      </div>
      <div class="srow">
        <h2 class="srow__k">specifications</h2>
        <dl class="srow__v specs">
          <div><dt>category</dt><dd>{esc(g['category_label'].lower())}</dd></div>
          <div><dt>sizes</dt><dd>{esc(sizes_all)}</dd></div>
          <div><dt>selected</dt><dd><span data-dose-out>{esc(d['dose'])}</span> · <span data-form-out>powder</span></dd></div>
          <div><dt>sku</dt><dd class="mono" data-sku-out>{esc(d['sku'])}</dd></div>
          <div><dt>purity</dt><dd>≥99% · hplc verified</dd></div>
          <div><dt>lab reports</dt><dd>{f'{len(certs)} published' if certs else 'on file, on request'}</dd></div>
        </dl>
      </div>
      {table}
      <div class="srow" id="coa">
        <h2 class="srow__k">certificate of analysis</h2>
        <div class="srow__v">{coa_section(g, a)}</div>
      </div>
      {f'<div class="srow"><h2 class="srow__k">research goals</h2><div class="srow__v chips">{tags}</div></div>' if tags else ''}
      <div class="srow">
        <h2 class="srow__k">research use only</h2>
        <div class="srow__v ruo"><p>for laboratory research use only. not intended for human or animal consumption, and not evaluated by the fda to diagnose, treat, cure or prevent any disease. it is not a drug, food, cosmetic or medical device. nothing on this page is medical advice.</p></div>
      </div>
    </div>
  </section>
  {rel}
</div>
<div class="buybar" data-buybar aria-hidden="true">
  <div class="buybar__info"><b>{esc(g['name'])}</b><span><span data-dose-out>{esc(d['dose'])}</span> · <span data-form-out>powder</span></span></div>
  <button type="button" class="btn btn--solid" data-add-proxy tabindex="-1">add · <span data-price-out>{money(pp)}</span></button>
</div>'''
    return shell(title=g["name"], desc=f"{g['name']}: {g['category_label']} research compound.", page="product", body=body, groups=groups, depth=1, body_class="product")


# ---------------------------------------------------------------- about ---

def page_about(groups):
    total = len(groups)
    sizes = sum(len(g["variants"]) for g in groups)
    rows = [
        ("01", "precision", "every entry gets a real dose, a real price and a real category. no vague listings."),
        ("02", "transparency", "pricing is always shown per single vial, with no bundled minimums or hidden markups."),
        ("03", "rigor", "≥99% purity is the floor for anything that makes it into the catalog, not the ceiling."),
    ]
    prin = "".join(f'<li class="prin" data-reveal style="--d:{i}"><span class="prin__n">{n}</span><h3>{t}</h3><p>{d}</p></li>' for i, (n, t, d) in enumerate(rows))
    body = f'''
<section class="phead">
  <div class="wrap phead__grid">
    <div>
      <p class="label label--dot" data-reveal>about</p>
      <h1 class="phead__title" data-reveal style="--d:1">a catalog, built like it matters.</h1>
    </div>
    <p class="phead__sub" data-reveal style="--d:2">hlix exists to bring order to research peptide sourcing. every compound is logged, priced and organized to one consistent standard, so nothing about the catalog is ever a guess.</p>
  </div>
</section>
<section class="sec sec--flush">
  <div class="wrap">
    <dl class="kpis kpis--lg" data-reveal>
      <div><dt>compounds</dt><dd>{total}</dd></div>
      <div><dt>vial sizes</dt><dd>{sizes}</dd></div>
      <div><dt>minimum purity</dt><dd>99%</dd></div>
      <div><dt>lab reports published</dt><dd>{len(COA)}</dd></div>
    </dl>
  </div>
</section>
<section class="sec">
  <div class="wrap">
    {sec_head("01", "the standard.")}
    <ol class="prins">{prin}</ol>
  </div>
</section>
<section class="sec">
  <div class="wrap split">
    <h2 class="split__t" data-reveal>straightforward pricing.</h2>
    <div data-reveal style="--d:1">
      <p class="lead">every listing is priced per single vial, with no bundled minimums and no hidden markups. the price shown is the price paid, batch after batch.</p>
      <p class="dim">powder is the base price. ready-to-use vials, already reconstituted, are a flat 20% more.</p>
    </div>
  </div>
</section>
<section class="sec sec--tint">
  <div class="wrap">
    {sec_head("02", "how ordering works.", "there's no card form on this site. you send a request; we confirm it with you by email.")}
    {ordering_steps("")}
  </div>
</section>
<section class="cta">
  <div class="wrap cta__in" data-reveal>
    <h2>see the catalog.</h2>
    <div class="cta__btns"><a class="btn btn--solid btn--lg" href="catalog">explore {total} compounds {ARROW}</a><a class="btn btn--ghost btn--lg" href="contact">get in touch</a></div>
  </div>
</section>'''
    return shell(title="about", desc="about hlix: a research peptide catalog for laboratory and research use.", page="about", body=body, groups=groups, body_class="about")


# -------------------------------------------------------------- contact ---

def page_contact(groups):
    body = f'''
<section class="phead">
  <div class="wrap phead__grid">
    <div>
      <p class="label label--dot" data-reveal>contact</p>
      <h1 class="phead__title" data-reveal style="--d:1">say hello.</h1>
    </div>
    <p class="phead__sub" data-reveal style="--d:2">questions about a compound, a batch, a lab report or an order request? write in and a person answers.</p>
  </div>
</section>
<section class="sec sec--flush">
  <div class="wrap contact">
    <div class="contact__info">
      <a class="cinfo cinfo--mail" href="mailto:{CONTACT_EMAIL}" data-reveal>{MAIL}<span class="label">email</span><b>{CONTACT_EMAIL}</b></a>
      <div class="cinfo" data-reveal style="--d:1">{CLOCK}<span class="label">response time</span><b>usually 1–2 business days</b></div>
      <div class="cinfo" data-reveal style="--d:2">{PIN}<span class="label">based in</span><b>united states</b></div>
      <button class="cinfo cinfo--ai" type="button" data-open-chat data-reveal style="--d:3">{SPARK}<span class="label">need an answer now?</span><b>ask the hlix ai {ARROW}</b></button>
    </div>
    <form class="form-card" data-contact-form data-reveal style="--d:1">
      <h2>send a message</h2>
      <div class="fields2">
        <label class="field"><span>name</span><input name="name" type="text" required autocomplete="name"></label>
        <label class="field"><span>email</span><input name="email" type="email" required autocomplete="email"></label>
      </div>
      <label class="field"><span>message</span><textarea name="message" rows="6" required></textarea></label>
      <div class="form-card__foot"><button class="btn btn--solid" type="submit">send message {ARROW}</button><p class="status" data-contact-status hidden></p></div>
    </form>
  </div>
</section>'''
    return shell(title="contact", desc="contact hlix.", page="contact", body=body, groups=groups, body_class="contact-page")


# ----------------------------------------------------------- calculator ---

def minical_days():
    """A static month whose squares drain like the planner's (the home page's and the calculator's planner cards)."""
    days = ""
    for i in range(28):
        lvl = max(0.0, 1 - (i // 2) * 0.075)
        dose = ' class="has"' if i % 2 == 0 and lvl > 0 else ""
        days += f'<i{dose} style="--lvl:{lvl:.2f}"></i>'
    return days


def page_calculator(groups):
    opts = v2.opts
    vial = opts("vial", [2, 5, 10, 20, 30, 50, 100], "mg", 5)
    water = opts("water", [0.5, 1, 2, 2.5, 3, 5, 10], "ml", 2)
    dose = opts("dose", [0.25, 0.5, 1, 2, 2.5, 3, 4, 5, 10], "mg", 0.25)
    freq_btns = "".join(
        f'<button type="button" class="opt{" is-active" if v == "1" else ""}" data-val="{v}">{label}</button>'
        for v, label in [("1", "daily"), ("2", "every other day"), ("7", "weekly"), ("30", "monthly")]
    )
    freq_units = "".join(
        f'<button type="button" class="opt{" is-active" if u == "days" else ""}" data-val="{u}">{u}</button>' for u in ["days", "weeks", "months"]
    )
    syr = opts("syringe", [0.3, 0.5, 1, 2], "ml", 1, custom=False, unit_small=lambda v: f"{int(v * 100)}u")
    supply = "".join(
        f'<button type="button" class="opt{" is-active" if u == "days" else ""}" data-val="{u}">{u}</button>' for u in ["days", "weeks", "months", "years"]
    )
    planu = "".join(
        f'<button type="button" class="opt{" is-active" if u == "months" else ""}" data-val="{u}">{u}</button>' for u in ["weeks", "months", "years"]
    )

    def step(n, title, inner, group=None, echo=None, extra=""):
        g = f' data-group="{group}"' if group else ""
        e = f'<b class="step__e" data-echo="{echo}"></b>' if echo else ""
        return (f'<fieldset class="step"{g}><legend><span class="step__n">{n}</span><span class="step__t">{title}</span>{e}</legend>'
                f'<div class="opts"{extra}>{inner}</div></fieldset>')

    body = f'''
<section class="phead phead--tight">
  <div class="wrap phead__grid">
    <div>
      <p class="label label--dot kicker" data-reveal>tools</p>
      <h1 class="phead__title" data-reveal style="--d:1">dosage calculator.</h1>
    </div>
    <div data-reveal style="--d:2">
      <p class="phead__sub">set the vial, the water and the dose; read the draw, how long a vial lasts and how many you need. to schedule your doses and keep track of each vial, use the dose planner.</p>
      <nav class="jump"><a href="#calc" class="pill is-on">{CALC} calculator</a><a href="planner" class="pill">{CALENDAR} dose planner {ARROW}</a></nav>
    </div>
  </div>
</section>
<div class="wrap" id="calc">
  <div class="calc" data-calc>
    <div class="calc__in">
      {step("01", "peptide in vial", vial, "vial", "vial")}
      {step("02", "bacteriostatic water", water, "water", "water")}
      {step("03", "dose per injection", dose, "dose", "dose")}
      <fieldset class="step"><legend><span class="step__n">04</span><span class="step__t">how often</span></legend><div class="opts" data-freq-presets>{freq_btns}<button type="button" class="opt" data-val="custom">custom</button></div>
        <div class="freq-custom" data-freq-custom hidden><span>every</span><input type="number" min="1" step="1" value="1" data-freq-n aria-label="interval amount"><div class="opts" data-freq-unit>{freq_units}</div></div></fieldset>
      {step("05", "syringe size", syr, "syringe", "syringe")}
    </div>
    <aside class="calc__out">
      <div class="readout">
        <p class="label">draw to</p>
        <div class="out__big"><b data-o="units">10</b><small>units</small></div>
        <div class="syr" data-syr>{v2.syringe_svg("calc")}</div>
        <dl class="rows">
          <div><dt>concentration</dt><dd><span data-o="conc">2.5</span> mg/ml</dd></div>
          <div><dt>volume</dt><dd><span data-o="vol">0.1</span> ml</dd></div>
        </dl>
        <p class="warn" data-warn hidden></p>
      </div>
      <div class="readout readout--sub" data-group="supplyUnit">
        <div class="readout__head"><p class="label">one vial lasts</p><div class="opts opts--sm">{supply}</div></div>
        <p class="readout__big"><b data-o="supply">20</b> <span data-o="supplyUnit">days</span></p>
        <p class="dim">about <b data-o="inj">20</b> <span data-o="freqlabel">injections, one a day</span>.</p>
      </div>
      <div class="readout readout--sub">
        <div class="readout__head"><p class="label">vials needed</p><div class="plan"><input type="number" min="1" step="1" value="3" data-plan aria-label="plan length"><div class="opts opts--sm" data-group="planUnit">{planu}</div></div></div>
        <p class="readout__big"><b data-o="vials">5</b> vials</p>
        <p class="dim">to cover <span data-o="planN">3</span> <span data-o="planU">months</span>.</p>
      </div>
    </aside>
  </div>
</div>
<section class="wrap plan-cta" id="planner" aria-label="dose planner">
  <a class="tool tool--plan plan-cta__card" href="planner" data-reveal>
    <div class="plan-cta__copy">
      <span class="label">{CALENDAR} dose planner</span>
      <h2>now plan your doses.</h2>
      <p>list the vials you're running, schedule doses on a calendar (daily, weekly or your own days), and see what's left in each vial and when it runs dry. sign in and your plan is saved to your account, on any device.</p>
      <span class="link">open the dose planner {ARROW}</span>
    </div>
    <div class="minical" aria-hidden="true">{minical_days()}</div>
  </a>
</section>
<div class="dock" data-dock aria-hidden="true">
  <div class="dock__row"><span>draw to</span><span class="dock__val"><b data-o="dock">10</b>units</span></div>
</div>'''
    return shell(title="dosage calculator", desc="peptide reconstitution and dosage calculator: draw-to units, how long a vial lasts and how many you need.", page="calculator", body=body,
                 groups=groups, scripts=("v2-calc.js",), body_class="calc-page")


# ------------------------------------------------------------- planner ---

def page_planner(groups):
    """The dose planner on a page of its own: the planner the admin's Calendar uses (planner_app(), styled by
    assets/css/planner.css), run by v2-planner.js. Signed out, the plan is kept in this browser; signed in,
    in the account (/api/account, the admin's 0035_shop_plans.sql), on any device. [data-pl-sync] says which.
    Signed in, [data-pl-privacy] says hlix can see it (to keep track of their schedule and refills) and holds
    the "keep my plan private" switch (the admin's 0038_plan_private.sql)."""
    how = "".join(
        f'<li><b>{n}</b><span>{t}</span></li>'
        for n, t in [("1", "add a vial for each peptide you're running: its name and size."),
                     ("2", "tap a day to log a dose, and repeat it daily, weekly or on your own days."),
                     ("3", "see what's left in each vial, day by day, and when it runs dry.")]
    )
    body = f'''
<section class="phead phead--tight">
  <div class="wrap phead__grid">
    <div>
      <p class="label label--dot kicker" data-reveal>tools</p>
      <h1 class="phead__title" data-reveal style="--d:1">dose planner.</h1>
    </div>
    <div data-reveal style="--d:2">
      <p class="phead__sub">your vials and your dose schedule on one calendar, with what's left in each vial and when to reorder.</p>
      <p class="plansync" data-pl-sync data-state="local" role="status" aria-live="polite">
        <span data-when="local">{PIN}<span>saved in this browser. <a href="account">sign in</a> to keep your plan in your account, on any device.</span></span>
        <span data-when="loading">{USER}<span>loading your saved plan…</span></span>
        <span data-when="saving">{USER}<span>saving to your account…</span></span>
        <span data-when="account">{USER}<span>saved to your account.</span></span>
        <span data-when="offline">{USER}<span>couldn't reach your account. your changes are kept in this browser and saved when it's back.</span></span>
      </p>
      <div class="planpriv" data-pl-privacy data-private="0" hidden>
        <p class="planpriv__msg">
          <span data-when="shared">{EYE}<span>we can see your saved plan, so we can keep track of your schedule and your refills.</span></span>
          <span data-when="private">{LOCK}<span>your plan is private. only you can see it.</span></span>
        </p>
        <label class="check planpriv__sw"><input type="checkbox" data-pl-private><span>keep my plan private</span></label>
        <p class="planpriv__err" data-pl-private-err role="alert" hidden>couldn't change that. try again in a moment.</p>
      </div>
    </div>
  </div>
  <div class="wrap"><ol class="planhow" data-reveal style="--d:3">{how}</ol></div>
</section>
<div class="wrap planpage">
  {v2.planner_app(embed=False)}
  <p class="planpage__calc">reconstituting a vial? <a href="calculator">{CALC} the dosage calculator</a> works out how much water and how many units to draw.</p>
</div>'''
    return shell(title="dose planner", desc="plan your peptide doses: your vials on a calendar, what's left in each and when it runs out. saved to your account.", page="planner", body=body,
                 groups=groups, scripts=("v2-planner.js",), body_class="planner-page", css=("planner.css",))


# ------------------------------------------------------------- checkout ---

def page_checkout(groups):
    body = f'''
<section class="phead phead--tight">
  <div class="wrap phead__grid">
    <div>
      <p class="label label--dot" data-reveal>checkout</p>
      <h1 class="phead__title" data-reveal style="--d:1">review &amp; request.</h1>
    </div>
    <p class="phead__sub" data-reveal style="--d:2">no payment happens here. send your order request and we'll follow up by email with next steps.</p>
  </div>
</section>
<div class="wrap">
  <div class="checkout" data-checkout>
    <form class="checkout__form" data-checkout-form>
      <p class="acctnote" data-checkout-acct-out>{USER}<span>have an account? <a href="account?next=checkout">sign in</a> to save your address and follow this order, or just order as a guest.</span></p>
      <p class="acctnote" data-checkout-acct-in hidden>{USER}<span>signed in as <b data-checkout-acct-email></b>. this order will show in <a href="account">your account</a>.</span></p>
      <fieldset class="cstep"><legend><span>01</span>contact</legend>
        <div class="fields2">
          <label class="field"><span>full name</span><input name="name" type="text" required autocomplete="name" maxlength="120"></label>
          <label class="field"><span>email</span><input name="email" type="email" required autocomplete="email" maxlength="254"></label>
        </div>
        <label class="field"><span>phone (optional)</span><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
      </fieldset>
      <fieldset class="cstep"><legend><span>02</span>shipping address</legend>
        <label class="field"><span>address line 1</span><input name="address1" type="text" required autocomplete="address-line1" maxlength="200"></label>
        <label class="field"><span>address line 2 (optional)</span><input name="address2" type="text" autocomplete="address-line2" maxlength="200"></label>
        <div class="fields2">
          <label class="field"><span>city</span><input name="city" type="text" required autocomplete="address-level2" maxlength="120"></label>
          <label class="field"><span>state / region</span><input name="state" type="text" required autocomplete="address-level1" maxlength="120"></label>
        </div>
        <div class="fields2">
          <label class="field"><span>zip / postal code</span><input name="zip" type="text" required autocomplete="postal-code" maxlength="40"></label>
          <label class="field"><span>country</span><input name="country" type="text" required autocomplete="country-name" value="United States" maxlength="120"></label>
        </div>
        <label class="check" data-checkout-save hidden><input type="checkbox" name="save" checked><span>save this address to my account</span></label>
      </fieldset>
      <fieldset class="cstep"><legend><span>03</span>notes <small>optional</small></legend>
        <label class="field"><span>anything we should know?</span><textarea name="notes" rows="3" maxlength="2000"></textarea></label>
      </fieldset>
      <div class="checkout__submit">
        <button class="btn btn--solid btn--lg" type="submit" data-checkout-submit>submit order request {ARROW}</button>
        <p class="status" data-checkout-status hidden></p>
        <p class="fine">submitting sends your request and cart to hlix. no payment method is collected or charged on this page. for laboratory research use only.</p>
      </div>
    </form>
    <aside class="summary">
      <div class="summary__in">
        <div class="summary__head"><h2>your order</h2><button type="button" class="link" data-cart-open>edit</button></div>
        <div class="summary__list" data-checkout-list></div>
        <div class="summary__row"><span>subtotal</span><b data-checkout-subtotal>$0</b></div>
        <p class="fine">shipping and payment are arranged by email once we've confirmed your request.</p>
      </div>
    </aside>
  </div>
  <div class="checkout__empty" data-checkout-empty hidden>
    <p class="empty__t">your cart is empty.</p>
    <a class="btn btn--solid" href="catalog">browse the catalog {ARROW}</a>
  </div>
  <div class="checkout__done" data-checkout-done hidden>
    <span class="done__icon">{CHECK}</span>
    <h2>request received.</h2>
    <p>your order request is in<span data-checkout-done-ref hidden></span>. we'll reply by email at <b data-checkout-done-email></b> with next steps, usually within 1–2 business days.</p>
    <a class="btn btn--solid" href="account" data-checkout-done-acct hidden>see it in your account {ARROW}</a>
    <a class="btn btn--solid" href="catalog" data-checkout-done-cat>back to the catalog {ARROW}</a>
  </div>
</div>'''
    return shell(title="checkout", desc="review your cart and submit an order request.", page="checkout", body=body, groups=groups,
                 scripts=("v3-checkout.js",), body_class="checkout-page")


# -------------------------------------------------------------- account ---

def page_account(groups):
    """Sign in or make an account, then: your orders, saved shipping details, password. Run by the
    shared assets/js/v2-account.js (its data-acct-* hooks) against /api/account, through
    window.HLIXAccount (v3-cart.js); the session is in cookies no script can read."""
    status = '<p class="status" data-acct-status hidden role="status" aria-live="polite"></p>'
    perks = "".join(
        f'<li>{icon}<span><b>{t}</b>{d}</span></li>'
        for icon, t, d in [
            (CART, "your cart, everywhere", "saved to your account, on every device you sign in on."),
            (PIN, "your address, saved", "checkout fills it in for you."),
            (DOC, "your orders, in one place", "what you asked for, where it stands, and tracking once it ships."),
            (CALENDAR, "your dose plan, saved", "your vials and dose schedule on the planner, on any device."),
        ]
    )
    body = f'''
<section class="phead phead--tight">
  <div class="wrap phead__grid">
    <div>
      <p class="label label--dot" data-reveal>account</p>
      <h1 class="phead__title" data-reveal style="--d:1">your account.</h1>
    </div>
    <p class="phead__sub" data-reveal style="--d:2">keep your cart on every device, save your shipping address and follow your orders.</p>
  </div>
</section>
<div class="wrap acct" data-acct>
  <p class="acct__loading" data-acct-loading>loading…</p>

  <div class="acct__out" data-acct-out hidden>
    <div class="form-card acct__card">
      <div class="acct__tabs" role="tablist" aria-label="sign in or make an account">
        <button type="button" role="tab" id="tab-signin" aria-controls="form-signin" aria-selected="true" data-acct-tab="signin">sign in</button>
        <button type="button" role="tab" id="tab-signup" aria-controls="form-signup" aria-selected="false" tabindex="-1" data-acct-tab="signup">create account</button>
      </div>
      <form class="acct__form" id="form-signin" role="tabpanel" aria-labelledby="tab-signin" data-acct-form="signin">
        <label class="field"><span>email</span><input name="email" type="email" required autocomplete="username" maxlength="254" spellcheck="false"></label>
        <label class="field"><span>password</span><input name="password" type="password" required autocomplete="current-password" maxlength="200"></label>
        <div class="acct__actions"><button class="btn btn--solid" type="submit">sign in {ARROW}</button><button type="button" class="acct__link" data-acct-go="forgot">forgot your password?</button></div>
        {status}
      </form>
      <form class="acct__form" id="form-signup" role="tabpanel" aria-labelledby="tab-signup" data-acct-form="signup" hidden>
        <label class="field"><span>name</span><input name="name" type="text" autocomplete="name" maxlength="120"></label>
        <label class="field"><span>email</span><input name="email" type="email" required autocomplete="username" maxlength="254" spellcheck="false"></label>
        <label class="field"><span>password (at least 10 characters)</span><input name="password" type="password" required minlength="10" maxlength="72" autocomplete="new-password"></label>
        <div class="acct__actions"><button class="btn btn--solid" type="submit">create account {ARROW}</button></div>
        {status}
        <p class="fine">your password is stored scrambled (hashed): nobody at hlix can see it. we use your email only for your orders.</p>
      </form>
      <form class="acct__form" data-acct-form="forgot" hidden>
        <p class="dim">enter your email and we'll send you a link to set a new password.</p>
        <label class="field"><span>email</span><input name="email" type="email" required autocomplete="username" maxlength="254" spellcheck="false"></label>
        <div class="acct__actions"><button class="btn btn--solid" type="submit">send the link {ARROW}</button><button type="button" class="acct__link" data-acct-go="signin">back to sign in</button></div>
        {status}
      </form>
    </div>
    <ul class="acct__perks">{perks}</ul>
  </div>

  <div class="acct__in" data-acct-in hidden>
    <div class="acct__who">
      <p>{USER}<span>signed in as <b data-acct-email></b></span><span class="acct__tier" data-acct-tier hidden>family &amp; friends pricing</span></p>
      <button class="btn btn--ghost btn--sm" type="button" data-acct-signout>sign out</button>
    </div>
    <form class="form-card acct__form acct__reset" data-acct-form="reset" hidden>
      <h2>set a new password</h2>
      <label class="field"><span>new password (at least 10 characters)</span><input name="password" type="password" required minlength="10" maxlength="72" autocomplete="new-password"></label>
      <div class="acct__actions"><button class="btn btn--solid" type="submit">save password {ARROW}</button></div>
      {status}
    </form>
    <div class="acct__grid">
      <section class="acct__orders" aria-labelledby="acct-orders-h">
        <h2 class="acct__h" id="acct-orders-h">your orders</h2>
        <div data-acct-orders></div>
        <div class="acct__empty" data-acct-orders-empty hidden><p>no orders yet.</p><a class="btn btn--ghost btn--sm" href="catalog">browse the catalog {ARROW}</a></div>
      </section>
      <div class="acct__side">
        <a class="form-card acct__plan" href="planner">
          <h2>{CALENDAR}dose planner</h2>
          <p>your vials and dose schedule, saved to your account. we can see it to keep track of your refills, or you can keep it private.</p>
          <span class="link">open your plan {ARROW}</span>
        </a>
        <form class="form-card acct__form" data-acct-form="profile">
          <h2>shipping details</h2>
          <div class="fields2">
            <label class="field"><span>full name</span><input name="name" type="text" autocomplete="name" maxlength="120"></label>
            <label class="field"><span>phone</span><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
          </div>
          <label class="field"><span>address line 1</span><input name="address1" type="text" autocomplete="address-line1" maxlength="200"></label>
          <label class="field"><span>address line 2</span><input name="address2" type="text" autocomplete="address-line2" maxlength="200"></label>
          <div class="fields2">
            <label class="field"><span>city</span><input name="city" type="text" autocomplete="address-level2" maxlength="120"></label>
            <label class="field"><span>state / region</span><input name="state" type="text" autocomplete="address-level1" maxlength="120"></label>
          </div>
          <div class="fields2">
            <label class="field"><span>zip / postal code</span><input name="zip" type="text" autocomplete="postal-code" maxlength="40"></label>
            <label class="field"><span>country</span><input name="country" type="text" autocomplete="country-name" maxlength="120"></label>
          </div>
          <div class="acct__actions"><button class="btn btn--solid btn--sm" type="submit">save details</button></div>
          {status}
        </form>
        <form class="form-card acct__form" data-acct-form="password">
          <h2>change password</h2>
          <p class="acct__temp" data-acct-temp hidden>you're signed in with a temporary password from hlix. choose your own here: enter the temporary one as your current password.</p>
          <label class="field"><span>current password</span><input name="current" type="password" required autocomplete="current-password" maxlength="200"></label>
          <label class="field"><span>new password (at least 10 characters)</span><input name="password" type="password" required minlength="10" maxlength="72" autocomplete="new-password"></label>
          <div class="acct__actions"><button class="btn btn--ghost btn--sm" type="submit">change password</button></div>
          {status}
        </form>
        <p><button type="button" class="acct__link" data-acct-signout-all>sign out on every device</button></p>
        <details class="acct__del" data-acct-del>
          <summary>delete my account</summary>
          <form class="form-card acct__form" data-acct-form="delete">
            <h2>delete my account</h2>
            <p>this deletes your hlix account for good: your sign-in, saved shipping details and cart, and you're signed out everywhere. orders you've already placed stay with hlix for our records. you can always make a new account later.</p>
            <label class="field"><span>your password, to confirm</span><input name="password" type="password" required autocomplete="current-password" maxlength="200"></label>
            <div class="acct__actions"><button class="btn btn--danger btn--sm" type="submit">delete my account</button></div>
            {status}
          </form>
        </details>
      </div>
    </div>
  </div>
</div>'''
    return shell(title="account", desc="sign in to your hlix account: your orders, cart and shipping details.", page="account", body=body, groups=groups,
                 scripts=("v2-account.js",), body_class="account-page", noindex=True)


# ----------------------------------------------------------------- main ---

def main():
    products = b.load_products()
    groups = b.group_products(products)

    # only the generated product pages are cleared, never OUT itself (OUT may be the repo root one day)
    if (OUT / "peptides").exists():
        shutil.rmtree(OUT / "peptides")
    (OUT / "peptides").mkdir(parents=True)

    (OUT / "index.html").write_text(page_home(groups))
    (OUT / "catalog.html").write_text(page_catalog(groups))
    (OUT / "about.html").write_text(page_about(groups))
    (OUT / "contact.html").write_text(page_contact(groups))
    (OUT / "calculator.html").write_text(page_calculator(groups))
    (OUT / "planner.html").write_text(page_planner(groups))
    (OUT / "checkout.html").write_text(page_checkout(groups))
    (OUT / "account.html").write_text(page_account(groups))
    for g in groups:
        (OUT / "peptides" / f"{g['slug']}.html").write_text(page_product(g, groups))
    print(f"v3: 7 pages + {len(groups)} product pages -> {'the repo root' if OUT == ROOT else OUT.relative_to(ROOT).as_posix() + '/'}")


if __name__ == "__main__":
    main()
