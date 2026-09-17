import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifies a base64 HMAC-SHA256 of the raw body (headless bridge and WooCommerce use the same scheme). */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"));
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
