# Go-live

The blocking items are rarely the technical ones. Work top to bottom; the first
two sections are yours, the rest need the client.

## Automated gates

```bash
npm run shopify:verify        # module on, tokens, counts, webhook secret, SITE_URL
npm run check                 # astro check - the template's correctness gate
npm run build                 # anything touching rendering, modules or the server
npm run shopify:webhooks -- --list
```

All four clean before you tell anyone it is ready.

## Environment on the host

- [ ] `SHOPIFY_STORE_DOMAIN`, a Storefront token and `SHOPIFY_API_VERSION` set as
      **real environment variables**, not just in `.env` — `node server.mjs` does
      not read the file
- [ ] `SITE_URL` is the canonical origin. Prerendered pages bake it in, so it is
      also a **build-time** value
- [ ] `SHOPIFY_WEBHOOK_SECRET` set, and matching whoever registered the webhooks
- [ ] `SHOPIFY_ADMIN_TOKEN` and `SHOPIFY_APP_CLIENT_ID` **not** present on the
      server (the client *secret* may be, as the webhook secret)
- [ ] `NOINDEX=false` in production, `true` on staging
- [ ] Every credential that was pasted into a chat has been rotated

## Freshness

- [ ] Webhooks registered against `https://<domain>/api/shopify/webhook`, JSON
- [ ] **Verified by hand:** change a product title in the Admin, reload the
      product page, it changes immediately. Delivery log shows `200`
- [ ] `cacheSeconds` is a deliberate number. With webhooks working it can be
      generous; without them it is the entire freshness story

## Catalogue

- [ ] `shopify:verify` product and collection counts match what the client
      expects, stated as numbers in the handover
- [ ] Every product has an image
- [ ] No vendor URLs left in descriptions (grep the pushed `descriptionHtml`)
- [ ] Single-product collections reviewed — one item under a top-level category
      looks broken
- [ ] Any normalisation documented, so the client is not surprised that filtering
      by one colour returns several vendor shades
- [ ] Products the source data categorised contradictorily listed for the client

## Commerce — the client's call, and the usual blockers

- [ ] Payments live for the store's country
- [ ] **Tax matches how prices were imported.** Verify on a real checkout page
      with a real product, not in the settings screen. If the feed was
      VAT-inclusive and Shopify is not set to match, every price inflates at
      checkout
- [ ] Shipping rates exist, and any free-shipping promise in the site copy is a
      real rule. Grep the locale files for the number
- [ ] Inventory tracking decided deliberately. Untracked means nothing ever shows
      out of stock and overselling is possible — fine for made-to-order, wrong
      for stocked goods
- [ ] Compare-at prices are real previous prices, confirmed by the client
- [ ] **A real order placed end to end and refunded.** Nothing else tests
      payments, tax, shipping and the checkout handoff together

## One shopfront, not two

- [ ] Domain connected to the Astro site
- [ ] Shopify's **Online Store** channel removed or password-protected, or the
      Shopify theme competes with the real site for the same Google results
- [ ] Checkout branding (logo, accent colour) set, so the handoff does not look
      like a different company
- [ ] `sitemap.xml` contains the shop, collection and product URLs in every locale

## Legal

- [ ] Terms, privacy, returns and shipping policies published and linked
- [ ] Cookie consent before any analytics fires
- [ ] Company registration details in the footer as the jurisdiction requires
- [ ] **No fabricated reviews or testimonials.** Inventing them breaches EU
      consumer-protection rules

## The pages themselves

- [ ] Shop, a collection, a product, the cart and a search with no results all
      load without console errors
- [ ] No horizontal scroll at 375px on any of them
- [ ] Add to cart works **with JavaScript disabled** (it posts a form; that is
      the point of the design)
- [ ] Lighthouse run against the deployed URL, not localhost
