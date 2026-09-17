/** `modules.config.ts` → `options: { shopify: { … } }` */
export interface ShopifyOptions {
  /**
   * URL segment for products: /[lang]/<basePath>/<handle>. Must not clash with a
   * page in src/pages/[lang]/ or with the catalog module's basePath.
   */
  basePath: string;
  /** URL segment for the cart: /[lang]/<cartPath>. */
  cartPath: string;
  /** Products per listing page (Shopify allows up to 250; keep it small). */
  pageSize: number;
  /**
   * ISO country for contextual pricing, currency and availability (Shopify Markets),
   * e.g. "GR". Empty = the store's default market.
   */
  country: string;
  /** Collection handle shown on the home page; empty = best sellers. */
  featuredCollection: string;
  /** Products shown on the home page (0 hides the section). */
  featuredOnHome: number;
  /** Seconds a rendered product/collection page is served from cache before revalidating. */
  cacheSeconds: number;
}

export const shopifyDefaults: ShopifyOptions = {
  basePath: "shop", // keep in sync with optionDefaults in module.json
  cartPath: "cart",
  pageSize: 24,
  country: "",
  featuredCollection: "",
  featuredOnHome: 4,
  cacheSeconds: 300,
};

export const SORT_OPTIONS = ["featured", "best-selling", "newest", "price-asc", "price-desc", "title"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

declare module "@/modules/types" {
  interface ModuleOptionsMap {
    shopify: ShopifyOptions;
  }
}
