---
name: headless-shopify-storefront
description: Ship a headless Shopify store on the landing-template Astro stack - enabling the shopify module, getting an Admin token, importing a catalogue through the Admin API, registering cache webhooks, and going live. Use this whenever the user mentions Shopify, a headless storefront, a Storefront or Admin API token, product feeds or supplier catalogues, importing products, metafields or metaobjects, product variants, collections, faceted filtering, or says their shop shows no products, placeholder products, or demo/mock.shop data. Also use it when a Shopify API call fails with a scope, token, publication or userErrors problem, and when the human needs to be told exactly which buttons to click in the Shopify admin.
---

# Headless Shopify on the landing-template

**The storefront already exists.** In a landing-template project the `shopify`
module ships the whole customer-facing side: listing with Shopify-native filters,
collections, search, product pages with variants, a cookie cart that works
without JavaScript, Shopify's hosted checkout, HMAC webhooks that purge the page
cache, sitemap entries and el/en copy. Do not rebuild any of it.

So the job is almost never "write a storefront". It is:

```
1  switch the module on          modules.config.ts             2 min    you
2  Shopify admin setup           clicks, tokens, channel       15 min   the human
3  wire the credentials          .env + npm run shopify:verify 2 min    you
4  get the catalogue in          npm run shopify:push          varies   you
5  webhooks + go-live            npm run shopify:webhooks      10 min   both
```

Step 2 is the long pole and it is not yours to do. **Start it first**, then work
on step 4 while the human clicks. `references/human-setup.md` is written to be
handed over one step at a time — read it before asking them anything.

## Before you start: which project is this?

```bash
cat modules.config.ts | head -30          # shopify: true|false present?
ls src/modules/shopify 2>/dev/null         # module present?
ls scripts/shopify 2>/dev/null             # npm run shopify:* available?
```

- **Both present** → this playbook, top to bottom.
- **`src/modules/shopify` missing but it is a landing-template** →
  `npm run module:add -- shopify` brings it back from the template remote.
- **Not a landing-template at all** (Next.js, bare Astro, anything else) →
  `references/custom-storefront.md`. Steps 1-4 still hold; only the rendering
  layer differs.

## Step 1 — switch the module on

```ts
// modules.config.ts
modules:  { shopify: true },
options:  { shopify: { basePath: "shop", cartPath: "cart", pageSize: 24,
                       country: "GR", featuredCollection: "", featuredOnHome: 4,
                       cacheSeconds: 300 } },
```

Nothing else to wire: routes, nav entry, cart button, home-page section, sitemap
and CSP all follow from the switch. `basePath` must not collide with a page in
`src/pages/[lang]/` or with the `catalog` module — `npm run shopify:verify`
checks both. Details and the full option list: `references/astro-template.md`.

With no `SHOPIFY_STORE_DOMAIN`, `npm run dev` serves Shopify's `mock.shop` demo
catalogue, so the design is reviewable before the client has a store.

## Step 2 — the human's part

**Read `references/human-setup.md` and drive it one step at a time.** Ask for one
thing, wait, confirm it landed, then ask for the next. A single message listing
twelve Shopify settings gets three of them done.

The sequence, each step with its exact menu path in that file:

| # | They do | You get back |
|---|---|---|
| 1 | Store plan, country, tax and currency | prices that mean what they look like |
| 2 | Sales channels → **Headless** → create storefront | Storefront tokens |
| 3 | Dev Dashboard app + Admin scopes + redirect URL | client id/secret for OAuth |
| 4 | Publish products and collections to that channel | a shop that is not empty |
| 4b | Search & Discovery app → configure filters | your metafields as filter chips |
| 5 | Payments, shipping zones, policies, checkout branding | a store that can take money |

Plus the five commerce decisions (tax, stock, shipping, compare-at, reviews),
which are step 0 of that file.

Step 0 and step 1 change how the catalogue is built, so ask them **before**
writing the importer, not after. `AskUserQuestion` with concrete options works
far better here than prose — these are cheap to answer and expensive to reverse.

## Step 3 — wire the credentials

```bash
cp .env.example .env     # if it does not exist
# SHOPIFY_STORE_DOMAIN, SHOPIFY_STOREFRONT_TOKEN (or _PRIVATE_), SHOPIFY_API_VERSION
npm run shopify:verify
```

