/** `modules.config.ts` → `options: { wordpress: { … } }` */

/** Short names for gateways this template documents; any other WooCommerce gateway id works too. */
export const PAYMENT_ALIASES = {
  cod: "cod",
  bacs: "bacs",
  cheque: "cheque",
  /** Viva.com Smart Checkout ("Viva.com | Smart Checkout for WooCommerce"). */
  viva: "vivacom_smart",
  /** Piraeus Bank ePay Paycenter ("Secure Card Gateway for ePay Paycenter"). */
  epay: "epay_paycenter",
} as const;

export type PaymentMethodName = keyof typeof PAYMENT_ALIASES | (string & {});

/**
 * A WordPress plugin, installed and activated by `npm run wp:up` / `npm run wp:plugins`.
 * Configure it in wp-admin as usual.
 *
 *   "wordfence"                                                wordpress.org, latest
 *   "wordfence@8.0.1"                                          wordpress.org, pinned
 *   { slug: "bank-gateway", zip: "wordpress-plugins/bank.zip" } zip (repo path or https URL)
 *   { slug: "some-plugin", activate: false }                  install only
 */
export type WordPressPlugin = string | { slug: string; version?: string; zip?: string; activate?: boolean };

export interface WordPressOptions {
  /** The WooCommerce shop (switches on the commerce and woocommerce modules). */
  shop: boolean;
  /** Content written in wp-admin, rendered with this site's design. */
  content: {
    /** Posts at /[lang]/<postsPath> (list, categories, RSS, post pages). */
    posts: boolean;
    /** Pages at /[lang]/<page path>, for paths no page in src/pages/ or module owns. */
    pages: boolean;
    /**
     * The site's own pages (home, about… in src/config/editable-pages.ts) get editable
     * copy, lists and images in wp-admin; empty fields keep the code copy. Those pages
     * become server-rendered and cached while this is on.
     */
    sitePages: boolean;
  };
  /** URL segment for posts. Don't enable the blog module with the same path. */
  postsPath: string;
  postsPerPage: number;
  /** Latest posts on the home page (0 hides the section). */
  latestOnHome: number;
  /** Seconds rendered content pages are served from cache (publishing in wp-admin purges it sooner). */
  cacheSeconds: number;
  /**
   * WordPress plugins the site needs, for anything the site itself doesn't do (payment
   * gateways, invoicing, ERP/courier sync, forms…). WooCommerce (with `shop`), Polylang
   * (with content in more than one language) and Secure Custom Fields (with
   * `content.sitePages`) are added automatically.
   */
  plugins: WordPressPlugin[];

  // Shop only (`shop: true`)
  /**
   * Payment methods offered at checkout, in this order, e.g. `["viva", "epay", "cod"]`.
   * Each must be enabled (with credentials) in WooCommerce. Empty = all WooCommerce enables.
   */
  paymentMethods: PaymentMethodName[];
  /** Attribute taxonomies offered as shop filters (e.g. ["pa_color"]); empty = all. */
  filterAttributes: string[];
  /** Offer an "in stock" filter. */
  stockFilter: boolean;
  /** Seconds categories and attribute terms are kept in memory. */
  lookupCacheSeconds: number;
}

export const wordpressDefaults: WordPressOptions = {
  shop: false, // keep in sync with optionDefaults in module.json
  content: { posts: true, pages: true, sitePages: true },
  postsPath: "blog",
  postsPerPage: 9,
  latestOnHome: 3,
  cacheSeconds: 300,
  plugins: [],
  paymentMethods: [],
  filterAttributes: [],
  stockFilter: true,
  lookupCacheSeconds: 300,
};

declare module "@/modules/types" {
  interface ModuleOptionsMap {
    wordpress: WordPressOptions;
  }
}
