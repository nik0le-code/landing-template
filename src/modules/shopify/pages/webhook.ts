/**
 * Shopify webhooks (products/*, collections/*, inventory_levels/update): verify the
 * HMAC and drop cached storefront pages so changes show up immediately.
 *
 * The page cache is in memory per pod, so with several replicas only the pod that
 * receives the webhook is purged; the rest catch up within `cacheSeconds`.
 */
import type { APIRoute } from "astro";
import { storefrontConfig } from "../lib/config";
import { COMMERCE_CACHE_TAG } from "@/modules/commerce/lib/products";
import { verifyWebhook } from "../lib/webhook";

export const prerender = false;

export const POST: APIRoute = async ({ request, cache }) => {
  const secret = storefrontConfig()?.webhookSecret ?? "";
  const body = await request.text();
  if (!secret) {
    console.warn("[shopify] webhook received but SHOPIFY_WEBHOOK_SECRET is not set; ignoring it.");
    return new Response("Webhook secret not configured", { status: 401 });
  }
  if (!verifyWebhook(body, request.headers.get("x-shopify-hmac-sha256"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }
  await cache.invalidate({ tags: [COMMERCE_CACHE_TAG, "sitemap"] });
  return new Response(null, { status: 204 });
};