`shopify:verify` asks the Storefront API the same way the running site does and
prints what it can actually see. Treat a non-zero exit as "the shop is broken",
because it is. It is also the fastest answer to "why is my shop empty" — the
usual cause is products that were never published to the Headless channel.

Never put `SHOPIFY_ADMIN_TOKEN` in the deployed environment. Serving the shop
does not need it, and it can rewrite the whole catalogue.

## Step 4 — get the catalogue in

Everything is pushed through the Admin API from one validated file,
`data/catalog.json`. Two halves, and they fail for different reasons, so keep
them apart:

```
normalise   source feed/sheet/scrape  →  data/catalog.json    no network, unit-testable
push        data/catalog.json         →  Shopify              npm run shopify:push
```

The normaliser needs no credentials, so **write and test it while the human is
still on step 2**. The format and its validator are in `scripts/shopify/catalog.mjs`;
normalisation patterns, variant grouping and the traps that make feeds lie are in
`references/catalog-import.md`.

```bash
npm run shopify:preflight            # scopes + channels, before writing anything
npm run shopify:push -- --dry-run    # validate, print the plan
npm run shopify:push -- --limit=5    # five products, check them in the Admin
npm run shopify:push                 # all of it; idempotent, re-run freely
npm run shopify:verify               # did the storefront actually see it?
```

Three rules that save the most time:

- **Introspect before writing a mutation.** Shopify's input shapes drift between
  versions and the docs lag. `node scripts/shopify/admin-client.mjs introspect
  ProductSetInput` prints the live schema. Field names in any guide, including
  this one, are a hint; the schema is the truth.
- **Idempotent or unfinished.** Key on handle. A second run must update, never
  duplicate. You will re-run more than you expect.
- **Verify through the layer the customer uses.** The Admin API saying the data
  is there does not mean the storefront serves it. Those two disagree regularly,
  which is the entire reason `shopify:verify` exists separately from
  `shopify:preflight`.

If the client will maintain the catalogue by hand and it has no metafields,
metaobjects or multi-collection products, Shopify's **Products → Import** CSV is
a legitimate shortcut — but it caps at one collection per product and cannot set
metafields, so most real catalogues come back to the push scripts.

## Step 5 — webhooks and go-live

Without webhooks the site serves a stale catalogue: a price edited in the Admin
does not appear until `cacheSeconds` expires.

```bash
npm run shopify:webhooks       # after the first deploy; needs a public https SITE_URL
```

That registers products/*, collections/* and inventory_levels/update against
`/api/shopify/webhook`. **It changes which secret signs the payload**: webhooks
created by an app are signed with the app's client secret, not the one printed on
the Notifications page. Set `SHOPIFY_WEBHOOK_SECRET` to `SHOPIFY_APP_CLIENT_SECRET`
or every delivery fails verification, silently, with a 401.

Then work `references/go-live.md`. The blocking items there are commercial, not
technical — tax treatment, real shipping rules, a test order placed and refunded.

## Verifying, at every step

Assert numbers, not vibes. A good final check states product count, variant
count, how many carry each metafield, collection count, and zero vendor URLs left
in descriptions — read back through the Storefront API, not the Admin.

```bash
npm run shopify:verify
npm run check && npm run build       # the template's own gates, after any code change
```

For anything user-visible, load the shop in a browser: no console errors, no
horizontal scroll at 375px, add-to-cart reaching Shopify's checkout.

## Reference files

| File | Read when |
|---|---|
| `references/human-setup.md` | at the start, every project — the clicks, in order |
| `references/astro-template.md` | module options, caching, where API code goes, customising |
| `references/catalog-import.md` | writing the importer, grouping variants, dirty feeds |
| `references/data-modelling.md` | designing metafields, metaobjects, taxonomy |
| `references/api-gotchas.md` | any Shopify or template call fails |
| `references/go-live.md` | before launch |
| `references/custom-storefront.md` | the project is not a landing-template |

The executable parts live in the project, not in this skill: `scripts/shopify/`,
exposed as `npm run shopify:{verify,oauth,preflight,push,webhooks}`. Read its
README before writing any Shopify script of your own — it probably exists.

## Extending this skill

- A new API trap → `references/api-gotchas.md`, **with the exact error text**;
  that is what the next person searches for.
- A new feed shape or normalisation trick → `references/catalog-import.md`.
- A new validation rule → `scripts/shopify/catalog.mjs`, so it cannot recur.
- A Shopify admin UI change → `references/human-setup.md`, with the new menu path.
