/**
 * Storefront API credentials, read at runtime (one image serves staging and
 * production). The variables are documented in .env.example; they are read with
 * `getSecret` so the core env schema doesn't need to know about this module.
 */
import { getSecret } from "astro:env/server";

/** Shopify's public demo store, used in development when no store is configured. */
const MOCK_SHOP = "mock.shop";

function normalizeDomain(raw: string | undefined): string {
  const domain = (raw ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  // "my-store" → "my-store.myshopify.com"
  return domain && !domain.includes(".") ? `${domain}.myshopify.com` : domain;
}

export interface StorefrontConfig {
  domain: string;
  endpoint: string;
  apiVersion: string;
  /** Public Storefront token (headless channel). */
  publicToken: string;
  /** Private Storefront token: server-only, higher rate limits with buyer IP forwarding. */
  privateToken: string;
  webhookSecret: string;
  isMock: boolean;
}

let cached: StorefrontConfig | null | undefined;

/** null when the store isn't configured (production without SHOPIFY_STORE_DOMAIN). */
export function storefrontConfig(): StorefrontConfig | null {
  if (cached !== undefined) return cached;
  const domain = normalizeDomain(getSecret("SHOPIFY_STORE_DOMAIN")) || (import.meta.env.DEV ? MOCK_SHOP : "");
  const apiVersion = getSecret("SHOPIFY_API_VERSION")?.trim() || "2025-07";
  const isMock = domain === MOCK_SHOP;
  cached = domain
    ? {
        domain,
        endpoint: isMock ? `https://${MOCK_SHOP}/api` : `https://${domain}/api/${apiVersion}/graphql.json`,
        apiVersion,
        publicToken: getSecret("SHOPIFY_STOREFRONT_TOKEN")?.trim() ?? "",
        privateToken: getSecret("SHOPIFY_STOREFRONT_PRIVATE_TOKEN")?.trim() ?? "",
        webhookSecret: getSecret("SHOPIFY_WEBHOOK_SECRET")?.trim() ?? "",
        isMock,
      }
    : null;
  if (cached && !cached.isMock && !cached.publicToken && !cached.privateToken) {
    console.warn("[shopify] SHOPIFY_STORE_DOMAIN is set but neither SHOPIFY_STOREFRONT_TOKEN nor SHOPIFY_STOREFRONT_PRIVATE_TOKEN is.");
  }
  return cached;
}
