/**
 * WooCommerce connection, read at runtime. Only the public Store API is used, so
 * there are no API keys: the WordPress URL and (optionally) the webhook secret.
 */
import { getSecret } from "astro:env/server";

export interface WooConfig {
  /** WordPress origin + path, no trailing slash, e.g. https://shop-admin.client.gr */
  url: string;
  storeApi: string;
  webhookSecret: string;
}

let cached: WooConfig | null | undefined;

export function wooConfig(): WooConfig | null {
  if (cached !== undefined) return cached;
  const url = (getSecret("WOOCOMMERCE_URL") ?? "").trim().replace(/\/+$/, "");
  cached = url
    ? { url, storeApi: `${url}/wp-json/wc/store/v1`, webhookSecret: getSecret("WOOCOMMERCE_WEBHOOK_SECRET")?.trim() ?? "" }
    : null;
  return cached;
}
