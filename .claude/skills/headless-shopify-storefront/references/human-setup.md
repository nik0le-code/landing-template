# The human's part

Everything here needs a person logged into the Shopify admin. You cannot do any
of it, and most of it blocks something you want to do, so start it before you
start coding.

## How to run this

**One step at a time.** Ask for one thing, wait for it, confirm it landed with the
command in that step, then ask for the next. A message containing twelve settings
comes back with three of them done and no way to tell which.

Use `AskUserQuestion` for decisions (step 0 and step 5) and plain messages with a
copy-pasteable menu path for the clicking steps. Every step below gives you:

> **Ask** — what to send them
> **They click** — the exact path, so you can paste it
> **You get** — what comes back
> **Verify** — the command that proves it
> **When it goes wrong** — what the failure looks like

Shopify moves menus. If a path below is not there, tell them to use the admin's
search box (top of every page) with the bolded term — that has stayed stable.
When you find a path has changed, update this file.

Blocking order:

```
0  decisions        ── blocks the importer (step 4 of SKILL.md)
1  store basics     ── blocks correct prices, cannot be fixed after the first order
2  Headless channel ── blocks the site rendering anything
3  Dev Dashboard app── blocks the catalogue push
4  publish products ── blocks the site rendering anything (again, differently)
4b filters          ── blocks your metafields showing up as filter chips
5  commerce settings── blocks taking money
6  webhooks         ── blocks fresh content
7  launch checks    ── blocks launch
```

Steps 0 and 1 are worth asking for on day one even if nothing else has started.

---

## Step 0 — the five decisions

Ask these **before writing the importer**. Each one changes the data you push,
and all five are cheap to answer and expensive to reverse.

> **Ask**

Use `AskUserQuestion`, one question per decision, with the trade-off in the
description. Phrase them commercially, not technically — the person answering
runs a shop, they do not know what a metafield is.

| Decision | Why it cannot wait | What it changes |
|---|---|---|
| **Are your prices tax-inclusive?** | If the feed is VAT-inclusive and Shopify is not set to match, every price jumps at checkout. Real money, real complaints. | step 1, and whether prices get divided by 1.24 |
| **Do you track stock, or is everything made to order?** | Untracked means nothing ever shows "sold out" and you can oversell. Tracked means someone enters real counts for every SKU. | `tracked` on every variant, and whether the client has weekly work forever |
| **What is free shipping, exactly?** | Any "free delivery over 50€" in the site copy has to exist as a real Shopify rule or the first order is a dispute. | step 5, and the copy on the site |
| **Are the "was" prices real?** | A compare-at price is a legal claim the item previously sold at that price. Only they know. | `compareAtPrice`, and whether sale badges appear at all |
| **Do you want reviews?** | Shopify has no reviews primitive. It needs an app or a metaobject, and the content must be genuine — inventing reviews breaches EU consumer-protection law. | whether there is a review data model at all |

Two more to ask when the catalogue has attributes worth filtering on (colour,
material, size): **how many colour names should a shopper see**, and **what
should a product with no colour show**. Both are in
`references/catalog-import.md`; do not guess them.

> **When it goes wrong** — "we'll decide later" on tax. Push back once, in one
> sentence: it cannot be changed after the first real order. Then proceed with
> tax-inclusive, which is the correct answer for EU retail, and say you did.

---

## Step 1 — store basics

> **Ask**
>
> "Before anything else, three settings that are painful to change later. In the
> Shopify admin: **Settings → General**. Confirm the store **country** and
> **currency** are right, and the **store contact email**. Currency cannot be
> changed after your first order."

> **They click**
>
> - **Settings** (bottom left of the admin) **→ General**
>   - *Store details*: store name, contact email, sender email
>   - *Store defaults*: **currency**, unit system, time zone
> - **Settings → Taxes and duties →** their country
>   - The switch you care about: **"All prices include tax"** (wording varies by
>     region; search the admin for **taxes**)
> - **Settings → Markets** if they sell to more than one country — this is what
>   the module's `country` option maps to

> **You get** — currency code and the tax answer.

> **Verify** — `npm run shopify:verify` prints the currency the Storefront API
> reports. If it says EUR and the client said "we sell in dollars", stop here.

> **When it goes wrong**
>
> - Currency wrong and orders already exist → it cannot be changed. They need a
>   new store, or Markets with a presentment currency. Escalate, do not work
>   around it.
> - Tax setting disagreeing with feed prices is the single most expensive
>   mistake on this list. Confirm it in writing.

---

## Step 2 — the Headless sales channel

This is what makes the store readable by the site. Without it there is no
Storefront token and every page is a 503.

> **Ask**
>
> "In the Shopify admin sidebar, find **Sales channels** and click the **+**.
> Search for **Headless** and add it. Open it and click **Create storefront**.
> Then send me the two tokens from the **Storefront API** section — the *public*
> one and the *private* one. Do not send me anything starting with `shpat_`."

