#!/usr/bin/env python3
"""
Generates the entire static hlix site (index, catalog, one page per
peptide, about, contact, calculator) from data/products.json.

Run after parse_pricelist.py whenever the price list changes:
    python3 scripts/parse_pricelist.py
    python3 scripts/build.py
"""
import json
import shutil
from pathlib import Path

from vial_svg import render_vial, CATEGORY_COLORS

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "products.json"

SITE_NAME = "hlix"
SITE_DOMAIN = "hlix.io"
BASE_DESCRIPTION = "hlix is a personal research catalog for peptides — dosing, specs and pricing in one clean, searchable place."
CONTACT_EMAIL = "hello@hlix.io"

CATEGORY_ORDER = [
    ("metabolic", "Metabolic Research", "GLP-1 analogs, tirzepatide, retatrutide, semaglutide and metabolic research compounds."),
    ("growth", "Growth & GH Secretagogues", "GH secretagogues, IGF-1, HGH and growth-axis research peptides."),
    ("recovery", "Healing & Recovery", "BPC-157, TB-500, GHK-Cu and tissue-repair research compounds."),
    ("cognitive", "Cognitive & Neuro Health", "Selank, Semax, kisspeptin and nootropic research peptides."),
    ("longevity", "Longevity & Anti-Aging", "Epithalon, NAD+, SS-31 and longevity-focused research compounds."),
    ("hormonal", "Hormonal & Sexual Health", "PT-141, gonadorelin and hormonal-axis research peptides."),
    ("specialty", "Specialty Research", "Specialty and niche research compounds."),
    ("supplies", "Supplies", "Reconstitution water and other bench supplies."),
]
CATEGORY_LABELS = {slug: label for slug, label, _ in CATEGORY_ORDER}

ICONS = {
    "flask": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6M10 2v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8.5V2"/><path d="M7.5 14h9"/></svg>',
    "shield": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></svg>',
    "check": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    "doc": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6M9 9h1"/></svg>',
    "usa": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z"/></svg>',
    "arrow": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    "zoom": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></svg>',
    "close": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    "menu": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    "mail": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>',
    "clock": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    "pin": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    "calc": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h1M12 11h1M16 11h1M8 15h1M12 15h1M16 15h1M8 19h1M12 19h1M16 19h1"/></svg>',
}


def icon(name):
    return ICONS[name]


def money(v):
    return f"${v:,.0f}" if float(v).is_integer() else f"${v:,.2f}"


def load_products():
    return json.loads(DATA.read_text())


# ---------------------------------------------------------------- shell ----

def nav_html(prefix, active):
    def link(href, label, key):
        cls = " active" if key == active else ""
        return f'<a href="{prefix}{href}" class="{cls.strip()}">{label}</a>'

    links = "".join([
        link("catalog.html", "Catalog", "catalog"),
        link("calculator.html", "Dosage Calculator", "calculator"),
        link("about.html", "About", "about"),
        link("contact.html", "Contact", "contact"),
    ])
    mobile_links = "".join([
        link("catalog.html", "Catalog", "catalog"),
        link("calculator.html", "Dosage Calculator", "calculator"),
        link("about.html", "About", "about"),
        link("contact.html", "Contact", "contact"),
    ])
    return f'''<header class="site-header">
    <div class="ticker"><div class="ticker__track">{_ticker_items() * 2}</div></div>
    <div class="container nav">
      <a href="{prefix}index.html" class="brand"><span class="brand__mark">h</span>hlix</a>
      <nav class="nav__links">{links}</nav>
      <div class="nav__cta">
        <a href="{prefix}calculator.html" class="btn btn--ghost">{icon('calc')} Calculator</a>
        <a href="{prefix}catalog.html" class="btn btn--accent">View Catalog</a>
        <button class="nav__toggle" aria-label="Open menu" aria-expanded="false">{icon('menu')}</button>
      </div>
    </div>
    <div class="mobile-menu">{mobile_links}<a href="{prefix}calculator.html" class="btn btn--accent btn--block">Dosage Calculator</a></div>
  </header>'''


