/** `modules.config.ts` → `options: { commerce: { … } }` */
export interface CommerceOptions {
  /**
   * URL segment for products: /[lang]/<basePath>/<handle>. Must not clash with a
   * page in src/pages/[lang]/ or with the catalog module's basePath.
   */
  basePath: string;
  /** URL segment for the cart and checkout: /[lang]/<cartPath>. */
  cartPath: string;
  /** Products per listing page. */
  pageSize: number;
  /** Collection handle shown on the home page; empty = best sellers. */
  featuredCollection: string;
  /** Products shown on the home page (0 hides the section). */
  featuredOnHome: number;
  /** Seconds a rendered product/collection page is served from cache before revalidating. */
  cacheSeconds: number;
  /** Native checkout: ISO countries the shipping address may use (first = default). */
  countries: string[];
  /**
   * Native checkout: text shown on the order confirmation per payment method id,
   * e.g. `{ bacs: { el: "IBAN GR…", en: "IBAN GR…" } }`. Overrides the defaults.
   */
  paymentInstructions: Record<string, Partial<Record<"el" | "en" | (string & {}), string>>>;
  /**
   * Native checkout: names and descriptions for payment method ids the built-in
   * translations don't cover, e.g. `{ my_gateway: { title: { el: "Κάρτα", en: "Card" } } }`.
   */
  paymentMethodLabels: Record<string, { title?: Partial<Record<string, string>>; description?: Partial<Record<string, string>> }>;
}

export const commerceDefaults: CommerceOptions = {
  basePath: "shop", // keep in sync with optionDefaults in module.json
  cartPath: "cart",
  pageSize: 24,
  featuredCollection: "",
  featuredOnHome: 4,
  cacheSeconds: 300,
  countries: ["GR", "CY"],
  paymentInstructions: {},
  paymentMethodLabels: {},
};

export const SORT_OPTIONS = ["featured", "best-selling", "newest", "price-asc", "price-desc", "title"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

declare module "@/modules/types" {
  interface ModuleOptionsMap {
    commerce: CommerceOptions;
  }
}
