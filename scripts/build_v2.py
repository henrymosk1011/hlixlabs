#!/usr/bin/env python3
"""
Generates the v2 site into /v2 — a full redesign (minimal, bold, lowercase,
scroll-driven) that shares the catalog data, vial artwork, search index and
chat backend with the original site but none of its markup or styling.

    python3 scripts/build_v2.py

The original site is untouched apart from one unlabeled link in its footer.
"""
import shutil
import time
from pathlib import Path

import build as b
from vial_svg import render_vial, CATEGORY_COLORS

ROOT = b.ROOT
OUT = ROOT / "v2"
VER = str(int(time.time()))
CONTACT_EMAIL = b.CONTACT_EMAIL

ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
ARROW_UR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>'
SEARCH = b.icon("search")
SPARK = b.icon("sparkles")
CLOSE = b.icon("close")

esc = b.html_escape
money = b.money


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



VIALS = ROOT / "assets" / "img" / "vials"


def has_photo(v):
    return (VIALS / f"{v['sku'].lower()}.webp").exists()


def vial_media(v, uid, size, root, alt=None, eager=False):
    """Photoreal composited bottle when assets/img/vials/<sku>.webp exists, else the coded SVG.

    size 's' = 480x600 thumbnail, 'l' = 1280x1600. root = relative path to the site root.
    """
    if has_photo(v):
        sku = v["sku"].lower()
        f = f"{sku}-s.webp" if size == "s" else f"{sku}.webp"
        w, h = (480, 600) if size == "s" else (1280, 1600)
        alt = alt or f"{v['name']} {v['dose']} research vial"
        load = "" if eager else ' loading="lazy"'
        return (f'<img src="{root}assets/img/vials/{f}" data-base="{root}assets/img/vials/" alt="{esc(alt)}" '
                f'width="{w}" height="{h}" decoding="async"{load}>')
    return render_vial(v, gradient_id_suffix=uid)


# ---------------------------------------------------------------- shell ---

def nav(p, page):
    def a(href, label, key):
        cur = ' aria-current="page"' if key == page else ""
        return f'<a href="{p}{href}"{cur}>{label}</a>'

    links = a("about.html", "about", "about") + a("catalog.html", "catalog", "catalog") + a("calculator.html", "calculator", "calculator")
    return f'''<div class="progress" aria-hidden="true"><i></i></div>
<header class="nav" data-nav>
  <a class="nav__brand" href="{p}index.html" aria-label="hlix home">hlix<i></i></a>
  <nav class="nav__links" aria-label="primary">{links}</nav>
  <div class="nav__right">
    <button class="nav__search" data-search-open aria-label="search">{SEARCH}<span>search</span><kbd>/</kbd></button>
    <a class="btn btn--sm" href="{p}contact.html" data-magnetic>contact</a>
    <button class="nav__burger" data-menu-toggle aria-label="menu" aria-expanded="false"><i></i><i></i></button>
  </div>
</header>
<div class="menu">
  <nav class="menu__links">
    <a style="--i:0" href="{p}about.html"><span>01</span>about</a>
    <a style="--i:1" href="{p}catalog.html"><span>02</span>catalog</a>
    <a style="--i:2" href="{p}calculator.html"><span>03</span>calculator</a>
    <a style="--i:3" href="{p}contact.html"><span>04</span>contact</a>
  </nav>
  <div class="menu__foot"><button data-search-open class="link-arrow">search products {SEARCH}</button><span>{CONTACT_EMAIL}</span></div>
</div>
<div class="search" data-search role="dialog" aria-label="search">
  <button class="x" data-search-close aria-label="close search">{CLOSE}</button>
  <div class="search__in">
    <div class="search__field">{SEARCH}<input data-search-input type="text" placeholder="search peptides" autocomplete="off" spellcheck="false"></div>
    <div data-search-hint>
      <p class="search__hint">start typing — or try</p>
      <div class="search__try"><button data-try="glp1-s">glp1-s</button><button data-try="bpc">bpc 157</button><button data-try="dsip">dsip</button><button data-try="recovery">recovery</button><button data-try="growth">growth</button></div>
    </div>
    <div data-search-list></div>
  </div>
</div>'''