def _ticker_items():
    items = [
        ("check", "RESEARCH USE ONLY"),
        ("flask", "HPLC VERIFIED"),
        ("shield", "BATCH TESTED"),
        ("usa", "USA BASED"),
        ("check", "≥99% PURITY MINIMUM"),
    ]
    return "".join(f'<span class="ticker__item">{icon(n)}{t}</span>' for n, t in items)


def lightbox_html():
    return f'''<div class="lightbox" data-lightbox>
    <button class="lightbox__close" data-lightbox-close aria-label="Close">{icon('close')}</button>
    <div class="lightbox__inner" data-lightbox-inner></div>
  </div>'''


def footer_html(prefix):
    cat_links = "".join(
        f'<a href="{prefix}catalog.html#{slug}">{label}</a>' for slug, label, _ in CATEGORY_ORDER if slug != "supplies"
    )
    return f'''<footer class="site-footer">
    <div class="container">
      <div class="footer__grid">
        <div class="footer__brand">
          <a href="{prefix}index.html" class="brand"><span class="brand__mark">h</span>hlix</a>
          <p>A personal research catalog — every peptide I keep on hand, cataloged with dosing, specs and pricing in one place.</p>
        </div>
        <div class="footer__col">
          <h4>Catalog</h4>
          {cat_links}
        </div>
        <div class="footer__col">
          <h4>Site</h4>
          <a href="{prefix}about.html">About</a>
          <a href="{prefix}contact.html">Contact</a>
          <a href="{prefix}calculator.html">Dosage Calculator</a>
        </div>
        <div class="footer__col">
          <h4>Contact</h4>
          <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>
          <span>Research use only</span>
        </div>
      </div>
      <div class="footer__legal">
        <p class="footer__ruo">© 2026 hlix. For laboratory research use only. Not for human or animal consumption. Nothing on this site is medical advice, and nothing here is an offer to sell a controlled or prescription substance.</p>
        <p>Built with a personal catalog generator.</p>
      </div>
    </div>
  </footer>'''


def page_shell(*, title, description, prefix, active, body, extra_head=""):
    canonical_title = f"{title} · hlix" if title != SITE_NAME else title
    return f'''<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{canonical_title}</title>
<meta name="description" content="{description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{prefix}assets/css/style.css">
{extra_head}
</head>
<body>
{nav_html(prefix, active)}
{body}
{footer_html(prefix)}
{lightbox_html()}
<script src="{prefix}assets/js/main.js"></script>
</body>
</html>'''


# -------------------------------------------------------------- pieces -----

def render_card(p, prefix):
    svg = render_vial(p)
    return f'''<a class="card" href="{prefix}peptides/{p['slug']}.html" data-card-category="{p['category']}">
  <div class="card__media" style="--cat-color:{CATEGORY_COLORS.get(p['category'], '#33e6b0')}">
    <span class="card__badge">HPLC 99%+</span>
    <span class="card__stock">IN STOCK</span>
    {svg}
  </div>
  <div class="card__body">
    <span class="card__cat" style="--cat-color:{CATEGORY_COLORS.get(p['category'], '#33e6b0')}">{p['category_label']}</span>
    <h3 class="card__name">{p['name']}</h3>
    <span class="card__dose">{p['dose']}</span>
    <div class="card__foot">
      <span class="card__price">{money(p['price'])} <small>/ vial</small></span>
      <span class="card__arrow">{icon('arrow')}</span>
    </div>
  </div>
</a>'''


def trust_grid_html():
    items = [
        ("flask", "HPLC Verified", "Every compound is checked against HPLC reference data before it earns a spot in the catalog."),
        ("shield", "Batch Tested", "Batch-level testing is tracked per lot so potency and purity stay consistent vial to vial."),
        ("doc", "COA On File", "A certificate of analysis is kept on file for each compound and available on request."),
        ("usa", "USA Based", "Sourced and stored domestically — no cross-border customs surprises."),
    ]
    cards = "".join(
        f'<div class="trust-card">{icon(n)}<h3>{t}</h3><p>{d}</p></div>' for n, t, d in items
    )
    return f'<div class="trust-grid">{cards}</div>'