> **They click**
>
> - Admin sidebar → **Sales channels** → **+** → search **Headless** → **Add**
> - **Headless** → **Create storefront** (name it after the site)
> - Inside the storefront → **Storefront API** →
>   - **Public access token** — 32 hex characters, no prefix. Safe in a browser
>     by design.
>   - **Private access token** — starts `shpss_`. Server-only, higher rate limits.
>     Shown once; if they lose it, rotate it.
>   - **Storefront API access scopes** — the defaults are right. If products come
>     back empty later, check `unauthenticated_read_product_listings` is on.

> **You get**
>
> ```
> SHOPIFY_STORE_DOMAIN=their-store.myshopify.com
> SHOPIFY_STOREFRONT_TOKEN=<32 hex>
> SHOPIFY_STOREFRONT_PRIVATE_TOKEN=shpss_...
> ```
>
> The domain is in the browser URL: `admin.shopify.com/store/**their-store**`.
> Give either token; the module prefers the private one when both are present.

> **Verify**
>
> ```bash
> npm run shopify:verify     # must print "reachable <Shop Name>"
> ```

> **When it goes wrong**
>
> - They send a token starting `shpat_` — that is an Admin token in a Storefront
>   slot. It will 401. Ask again for the Headless channel one.
> - They send `atkn_` — that is a Dev Dashboard *app automation* token, it
>   deploys app versions and talks to neither API you want.
> - "Reachable" but 0 products → nothing is published to this channel yet. That
>   is step 4, not a token problem.
> - Tokens pasted into a chat are in the transcript. Say so, and rotate anything
>   shared that way before launch.

**Why they are not interchangeable**, for when someone asks:

| Prefix | Issued by | Talks to | Can create products? |
|---|---|---|---|
| `shpat_` | OAuth install of an app | Admin API | **yes — this is the write one** |
| `shpss_` | Headless channel | Storefront API (private) | no |
| 32 hex, no prefix | Headless channel | Storefront API (public) | no |
| `atkn_` | Dev Dashboard | App Management | no |

The Storefront API cannot create a product no matter which scopes are ticked.
That is a property of the API, not a permission you can grant.

---

## Step 3 — the Dev Dashboard app (only if you are pushing a catalogue)

Skip this entirely if the client will add products by hand in the Admin.

Shopify retired legacy custom apps, so "create an app" now redirects to the Dev
Dashboard, and a Dev Dashboard app never displays a token — it receives one
through OAuth at install. Hence the four sub-steps and the local OAuth helper.

> **Ask** (send as four numbered lines, they are all in one place)
>
> "I need an app so I can write your products in. In the admin go to
> **Settings → Apps and sales channels → Develop apps** → **Build apps in Dev
> Dashboard**, and create an app named after the site. Then, inside that app:
>
> 1. **Configuration → Admin API access scopes** — tick these:
>    `write_products, write_publications, write_files, write_metaobjects,
>     write_metaobject_definitions, write_inventory, read_locations`
> 2. **Configuration → allowed redirection URLs** — add exactly
>    `http://localhost:3456/callback`
> 3. **Release a new app version** (scope changes do not apply until you do)
> 4. **App settings → Credentials** — send me the **Client ID** and the
>    **Client secret** (the secret needs the eye icon to reveal)"

> **They click**
>
> - `https://admin.shopify.com/store/<store>/settings/apps/development` →
>   **Build apps in Dev Dashboard**
> - The app's **Configuration** page has *separate* Admin API and Storefront API
>   scope sections. Admin is the one that matters here; a token with only
>   `unauthenticated_*` scopes means they filled in the wrong section.
> - **App settings → Credentials** for the client id and secret.

> **You get**
>
> ```
> SHOPIFY_APP_CLIENT_ID=...
> SHOPIFY_APP_CLIENT_SECRET=...
> ```
>
> Then you run OAuth yourself — it is one browser click for them:
>
> ```bash
> npm run shopify:oauth        # prints a URL; they open it and click Install
> npm run shopify:preflight    # proves the scopes actually landed
> ```

> **Verify** — `npm run shopify:preflight` exits 0 and lists the granted scopes.

> **When it goes wrong**
>
> - `preflight` reports missing scopes → they were added but no new app version
>   was released, so OAuth granted the old set. Release, then re-run
>   `shopify:oauth`.
> - "Invalid redirect_uri" → the redirect URL has a typo or a trailing slash. It
>   must be exactly `http://localhost:3456/callback`.
> - `write_discounts` is only needed for real discount objects. Compare-at
>   pricing, which is what sale badges use, does not need it.
> - After the import is done, the app can be uninstalled. Say so — clients are
>   uneasy about a thing that can rewrite their catalogue sitting there forever.

---

## Step 4 — publish the products

The most common "the site is empty but the Admin is full" cause. A product can be
Active, correct, and invisible, because *Active* and *published to a channel* are
two different things.

`npm run shopify:push` publishes everything it writes, so this step is only for
products that arrived another way — a CSV import, a migration, or the client
adding them by hand.

> **Ask**
>
> "The products need to be published to the Headless channel or the site cannot
> see them. **Products** → tick the checkbox in the header to select all →
> **⋯ (more actions)** → **Publish** → tick the **Headless** storefront."