def footer(p, r, groups):
    cats = "".join(
        f'<a href="{p}catalog.html#{s}">{l}</a>' for s, l, _ in b.CATEGORY_ORDER if s != "supplies"
    )
    return f'''<footer class="foot">
  <div class="wrap foot__top">
    <div><p class="kicker">// hlix</p><p class="foot__lede">a personal research catalog. every peptide i keep on hand, logged with its dose, spec and price.</p></div>
    <div class="foot__col"><h4>catalog</h4>{cats}</div>
    <div class="foot__col"><h4>site</h4><a href="{p}about.html">about</a><a href="{p}calculator.html">calculator</a><a href="{p}contact.html">contact</a></div>
    <div class="foot__col"><h4>contact</h4><a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a><span>research use only</span></div>
  </div>
  <div class="foot__word" aria-hidden="true"><span data-parallax="-0.06">hlix</span></div>
  <div class="wrap foot__legal">
    <p>© 2026 hlix. for laboratory research use only. not for human or animal consumption. nothing on this site is medical advice, and nothing here is an offer to sell a controlled or prescription substance.</p>
    <a class="foot__orig" href="{r}index.html">original site ↗</a>
  </div>
</footer>'''


def shell(*, title, desc, page, body, depth=0, groups=(), scripts=(), body_class=""):
    p = "../" * depth          # v2 root (assets + pages)
    r = "../" * (depth + 1)    # site root (search index, original site)
    js = "".join(f'<script src="{p}assets/js/{s}?v={VER}" defer></script>' for s in scripts)
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#050607">
<title>{title} · hlix</title>
<meta name="description" content="{esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{p}assets/css/v2.css?v={VER}">
<script>(function(){{var h=document.documentElement;h.classList.add("js");if(/[?&]motion=off/.test(location.search)||(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches))h.classList.add("no-motion");window.HLIX2={{base:"{p}",root:"{r}"}};}})();</script>
</head>
<body class="{body_class}" data-page="{page}">
{nav(p, page)}
<main>
{body}
</main>
{footer(p, r, groups)}
<div class="lb" data-lb aria-hidden="true"><button class="x" aria-label="close">{CLOSE}</button><div class="lb__in"></div></div>
<script src="{r}assets/js/search-index.js?v={VER}"></script>
<script src="{p}assets/js/v2.js?v={VER}"></script>
{js}
<script src="{p}assets/js/v2-chat.js?v={VER}"></script>
</body>
</html>'''


# ---------------------------------------------------------------- cards ---

def card(g, p, uid_prefix="c"):
    d = g["default"]
    svg = vial_media(d, f"{uid_prefix}-{g['slug']}", "s", p + "../")
    multi = len(g["variants"]) > 1
    price = f"from {money(g['min_price'])}" if multi else money(d["price"])
    meta = f"{g['category_label']} · {len(g['variants'])} sizes" if multi else f"{g['category_label']} · {d['dose']}"
    color = CATEGORY_COLORS.get(g["category"], "#33e6b0")
    return f'''<a class="pcard" href="{p}peptides/{g['slug']}.html" data-cat="{g['category']}" data-name="{esc(g['name'].lower())}" style="--c:{color}" data-reveal>
  <div class="pcard__stage">{svg}</div>
  <div class="pcard__row"><h3>{esc(g['name'])}</h3><span class="pcard__price">{price}</span></div>
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
        lcards += f'''<a class="lcard" href="peptides/{g['slug']}.html" style="--c:{color}">
      <div class="lcard__stage">{svg}</div>
      <div class="lcard__meta"><span class="lcard__n">{i + 1:02d}</span><h3>{esc(g['name'])}</h3><span>{price}</span></div>
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
        crows += f'''<a class="crow" href="catalog.html#{slug}" style="--c:{CATEGORY_COLORS[slug]};--d:{i}" data-reveal>
      <span class="crow__n">{i + 1:02d}</span><span class="crow__t">{esc(label)}</span><span class="crow__c">{n} compounds</span><span class="crow__a">{ARROW}</span>
    </a>'''

    # sample conversation built from real catalog data so the mock never lies
    sample = by_name.get("DSIP") or next(g for g in groups if len(g["variants"]) > 2)
    parts = [f"{v['dose']} ({money(v['price'])})" for v in sample["variants"]]
    answer = f"{sample['name'].lower()} comes in {len(parts)} sizes — " + ", ".join(parts[:-1]) + f" and {parts[-1]}, priced per vial."
    question = f"what sizes does {sample['name'].lower()} come in?"

    total = len(groups)
    variants = sum(len(g["variants"]) for g in groups)
    cats = len({g["category"] for g in groups if g["category"] != "supplies"})

    body = f'''
