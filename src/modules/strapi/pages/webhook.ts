/**
 * Change notifications from Strapi (strapi/src/index.js: any write to content or media).
 * Verifies the signature, then drops cached pages so the change shows up immediately.
 *
 * The page cache is in memory per pod, so with several replicas only the pod that
 * receives the notification is purged; the rest catch up within `cacheSeconds`.
 */
import type { APIRoute } from "astro";
import { strapiConfig } from "../lib/config";
import { STRAPI_CACHE_TAG } from "../lib/content";
import { verifySignature } from "../lib/webhook";

export const prerender = false;

export const POST: APIRoute = async ({ request, cache }) => {
  const secret = strapiConfig()?.webhookSecret ?? "";
  const body = await request.text();
  if (!secret) {
    console.warn("[strapi] change notification received but STRAPI_WEBHOOK_SECRET is not set; ignoring it.");
    return new Response("Webhook secret not configured", { status: 401 });
  }
  if (!verifySignature(body, request.headers.get("x-headless-signature"), secret)) return new Response("Invalid signature", { status: 401 });

  await cache.invalidate({ tags: [STRAPI_CACHE_TAG, "sitemap"] });
  return new Response(null, { status: 204 });
};
