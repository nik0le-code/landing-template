import type { APIRoute } from "astro";
import { siteConfig } from "@site-config";
import { isLocale } from "@/i18n";
import { absoluteUrl } from "@/lib/site";
import { escapeHtml } from "@/lib/email";
import { translateModule } from "@/modules/registry";
import { listPublished, postPath } from "../lib/posts";

export const prerender = false;

/** RSS 2.0 feed of the latest 20 posts per language. */
export const GET: APIRoute = async ({ params, cache }) => {
  if (!isLocale(params.lang)) return new Response(null, { status: 404 });
  const lang = params.lang;
  const { items } = await listPublished({ locale: lang, page: 1, pageSize: 20 });
  const feedUrl = absoluteUrl(`/${lang}/blog/rss.xml`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${escapeHtml(`${siteConfig.name} — ${translateModule(lang, "blog", "title")}`)}</title>
<link>${absoluteUrl(`/${lang}/blog`)}</link>
<description>${escapeHtml(translateModule(lang, "blog", "description"))}</description>
<language>${lang}</language>
<atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
${items
  .map(
    (post) => `<item>
<title>${escapeHtml(post.title)}</title>
<link>${absoluteUrl(postPath(post))}</link>
<guid isPermaLink="true">${absoluteUrl(postPath(post))}</guid>
<pubDate>${post.publishedAt!.toUTCString()}</pubDate>
<description>${escapeHtml(post.excerpt)}</description>
</item>`,
  )
  .join("\n")}
</channel>
</rss>`;

  cache.set({ maxAge: 900, swr: 3600, tags: ["blog"] });
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
