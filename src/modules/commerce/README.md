# commerce

The storefront: product listing with filters, collections, product pages, cart
drawer, checkout, order confirmation and the storefront motion. It has no data of
its own; a **backend module** supplies it.

It isn't switched on directly: a backend enables it.

```ts
// modules.config.ts
modules: { wordpress: true },                    // WooCommerce: wordpress + shop: true
// or:   { shopify: true },
options: {
  wordpress: { shop: true },
  commerce: { basePath: "shop", cartPath: "cart", countries: ["GR", "CY"],
    paymentInstructions: { bacs: { el: "IBAN GR…", en: "IBAN GR…" } } },
},
```

| | Shopify | WooCommerce |
|---|---|---|
| Enabled by | `shopify: true` | `wordpress: true` + `shop: true` |
| Data source | Storefront API | Store API of the site's WordPress |
| Credentials | Storefront token (public or private) | none (public API) |
| Filters | Search & Discovery app filters | product attributes, stock, price |
| Checkout | Shopify's hosted checkout | on this site (`/[lang]/cart/checkout`), offline gateways |
| Order page | Shopify's | `/[lang]/cart/order/[id]` |
| Cache purge | `/api/shopify/webhook` | `/api/wordpress/webhook` (headless bridge plugin) |

WooCommerce setup, WordPress plugins, payment gateways (Viva.com, Piraeus ePay):
[`src/modules/wordpress/README.md`](../wordpress/README.md).

## How it fits together

- Pages and components only use the types in `lib/types.ts`. `lib/provider.ts`
  finds the enabled backend through `provides.commerce`.
- The cart lives in the backend. The visitor holds its id/token in the httpOnly
  `commerce_cart` cookie; `commerce_cart_count` (readable) drives the header badge.
- Every cart form posts to `/[lang]/cart/update` without JavaScript and goes through
  `actions.commerce.cart` with it. Checkout is a plain form with in-place shipping
  refreshes.
- Catalogue pages are cached with the `commerce` tag; the backend's webhook purges it.

## Adding a backend

Create a module that `dependsOn: ["commerce"]` and `enables: [{ "module": "commerce" }]`, implements `CommerceProvider` and
registers it: `provides: { commerce: async () => (await import("./lib/provider")).myProvider }`.
Choose `checkout.kind`: `"hosted"` (return a URL) or `"native"` (address, shipping
rates, payment methods, place order, read order). Map money to major-unit strings
and give images a ready `srcset`.
