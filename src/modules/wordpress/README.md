# wordpress

WordPress as the site's backend, edited in wp-admin and shown with this site's design:

- **Content:** posts (list, categories, post pages, RSS, latest posts on the home
  page) and pages, in every language through Polylang, with SEO, hreflang, sitemap
  entries, and the cache cleared the moment something is published.
- **Plugins:** anything niche (payment gateways, invoicing, ERP or courier sync,
  forms, SEO) is a WordPress plugin listed in config and configured in wp-admin.
- **Shop (optional):** WooCommerce behind the `commerce` storefront, with checkout on
  this site.

```ts
// modules.config.ts
modules: { wordpress: true },
options: {
  wordpress: {
    shop: false,                              // true: WooCommerce storefront (commerce + woocommerce)
    content: { posts: true, pages: true },    // false for a WordPress used only for plugins
    postsPath: "blog",                        // posts at /[lang]/blog (don't enable the blog module too)
    postsPerPage: 9,
    latestOnHome: 3,
    plugins: ["wordpress-seo"],               // see "Plugins"
    paymentMethods: ["viva", "epay", "cod"],  // shop only
  },
},
```

## Local development

```bash
npm run wp:up -- --demo     # WordPress on :8088 (admin / admin), demo posts/pages (and shop)
npm run dev                 # WORDPRESS_URL and WORDPRESS_WEBHOOK_SECRET in .env (wp:up prints them)
npm run wp:down             # stop (-- --volumes deletes the data)
```

`wp:up` installs WordPress, the headless bridge, the plugins the options need
(WooCommerce with `shop`, Polylang with content in more than one language) and
everything in `plugins`. It sets permalinks that mirror the site's paths and Polylang
languages from `site.config.ts`.

The dev server doesn't cache pages, so publishing shows up on reload. To see cache
invalidation locally, run the production build (`npm run build && npm start`).

## Content

| WordPress | Site |
|---|---|
| Post `welcome` (English) | `/en/blog/welcome` |
| Category `news` | `/en/blog/category/news` |
| Page `about/team` | `/en/about/team` |
| Polylang translations | hreflang alternates, language switcher, sitemap |
| Featured image | cover, Open Graph image (all sizes WordPress generated) |
| Yoast SEO title/description/noindex (if installed) | page SEO |
| Links to posts/pages in content | rewritten to site paths |

- **Routing:** WordPress pages are the lowest-priority route. Pages in `src/pages/`
  and module routes always win, so hand-built pages (home, services…) stay in code and
  WordPress fills in the rest. WooCommerce's own pages (cart, checkout, account) are
  never rendered.
- **Permalinks** must mirror the site: posts `/<postsPath>/%postname%/`, category base
  `<postsPath>/category`, Polylang with language directories and the default language
  hidden. `wp:up` sets all of this; set the same on a server.
- **Blocks:** common block markup (images, columns, galleries, buttons, embeds,
  quotes) is styled with the site's tokens (`components/wp-content.css`). The HTML is
  editor-authored; the CSP blocks scripts in it, and embeds need their host in
  `frame-src`.
- **Menus** stay in `src/config/navigation.ts`; the posts link is added automatically.

## Plugins

```ts
wordpress: {
  plugins: [
    "wordpress-seo",                                               // wordpress.org, latest
    "woocommerce-pdf-invoices-packing-slips@3.9.0",                // pinned version
    { slug: "bank-gateway", zip: "wordpress-plugins/bank.zip" },   // zip from a bank/vendor
    { slug: "some-plugin", activate: false },                     // install only
  ],
},
```

```bash
npm run wp:plugins                                                          # local Docker WordPress
npm run wp:plugins -- --ssh deploy@cms.client.gr:/var/www/wordpress         # a server (needs WP-CLI there)
npm run wp:plugins -- --force                                               # reinstall zip plugins
npm run wp:plugins -- --prune                                               # remove plugins not in the list
npm run wp -- plugin list                                                   # any WP-CLI command (also --ssh)
```

It installs, pins and activates; settings stay in wp-admin (WordPress's database).
Plugins installed from wp-admin keep working; the sync only reports them until they
are added to the list (and `--prune` would remove them). Don't edit plugin code in
wp-admin: updates overwrite it. Put custom code in a small plugin zip instead.

## Production

1. WordPress on its own (sub)domain, e.g. `cms.client.gr`, with pretty permalinks as
   above. With `shop`: WooCommerce's "Coming soon" mode off.
2. Copy `wordpress/headless-bridge.php` to `wp-content/mu-plugins/` and add to
   `wp-config.php`:
   ```php
   define( 'HEADLESS_SITE_URL', 'https://www.client.gr' );
   define( 'HEADLESS_WEBHOOK_SECRET', '…' );   // same value as WORDPRESS_WEBHOOK_SECRET
   ```
   (`HEADLESS_WEBHOOK_URL` only when WordPress reaches the site at a private address.)
3. `.env` of the site: `WORDPRESS_URL=https://cms.client.gr` (also at build time, for
   the CSP) and `WORDPRESS_WEBHOOK_SECRET`. `WORDPRESS_MEDIA_URL` when uploads are
   served from another origin (CDN).
4. `npm run wp:plugins -- --ssh …`, then configure plugins in wp-admin.
5. Keep WordPress's own front end out of search engines (Settings → Reading →
   discourage indexing, or a redirect to the site): the site is the public front.

The bridge sends one signed notification per change (publish, update, trash, terms,
products, stock); the site clears its page cache and sitemap. The cache is in memory
per pod: with several replicas only the pod that receives it is purged at once, the
rest within `cacheSeconds`.

## Shop (`shop: true`)

The storefront itself is documented in [`commerce`](../commerce/README.md).

- Payments: offline gateways (Cash on delivery, Direct bank transfer) work as they
  are. Card payments use a redirect gateway (below).
- Shipping zones and methods as usual; the checkout shows whatever rates WooCommerce
  returns for the address.
- Emails (order confirmation, bank details) are sent by WooCommerce itself
  (WooCommerce → Settings → Emails).
- Behind a proxy, WooCommerce's Store API rate limiting (off by default) needs its
  proxy support enabled, since every request comes from this server; the site sends
  `X-Forwarded-For` with the visitor's IP.
- WooCommerce's own webhooks aren't needed: the bridge already reports product and
  stock changes. (They still work at `/api/wordpress/webhook` with the same secret.)

### Card payments: redirect gateways (Viva.com and others)

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
wordpress: { shop: true, paymentMethods: ["viva", "epay", "cod", "bacs"] },
```

`viva` (Viva.com Smart Checkout) and `epay` (Piraeus Bank ePay Paycenter) are
shorthands; any other WooCommerce gateway id works too, and `[]` offers everything
WooCommerce enables. A listed method only appears once it is enabled with credentials
in WooCommerce (the admin dashboard lists the ones that aren't), and the server
rejects a method that isn't listed.

Setup: the headless bridge plugin (see Production) handles the return to the site.
List the gateway plugin in `plugins`, then configure it in wp-admin.
`WORDPRESS_URL` must be set at build time: the checkout's form redirects to the
WordPress origin, and the CSP `form-action` allows it from that variable.

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