def ruo_notice():
    return '''<div class="notice"><strong>RESEARCH USE ONLY</strong>For laboratory research use only. Not intended for human or animal consumption, and not evaluated by the FDA to diagnose, treat, cure or prevent any disease. Nothing on this page is medical advice.</div>'''


# ---------------------------------------------------------------- home -----

def render_home(products):
    prefix = ""
    total = len(products)
    categories_used = sorted({p["category"] for p in products})

    hero_vial = render_vial({
        "name": "RESEARCH PEPTIDE",
        "dose": "hlix",
        "category": "metabolic",
        "sku": "HLX-000",
        "slug": "hero",
    }, gradient_id_suffix="hero")

    featured_slugs_seen = set()
    featured = []
    for slug, _, _ in CATEGORY_ORDER:
        if slug == "supplies":
            continue
        for p in products:
            if p["category"] == slug and p["name"] not in featured_slugs_seen:
                featured.append(p)
                featured_slugs_seen.add(p["name"])
                break
    featured = featured[:6]

    cat_cards = ""
    for slug, label, desc in CATEGORY_ORDER:
        if slug == "supplies":
            continue
        count = sum(1 for p in products if p["category"] == slug)
        color = CATEGORY_COLORS[slug]
        cat_cards += f'''<a class="cat-card" href="catalog.html#{slug}" style="--cat-color:{color}">
      <span class="cat-card__dot"></span>
      <h3>{label}</h3>
      <p>{desc}</p>
      <span class="count">{count} compounds cataloged</span>
      <div class="cat-card__link">Browse {icon('arrow')}</div>
    </a>'''

    body = f'''
  <section class="hero">
    <div class="container hero__grid">
      <div>
        <span class="eyebrow">PERSONAL RESEARCH CATALOG</span>
        <h1>RESEARCH-GRADE.<br>CATALOGED.<br><span class="accent-line">CLEARLY PRICED.</span></h1>
        <p class="lede">hlix is where I keep every research peptide I'm running — dose, spec and price in one place, so there's never any guessing what's on hand or what it cost.</p>
        <div class="hero__actions">
          <a href="catalog.html" class="btn btn--accent">View Full Catalog {icon('arrow')}</a>
          <a href="calculator.html" class="btn btn--ghost">{icon('calc')} Dosage Calculator</a>
        </div>
        <div class="hero__stats">
          <div><div class="stat__value">{total}</div><div class="stat__label">Compounds Logged</div></div>
          <div><div class="stat__value">{len(categories_used)}</div><div class="stat__label">Categories</div></div>
          <div><div class="stat__value">99%+</div><div class="stat__label">Purity Minimum</div></div>
          <div><div class="stat__value">RUO</div><div class="stat__label">Research Use Only</div></div>
        </div>
      </div>
      <div class="hero__art"><div class="hero__art-glow"></div>{hero_vial}</div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section__head">
        <div><span class="section__kicker">// FEATURED</span><h2>A cross-section of the catalog</h2></div>
        <a href="catalog.html" class="btn btn--ghost">View All {icon('arrow')}</a>
      </div>
      <div class="product-grid">
        {''.join(render_card(p, prefix) for p in featured)}
      </div>
    </div>
  </section>

  <section class="section section--alt">
    <div class="container">
      <div class="section__head">
        <div><span class="section__kicker">// CATEGORIES</span><h2>Browse by research category</h2></div>
      </div>
      <div class="cat-grid">{cat_cards}</div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section__head">
        <div><span class="section__kicker">// STANDARD</span><h2>The same bar, every time</h2><p>Every compound in this catalog is held to one standard before it's logged.</p></div>
      </div>
      {trust_grid_html()}
    </div>
  </section>

  <section class="section--tight">
    <div class="container">
      <div class="cta-band">
        <h2>Reconstituting a new vial?</h2>
        <p>Run the numbers with the built-in dosage calculator — concentration, draw volume, syringe units and vial supply, all in one place.</p>
        <a href="calculator.html" class="btn btn--accent">Open the Calculator {icon('arrow')}</a>
      </div>
    </div>
  </section>
'''
    return page_shell(
        title="hlix — Research-Grade Peptides, Cataloged",
        description=BASE_DESCRIPTION,
        prefix=prefix,
        active="home",
        body=body,
    )