<section class="hero" data-hero>
  <div class="hero__bg"><span class="blob blob--a"></span><span class="blob blob--b"></span></div>
  <div class="hero__vials" aria-hidden="true">{hero_vials}</div>
  <div class="wrap">
    <p class="hero__label" data-reveal="fade">personal research catalog</p>
    <h1 class="hero__title" data-split><span>research-grade.</span><br><span class="ol">cataloged.</span><br><span class="ac">clearly priced.</span></h1>
    <div class="hero__bar" data-reveal style="--d:6">
      <p class="hero__sub">every research peptide i'm running — dose, spec and price in one place.</p>
      <div class="hero__cta"><a class="btn btn--solid" href="catalog.html" data-magnetic>explore the catalog {ARROW}</a><a class="btn" href="calculator.html" data-magnetic>open calculator</a></div>
    </div>
  </div>
  <div class="cue" aria-hidden="true">scroll</div>
</section>

{marq1}{marq2}

<section class="statement">
  <div class="wrap"><p data-scrub>every peptide i run, logged with its <span class="hl">dose</span>, its <span class="hl">spec</span> and its <span class="hl">price</span>. no guessing what's on hand. no guessing what it cost.</p></div>
</section>

<div class="wrap"><div class="stats">
  <div class="stat" data-reveal><div class="stat__n"><span data-count="{total}">{total}</span></div><p class="stat__l">compounds logged</p></div>
  <div class="stat" data-reveal style="--d:1"><div class="stat__n"><span data-count="{variants}">{variants}</span></div><p class="stat__l">vial sizes</p></div>
  <div class="stat" data-reveal style="--d:2"><div class="stat__n"><span data-count="{cats}">{cats}</span></div><p class="stat__l">research categories</p></div>
</div></div>

<section class="lineup" id="lineup" data-hscroll>
  <div class="lineup__pin">
    <div class="wrap lineup__head"><h2 class="lineup__title" data-split>the lineup.</h2><span class="lineup__count" data-reveal="fade">{len(featured):02d} of {total} — keep scrolling</span></div>
    <div class="lineup__track" data-htrack>{lcards}
      <a class="lcard" href="catalog.html"><div class="lcard__stage" style="--c:#33e6b0"><span class="btn btn--solid">view all {total} {ARROW}</span></div><div class="lcard__meta"><h3>the full catalog</h3></div></a>
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
      <p class="ai__copy" data-reveal>it knows the whole catalog — every compound, size and price — plus general research background on peptides.</p>
      <button class="btn btn--solid" data-open-chat data-reveal data-magnetic>{SPARK} open the assistant</button>
    </div>
    <div class="mock" data-typing data-reveal="scale">
      <div class="mock__bar">{SPARK} hlix ai</div>
      <div class="bub bub--u">{esc(question)}</div>
      <div class="bub bub--a">{esc(answer)}</div>
    </div>
  </div>
</section>

<section class="sec calcband" id="calc">
  <div class="wrap">
    <p class="kicker" data-reveal="fade">// dosage calculator</p>
    <h2 class="calcband__title" data-split>know your draw.</h2>
    <div class="syr no-tr" data-syr data-syringe-scrub style="--fill:.1">{syringe_svg("tease")}</div>
    <p data-reveal>concentration, draw-to units, syringe capacity and how many vials you'll need — instantly, right in your browser.</p>
    <a class="btn btn--solid" href="calculator.html" data-reveal data-magnetic>open the calculator {ARROW}</a>
  </div>
