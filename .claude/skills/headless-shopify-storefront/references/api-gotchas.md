# Shopify API gotchas

Every entry below is something that actually failed, with the exact error text,
because that is what the next person will paste into a search box. Verified against Admin
API `2025-01`; the storefront side against `2025-07`.

**Before trusting any shape here, introspect.** Input types drift between
versions and the docs lag behind:

```bash
node scripts/shopify/admin-client.mjs introspect ProductSetInput
```

## Auth

### "Invalid API key or access token (unrecognized login or wrong password)"
Wrong token family. See `human-setup.md`. Only `shpat_` talks to the Admin API.

### "Service is not valid for authentication"
An `atkn_` app automation token against the store Admin API. It is valid, but
for the App Management service (`shopify app deploy` in CI).

### "Access denied for products field"
Token authenticates but lacks the scope. Confirm with the granted list:

```bash
curl -s https://<store>.myshopify.com/admin/oauth/access_scopes.json \
  -H "X-Shopify-Access-Token: $TOKEN"
```

Scopes are granted at install. Adding them in the app config does nothing until
a new version is released **and** the app is reinstalled.

### Storefront API returns `null` for every metafield
The definition lacks storefront visibility. Every definition needs:

```js
access: { storefront: 'PUBLIC_READ' }
```

This is the single most common cause of an empty filter UI when the Admin shows
the data correctly. Assert it after creating definitions rather than trusting it.

## Metaobjects

### "The name \"product_review\" is reserved for system use"
Some type names are reserved. Prefix or rename — `customer_review` works.

### "Base color can't be blank" / "Base pattern can't be blank"
Writing to Shopify's standard `shopify--color-pattern`. It requires
`color_taxonomy_reference` and `pattern_taxonomy_reference`, which are Shopify
taxonomy GIDs you would have to map your colour names onto. A custom definition
is simpler unless you specifically want Shopify's native theme filtering.

### Capability shape differs between create and upsert
```js
// metaobjectDefinitionCreate
capabilities: { publishable: { enabled: true } }
// metaobjectUpsert
capabilities: { publishable: { status: 'ACTIVE' } }
```

## Metafields

### "Validations require that you select a metaobject."
Using `metaobject_definition_type` for a `list.metaobject_reference`.
`metafieldDefinitionTypes` advertises it as supported, and it is rejected
anyway. Use the GID:

```js
validations: [{ name: 'metaobject_definition_id',
                value: 'gid://shopify/MetaobjectDefinition/123' }]
```

Resolve the GID at run time from the definition you just created, rather than
hard-coding it.

## Products

### `identifier` is a mutation argument, not an input field
```graphql
mutation($identifier: ProductSetIdentifiers!, $input: ProductSetInput!) {
  productSet(identifier: $identifier, input: $input, synchronous: true) { ... }
}
```
`productSet` keyed on `{ handle }` is the idempotent create-or-update, and
handles options, variants and metafields in one call.

### List metafields are JSON-encoded strings
```js
{ namespace: 'custom', key: 'color', type: 'list.metaobject_reference',
  value: JSON.stringify([gid1, gid2]) }
```

### "Could not coerce value {huge:…} to String"
A feed field that is an object where the API wants a string. Normalise in the
ETL and have the validator reject non-string image values.

## Images

### Media shows `fileStatus: FAILED`, error "Unsuccessful HTTP response code: 403"
The source host blocks Shopify's fetcher while serving browsers fine. Download
the bytes yourself and upload via `stagedUploadsCreate` → POST → `fileCreate`,
then reference the CDN URL. Keep a set of known-blocked hosts.

Media processing is asynchronous: `image.url` is `null` until `fileStatus` is
`READY`. Poll before assuming success — `productSet` returning cleanly does not
mean the images landed.

### Only some products have images
Check `media { ... mediaErrors { details } }` in the Admin API. Per-product
media failures do not fail the mutation.

## Collections

### Collections exist in Admin but the Storefront API returns none
They were never published. Products and collections both need:

```graphql
publishablePublish(id: $id, input: [{ publicationId: ... }])
```

Publish to every publication from `{ publications(first: 25) { nodes { id } } }`,
including the headless channel.

### No native nesting
Shopify collections are flat. Express a tree with a `custom.parent` collection
metafield holding the parent handle, plus `custom.sort` for ordering, and
rebuild the tree on the client.

## Discounts

Only **one automatic discount applies per order**. Per-product percentages
cannot be expressed as automatic discounts — a two-item cart gets the discount
on one item. For per-product sale pricing use `compareAtPrice`, which is
Shopify's native sale mechanism and has no stacking limit.

## Throttling

The Admin API uses a leaky bucket. Read `extensions.cost.throttleStatus` and
back off when `currentlyAvailable` drops low; retry `THROTTLED` with
exponential backoff. `scripts/shopify/admin-client.mjs` does both.

## userErrors

Shopify returns many failures as HTTP 200 with a populated `userErrors` array.
A client that only checks HTTP status reports success on a failed write. Walk
the whole response for `userErrors` and throw — `collectUserErrors` in
`scripts/shopify/admin-client.mjs`.

## The landing-template

### The shop works in `npm run dev` and 503s in `npm run preview`
`.env` is loaded by Vite, which only runs in dev. The production server
(`node server.mjs`) reads the real process environment and nothing else, so
`getSecret("SHOPIFY_STORE_DOMAIN")` comes back undefined and the module reports
itself unconfigured.

```bash
node --env-file=.env server.mjs        # local preview
```

On a real host, set them as environment variables. Same trap for `SITE_URL`.

### Every webhook delivery is a 401 and nothing says why
Two different secrets, depending on who created the subscription:

| Created by | Signed with |
|---|---|
| `npm run shopify:webhooks` (the app, via Admin API) | the app's **client secret** |
| Settings → Notifications → Webhooks (the merchant) | the secret printed on that page |

`verifyWebhook` compares HMACs and returns 401 with no detail, by design, so the
symptom is only that the site serves a stale catalogue. Check which route created
the subscription before changing anything else.

### The shop route 404s
`basePath` collides with a real page. `src/pages/[lang]/shop.astro` beats the
module's generated route, and so does the `catalog` module's `basePath` if both
are on. `npm run shopify:verify` checks both.

### Filters render for a collection but not for "all products"
Shopify only returns `filters` on collection and search queries, not on the bare
`products` connection. `listProducts()` returns `filters: []` for that reason.
Give the shop a collection to land on, or accept sort-only on the index.

### Adding to the cart returns "unavailable"
`resolveMerchandiseId` needs either a real `merchandiseId`
(`gid://shopify/ProductVariant/…`) or **both** `handle` and a complete
`options[]` set. A `handle` with no options resolves to null and the visitor sees
the unavailable message. Relevant when you post to `/cart/update` from your own
code rather than `ProductForm`.

### mock.shop looks like a store and is not one
Demo mode is a real Storefront API — products, collections, cart and checkout all
work, and checkout lands on Shopify's demo store. What it cannot show you is
anything store-specific: your collections, your metafields, Markets pricing, or
webhooks. Never sign off a client store against it.

### Product edits take up to `cacheSeconds` to appear, with webhooks working
The page cache is per pod. Only the replica that received the webhook is purged;
the others expire normally. Expected behaviour on a multi-replica deployment.
