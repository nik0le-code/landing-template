/** `modules.config.ts` → `options: { woocommerce: { … } }` (paths and listing options live under `commerce`). */
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

export interface WooCommerceOptions {
  /**
   * Payment methods offered at checkout, in this order, e.g. `["viva", "epay", "cod"]`.
   * Each must also be enabled (with credentials) in WooCommerce; methods WooCommerce
   * reports as unavailable are left out. Empty = every method WooCommerce enables.
   */
  paymentMethods: PaymentMethodName[];
  /** Attribute taxonomies offered as filters (e.g. ["pa_color", "pa_size"]); empty = all. */
  filterAttributes: string[];
  /** Offer an "in stock" filter. */
  stockFilter: boolean;
  /** Seconds categories and attribute terms are kept in memory (webhooks clear them sooner). */
  lookupCacheSeconds: number;
}

export const wooDefaults: WooCommerceOptions = {
  paymentMethods: [],
  filterAttributes: [],
  stockFilter: true,
  lookupCacheSeconds: 300,
};

declare module "@/modules/types" {
  interface ModuleOptionsMap {
    woocommerce: WooCommerceOptions;
  }
}
