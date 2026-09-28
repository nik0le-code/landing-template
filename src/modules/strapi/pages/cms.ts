/**
 * Strapi on the site's own domain: /cms/<path> is passed to STRAPI_URL/<path>, the way
 * Traefik routes it in the cluster (there this route never sees a request). Makes
 * <site>/cms/admin work locally and on any host without a CMS-aware proxy in front.
 */
import type { APIRoute } from "astro";
import { strapiConfig } from "../lib/config";

export const prerender = false;

// Hop-by-hop, or recomputed for the new body (fetch decompresses what it reads).
const DROP_REQUEST = new Set(["host", "connection", "content-length", "accept-encoding", "transfer-encoding"]);
const DROP_RESPONSE = new Set(["connection", "content-encoding", "content-length", "transfer-encoding", "keep-alive"]);

export const ALL: APIRoute = async ({ params, request, url, clientAddress }) => {
  const config = strapiConfig();
  if (!config) return new Response("Strapi is not configured: set STRAPI_URL.", { status: 503 });
  if (!params.path) return new Response(null, { status: 404 });

  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!DROP_REQUEST.has(name)) headers.set(name, value);
  });
  // Strapi rate-limits logins per client IP: pass the visitor's, not this server's.
  headers.set("X-Forwarded-For", [request.headers.get("x-forwarded-for"), clientAddress].filter(Boolean).join(", "));
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
  headers.set("X-Forwarded-Prefix", "/cms");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(`${config.url}/${params.path}${url.search}`, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
    // Streams the upload through instead of buffering it.
    ...(hasBody && { duplex: "half" }),
  }).catch(() => null);
  if (!upstream) return new Response("Strapi is not reachable.", { status: 502 });

  const out = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!DROP_RESPONSE.has(name) && name !== "set-cookie") out.set(name, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
  // Strapi redirects to its own paths (/admin/…): keep them under /cms.
  const location = out.get("location");
  if (location?.startsWith("/") && !location.startsWith("/cms/")) out.set("location", `/cms${location}`);
  return new Response(upstream.body, { status: upstream.status, headers: out });
};
