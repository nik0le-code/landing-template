/** `modules.config.ts` → `options: { catalog: { … } }` */
export interface CatalogOptions {
  /**
   * URL segment: /[lang]/<basePath>/<item>. E.g. "products", "services", "menu".
   * Must not clash with a page in src/pages/[lang]/.
   */
  basePath: string;
  /** ISO 4217 currency for prices. */
  currency: string;
  /** Show prices publicly (false: only "Ask for a price"). */
  showPrices: boolean;
  /** Featured items shown on the home page (0 hides the section). */
  featuredOnHome: number;
}

export const catalogDefaults: CatalogOptions = {
  basePath: "products", // keep in sync with optionDefaults in module.json
  currency: "EUR",
  showPrices: true,
  featuredOnHome: 3,
};

export const AVAILABILITY = ["InStock", "OutOfStock", "PreOrder"] as const;
export type Availability = (typeof AVAILABILITY)[number];

declare module "@/modules/types" {
  interface ModuleOptionsMap {
    catalog: CatalogOptions;
  }
}
