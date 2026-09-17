/**
 * WooCommerce webhooks (Product created/updated/deleted, …): verify the signature
 * and drop cached storefront pages and lookups so changes show up immediately.
 *
 * The page cache is in memory per pod, so with several replicas only the pod that
 * receives the webhook is purged; the rest catch up within `cacheSeconds`.
 */
import type { APIRoute } from "astro";
import { COMMERCE_CACHE_TAG } from "@/modules/commerce/lib/products";
import { wooConfig } from "../lib/config";
import { clearLookups } from "../lib/provider";
import { verifyWebhook } from "../lib/webhook";

export const prerender = false;

export const POST: APIRoute = async ({ request, cache }) => {
  const secret = wooConfig()?.webhookSecret ?? "";
  const body = await request.text();
  // WooCommerce pings a new webhook with `webhook_id=<n>` and expects a 2xx; it changes nothing.
  if (/^webhook_id=\d+$/.test(body.trim())) return new Response(null, { status: 204 });
  if (!secret) {
    console.warn("[woocommerce] webhook received but WOOCOMMERCE_WEBHOOK_SECRET is not set; ignoring it.");
    return new Response("Webhook secret not configured", { status: 401 });
  }
  if (!verifyWebhook(body, request.headers.get("x-wc-webhook-signature"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }
  clearLookups();
  await cache.invalidate({ tags: [COMMERCE_CACHE_TAG, "sitemap"] });
  return new Response(null, { status: 204 });
};
