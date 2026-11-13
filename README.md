# hlix

A research peptide catalog: one page per compound (with a vial-size
selector when a peptide has multiple doses, plus a Powder/Reconstituted
form toggle on every one), a category-filtered and searchable catalog
(search matches by name or by research-goal tag, e.g. "hair" or "sleep"),
an About/Contact page, a standalone reconstitution/dosage calculator, and
an optional AI chat widget backed by a small serverless function, a cart
with an order-request checkout, and customer accounts. The pages are static
HTML/CSS/JS — no build step to view them; the chat, checkout and accounts use
the small serverless functions in `api/` (see "Chat backend" and "Accounts"
below).

## Structure

```
hlix/
├── index.html            Home (the main site — this is the v3 design)
├── catalog.html           Full, filterable catalog
├── about.html
├── contact.html
├── calculator.html        Reconstitution & dosage calculator
├── planner.html           Dose planner (/planner): vials and doses on a calendar, saved to the account
├── planner-embed.html     The calculator's dose planner on its own, for the admin (see below)
├── checkout.html          Review the cart and send an order request
├── account.html           Sign in / make an account: orders, saved address, password (see "Accounts")
├── peptides/               One generated page per catalog entry
├── v1/                     The original design, kept for reference (see below)
├── v2/                     The previous design, kept working for reference (see below)
├── assets/
│   ├── css/style.css       v1's design system
│   ├── css/v3.css          Main site's design system
│   ├── css/v2.css          The /v2/ design's styles (its own, older dose planner look included)
│   ├── css/planner.css     The dose planner's styles: /planner, /v2/calculator and planner-embed.html (the admin's Calendar)
│   ├── js/main.js, product.js, calculator.js, search.js, chatbot.js   v1's JS
│   ├── js/v3.js            Main site's ui: menus, search palette, catalog filters, product picker
│   ├── js/v3-cart.js, v3-checkout.js   Main site's cart (and its copy on the account, family & friends and member prices), checkout
│   ├── js/v2-calc.js, v2-planner.js, v2-chat.js, v2-prices.js, v2-account.js   Shared by both designs: calculator, dose planner, chat, live prices, account page
│   ├── js/v3-boot.js, v2-boot.js, v2-boot-embed.js, v1-prefix.js   The first script on each page (no inline scripts: see "Security")
│   ├── js/v2.js, v2-cart.js, v2-checkout.js   The /v2/ design's ui, cart and checkout
│   ├── js/search-index.js  Shared search index, read by every version
│   └── img/vials/          Shared photoreal product images
├── data/
│   ├── price_list_source.xlsx   Source of the product list (prices are set in the admin, see "Prices")
│   ├── sku_codes.json            Maps each product to its supplier Cat. No. based SKU
│   └── products.json            Generated from the xlsx — do not hand-edit
├── scripts/
│   ├── parse_pricelist.py  xlsx -> data/products.json
│   ├── pull_prices.py      admin's current prices -> data/products.json
│   ├── build.py             products.json -> v1/* (also holds shared helpers the others import)
│   ├── build_v3.py          products.json -> the main site at the repo root
│   ├── build_v2.py          products.json -> v2/, and planner-embed.html at the root
│   ├── photo_labels.py     products.json -> assets/img/vials/*.webp
│   └── vial_svg.py          Coded-SVG vial fallback for any variant with no photo
└── api/
    ├── chat.js               Serverless function backing the chat widget
    │                          (Vercel Node function — needs ANTHROPIC_API_KEY)
    ├── prices.js             Live prices from the admin, for the pages and cart
    ├── order.js              Checkout: an account's order goes into the admin; a guest's is emailed
    ├── account.js            Accounts: sign up / in / out, password, saved details, cart
    ├── _lib/prices.js        Shared price lookup (prices.js, order.js, chat.js)
    └── _lib/session.js       Sign-in sessions in HttpOnly cookies, and request checks
```

## Dose planner in the admin (`planner-embed.html`)

The admin dashboard's **Calendar** page (admin.hlixlabs.com) is this site's dose
planner: it shows `planner-embed.html` in a frame. That page is the planner on
its own (no nav, footer, cart or chat; the same light sheet as on the calculator
page, on a see-through page so the admin shows around it), generated from the same
`planner_section()` in `scripts/build_v2.py` as the calculator page and run by
the same `assets/js/v2-planner.js` and `assets/css/v2.css`. So there's only one
planner: change it here, rebuild and deploy, and the calculator page and the
admin's Calendar both get the change. The admin repo has no copy to update.

