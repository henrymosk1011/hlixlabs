# hlix

A research peptide catalog: one page per compound (with a vial-size
selector when a peptide has multiple doses, plus a Powder/Reconstituted
form toggle on every one), a category-filtered and searchable catalog
(search matches by name or by research-goal tag, e.g. "hair" or "sleep"),
an About/Contact page, a standalone reconstitution/dosage calculator, and
an optional AI chat widget backed by a small serverless function. The
site itself is static HTML/CSS/JS — no build step to view it, no shopping
cart. The chat widget is the one piece that needs a real backend; see
"Chat backend" below.

## Structure

```
hlix/
├── index.html            Home (the main site — this is the v2 design)
├── catalog.html           Full, filterable catalog
├── about.html
├── contact.html
├── calculator.html        Reconstitution & dosage calculator
├── peptides/               One generated page per catalog entry
├── v1/                     The original design, kept for reference (see below)
├── assets/
│   ├── css/style.css       v1's design system
│   ├── css/v2.css          Main site's design system
│   ├── js/main.js, product.js, calculator.js, search.js, chatbot.js   v1's JS
│   ├── js/v2.js, v2-calc.js, v2-chat.js                                Main site's JS
│   ├── js/search-index.js  Shared search index, read by both sites
│   └── img/vials/          Shared photoreal product images
├── data/
│   ├── price_list_source.xlsx   Source of truth — replace this file to update prices
│   ├── sku_codes.json            Maps each product to its supplier Cat. No. based SKU
│   └── products.json            Generated from the xlsx — do not hand-edit
├── scripts/
│   ├── parse_pricelist.py  xlsx -> data/products.json
│   ├── build.py             products.json -> v1/* (also holds shared helpers build_v2.py imports)
│   ├── build_v2.py          products.json -> the main site at the repo root
│   ├── photo_labels.py     products.json -> assets/img/vials/*.webp
│   └── vial_svg.py          Coded-SVG vial fallback for any variant with no photo
└── api/
    └── chat.js               Serverless function backing the chat widget
                               (Vercel Node function — needs ANTHROPIC_API_KEY)
```

## The original design (`/v1/`)

`/v1/` is the original design of the site, kept for reference after the v2
redesign was promoted to the main site. It reuses the same catalog data,
vial artwork, search index and `/api/chat` backend, but has its own markup
and CSS/JS (`assets/css/style.css`, `assets/js/main.js` and friends).

- **How to reach it:** go straight to `/v1/index.html`. Nothing on the main
  site links to it.
- **Hidden, not secret:** `/v1/` pages are `noindex, nofollow` and unlinked,
  but anyone who guesses the URL can open them. Add auth if it ever matters.
- **Rebuild it:** `python3 scripts/build.py` (writes only inside `v1/`).
  Run it after `parse_pricelist.py` whenever prices change, same as
  `build_v2.py` for the main site.

## Updating the catalog

1. Replace `data/price_list_source.xlsx` with your updated price list (same
   columns: SKU Number / Product name / Quantity / Price, quantity formatted
   like `10mg*10vials`).
2. Regenerate both sites:
   ```bash
   python3 scripts/parse_pricelist.py
   python3 scripts/build_v2.py
   python3 scripts/build.py
   ```
3. `index.html`, `catalog.html` and everything under `peptides/` at the repo
   root (the main site), plus the equivalents under `v1/`, all get rewritten.
   Nothing else touches your hand-written pages (about/contact/calculator
   are also regenerated, so edit their copy inside `scripts/build_v2.py` or
   `scripts/build.py`, not the generated `.html` files directly).

Pricing rule baked into the parser: a pack listed as `10mg*10vials` at `$50`
is shown on the site as **1 vial, 10mg, $50** — the full pack price against a
single vial, per how you price things. That price is the Powder-form base
price; the Reconstituted form is a flat 20% premium on top, computed by
`recon_price()` in `scripts/build.py`.

## Photoreal bottles (both sites)

Both sites use real product photography: one AI-generated photo of a
black-labeled vial (`data/photo/base-black.webp`), with a printed "badge"
label composited on for every one of the 130 catalog variants, in **two
forms** — Powder (white pill, plain dose, as-shipped) and Reconstituted
(mint pill, suggested bac-water volume e.g. "10MG/2ML"). A toggle on every
product page lets the visitor switch between them. Regenerate after a
price/name change:

```bash
python3 -m venv .venv && ./.venv/bin/pip install pillow numpy   # once
./.venv/bin/python scripts/photo_labels.py                       # all 130 x 2 forms (~4min)
./.venv/bin/python scripts/photo_labels.py --only glp1-s         # one product, both forms
python3 scripts/build.py
python3 scripts/build_v2.py
```

Each label is typeset from `data/products.json`, wrapped around the bottle's
cylinder (so type foreshortens toward the edges) and lit using
`data/photo/base-white.webp` — the same bottle with a white label — as a
lighting map. Output goes to `assets/img/vials/<sku>-recon.webp` and
`<sku>-powder.webp` (1280x1600), plus `-s.webp` thumbnails (480x600) of each.
Any variant with no image falls back to the coded SVG vial. To change the
look, edit `render_art_badge()` in `scripts/photo_labels.py`; `--outdir` plus
`--form`/`--wordmark` renders one-off proofs without touching the live site.

## Before you publish anywhere public

- `CONTACT_EMAIL` in `scripts/build.py` is set to `contact@hlixlabs.com`;
  change it there if that inbox ever changes, then rebuild.
- The trust badges (HPLC Verified / Batch Tested / COA on File) are copy
  choices, not verified claims this generator makes for you — keep them only
  if they're true for your actual supply.
- Every generated page carries a "Research Use Only / not for human
  consumption" disclaimer. Don't remove it without knowing why it's there.

## Local preview

No dependencies for the static site itself. From the project root:
```bash
python3 -m http.server 8000
```
then open http://localhost:8000. The chat widget will render but can't reach
a backend this way (see below) — that's expected locally.

## Getting this onto GitHub

```bash
git remote add origin <your-empty-github-repo-url>
git branch -M main
git push -u origin main
```
Create the empty repo on GitHub first (github.com → New repository, no
README/gitignore — this project already has both), then run the above with
that repo's URL.

## Hosting — two options depending on whether you want the chat widget live

**Static only, no chat backend:** GitHub Pages works as-is. Repo Settings →
Pages → source = `main` branch, root folder. No build step. The chat bubble
will still show but always says it can't reach the assistant, since Pages
can't run server code.

**With the chat backend (recommended):** deploy to **Vercel** instead —
Vercel serves the static pages *and* runs `api/chat.js` as a serverless
function from the same repo, so GitHub Pages isn't needed at all in this
case:
1. Push the repo to GitHub (above).
2. Go to vercel.com → sign in with GitHub → "Add New Project" → import this
   repo. Leave build settings on their defaults (no framework, no build
   command needed — it's static files plus one `/api` function).
3. Before or after the first deploy, go to the project's **Settings →
   Environment Variables** and add `ANTHROPIC_API_KEY` with a real key from
   console.anthropic.com. Redeploy if you added it after the first deploy.
4. Visit the `*.vercel.app` URL Vercel gives you — the chat widget now
   actually answers. Every future `git push` to `main` auto-redeploys.

Cost note: `api/chat.js` uses Claude Haiku by default (cheap) and caps each
visitor to 30 messages/hour per IP as a basic abuse guard — see the comments
in that file if you want to tighten it further or swap in a real rate
limiter (Vercel KV / Upstash) once there's real traffic.

## Contact form + checkout emails (Resend)

The contact form (`contact.html`) and the checkout order-request flow
(`checkout.html` → cart → `api/order.js`) both send email through
[Resend](https://resend.com) instead of opening the visitor's own email
client. Same Vercel Settings → Environment Variables screen as above:

- `RESEND_API_KEY` — required. A real key from resend.com/api-keys.
- `NOTIFY_EMAIL` — optional, defaults to `henrymm@gmail.com`. Where contact
  messages and order requests land.
- `RESEND_FROM_EMAIL` — optional, defaults to Resend's shared sandbox sender
  (`hlix <onboarding@resend.dev>`), which works immediately with no setup
  but looks less trustworthy to recipients and has stricter sending limits.
  To send as `hlix <orders@hlixlabs.com>` (or similar), verify that domain
  under resend.com/domains first, then set this variable to match — sending
  "from" an unverified domain will fail.

Checkout has no payment processor wired up on purpose: a visitor adds items
to a `localStorage` cart, fills in a shipping form, and submitting emails
that request to `NOTIFY_EMAIL` — the cart is not billed anywhere. Follow up
with the customer directly to arrange payment.