</section>'''
    return shell(title="hlix — research-grade, cataloged", desc=b.BASE_DESCRIPTION, page="home", body=body, groups=groups)


# -------------------------------------------------------------- catalog ---

def page_catalog(groups):
    cats = [(s, l) for s, l, _ in b.CATEGORY_ORDER if any(g["category"] == s for g in groups)]
    tabs = f'<button class="is-active" data-filter="all">all<sup>{len(groups)}</sup></button>' + "".join(
        f'<button data-filter="{s}">{esc(l)}<sup>{sum(1 for g in groups if g["category"] == s)}</sup></button>' for s, l in cats
    )
    cards = "".join(card(g, "", "cat") for g in groups)
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
  <div class="pgrid">{cards}</div>
  <p class="empty" data-empty>nothing matches that — try another name or category.</p>
</div>'''
    return shell(title="catalog", desc="the complete hlix research peptide catalog.", page="catalog", body=body, groups=groups)


# -------------------------------------------------------------- product ---

def page_product(g, groups):
    d = g["default"]
    svg = vial_media(d, f"pdp-{g['slug']}", "l", "../../", eager=True)
    variants = g["variants"]
    multi = len(variants) > 1
    color = CATEGORY_COLORS.get(g["category"], "#33e6b0")
    seg = ""
    if multi:
        btns = "".join(
            f'<button role="radio" aria-checked="{"true" if v is d else "false"}" class="{"is-active" if v is d else ""}" data-variant '
            f'data-dose="{esc(v["dose"])}" data-price="{v["price"]:.0f}" data-sku="{esc(v["sku"])}" data-img="{v["sku"].lower()}">{esc(v["dose"])}</button>'
            for v in variants
        )
        seg = f'<span class="field-l">vial size</span><div class="seg" data-seg role="radiogroup" aria-label="vial size"><span class="seg__thumb"></span>{btns}</div>'
    related = [x for x in groups if x["category"] == g["category"] and x["slug"] != g["slug"]][:4]
    rel = ""
    if related:
        rel = f'''<section class="related"><div class="wrap">
  <div class="sec__head"><h2 class="sec__title" data-split>more in {esc(g['category_label'].lower())}.</h2></div>
  <div class="pgrid">{"".join(card(x, "../", "rel") for x in related)}</div></div></section>'''
    body = f'''
<div class="pdp" style="--c:{color}">
  <div class="wrap">
    <nav class="crumbs" aria-label="breadcrumb"><a href="../index.html">home</a> / <a href="../catalog.html">catalog</a> / <a href="../catalog.html#{g['category']}">{esc(g['category_label'])}</a> / <span>{esc(g['name'])}</span></nav>
    <div class="pdp__grid">
      <div class="pdp__media" data-reveal="scale"><div class="stage" data-zoom data-tilt>{svg}<span class="stage__hint">click to enlarge</span></div></div>
      <div class="pdp__info">
        <p class="kicker" style="color:var(--c)" data-reveal="fade">// {esc(g['category_label'].lower())}</p>
        <h1 class="pdp__name" data-split>{esc(g['name'])}</h1>
        <div class="price" data-reveal><span class="price__n" data-price="{d['price']:.0f}">{money(d['price'])}</span><span class="price__u">/ vial</span></div>
        <div data-reveal>{seg}</div>
        <p class="stock" data-reveal>in stock</p>
        <dl class="specs" data-reveal>
          <div><dt>category</dt><dd>{esc(g['category_label'])}</dd></div>
          <div><dt>dose per vial</dt><dd data-dose-out>{esc(d['dose'])}</dd></div>
          <div><dt>sku</dt><dd data-sku-out>{esc(d['sku'])}</dd></div>
          <div><dt>purity</dt><dd>≥99% · hplc verified</dd></div>
        </dl>
        <div class="ruo" data-reveal><b>research use only</b>for laboratory research use only. not intended for human or animal consumption, and not evaluated by the fda to diagnose, treat, cure or prevent any disease. nothing on this page is medical advice.</div>
        <div class="acc" data-acc data-reveal>
          <div class="acc__i is-open"><button class="acc__h" aria-expanded="true">overview<i></i></button><div class="acc__b"><div><p>{esc(g['name'])} — cataloged under {esc(g['category_label'].lower())}, available in {len(variants)} vial size{'s' if multi else ''}. logged at ≥99% purity per the standard applied across this catalog.</p></div></div></div>
          <div class="acc__i"><button class="acc__h" aria-expanded="false">research use only<i></i></button><div class="acc__b"><div><p>this entry is for research and record-keeping purposes only. it is not intended for human consumption, clinical use, or as a drug, food, cosmetic or medical device, and has not been evaluated by the fda.</p></div></div></div>
          <div class="acc__i"><button class="acc__h" aria-expanded="false">certificate of analysis<i></i></button><div class="acc__b"><div><p>a certificate of analysis is kept on file for this compound and available on request via the <a href="../contact.html" style="color:var(--accent)">contact page</a>.</p></div></div></div>
        </div>
      </div>
    </div>
  </div>
  {rel}
</div>'''
    return shell(title=g["name"], desc=f"{g['name']} — {g['category_label']} research compound.", page="catalog", body=body, depth=1, groups=groups)


