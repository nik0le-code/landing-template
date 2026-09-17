/** `modules.config.ts` → `options: { shopify: { … } }` (paths and listing options live under `commerce`). */
export interface ShopifyOptions {
  /**
   * ISO country for contextual pricing, currency and availability (Shopify Markets),
   * e.g. "GR". Empty = the store's default market.
   */
  country: string;
}

export const shopifyDefaults: ShopifyOptions = { country: "" };

declare module "@/modules/types" {
  interface ModuleOptionsMap {
    shopify: ShopifyOptions;
  }
}