# -------------------------------------------------------------- catalog ----

def render_catalog(products):
    prefix = ""
    chips = ['<button class="chip is-active" data-filter="all">All <span class="chip__count">' + str(len(products)) + '</span></button>']
    for slug, label, _ in CATEGORY_ORDER:
        count = sum(1 for p in products if p["category"] == slug)
        if count == 0:
            continue
        chips.append(f'<button class="chip" data-filter="{slug}">{label} <span class="chip__count">{count}</span></button>')

    cards = "".join(render_card(p, prefix) for p in products)

    body = f'''
  <section class="page-hero">
    <div class="container">
      <span class="eyebrow">THE CATALOG</span>
      <h1>Every compound, one list.</h1>
      <p>{len(products)} cataloged entries across {len({p['category'] for p in products})} categories. Priced as 1 vial at the sourced pack rate — filter by category or scroll the full list.</p>
    </div>
  </section>
  <section class="section">
    <div class="container">
      <div class="filters" data-filters>{''.join(chips)}</div>
      <div class="product-grid">{cards}</div>
      <p data-empty-state style="display:none; color:var(--text-faint); text-align:center; padding:60px 0;">No compounds in this category yet.</p>
    </div>
  </section>
'''
    return page_shell(
        title="Full Catalog",
        description="The complete hlix research peptide catalog, filterable by category.",
        prefix=prefix,
        active="catalog",
        body=body,
    )


# --------------------------------------------------------- product page ----

def render_product_page(p, products):
    prefix = "../"
    svg = render_vial(p)
    related = [x for x in products if x["category"] == p["category"] and x["slug"] != p["slug"]][:4]
    related_html = "".join(render_card(r, prefix) for r in related)
    related_section = f'''
  <section class="related">
    <div class="section__head">
      <div><span class="section__kicker">// RELATED</span><h2>More from {p['category_label']}</h2></div>
    </div>
    <div class="product-grid">{related_html}</div>
  </section>''' if related else ""

    body = f'''
  <div class="container">
    <nav class="breadcrumb">
      <a href="{prefix}index.html">Home</a> / <a href="{prefix}catalog.html">Catalog</a> / <a href="{prefix}catalog.html#{p['category']}">{p['category_label']}</a> / <span>{p['name']}</span>
    </nav>
    <div class="product-layout">
      <div class="product-media" data-zoom-trigger style="--cat-color:{CATEGORY_COLORS.get(p['category'], '#33e6b0')}">
        {svg}
        <span class="product-media__hint">{icon('zoom')} Click to enlarge</span>
      </div>
      <div class="product-info">
        <span class="product-info__purity">{icon('flask')} ≥99% Purity · HPLC Verified</span>
        <h1>{p['name']}</h1>
        <div class="product-info__dose">{p['dose']} · SKU {p['sku']}</div>
        <div class="product-info__price-row">
          <span class="product-info__price">{money(p['price'])}</span>
          <span class="product-info__price-note">per vial · {p['dose']}</span>
        </div>
        <div class="product-info__stock">In stock — ready in inventory</div>

        <div class="mini-trust">
          <div>{icon('flask')}HPLC Tested</div>
          <div>{icon('shield')}Batch Tested</div>
          <div>{icon('doc')}COA on File</div>
          <div>{icon('usa')}USA Based</div>
        </div>

        {ruo_notice()}

        <div class="tabs">
          <div class="tabs__nav">
            <button class="is-active" data-tab-target="overview">Overview</button>
            <button data-tab-target="ruo">RUO Disclaimer</button>
            <button data-tab-target="coa">Certificate of Analysis</button>
          </div>
          <div class="tabs__panel is-active" data-tab-panel="overview">
            <h3>Research Summary</h3>
            <p>{p['name']} — {p['dose']} vial, cataloged under {p['category_label'].lower()}. Logged at ≥99% purity per the standard applied across this catalog.</p>
            <table class="data-table">
              <tr><td>Category</td><td>{p['category_label']}</td></tr>
              <tr><td>Dose per vial</td><td>{p['dose']}</td></tr>
              <tr><td>Purity standard</td><td>≥99% (HPLC verified)</td></tr>
              <tr><td>SKU</td><td>{p['sku']}</td></tr>
              <tr><td>Research use only</td><td>Not for human consumption</td></tr>
            </table>
          </div>
          <div class="tabs__panel" data-tab-panel="ruo">
            <h3>Research Use Only</h3>
            <p>This entry is for research and record-keeping purposes only. It is not intended for human consumption, clinical use, or as a drug, food, cosmetic or medical device, and has not been evaluated by the FDA. Handling, storage and use are the sole responsibility of the researcher.</p>
          </div>
          <div class="tabs__panel" data-tab-panel="coa">
            <h3>Certificate of Analysis</h3>
            <p>A certificate of analysis is kept on file for this compound and available on request via the <a href="{prefix}contact.html" style="color:var(--accent)">contact page</a>.</p>
          </div>
        </div>
      </div>
    </div>
    {related_section}
  </div>
'''
    return page_shell(
        title=f"{p['name']} {p['dose']}",
        description=f"{p['name']} {p['dose']} — {p['category_label']} research compound, ≥99% purity, HPLC verified.",
        prefix=prefix,
        active="catalog",
        body=body,
    )