# ---------------------------------------------------------------- about ---

def page_about(groups):
    rows = [
        ("01", "precision", "every entry gets a real dose, a real price and a real category — no vague listings."),
        ("02", "transparency", "pricing is always shown per single vial, straight off the sourced pack rate."),
        ("03", "rigor", "≥99% purity is the floor for anything that makes it into the catalog, not the ceiling."),
    ]
    prin = "".join(f'<div class="prin__r" data-reveal><span class="prin__n">{n}</span><h3>{t}</h3><p>{d}</p></div>' for n, t, d in rows)
    body = f'''
<section class="phead"><div class="wrap">
  <p class="kicker" data-reveal="fade">// about</p>
  <h1 class="phead__title" data-split>a catalog, built like it matters.</h1>
</div></section>
<section class="statement statement--wide" style="padding-top:0"><div class="wrap"><p data-scrub>hlix started as a spreadsheet and outgrew it. this is where every research peptide gets logged, priced, and organized in one clean, searchable place.</p></div></section>
<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="split2">
    <h2 data-split>how pricing works.</h2>
    <p data-reveal>everything is priced as a single vial at the rate the full pack was sourced for. if a 10-vial pack costs $50, that's the number listed against 1 vial here — no markup, no math required.</p>
  </div>
</div></section>
<section class="sec" style="padding-top:0"><div class="wrap">
  <div class="sec__head"><h2 class="sec__title" data-split>the standard.</h2></div>
  <div class="prin">{prin}</div>
</div></section>
<section class="sec calcband"><div class="wrap">
  <h2 class="calcband__title" data-split>see the catalog.</h2>
  <a class="btn btn--solid" href="catalog.html" data-reveal data-magnetic>explore {len(groups)} compounds {ARROW}</a>
</div></section>'''
    return shell(title="about", desc="about hlix — a personal research peptide catalog.", page="about", body=body, groups=groups)


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
    <form class="cform" action="mailto:{CONTACT_EMAIL}" method="post" enctype="text/plain" data-reveal>
      <label><span>name</span><input name="name" type="text" required autocomplete="name"></label>
      <label><span>email</span><input name="email" type="email" required autocomplete="email"></label>
      <label><span>message</span><textarea name="message" rows="4" required></textarea></label>
      <div><button class="btn btn--solid" type="submit" data-magnetic>send message {ARROW}</button></div>
      <small>submitting opens your email client addressed to {CONTACT_EMAIL} — nothing is sent from this page directly.</small>
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


