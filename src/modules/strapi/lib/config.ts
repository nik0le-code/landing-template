/**
 * Strapi connection, read at runtime: the URL, a read-only API token (the content API
 * isn't public) and the secret Strapi signs change notifications with.
 */
import { getSecret } from "astro:env/server";
import { moduleOptions } from "@/modules/.generated/registry";
import { mergeOptions } from "@/modules/merge";
import { strapiDefaults, type StrapiOptions } from "../options";

export interface StrapiConfig {
  /** Strapi origin + path, no trailing slash, e.g. https://cms.client.gr */
  url: string;
  /** Where uploads are served from (a CDN), defaults to `url`. */
  mediaUrl: string;
  token: string;
  webhookSecret: string;
}

let cached: StrapiConfig | null | undefined;

export function strapiConfig(): StrapiConfig | null {
  if (cached !== undefined) return cached;
  const url = (getSecret("STRAPI_URL") ?? "").trim().replace(/\/+$/, "");
  cached = url
    ? {
        url,
        mediaUrl: (getSecret("STRAPI_MEDIA_URL") ?? "").trim().replace(/\/+$/, "") || url,
        token: (getSecret("STRAPI_TOKEN") ?? "").trim(),
        webhookSecret: (getSecret("STRAPI_WEBHOOK_SECRET") ?? "").trim(),
      }
    : null;
  return cached;
}

/** Options merged over defaults, nested objects included (`content: { pages: false }` keeps posts on). */
export const strapiOptions = (): StrapiOptions => mergeOptions(strapiDefaults as unknown as Record<string, unknown>, moduleOptions.strapi) as unknown as StrapiOptions;