# --------------------------------------------------------------- about -----

def render_about():
    prefix = ""
    values = [
        ("Precision", "Every entry gets a real dose, a real price and a real category — no vague listings."),
        ("Transparency", "Pricing here is always shown per single vial, calculated straight off the sourced pack rate."),
        ("Rigor", "≥99% purity is the floor for anything that makes it into the catalog, not the ceiling."),
    ]
    value_cards = "".join(f'<div class="value-card"><h3>{t}</h3><p>{d}</p></div>' for t, d in values)

    body = f'''
  <section class="page-hero">
    <div class="container">
      <span class="eyebrow">ABOUT HLIX</span>
      <h1>A personal catalog, built like it matters.</h1>
      <p>hlix started as a spreadsheet and outgrew it. This is where every research peptide gets logged, priced, and organized in one clean, searchable place.</p>
    </div>
  </section>
  <section class="section">
    <div class="container">
      <div class="prose">
        <h2 class="mt-0">Why this exists</h2>
        <p>Keeping track of research compounds across suppliers, batches and price sheets gets messy fast. hlix exists to fix that: a single, well-organized reference for what's on hand, what it costs per vial, and where it fits — metabolic, growth, recovery, cognitive, longevity or hormonal research.</p>
        <h2>How pricing works</h2>
        <p>Everything in the catalog is priced as a single vial at the rate the full pack was sourced for. If a 10-vial pack costs $50, that's the number you'll see listed against 1 vial here — no markup, no math required.</p>
        <h2>Our standard</h2>
        <div class="value-grid">{value_cards}</div>
      </div>
    </div>
  </section>
  <section class="section section--alt">
    <div class="container">
      <div class="section__head">
        <div><span class="section__kicker">// STANDARD</span><h2>Verification, every time</h2></div>
      </div>
      {trust_grid_html()}
    </div>
  </section>
'''
    return page_shell(
        title="About",
        description="About hlix — a personal research peptide catalog built for clarity and precision.",
        prefix=prefix,
        active="about",
        body=body,
    )


# ------------------------------------------------------------- contact -----

