import type { APIRoute } from "astro";
import { siteConfig } from "@site-config";
import { isLocale } from "@/i18n";
import { escapeHtml } from "@/lib/email";
import { absoluteUrl } from "@/lib/site";
import { translateModule } from "@/modules/registry";
import { strapiOptions } from "../lib/config";
import { listPosts, postsPath, STRAPI_CACHE_TAG } from "../lib/content";

export const prerender = false;

/** RSS 2.0 feed of the latest 20 posts per language. */
export const GET: APIRoute = async ({ params, cache }) => {
  if (!isLocale(params.lang)) return new Response(null, { status: 404 });
  const lang = params.lang;
  const t = (key: string) => translateModule(lang, "strapi", key);
  const { items } = await listPosts({ lang, page: 1, perPage: 20 });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${escapeHtml(`${siteConfig.name} - ${t("title")}`)}</title>
<link>${absoluteUrl(postsPath(lang))}</link>
<description>${escapeHtml(t("description"))}</description>
<language>${lang}</language>
<atom:link href="${absoluteUrl(`${postsPath(lang)}/rss.xml`)}" rel="self" type="application/rss+xml"/>
${items
  .map(
    (post) => `<item>
<title>${escapeHtml(post.title)}</title>
<link>${absoluteUrl(postsPath(lang, post.slug))}</link>
<guid isPermaLink="true">${absoluteUrl(postsPath(lang, post.slug))}</guid>
<pubDate>${post.publishedAt.toUTCString()}</pubDate>
<description>${escapeHtml(post.excerpt)}</description>
</item>`,
  )
  .join("\n")}
</channel>
</rss>`;

  cache.set({ maxAge: Math.max(900, strapiOptions().cacheSeconds), swr: 3600, tags: [STRAPI_CACHE_TAG] });
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
