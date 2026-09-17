import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifies WooCommerce's `X-WC-Webhook-Signature` (base64 HMAC-SHA256 of the raw body). */
export function verifyWebhook(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"));
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
