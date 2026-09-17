# Shopify scripts

Everything here runs **outside** the site, at import time. Nothing in `src/`
imports it, and nothing here is needed to serve the shop.

| Command | Does | Needs |
|---|---|---|
| `npm run shopify:verify` | Asks the Storefront API what the *site* can see: module switch, tokens, product and collection counts, webhook secret. The gate that matters. | Storefront token |
| `npm run shopify:oauth` | One browser click gets an Admin token into `.env`. | app client id + secret |
| `npm run shopify:preflight` | Scopes, channels, store totals. Run before any push. | Admin token |
| `npm run shopify:push` | Writes `data/catalog.json` into Shopify. Idempotent, keyed on handle. | Admin token |
| `npm run shopify:webhooks` | Registers the cache-invalidation webhooks. | Admin token + public `SITE_URL` |

```bash
npm run shopify:push -- --dry-run          # validate, print the plan, write nothing
npm run shopify:push -- --limit=5          # smoke test on five products
npm run shopify:push -- --only=collections
npm run shopify:push -- --skip-images      # re-run without re-uploading media
npm run shopify:webhooks -- --list
node scripts/shopify/admin-client.mjs introspect ProductSetInput
```

## Two APIs, two jobs

**Storefront API** — read-only, public-ish, used by the running site through
`src/modules/shopify/lib/client.ts`. It cannot create a product no matter which
scopes are ticked; that is a property of the API, not a permission.

**Admin API** — read/write, used only here. `SHOPIFY_ADMIN_TOKEN` can rewrite the
entire catalogue, so it stays in your local `.env` and never reaches the server.

## The import format

`data/catalog.json`, documented and validated in `catalog.mjs`. Write one
normaliser per source that emits this shape, keep it in `scripts/shopify/import/`,
and unit-test it with `node --test` — it needs no credentials, so it is the part
you can finish while the client is still hunting for their Shopify password.

`data/` is gitignored. Commit the raw source feeds if they matter.

## The trap that costs the most time

A product can be Active, correct in the Admin, and invisible to the site because
it was never published to the **Headless** sales channel. `push.mjs` publishes
everything it writes, and `verify.mjs` counts what the storefront actually
returns, which is why the two exist separately.
