import { NOINDEX, SITE_URL } from "astro:env/server";
import { siteConfig } from "@site-config";

/**
 * Canonical origin: SITE_URL env, falling back to site.config.ts `url`. Never
 * derived from the request Host header.
 *
 * Read at request time for server-rendered routes, but baked in at build time for
 * prerendered pages — so keep `siteConfig.url` set to the production origin.
 */
export function getSiteUrl(): string {
  return (SITE_URL || siteConfig.url).replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${getSiteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * True on staging/preview deployments: robots.txt disallows all and server-rendered
 * responses get `X-Robots-Tag: noindex`. (Prerendered pages are covered by
 * robots.txt; the production server adds the header for static files too — see
 * segment 14 in docs/PLAN.md.)
 */
export function isNoindexDeployment(): boolean {
  return NOINDEX;
}
