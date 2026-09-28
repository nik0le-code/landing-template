/**
 * Strapi's uploads on the site's own origin: /uploads/<file> is fetched from STRAPI_URL and
 * streamed back. Images then fall under the CSP's 'self' (no CMS origin baked in at build
 * time), Strapi's API can stay private, and a CDN in front of the site caches them too.
 * Strapi names every file with a content hash, so responses are cacheable forever.
 */
import type { APIRoute } from "astro";
import { strapiConfig } from "../lib/config";

export const prerender = false;

// Strapi's local provider: flat names like hero_50aee7aea0.jpg or small_hero_50aee7aea0.jpg.
const FILE = /^[\w.-]+\.(avif|webp|jpe?g|png|gif|pdf)$/i;

export const GET: APIRoute = async ({ params, request }) => {
  const file = params.path ?? "";
  const config = strapiConfig();
  if (!config || !FILE.test(file) || file.startsWith(".")) return new Response(null, { status: 404 });

  const upstream = await fetch(`${config.url}/uploads/${file}`, {
    headers: request.headers.get("if-none-match") ? { "If-None-Match": request.headers.get("if-none-match")! } : {},
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!upstream) return new Response(null, { status: 502 });
  if (upstream.status !== 200 && upstream.status !== 304) {
    await upstream.body?.cancel();
    return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
  }

  const headers = new Headers({
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
  });
  for (const name of ["Content-Type", "Content-Length", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.status === 304 ? null : upstream.body, { status: upstream.status, headers });
};
