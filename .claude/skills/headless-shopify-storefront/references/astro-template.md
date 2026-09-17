# The shopify module, and where Shopify code goes

Read this before writing any Shopify code in a landing-template project. Most of
what you are about to write already exists.

## Where the API connections live

There are two Shopify APIs and they belong in two different places. Putting them
in the same place is the mistake this layout prevents.

```
READ  (Storefront API)                  WRITE (Admin API)
runs on every request                   runs at import time, from your laptop
──────────────────────────────          ──────────────────────────────
src/modules/shopify/lib/                scripts/shopify/
  config.ts   credentials, one place      env.mjs          reads .env
  client.ts   fetch, retries, @inContext  admin-client.mjs GraphQL + userErrors
  queries.ts  every GraphQL document      oauth.mjs        token, once
  products.ts catalogue reads             preflight.mjs    scopes
  cart.ts     cart mutations              catalog.mjs      the import format
  format.ts   paths, money, image URLs    push.mjs         writes the catalogue
  types.ts    response shapes             verify.mjs       what the site sees
  webhook.ts  HMAC check                  webhooks.mjs     registers webhooks
```

Rules that follow, and they are not negotiable:

- **Never call `fetch` against Shopify from a page or component.** Everything
  goes through `storefront()` in `lib/client.ts`, which owns the timeout, the
  retry-on-throttle, the buyer-IP forwarding and the `@inContext` country and
  language variables. A raw fetch silently loses all four.
- **Every GraphQL document goes in `lib/queries.ts`**, next to the fragments, and
  declares `${CTX}` / `${IN_CONTEXT}` like its neighbours. Queries scattered
  across components is how a catalogue ends up rendering in the wrong currency.
- **Credentials are read in exactly one place**, `lib/config.ts`, through
  `getSecret()` from `astro:env/server`. Do not read `import.meta.env.SHOPIFY_*`
  anywhere else. The vars are deliberately not in `astro.config.ts`'s env schema
  so the core does not need to know this module exists.
- **The Admin API never runs in the site.** Nothing in `src/` imports
  `scripts/shopify/`, and `SHOPIFY_ADMIN_TOKEN` never reaches the server. It can
  rewrite the entire catalogue; serving pages does not need it.
- **New read helper?** It goes in `lib/products.ts` and returns typed data. Pages
  stay thin.

## Rendering and caching

Module pages are `prerender = false` and cached per pod with a tag:

```
/[lang]/{basePath}                       list.astro      SSR + cache tag
/[lang]/{basePath}/collections/[handle]  list.astro      SSR + cache tag
/[lang]/{basePath}/[handle]              product.astro   SSR + cache tag
/[lang]/{cartPath}                       cart.astro      never cached
/[lang]/{cartPath}/panel|update|checkout                 never cached
/api/shopify/webhook                     webhook.ts      invalidates the tag
```

Everything the listing shows — search term, sort, filters, pagination cursor —
lives in the URL, so each state caches separately and the back button works.
Keep it that way; a filter held in client state is uncacheable and unshareable.

`SHOPIFY_CACHE_TAG` is `"shopify"`. After any mutation of your own:

```ts
await context.cache.invalidate({ tags: ["shopify", "sitemap"] });
```

The cache is in memory per pod. With several replicas only the pod that received
the webhook is purged and the rest catch up within `cacheSeconds`. That is a
deliberate trade, not a bug — say so if someone reports it.

## Options

`modules.config.ts → options.shopify`, typed in `src/modules/shopify/options.ts`:

| Option | Default | Notes |
|---|---|---|
| `basePath` | `"shop"` | URL segment. Must not collide with `src/pages/[lang]/<segment>.astro` or the `catalog` module. |
| `cartPath` | `"cart"` | Same rule. |
| `pageSize` | `24` | Products per page. Shopify allows 250; keep it small. |
| `country` | `""` | ISO code for Shopify Markets pricing and availability, e.g. `"GR"`. Empty means the store's default market. |
| `featuredCollection` | `""` | Collection handle for the home-page section. Empty means best sellers. A handle that does not exist renders an empty section — `shopify:verify` catches it. |
| `featuredOnHome` | `4` | `0` hides the home-page section. |
| `cacheSeconds` | `300` | How long a page is served from cache. With webhooks working this can be generous. |

Changing an option needs no code change. Changing `basePath` changes every URL,
so do it before launch or ship redirects.

## What the module already gives you

Do not rebuild these:

- **Listing** with Shopify-native filters (`filters[].values[].input` passed
  straight back), search, six sort orders, cursor pagination.
- **Filter sidebar** that renders whatever facets Shopify returns, including
  colour swatches. Facets are configured in Shopify (Search & Discovery), not in
  code — which is why there is no facet manifest to write here.
- **Product page**: gallery, variant selection by option, compare-at "was"
  pricing, related products.
- **Cart**: cookie-held cart id, works with JavaScript off (form posts to
  `/cart/update`), drawer when JavaScript is on, discount codes, then Shopify's
  hosted checkout.
- **Slots**: cart button in the header, featured products under the hero, a
  connection-status panel on the admin dashboard.
- **SEO**: product and collection URLs in the sitemap in every locale,
  `cdn.shopify.com` already in the CSP.
- **Copy** in `i18n/el.json` and `i18n/en.json`. Adding a string means adding it
  to **every** locale file or the build fails.

## Customising it properly

- **Copy** → the module's `i18n/*.json`, via `translateModule(lang, "shopify", key)`.
- **Look** → the components in `src/modules/shopify/components/`, using Tailwind
  tokens only (`bg-primary`, `text-muted-foreground`). No raw colours, no `dark:`
  variants — the template is token-only in both themes.
- **A new section on a core page** → a slot, not an import. Core never imports a
  module.
- **A new catalogue field** → a Shopify metafield, pulled through `queries.ts`.
  Do not add a database table for it; this module deliberately has no schema.
- **Shape system**: interactive = pill, inputs = `rounded-md`, cards =
  `rounded-lg`, panels = `rounded-xl`. The shop must not look like a different
  site from the rest of the pages.

After any change: `npm run check`, then `npm run build`.

## Demo mode

With `SHOPIFY_STORE_DOMAIN` unset, `npm run dev` points at Shopify's `mock.shop`
and renders a real catalogue. Useful for design review before the client has a
store. `SHOPIFY_STORE_DOMAIN=mock.shop` does the same in a deployed demo.

It is a real Storefront API, so listings, product pages, cart and checkout all
work against it — checkout lands on Shopify's demo store. What you cannot test
there is anything store-specific: your own collections, metafields, Markets
pricing, or webhooks.

## Environment

```
SHOPIFY_STORE_DOMAIN              site + scripts   "acme" is expanded to acme.myshopify.com
SHOPIFY_API_VERSION               site + scripts   default 2025-07
SHOPIFY_STOREFRONT_TOKEN          site             public, 32 hex
SHOPIFY_STOREFRONT_PRIVATE_TOKEN  site             shpss_, preferred when both are set
SHOPIFY_WEBHOOK_SECRET            site             without it the endpoint 401s everything
SHOPIFY_ADMIN_TOKEN               scripts only     shpat_, never on the server
SHOPIFY_APP_CLIENT_ID/SECRET      scripts only     for OAuth; the secret doubles as the
                                                   webhook secret when webhooks are
                                                   registered by the app
```

**`.env` is only loaded automatically by `npm run dev`.** The production server
(`node server.mjs`) reads the real environment, so a deployed box needs these set
as actual environment variables — or `node --env-file=.env server.mjs`. A shop
that works in dev and 503s in preview is almost always this.