def page_calculator(groups):
    vial = opts("vial", [2, 5, 10, 15, 20, 30], "mg", 5)
    water = opts("water", [0.5, 1, 2, 2.5, 3, 5], "ml", 2)
    dose = opts("dose", [0.1, 0.25, 0.5, 1, 2, 2.5, 5, 10], "mg", 0.25)
    freq = '<button type="button" class="opt is-active" data-val="daily">daily</button><button type="button" class="opt" data-val="weekly">weekly</button>'
    syr = opts("syringe", [0.3, 0.5, 1, 1.5, 2], "ml", 1, custom=False, unit_small=lambda v: f"{int(v * 100)}u")
    supply = "".join(
        f'<button type="button" class="opt{" is-active" if u == "days" else ""}" data-val="{u}">{u}</button>' for u in ["days", "weeks", "months", "years"]
    )
    planu = "".join(
        f'<button type="button" class="opt{" is-active" if u == "months" else ""}" data-val="{u}">{u}</button>' for u in ["weeks", "months", "years"]
    )
    body = f'''
<section class="phead"><div class="wrap">
  <p class="kicker" data-reveal="fade">// dosage calculator</p>
  <h1 class="phead__title" data-split>know your draw.</h1>
  <p class="phead__sub" data-reveal>edit any number — concentration, draw-to units, syringe capacity and vial supply all update instantly. everything runs in your browser; nothing is saved or sent anywhere.</p>
</div></section>
<div class="wrap">
  <div class="calc" data-calc>
    <div class="calc__in">
      <fieldset class="step" data-group="vial" data-reveal><legend><span class="step__n">01</span><span class="step__t">peptide in vial</span><b class="step__e" data-echo="vial">5 mg</b></legend><div class="opts">{vial}</div></fieldset>
      <fieldset class="step" data-group="water" data-reveal><legend><span class="step__n">02</span><span class="step__t">bacteriostatic water added</span><b class="step__e" data-echo="water">2 mL</b></legend><div class="opts">{water}</div></fieldset>
      <fieldset class="step" data-group="dose" data-reveal><legend><span class="step__n">03</span><span class="step__t">dose per injection</span><b class="step__e" data-echo="dose">0.25 mg</b></legend><div class="opts">{dose}</div></fieldset>
      <fieldset class="step" data-group="freq" data-reveal><legend><span class="step__n">04</span><span class="step__t">how often</span></legend><div class="opts">{freq}</div></fieldset>
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
      <div class="sub" data-group="supplyUnit">
        <h3>supply</h3>
        <div class="opts">{supply}</div>
        <p>this vial covers about <b data-o="inj">20</b> <span data-o="freqlabel">injections, one a day</span> — roughly <b><span data-o="supply">20</span> <span data-o="supplyUnit">days</span></b>.</p>
      </div>
      <div class="sub">
        <h3>plan for</h3>
        <div class="plan"><input type="number" min="1" step="1" value="3" data-plan aria-label="amount"><div class="opts" data-group="planUnit">{planu}</div></div>
        <p>you'll need about <b><span data-o="vials">5</span> vials</b> to cover <span data-o="planN">3</span> <span data-o="planU">months</span>.</p>
      </div>
    </aside>
  </div>
</div>
<div class="dock" aria-hidden="true"><span>draw to</span><span><b data-o="dock">10</b>units</span></div>'''
    return shell(title="dosage calculator", desc="peptide reconstitution and dosage calculator.", page="calculator", body=body, groups=groups, scripts=("v2-calc.js",), body_class="calc-page")


# ----------------------------------------------------------------- main ---

def main():
    products = b.load_products()
    groups = b.group_products(products)

    for d in (OUT / "peptides",):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)

    (OUT / "index.html").write_text(page_home(groups))
    (OUT / "catalog.html").write_text(page_catalog(groups))
    (OUT / "about.html").write_text(page_about(groups))
    (OUT / "contact.html").write_text(page_contact(groups))
    (OUT / "calculator.html").write_text(page_calculator(groups))
    for g in groups:
        (OUT / "peptides" / f"{g['slug']}.html").write_text(page_product(g, groups))
    print(f"v2: 5 core pages + {len(groups)} product pages -> {OUT}")


if __name__ == "__main__":
    main()
