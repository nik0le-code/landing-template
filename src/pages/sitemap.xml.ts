import type { APIRoute } from "astro";
import type { Locale } from "@site-config";
import { collectSitemapEntries } from "@/lib/seo/sitemap";
import { absoluteUrl } from "@/lib/site";

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/**
 * One <url> per locale version, each listing all its alternates (Google's
 * recommended hreflang-in-sitemap format).
 */
export const GET: APIRoute = async ({ cache }) => {
  const entries = await collectSitemapEntries();

  const urls = entries.flatMap((entry) => {
    const alternates = (Object.entries(entry.paths) as [Locale, string][]).map(([lang, path]) => ({
      lang,
      href: escapeXml(absoluteUrl(path)),
    }));
    const links = alternates
      .map((alt) => `<xhtml:link rel="alternate" hreflang="${alt.lang}" href="${alt.href}"/>`)
      .join("");
    const lastmod = entry.lastModified ? `<lastmod>${entry.lastModified.toISOString()}</lastmod>` : "";
    return alternates.map((alt) => `<url><loc>${alt.href}</loc>${lastmod}${links}</url>`);
  });

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">` +
    urls.join("") +
    `</urlset>`;

  cache.set({ maxAge: 3600, swr: 600, tags: ["sitemap"] });
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
