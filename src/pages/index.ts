import type { APIRoute } from "astro";
import { siteConfig } from "@site-config";

/**
 * `/` has no content of its own: send visitors to their preferred supported
 * locale (Accept-Language), falling back to the default. 302 so search engines
 * keep treating each locale URL as canonical; hreflang x-default points here.
 */
export const GET: APIRoute = ({ preferredLocale, redirect }) =>
  redirect(`/${preferredLocale ?? siteConfig.defaultLocale}`, 302);
