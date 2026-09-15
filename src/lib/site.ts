import { NOINDEX, SITE_URL } from "astro:env/server";
import { siteConfig } from "@site-config";

/**
 * Canonical origin, resolved at runtime (SITE_URL env) so one Docker image can
 * serve staging and production. Never derived from the request Host header.
 */
export function getSiteUrl(): string {
  return (SITE_URL || siteConfig.url).replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${getSiteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** True on staging/preview deployments: pages get noindex and robots.txt disallows all. */
export function isNoindexDeployment(): boolean {
  return NOINDEX;
}