def render_contact():
    prefix = ""
    body = f'''
  <section class="page-hero">
    <div class="container">
      <span class="eyebrow">GET IN TOUCH</span>
      <h1>Contact</h1>
      <p>Questions about a compound, a batch, or the catalog itself — reach out below.</p>
    </div>
  </section>
  <section class="section">
    <div class="container contact-layout">
      <div>
        <div class="contact-card">
          <h3>{icon('mail')} Email</h3>
          <p><a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a></p>
        </div>
        <div class="contact-card">
          <h3>{icon('clock')} Response Time</h3>
          <p>Usually within 1–2 business days.</p>
        </div>
        <div class="contact-card">
          <h3>{icon('pin')} Based In</h3>
          <p>United States</p>
        </div>
      </div>
      <div>
        <form class="contact-card" action="mailto:{CONTACT_EMAIL}" method="post" enctype="text/plain">
          <div class="form-field">
            <label for="name">Name</label>
            <input id="name" name="name" type="text" placeholder="Your name" required>
          </div>
          <div class="form-field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" placeholder="you@example.com" required>
          </div>
          <div class="form-field">
            <label for="message">Message</label>
            <textarea id="message" name="message" rows="5" placeholder="What's on your mind?" required></textarea>
          </div>
          <button type="submit" class="btn btn--accent btn--block">Send Message</button>
          <p class="form-note">Submitting opens your email client addressed to {CONTACT_EMAIL} — nothing is sent from this page directly.</p>
        </form>
      </div>
    </div>
  </section>
'''
    return page_shell(
        title="Contact",
        description="Contact hlix.",
        prefix=prefix,
        active="contact",
        body=body,
    )


# ----------------------------------------------------------- calculator ----

