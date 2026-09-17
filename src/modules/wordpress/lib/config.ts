/**
 * WordPress connection, read at runtime. Only public APIs are used (REST API, the
 * WooCommerce Store API), so there are no API keys: the URL and the webhook secret
 * the headless bridge plugin signs change notifications with.
 */
import { getSecret } from "astro:env/server";
import { moduleOptions } from "@/modules/.generated/registry";
import { mergeOptions } from "@/modules/merge";
import { wordpressDefaults, type WordPressOptions } from "../options";

export interface WordPressConfig {
  /** WordPress origin + path, no trailing slash, e.g. https://cms.client.gr */
  url: string;
  restApi: string;
  storeApi: string;
  webhookSecret: string;
}

let cached: WordPressConfig | null | undefined;

export function wordpressConfig(): WordPressConfig | null {
  if (cached !== undefined) return cached;
  // WOOCOMMERCE_* are the names used before the wordpress module existed.
  const url = (getSecret("WORDPRESS_URL") ?? getSecret("WOOCOMMERCE_URL") ?? "").trim().replace(/\/+$/, "");
  cached = url
    ? {
        url,
        restApi: `${url}/wp-json/wp/v2`,
        storeApi: `${url}/wp-json/wc/store/v1`,
        webhookSecret: (getSecret("WORDPRESS_WEBHOOK_SECRET") ?? getSecret("WOOCOMMERCE_WEBHOOK_SECRET") ?? "").trim(),
      }
    : null;
  return cached;
}

/** Options merged over defaults, nested objects included (`content: { pages: false }` keeps posts on). */
export const wordpressOptions = (): WordPressOptions =>
  mergeOptions(wordpressDefaults as unknown as Record<string, unknown>, moduleOptions.wordpress) as unknown as WordPressOptions;

/** Called when WordPress reports a change, so modules can drop in-memory lookups too. */
const changeListeners = new Set<() => void>();
export const onWordPressChange = (listener: () => void) => changeListeners.add(listener);
export const notifyWordPressChange = () => changeListeners.forEach((listener) => listener());