Only the plan is different. On the calculator page it lives in the visitor's
browser (localStorage). On `planner-embed.html` the planner reads and keeps
nothing in the browser: the admin sends the plan in and saves every change the
planner sends back (`postMessage`; see "embedded" at the bottom of
`v2-planner.js`), so your admin plan and site visitors' plans never mix.

A plan is `{ v: 3, active, look, months, vials }`; each vial is `{ id, name, size,
color, doses, rules, end? }`: `doses` the days set by hand, `rules` the repeats
(`{ from, dose, every, until? }`), `end` the last day it's used (its end date, or
"stop here"; empty: it runs until it's dry). Vials keep the order they're in (drag
the tabs to change it), and two can share a color. The admin reads plans with the
same math (`dashboard/src/lib/vials.ts` there): change one, change the other.

`planner-embed.html` has a layout and look of its own, in the admin's style:
`planner_app()` in `scripts/build_v2.py` (three cards: Vials, Calendar, the vial
picked) styled by `assets/css/planner.css` (not `v2.css`, and without `v2.js`).
Both pages share `v2-planner.js` and its `data-*` hooks. Its text is in sentence
case; the calculator page lowercases it (v2.css, and `lc()` in the script where a
vial's name keeps its case).

The admin frames the page more than once when it's wide, each copy showing part of
the planner (`part` in `v2-planner.js`): the calendar, and beside it `#side` (the
Vials and the vial picked, which saves like the calendar). Narrow, one copy shows
it all. The admin passes the plan and the day or vial picked between them; a copy
given back the plan it sent changes nothing. A load with `readOnly: true` (a website
customer's own plan, which only they change) shows it to look at: `data-readonly` on
`.pc` hides adding, editing and deleting (planner.css), days and vials can still be
tapped, and the admin saves nothing that comes back. (`#vials` and `#panel`, each card on
its own, are what an older admin page asked for.)

`vercel.json` keeps every page unframeable except `planner-embed.html`, which
only admin.hlixlabs.com (and the admin's local demo on `localhost:5175`) may
frame. Opened directly, it just forwards to the calculator.

## The main site's design (v3)

The site at the root is the v3 design, generated by `scripts/build_v3.py` and
styled by `assets/css/v3.css`: dark, mint, lowercase, heavy display type.

- **Home** leads with a search field (name or research goal, results as you
  type) and a rotating product spotlight, then a category grid, research goals,
  featured products, the calculator / planner / AI tools, and "how ordering works".
- **Catalog** has a sidebar (category, research goals, a name-or-goal filter),
  sorting (price, name, most sizes), a grid or list view, removable filter
  chips, and shareable URLs (`?cat=`, `?tag=`, `?q=`, `?sort=`, `?view=`; old
  `#category` links still work). On phones the filters open as a bottom sheet.
- **Product pages** keep the buy panel in view while you scroll: sizes and
  powder / ready-to-use as tiles with their prices, the family & friends price
  box for those accounts, quantity and add to cart. Below it, a spec sheet:
  overview, specifications, every size with its price per mg, lab reports and
  research goals. On phones an add bar appears once the main button scrolls away.
- **Everywhere:** a "shop" menu (categories, goals, published lab reports), a
  search palette on `/` or ⌘K (remembers recently viewed products), the account
  icon, a cart drawer with product photos, and a bottom tab bar on phones (shop,
  search, calculator, ask ai, cart).

What it shares with the `/v2/` design: the dose planner's script (`v2-planner.js`),
the calculator math (`v2-calc.js`), the chat (`v2-chat.js`), live prices
(`v2-prices.js`) and the account page's logic (`v2-account.js`).

**The dose planner** has a page of its own, `/planner` (in the nav, the menu, the
footer and the home page's tools): planning doses is ongoing, so it isn't tucked
under the calculator. The calculator page says what it's for and ends with a card
that leads there (`/calculator#planner` still lands on it). The planner is the one
the admin's Calendar shows: `planner_app()` in `build_v2.py` styled by
`assets/css/planner.css` (loaded after `v3.css`, everything scoped to `.pc`), under
the page's own heading, a "how it works" strip and a line saying where the plan is
kept; the Vials and the vial picked sit beside the calendar on a wide screen and stay
in sight as you scroll it. `/v2/calculator` shows the same planner. Signed out, a
plan is kept in the browser; signed in, in the account (below, "Accounts"). The
calculator remembers its vial and water once you set them (`hlix-calc` in the
browser) so the planner's day editor can still say how many units to draw. Change
the planner in `build_v2.py` / `planner.css` and rebuild both (`build_v2.py`, then
`build_v3.py`). The cart (`hlix_cart` in the browser, and the account's copy) is the
same for both designs.

`/v3/...` addresses (the preview this design was tried out at) redirect to the
same page at the root (`vercel.json`).

## The previous designs (`/v2/`, `/v1/`)

Both are kept for reference. Nothing on the main site links to them, and their
pages are `noindex, nofollow`, but anyone who guesses the address can open them.

**`/v2/`** is the design the site had before v3 (minimal, bold, scroll-driven),
generated by `scripts/build_v2.py` into `v2/`. It still works: catalog, product
pages, calculator, cart, checkout and accounts. `build_v2.py` also writes
`planner-embed.html` (the admin's Calendar) at the root, whatever design the
site has.

**`/v1/`** is the original design, with its own markup and CSS/JS
(`assets/css/style.css`, `assets/js/main.js` and friends), generated by
`scripts/build.py` into `v1/`.

Both are written with root-absolute links (`/v2/catalog`, `/v1/peptides/bpc-157`,
`/assets/...`; `absolutize()` in `build.py`), and the address their scripts build
links from (`data-base`, `data-prefix`) is absolute too. That's because the site
drops trailing slashes: `/v1/` is served as `/v1`, where relative links would
resolve against the site root and land on the main site.

Rebuild them with the main site whenever prices or products change (see
"Updating the catalog").

## Updating the catalog

1. Replace `data/price_list_source.xlsx` with your updated price list (same
   columns: SKU Number / Product name / Quantity / Price, quantity formatted
   like `10mg*10vials`).
2. Regenerate the site:
   ```bash
   python3 scripts/parse_pricelist.py
   python3 scripts/pull_prices.py     # keep the admin's prices (see "Prices")
   python3 scripts/build_v3.py        # the main site, at the repo root
   python3 scripts/build_v2.py        # v2/, and planner-embed.html
   python3 scripts/build.py           # v1/
   ```
3. Every page at the repo root (the main site), plus the equivalents under
   `v2/` and `v1/`, gets rewritten. Edit page copy inside `scripts/build_v3.py`
   (or `build_v2.py` / `build.py` for the old designs), not the generated `.html`
   files directly.

Pricing rule baked into the parser: a pack listed as `10mg*10vials` at `$50`
is shown on the site as **1 vial, 10mg, $50** — the full pack price against a
single vial, per how you price things. That price is the Powder-form base
price; the Reconstituted form is a flat 20% premium on top, computed by
`recon_price()` in `scripts/build.py` (and `reconPrice()` in
`api/_lib/prices.js` for live prices; keep the two in step).

## Prices (live from the admin)

Prices are set in the hlix admin: admin.hlixlabs.com → **Inventory**, click a
product's price to change it. The site shows the new price within about a
minute, with no rebuild and no deploy:

- `api/prices.js` serves the current price of every SKU, read from the
  admin's Supabase database through `public.storefront_prices()`, which
  returns SKU + price and nothing else (the public key can't read any table).
  Vercel's edge caches the answer for 15 seconds.
- `assets/js/v2-prices.js` swaps those prices into every page: product pages
  (every size, both forms), catalog and home cards, search, the cart and
  checkout.
- `api/order.js` prices each order line itself from the same source, so a
  cart saved before a price change, or an edited request, can't change what
  the order email says.
- `api/chat.js` gives the assistant the same prices.

The admin price is the Powder price; Reconstituted is +20% as above. A $0
price in the admin is ignored (the site keeps its built-in price), and
products that exist only in the admin never appear here.

The prices baked into the pages (from `data/products.json`) are only the
fallback: what shows for a split second before the live prices load, and what
the site uses if the database can't be reached. To bake the admin's current
prices in, run `python3 scripts/pull_prices.py`, then rebuild. The database
URL and public key default to the hlix project; set `SUPABASE_URL` /
`SUPABASE_PUBLISHABLE_KEY` in Vercel only if that ever changes.

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
python3 scripts/build_v3.py
python3 scripts/build_v2.py
python3 scripts/build.py
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
  if they're true for your actual supply. Products with no entry in
  `data/coa.json` still show the generic "kept on file, available on request"
  line in their certificate of analysis section.
- Every generated page carries a "Research Use Only / not for human
  consumption" disclaimer. Don't remove it without knowing why it's there.

## Certificates of analysis

Lab reports live in `assets/coa/` (the PDFs exactly as received) and are
listed in `data/coa.json`, one entry per report, keyed by the product's page
slug (e.g. `glp3-r`). They apply to the whole product, whatever vial size is
picked: `build_v3.py` (and `build_v2.py` for `/v2/`) puts the newest report on a line under the product name
(purity · lab · date · view certificate, plus "all n reports" when there are
several) and lists them all, newest first, in the certificate of analysis
section (`#coa`). To add one, drop the PDF in `assets/coa/`, add its entry,
and rebuild. `vercel.json` serves `/assets/coa/` without the site's
Content-Security-Policy so browsers' built-in PDF viewers aren't blocked.

## Local preview

No dependencies for the static site itself. From the project root:
```bash
python3 scripts/serve.py
```
then open http://localhost:8743. Pages have no `.html` in their address, as on
hlixlabs.com (`vercel.json` turns on Vercel's `cleanUrls`: `/catalog` serves
`catalog.html`, and `/catalog.html` redirects to `/catalog`), and this little
server does the same. The chat widget, checkout and accounts render but can't
reach a backend this way (see below) — that's expected locally; `vercel dev`
runs them too.

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
to the cart, fills in a shipping form, and submitting emails that request to
`NOTIFY_EMAIL` — the cart is not billed anywhere. Follow up with the customer
directly to arrange payment. A signed-in customer's order is also saved in the
admin as a pending Customer Order (see "Accounts"); if the email can't be sent,
their order is still placed.

## Stock (live from the admin)

Stock follows the admin's Inventory. Every product card (catalog, home, "more in")
has a tag: **in stock** when any size has vials for sale on hand, **on the way** when some
are on a supplier order no customer is waiting for, otherwise **out of stock** (in red,
`--out` in `v3.css`). On a product page each size button says it too, under the price, and
the line under the buy button says it for the size picked (**out of stock · ships in 2–3
weeks, ordered for you**). Every size can still be ordered: for a size that's out of stock
the button (and the phone's buy bar) says **pre-order** instead of "add to cart", and it goes
in the cart the same way.
`/api/prices` carries it as `stock` (`{ SKU: "in_stock" | "on_the_way" | "to_order" }`,
from `public.storefront_stock()` in the admin's migration 0030, never a count) and
`v2-prices.js` hands it out as `HLIXPrices.stock(sku)`. If it can't be read, the line stays
hidden: the page never claims stock it can't confirm. The wording is `STOCK_TEXT` and
`CARD_STOCK` in `assets/js/v3.js`.

Product pages open on **powder**; family & friends accounts' price box opens on **pack of
10**, listed first.

## Accounts

Customers can make an account (the person icon in the nav, or `account.html`).
Signed in, their cart is saved to the account and follows them to any device
(signing in merges the cart they had into it; signing out clears it from that
browser), checkout fills in their saved shipping details, their orders go
straight into the hlix admin, and the account page shows their orders, saved
details and a password change.

**Their dose plan.** Signed in, the dose planner (`/planner`) keeps their vials and
schedule in their account, on any device: `GET /api/account?plan=1` loads it, `POST
{ action: "plan" }` saves it a moment after each change (the database's
`shop_plan` / `shop_save_plan`, the admin's `0035_shop_plans.sql`: only they can change
it, and it goes with the account; admins with two-factor can look at it, view only, in
the admin's Calendar and on their user page, `0037_admin_customer_plans.sql`). The first time an account has none, the
plan they had in that browser becomes it. The page keeps a copy in the browser
(`hlix-plan:account`) so it opens on it at once; signing out removes the copy, and
the browser's own signed-out plan (`hlix-plan`) is left as it was. If the account
can't be reached, changes stay in the browser and are saved when it's back. They can also delete their account there ("delete
my account", under "sign out on every device"): it asks for their password again,
then their sign-in, saved details and cart are gone and they're signed out
everywhere; their orders stay in the admin (the admin's
`0033_shop_delete_account.sql`, which only does it for a session that began with a
password in the last 5 minutes).

Accounts live in the admin's Supabase project (its Auth), next to the admin
login. What a customer can do there is decided by the database, not this site:
the `shop_*` functions in the admin repo's
`supabase/migrations/0026_shop_accounts.sql` only ever read or write the
caller's own account, price orders themselves, and limit orders (5 a day per
account, 30 an hour in all). The admin repo's README has the Supabase settings
accounts need ("Website accounts").

**Family & friends.** An admin can mark an account as family & friends (on the
user's page under Users in the admin). That account pays hlix's cost: a pack of 10 at the
supplier pack price, a single vial at a tenth of it (rounded up to the cent),
powder or ready to use alike. Product pages then show a "family & friends
price" box with **single vial / pack of 10**, cart lines can be packs, and the
account page says so. `GET /api/account` returns those prices (`prices`, a pack
of 10 by SKU) only for that account; the database prices the order itself and
refuses packs from anyone else (the admin's `0027_family_pricing.sql`).

**Silver and Gold.** An admin can also make an account a Silver member (25% off
the website price) or a Gold member (50% off), on the same page. A $100 vial is $75
for Silver and $50 for Gold; the discount comes off the price the site shows, powder
or ready to use, to the cent. By the vial only (packs stay family & friends). Product
pages show a "silver / gold member price" box (the same box as family & friends,
without the pack choice) with the regular price crossed out, the cart and checkout
use their price (`memberPrice()` in `v3-cart.js`), the account page says "gold
member · 50% off", and the order emails say which pricing it was. `GET /api/account`
returns `discount` (percent off) for them; the database prices the order itself (the
admin's `0031_member_discounts.sql`).

**Turned off / temporary passwords.** An admin can turn an account off (Users in
the admin): it's signed out everywhere, can't sign in (the site says the account
is turned off and to write to contact@hlixlabs.com), and every `shop_*` call is
refused. An admin can also reset a password to a temporary one; the account page
then asks them to choose their own (`tempPassword` in `GET /api/account`), and
changing it clears the flag (the admin's `0028_users_admin.sql`).

Vercel environment variables (all optional):

- `SITE_URL` — where account emails link back to. Defaults to
  `https://hlixlabs.com`. Never taken from the request.
- `ACCOUNT_EMAILS=on` — once the Supabase project sends email through your own
  SMTP (Resend), so "forgot your password?" sends a reset link. Until then it
  asks people to write to contact@hlixlabs.com.
- `CUSTOMER_EMAILS=on` — order confirmations to customers (below). Needs
  hlixlabs.com verified in Resend and `RESEND_FROM_EMAIL` on it.
- `REPLY_TO_EMAIL` — where customers' replies go. Defaults to
  `contact@hlixlabs.com`.
- `OWNER_ALERTS=off` — stops the emails to you (below). On by default.
- `ALERTS_SECRET` — lets the database post finished cart visits to `/api/alerts`
  (below). Sensitive.
- `ADMIN_URL` — the admin's address in those emails. Defaults to
  `https://admin.hlixlabs.com`.

### Emails to customers

**Order confirmation** (`api/_lib/mail.js`, sent by `api/order.js`): "request
received." with the order # (accounts), each line with its form and quantity,
the subtotal, "no payment has been taken" and, for accounts, a link to the
account page. From `RESEND_FROM_EMAIL`, replies to `REPLY_TO_EMAIL`. An
account's order gets one once it's saved; a guest's only once hlix's own copy
has gone out (so nobody is told about an order hlix never got). A failed
confirmation never fails the order.

Anyone can type any address at checkout, so the email can't be used to mail
strangers anything useful: nothing typed into the form goes in it except a first
name that reads as a name ("hi there" otherwise), product names and prices come
from the catalog or the database, and a guest address gets at most one
confirmation a day (a Resend idempotency key).

**Account emails** (confirm your email, reset your password) are sent by Supabase
Auth, through Resend once its SMTP is set. The templates are in `emails/` (kept
off the site by `.vercelignore`). To switch them on, after hlixlabs.com is
verified in Resend:

1. Resend: **API Keys**, create a *Sending access* key limited to hlixlabs.com.
2. Supabase (project hlix): **Authentication**, **Emails**, **SMTP Settings**:
   enable custom SMTP. Host `smtp.resend.com`, port `465`, username `resend`,
   password the key from step 1, sender `contact@hlixlabs.com`, sender name `hlix`.
3. **Authentication**, **Emails**, **Templates**: "Confirm signup", subject
   `confirm your hlix account`, body `emails/supabase-confirm-signup.html`;
   "Reset password", subject `reset your hlix password`, body
   `emails/supabase-reset-password.html`.
4. **Authentication**, **URL Configuration**: Site URL `https://hlixlabs.com`, and
   under **Redirect URLs** add `https://hlixlabs.com/account.html`. Without this,
   Supabase drops the site's return address and the links open its default,
   `http://localhost:3000`.
5. **Authentication**, **Sign In / Providers**, **Email**: turn on **Confirm
   email**. Accounts made before stay confirmed.
6. Vercel (project hlixlabs): `ACCOUNT_EMAILS=on`, then redeploy.

### Emails to you

`api/_lib/alerts.js` emails `NOTIFY_EMAIL` (reply goes to the customer) when:

- **someone makes an account** (with "they still have to confirm their email" until
  they do). An email that already had an account gets the same answer on the site
  but no email to you. At most one a day per address.
- **someone deletes their own account**: who, their membership, and that their
  orders and client stay in the admin.
- **a signed-in customer adds things to their cart**: one email per visit, sent
  once the visit is over, listing what they added on that visit and their whole
  cart, each line with **your cost** (the supplier pack price, a tenth of it per
  vial; "not set" when the admin has no cost for it) and **their price** (what
  they'd pay with their membership, worked out by the database the way an order
  is: the admin's `0036_cart_alert_costs.sql`), with totals of both. A browser can't reliably say when someone leaves, so the database keeps
  each customer's open visit (the admin's `0034_cart_visit_alerts.sql`: their cart
  as the visit began, when they were last seen, when they left) and calls it over
  after **15 quiet minutes** (no page opened, no cart change), or **3 minutes**
  after they left the site (closed the tab, switched to another app or tab:
  `v3-cart.js` tells the server, only while a visit is open, the `hlix_cv` cookie)
  unless they came back. Signing out counts as leaving; placing an order or
  deleting the account means no email (that email says it all). Every minute
  (pg_cron) the database posts the visits that are over to `api/alerts.js`, which
  sends the emails. Guests' carts never leave their browser, so there's nothing to
  send for them. The times are in `private.cart_alerts_send()`.

  That post carries a secret: `ALERTS_SECRET` in Vercel (sensitive) must match
  `hlix_alerts_secret` in the Supabase project's Vault, which the migration makes.
  Without it `/api/alerts` refuses everything. The website's Resend key stays
  send-only: it can't read, cancel or change emails.
- **a payment comes in**: ready, but nothing sends it yet, because there's no
  payment processor. When one is added, its webhook (a new `api/` function) checks
  the payment is real (the processor's signature), records it on the order, then
  calls `require("./_lib/alerts").alertPaid({ ref, name, email, amount, total,
  paid, method, txn })` (`paid`: everything paid on the order so far; `txn`: the
  processor's payment id, so a retried webhook sends one email). The email says
  "paid in full" or how much is left.

New orders already email you from `api/order.js` (above).

Tests: `npm test` (`tests/api.test.js`, with Supabase and Resend faked).

## Security

- **No token ever reaches the browser's scripts.** `api/account.js` signs in on
  the customer's behalf and keeps the session in `__Host-` cookies that are
  `HttpOnly`, `Secure` and `SameSite=Strict`; only a harmless `hlix_in=1` flag
  is readable, so pages know someone's signed in. The access token renews
  itself from the refresh token; signing out (or "sign out on every device")
  ends the session in Supabase too.
- **Only this site can make changes.** Every `POST` to `/api/account` and
  `/api/order` must come from a page on this site (`Origin` /
  `Sec-Fetch-Site`) and be JSON, so another site can't sign someone out, place
  orders or change anything in their name.
- **No inline scripts.** Every script is a file on this site, and
  `vercel.json`'s Content-Security-Policy allows nothing else
  (`script-src 'self'`), so an injected `<script>` won't run. The account page
  sets everything it shows as text, never HTML.
- **Passwords**: at least 10 characters, not just the email, 72 at most (what
  the hashing uses). Changing it needs the current one (or a reset link from the
  last 15 minutes), and signs out every other device.
- **Email links** (confirm, reset) are taken out of the address bar at once and
  checked by Supabase before they become a session. Their return address is
  fixed (`SITE_URL`), never the request's `Host`.
- **Admin logins** are refused here, so they're only ever used on
  admin.hlixlabs.com.
- **Deleting an account** needs the password typed again: the site signs in with
  it, and the database deletes only for a session that began with a password in
  the last 5 minutes, so a session left open (or stolen) can't do it.
- **Rate limits**: sign-in (per address and per email), sign-up, password and
  reset tries are limited on each server instance; Supabase Auth and the
  database add their own.