def render_calculator():
    prefix = ""
    def chip_row(name, values, unit_suffix="", active_value=None):
        chips = []
        for v in values:
            active = " is-active" if str(v) == str(active_value) else ""
            chips.append(f'<button class="chip{active}" data-value="{v}">{v}{unit_suffix}</button>')
        return "".join(chips)

    body = f'''
  <section class="page-hero">
    <div class="container">
      <span class="eyebrow">{icon('calc')} DOSAGE CALCULATOR</span>
      <h1>Reconstitution &amp; dosage calculator</h1>
      <p>Edit any number — concentration, draw volume, syringe units and vial supply all update instantly. Everything runs in your browser; nothing is saved or sent anywhere.</p>
    </div>
  </section>
  <section class="section">
    <div class="container calc-layout" data-calculator>
      <div>
        <div class="calc-card">
          <h2>Build Your Dose</h2>
          <div class="calc-group">
            <div class="calc-group__label">Peptide in vial <span class="calc-group__value" id="vialEcho">5 mg</span></div>
            <div class="chip-row" data-calc="vial">
              {chip_row('vial', [2,5,10,15,20,30], ' mg', 5)}
              <button class="chip" data-value="custom">Custom</button>
              <input type="number" class="chip" data-custom-input style="display:none; width:90px;" placeholder="mg" min="0.1" step="0.1">
            </div>
          </div>
          <div class="calc-group">
            <div class="calc-group__label">Bacteriostatic water added</div>
            <div class="chip-row" data-calc="water">
              {chip_row('water', [0.5,1,2,2.5,3,5], ' mL', 2)}
              <button class="chip" data-value="custom">Custom</button>
              <input type="number" class="chip" data-custom-input style="display:none; width:90px;" placeholder="mL" min="0.1" step="0.1">
            </div>
          </div>
          <div class="calc-group">
            <div class="calc-group__label">Dose per injection</div>
            <div class="chip-row" data-calc="dose">
              {chip_row('dose', [0.1,0.25,0.5,1,2,2.5,5,10], ' mg', 0.25)}
              <button class="chip" data-value="custom">Custom</button>
              <input type="number" class="chip" data-custom-input style="display:none; width:90px;" placeholder="mg" min="0.01" step="0.01">
            </div>
            <div class="toggle-row" style="margin-top:10px;" data-calc="frequency">
              <button class="chip is-active" data-value="daily">Daily</button>
              <button class="chip" data-value="weekly">Weekly</button>
            </div>
          </div>
        </div>

        <div class="calc-card">
          <h2>Setup</h2>
          <div class="calc-group">
            <div class="calc-group__label">Syringe size</div>
            <div class="chip-row" data-calc="syringe">
              <button class="chip" data-value="0.3">0.3 mL <span style="opacity:.6">/ 30u</span></button>
              <button class="chip" data-value="0.5">0.5 mL <span style="opacity:.6">/ 50u</span></button>
              <button class="chip is-active" data-value="1">1 mL <span style="opacity:.6">/ 100u</span></button>
              <button class="chip" data-value="1.5">1.5 mL <span style="opacity:.6">/ 150u</span></button>
              <button class="chip" data-value="2">2 mL <span style="opacity:.6">/ 200u</span></button>
              <button class="chip" data-value="custom">Custom</button>
              <input type="number" class="chip" data-custom-input style="display:none; width:90px;" placeholder="mL" min="0.1" step="0.1">
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="results-card">
          <h2>Results</h2>
          <div class="result-big">
            <div class="result-big__value" id="calcConcentration">2.5</div>
            <div class="result-big__unit">mg / mL CONCENTRATION</div>
          </div>
          <div class="result-row"><span class="result-row__label">Draw to</span><span class="result-row__value"><span id="calcDrawUnits">10</span> units</span></div>
          <div class="result-row"><span class="result-row__label">Volume</span><span class="result-row__value"><span id="calcDrawVolume">0.1</span> mL</span></div>
          <div class="syringe-gauge"><div class="syringe-gauge__fill" id="syringeGaugeFill" style="width:10%"></div></div>
          <div class="result-warn" id="syringeWarn"></div>

          <h2 style="margin-top:30px;">Supply</h2>
          <p class="supply-line">This vial covers about <strong id="calcInjectionsPerVial">20</strong> <span id="calcFrequencyLabel">injections / day</span>.</p>
          <div class="toggle-row" data-calc="supplyUnit" style="margin-top:12px;">
            <button class="chip is-active" data-value="days">Days</button>
            <button class="chip" data-value="weeks">Weeks</button>
            <button class="chip" data-value="months">Months</button>
            <button class="chip" data-value="years">Years</button>
          </div>
          <p class="supply-line">About <strong><span id="calcSupplyValue">20</span> <span id="calcSupplyUnit">days</span></strong> of supply from one vial.</p>

          <h2 style="margin-top:30px;">Plan For</h2>
          <div class="calc-input-row">
            <input type="number" id="planAmountInput" data-plan-amount value="3" min="1" max="60">
            <div class="toggle-row" data-calc="planUnit" style="flex:1;">
              <button class="chip" data-value="weeks">Weeks</button>
              <button class="chip is-active" data-value="months">Months</button>
              <button class="chip" data-value="years">Years</button>
            </div>
          </div>
          <p class="supply-line" style="margin-top:14px;">You'll need about <strong><span id="calcVialsNeeded">5</span> vials</strong> to cover <span id="calcPlanAmountEcho">3</span> <span id="calcPlanUnitEcho">months</span>.</p>
        </div>
      </div>
    </div>
  </section>
'''
    return page_shell(
        title="Dosage Calculator",
        description="Free peptide reconstitution and dosage calculator — concentration, draw volume, syringe units and vial supply.",
        prefix=prefix,
        active="calculator",
        body=body,
        extra_head=f'<script src="{prefix}assets/js/calculator.js" defer></script>',
    )


# ----------------------------------------------------------------- main ----

def main():
    products = load_products()

    (ROOT / "index.html").write_text(render_home(products))
    (ROOT / "catalog.html").write_text(render_catalog(products))
    (ROOT / "about.html").write_text(render_about())
    (ROOT / "contact.html").write_text(render_contact())
    (ROOT / "calculator.html").write_text(render_calculator())

    peptides_dir = ROOT / "peptides"
    if peptides_dir.exists():
        shutil.rmtree(peptides_dir)
    peptides_dir.mkdir()
    for p in products:
        (peptides_dir / f"{p['slug']}.html").write_text(render_product_page(p, products))

    print(f"Built {5} core pages + {len(products)} product pages.")


if __name__ == "__main__":
    main()
