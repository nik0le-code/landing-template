/**
 * Change notifications from WordPress: the headless bridge (posts, pages, terms,
 * products, stock) and WooCommerce's own webhooks. Verifies the signature, then drops
 * cached pages and in-memory lookups so the change shows up immediately.
 *
 * The page cache is in memory per pod, so with several replicas only the pod that
 * receives the notification is purged; the rest catch up within `cacheSeconds`.
 */
import type { APIRoute } from "astro";
import { wordpressConfig, notifyWordPressChange } from "../lib/config";
import { WORDPRESS_CACHE_TAG } from "../lib/content";
import { verifySignature } from "../lib/webhook";

export const prerender = false;

export const POST: APIRoute = async ({ request, cache }) => {
  const secret = wordpressConfig()?.webhookSecret ?? "";
  const body = await request.text();
  // WooCommerce pings a new webhook with `webhook_id=<n>` and expects a 2xx; it changes nothing.
  if (/^webhook_id=\d+$/.test(body.trim())) return new Response(null, { status: 204 });
  if (!secret) {
    console.warn("[wordpress] change notification received but WORDPRESS_WEBHOOK_SECRET is not set; ignoring it.");
    return new Response("Webhook secret not configured", { status: 401 });
  }
  const signature = request.headers.get("x-headless-signature") ?? request.headers.get("x-wc-webhook-signature");
  if (!verifySignature(body, signature, secret)) return new Response("Invalid signature", { status: 401 });

  notifyWordPressChange();
  // "commerce" is only used when the shop is on; invalidating an unused tag is harmless.
  await cache.invalidate({ tags: [WORDPRESS_CACHE_TAG, "commerce", "sitemap"] });
  return new Response(null, { status: 204 });
};
