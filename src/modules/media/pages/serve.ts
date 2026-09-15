/**
 * Serves stored variants: /media/<uuid>/<width>.<ext>. Keys are unique per upload
 * and never change, so responses are cacheable forever.
 */
import type { APIRoute } from "astro";
import { storage } from "../lib/storage";

const KEY = /^[0-9a-f-]{36}\/\d{1,5}\.(avif|webp|jpg|png)$/;
const TYPES: Record<string, string> = { avif: "image/avif", webp: "image/webp", jpg: "image/jpeg", png: "image/png" };

export const GET: APIRoute = async ({ params, request }) => {
  const key = params.path ?? "";
  const match = KEY.exec(key);
  if (!match) return new Response(null, { status: 404 });

  const file = await storage.get(key);
  if (!file) return new Response(null, { status: 404 });

  const etag = `"${file.bytes.toString(16)}-${file.modifiedAt.getTime().toString(16)}"`;
  const headers = {
    ETag: etag,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
  };

  if (request.headers.get("if-none-match") === etag) {
    await file.body.cancel();
    return new Response(null, { status: 304, headers });
  }

  return new Response(file.body, {
    headers: { ...headers, "Content-Type": TYPES[match[1]!]!, "Content-Length": String(file.bytes) },
  });
};