> **They click**
>
> - **Products** → select all → **⋯** → **Publish**
> - Or per product: the product page's right sidebar → **Publishing** →
>   **Manage** → tick the Headless channel
> - Same thing for **Collections** — unpublished collections make the filter
>   sidebar empty while products still show

> **Verify**
>
> ```bash
> npm run shopify:verify     # products and collections must both be non-zero
> ```

> **When it goes wrong** — new products added later default to whichever channels
> the store's default publishing settings say. Tell them to check the first
> product they add after launch.

---

## Step 4b — filters (only if the catalogue has filterable attributes)

The shop's filter sidebar shows whatever Shopify says is filterable. Shopify's
own defaults (availability, price, product type, vendor) work with no setup;
anything of yours — colour, material, size held in metafields — does not appear
until a merchant configures it.

> **Ask**
>
> "Last catalogue step. Install the free **Search & Discovery** app from the
> Shopify App Store, then open **Apps -> Search & Discovery -> Filters -> Add
> filter** and add one for each of: <the metafields you pushed>. Colour can be
> set to show as swatches there too."

> **They click**
>
> - **Apps** -> Shopify App Store -> search **Search & Discovery** -> Install
> - **Apps -> Search & Discovery -> Filters** -> **Add filter** -> choose the
>   metafield -> Save. Reorder by dragging; the sidebar follows this order.

> **Verify** — load a collection page and count the filter groups. Filters only
> appear on collection and search pages, never on the bare product list, so check
> there and not on the shop index.

> **When it goes wrong** — the filter is configured and still absent: the
> metafield definition is missing storefront access
> (`access: { storefront: "PUBLIC_READ" }`), which is a push-side fix, not theirs.

---

## Step 5 — commerce settings

None of this is technical and all of it blocks taking money.

> **Ask**, in this order, one at a time:
>
> 1. "**Settings → Payments** — activate Shopify Payments (or your provider) for
>    your country. Until this is done, checkout cannot complete."
> 2. "**Settings → Shipping and delivery** — create a shipping zone for the
>    countries you ship to, with real rates. If the site promises free delivery
>    over an amount, that has to exist here as a rule."
> 3. "**Settings → Policies** — refund, privacy, terms and shipping policy text.
>    Shopify links these from checkout and they are legally required in the EU."
> 4. "**Settings → Checkout → Branding** — upload your logo and set the accent
>    colour, so the jump from the site to checkout does not look like a
>    different company."
> 5. "**Sales channels → Online Store** — if it is installed, either remove it or
>    password-protect it. Otherwise your Shopify theme and your real site compete
>    for the same Google results."

> **When it goes wrong** — the free-shipping threshold in the site copy not
> matching the Shopify rule. Grep the locale files for the number and check it
> against the shipping zone before launch.

---

## Step 6 — webhooks

Do this after the first deploy, because Shopify will not deliver to localhost.

Two routes. Prefer the first.

**A. You register them (one command):**

```bash
npm run shopify:webhooks           # needs SITE_URL and the Admin token
```

Then `SHOPIFY_WEBHOOK_SECRET` must be set to **`SHOPIFY_APP_CLIENT_SECRET`** —
webhooks created by an app are signed with the app's client secret. Set it in the
production environment too, and redeploy.

**B. They register them by hand:**

> **They click**
>
> - **Settings → Notifications → Webhooks** (bottom of the page) → **Create
>   webhook**, once per event, **Format: JSON**:
>   `products/create`, `products/update`, `products/delete`,
>   `collections/create`, `collections/update`, `collections/delete`,
>   `inventory_levels/update`
> - URL for every one: `https://<the site domain>/api/shopify/webhook`
> - The **signing secret** is printed at the bottom of that same page → that is
>   `SHOPIFY_WEBHOOK_SECRET`.

> **Verify** — have them change a product title in the Admin, then reload the
> product page. It changes immediately when the webhook works, and only after
> `cacheSeconds` when it does not. The delivery log next to each webhook should
> show `200`.

> **When it goes wrong**
>
> - Every delivery 401 → the secret is from the wrong route (see A vs B above).
>   This fails silently from the client's point of view; the site just goes
>   stale.
> - No secret set at all → the endpoint refuses every request, by design. The
>   admin dashboard widget says so in plain language.

---

## Step 7 — before launch

Hand them `references/go-live.md`. The two items that actually stop launches:

- **A real order, placed and refunded.** Nothing else proves payments, tax,
  shipping and the checkout handoff together.
- **Tax matching how prices were imported.** Verify on the checkout page, with a
  real product, not in the settings screen.

---

## Credential hygiene

Say this once, early, and then act on it:

- Tokens pasted into a chat live in the transcript and in scrollback. Anything
  shared that way gets rotated before launch.
- `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_APP_CLIENT_ID` and `SHOPIFY_APP_CLIENT_SECRET`
  belong in the local `.env` only. The deployed site never needs them.
  (The one exception: if you used `shopify:webhooks`, the *client secret* is also
  the webhook secret and does have to be on the server.)
- `.env` is gitignored in this template. Check it still is before committing.
