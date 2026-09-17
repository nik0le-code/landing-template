# commerce

The storefront: product listing with filters, collections, product pages, cart
drawer, checkout, order confirmation and the storefront motion. It has no data of
its own; a **backend module** supplies it.

```ts
// modules.config.ts
modules: { commerce: true, woocommerce: true },   // or shopify: true (exactly one)
options: {
  commerce: { basePath: "shop", cartPath: "cart", countries: ["GR", "CY"],
    paymentInstructions: { bacs: { el: "IBAN GR…", en: "IBAN GR…" } } },
},
```

| | Shopify | WooCommerce |
|---|---|---|
| Data source | Storefront API | Store API of a headless WordPress |
| Credentials | Storefront token (public or private) | none (public API) |
| Filters | Search & Discovery app filters | product attributes, stock, price |
| Checkout | Shopify's hosted checkout | on this site (`/[lang]/cart/checkout`), offline gateways |
| Order page | Shopify's | `/[lang]/cart/order/[id]` |
| Cache purge | `/api/shopify/webhook` | `/api/woocommerce/webhook` |

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

Create a module that `dependsOn: ["commerce"]`, implements `CommerceProvider` and
registers it: `provides: { commerce: async () => (await import("./lib/provider")).myProvider }`.
Choose `checkout.kind`: `"hosted"` (return a URL) or `"native"` (address, shipping
rates, payment methods, place order, read order). Map money to major-unit strings
and give images a ready `srcset`.

## WooCommerce setup

1. WordPress + WooCommerce on its own (sub)domain, e.g. `shop-admin.client.gr`, with
   **pretty permalinks** (`/wp-json/` must work) and WooCommerce's "Coming soon" mode off.
2. Payments: offline gateways (Cash on delivery, Direct bank transfer) work as they
   are. Card payments use a **redirect gateway** (see below).
3. Shipping zones and methods as usual; the checkout shows whatever rates WooCommerce
   returns for the address.
4. `.env`: `WOOCOMMERCE_URL=https://shop-admin.client.gr` (also at build time, for the
   image CSP).
5. Webhooks: WooCommerce → Settings → Advanced → Webhooks, topics Product created /
   updated / deleted / restored, delivery URL `https://<site>/api/woocommerce/webhook`,
   and the same secret in `WOOCOMMERCE_WEBHOOK_SECRET`. Saving shows "Delivery URL
   returned response code: 403": that is WooCommerce's form-encoded ping being
   refused by Astro's origin check. It is harmless; real deliveries are JSON and pass.
6. Behind a proxy, WooCommerce's Store API rate limiting (off by default) needs its
   proxy support enabled, since every request comes from this server; the site sends
   `X-Forwarded-For` with the visitor's IP.

## Card payments: redirect gateways (Viva.com and others)

Gateways that send the shopper to their own payment page work with the native
checkout: Viva.com Smart Checkout, Greek bank gateways, PayPal. Gateways that embed
card fields in WooCommerce's own checkout (WooPayments, Stripe card elements) do not.

How a card payment flows:

1. The shopper places the order here; WooCommerce creates it as *pending* and returns
   the gateway's payment URL (often WordPress's order-pay step, which forwards to the
   gateway). The cart is **kept** until the payment is confirmed.
2. The shopper pays on the gateway's page (3-D Secure happens there).
3. The gateway returns to WordPress, and the **bridge plugin** sends the shopper to
   `https://<site>/commerce/return`, which clears the cart and shows the order page.
4. Declined or cancelled: the order page offers "try again" (same order) or another
   payment method (the cart is still there). Paid but not yet confirmed by the
   gateway's notification: the page shows "confirming" and re-checks for two minutes.

Choose what checkout offers in `modules.config.ts`, in display order:

```ts
woocommerce: { paymentMethods: ["viva", "epay", "cod", "bacs"] },
```

`viva` (Viva.com Smart Checkout) and `epay` (Piraeus Bank ePay Paycenter) are
shorthands; any other WooCommerce gateway id works too, and `[]` offers everything
WooCommerce enables. A listed method only appears once it is enabled with credentials
in WooCommerce (the admin dashboard lists the ones that aren't), and the server
rejects a method that isn't listed.

Setup:

1. Copy `src/modules/woocommerce/wordpress/commerce-headless-bridge.php` to
   `wp-content/mu-plugins/` and add `define( 'COMMERCE_SITE_URL', 'https://www.client.gr' );`
   to `wp-config.php`.
2. `WOOCOMMERCE_URL` must be set at build time: the checkout's form redirects to the
   WordPress origin, and the CSP `form-action` allows it from that variable.
3. Install and configure the gateway plugin in WordPress.

Viva.com (plugin "Viva.com | Smart Checkout for WooCommerce"):

- Demo first: create a demo account at demo.vivapayments.com, then in WooCommerce →
  Settings → Payments → Viva.com enable test mode and paste the demo Client ID,
  Client Secret and Source Code (Smart Checkout credentials).
- In the Viva dashboard, the payment source's success and failure URLs must point to
  WordPress: `https://<wordpress>/wc-api/wc_vivacom_smart_success` and
  `…/wc-api/wc_vivacom_smart_fail` (the plugin shows them).
- Viva confirms payments with a webhook to WordPress, so WordPress must be publicly
  reachable (a tunnel when testing locally). Until it arrives the order page shows
  "confirming".
- Its id is `vivacom_smart`; the checkout names it "Card, Apple Pay, Google Pay".

Piraeus Bank ePay Paycenter (plugin "Secure Card Gateway for ePay Paycenter"):

- Piraeus issues the credentials (Acquirer ID, Merchant ID, POS ID, username,
  password) after the e-commerce agreement, plus a test environment. Enter them in
  WooCommerce → Settings → Payments → ePay Paycenter.
- Give the bank the URLs the plugin's settings page lists (success, failure, cancel
  and the `?wc-api=epay_paycenter` callback, all on WordPress) and the server IP it
  shows; Piraeus whitelists both.
- If the plugin can't start a payment (wrong credentials, bank unreachable) it marks
  the order failed; the bridge sends the shopper back to the storefront's "payment not
  completed" page.
- Installments: the plugin reads the count from WooCommerce's own checkout form, so
  headless orders are single payments.
- Its id is `epay_paycenter`; the checkout names it "Card (Piraeus Bank)".

Gateways other than these show their id unless you add `commerce.paymentMethodLabels`.

Emails (order confirmation, bank details) are sent by WooCommerce itself; set them up
in WooCommerce → Settings → Emails.
