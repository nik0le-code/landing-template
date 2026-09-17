/**
 * Minimal Storefront API client: timeout, retries on throttling (HTTP 429/5xx and
 * GraphQL THROTTLED), buyer-IP forwarding for private tokens, and `@inContext`
 * variables (country + language) filled in for every operation.
 */
import type { Locale } from "@site-config";
import { getModuleOptions } from "@/modules/registry";
import { shopifyDefaults } from "../options";
import { storefrontConfig } from "./config";

export class ShopifyError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "ShopifyError";
  }
}

export interface StorefrontRequest {
  query: string;
  variables?: Record<string, unknown>;
  lang: Locale;
  /** Visitor IP, forwarded with the private token so rate limits apply per buyer. */
  buyerIp?: string;
}

const TIMEOUT_MS = 10_000;
const RETRIES = 2;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const backoff = (attempt: number) => 400 * 2 ** attempt + Math.random() * 200;

export const isShopifyConfigured = () => storefrontConfig() !== null;

export async function storefront<T>({ query, variables = {}, lang, buyerIp }: StorefrontRequest): Promise<T> {
  const config = storefrontConfig();
  if (!config) throw new ShopifyError("Shopify is not configured: set SHOPIFY_STORE_DOMAIN and a Storefront token.", 503);

  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (config.privateToken) {
    headers["Shopify-Storefront-Private-Token"] = config.privateToken;
    if (buyerIp) headers["Shopify-Storefront-Buyer-IP"] = buyerIp;
  } else if (config.publicToken) {
    headers["X-Shopify-Storefront-Access-Token"] = config.publicToken;
  }

  const { country } = getModuleOptions("shopify", shopifyDefaults);
  const body = JSON.stringify({
    query,
    variables: { ...variables, language: lang.toUpperCase(), ...(country && { country: country.toUpperCase() }) },
  });

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(config.endpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      if (attempt < RETRIES) {
        await sleep(backoff(attempt));
        continue;
      }
      throw new ShopifyError(`Shopify request failed: ${error instanceof Error ? error.message : String(error)}`, 503);
    }

    if ((response.status === 429 || response.status >= 500) && attempt < RETRIES) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
      continue;
    }
    if (!response.ok) {
      throw new ShopifyError(`Shopify HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`, response.status);
    }

    const json = (await response.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
    if (json.errors?.length) {
      if (json.errors.some((e) => e.extensions?.code === "THROTTLED") && attempt < RETRIES) {
        await sleep(backoff(attempt));
        continue;
      }
      throw new ShopifyError(`Shopify GraphQL: ${json.errors.map((e) => e.message).join("; ")}`, 502);
    }
    if (!json.data) throw new ShopifyError("Shopify returned no data.", 502);
    return json.data;
  }
}

/** Declares the `@inContext` variables every operation receives from `storefront()`. */
export const CONTEXT_VARIABLES = "$country: CountryCode, $language: LanguageCode";
export const IN_CONTEXT = "@inContext(country: $country, language: $language)";
