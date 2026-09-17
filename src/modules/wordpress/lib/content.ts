/**
 * Posts, pages and categories from WordPress, mapped to what the pages render.
 *
 * Languages: with more than one site locale, Polylang assigns each post a language and
 * links translations; the headless bridge exposes both in the REST API (`lang`,
 * `translations`) and filters collections by `?lang=`.
 *
 * URLs: WordPress is set up so its permalinks mirror the site's paths
 * (`/<postsPath>/<slug>/`, `/<postsPath>/category/<slug>/`, pages by path, Polylang
 * language directories). Links in content are rewritten to site paths from that rule.
 */
import { siteConfig, type Locale } from "@site-config";
import { isLocale } from "@/i18n";
import { slugify } from "@/lib/slug";
import { wordpressConfig, wordpressOptions } from "./config";
import { wpGet, WordPressError } from "./rest";

/** Cache tag on every page that shows WordPress content; the webhook invalidates it. */
export const WORDPRESS_CACHE_TAG = "wordpress";

const multilingual = () => siteConfig.locales.length > 1;
const langQuery = (lang: Locale) => (multilingual() ? { lang } : {});

// ---------------------------------------------------------------- raw shapes

interface WpRendered {
  rendered: string;
}

interface WpMedia {
  source_url: string;
  alt_text: string;
  media_details?: { width?: number; height?: number; sizes?: Record<string, { source_url: string; width: number }> };
}

interface WpTerm {
  id: number;
  slug: string;
  name: string;
  taxonomy: string;
  count?: number;
  description?: string;
}

interface WpTranslation {
  id: number;
  slug: string;
  link: string;
}

interface WpEntry {
  id: number;
  slug: string;
  link: string;
  date_gmt: string;
  modified_gmt: string;
  title: WpRendered;
  content: WpRendered;
  excerpt: WpRendered;
  featured_media: number;
  categories?: number[];
  parent?: number;
  lang?: string;
  translations?: Partial<Record<string, WpTranslation>>;
  /** Set by the headless bridge on WordPress's own pages (WooCommerce cart/checkout/account/shop). */
  headless_hidden?: boolean;
  yoast_head_json?: { title?: string; description?: string; og_image?: { url: string }[]; robots?: { index?: string } };
  _embedded?: {
    "wp:featuredmedia"?: WpMedia[];
    "wp:term"?: WpTerm[][];
    author?: { name: string }[];
  };
}

// ---------------------------------------------------------------- shapes for pages

export interface WpImage {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  srcset: string | null;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  count: number;
}

export interface Seo {
  title: string | null;
  description: string | null;
  image: string | null;
  noindex: boolean;
}

export interface PostSummary {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: Date;
  updatedAt: Date;
  image: WpImage | null;
  categories: Category[];
  author: string | null;
  readingMinutes: number;
}

export interface Heading {
  id: string;
  text: string;
}

export interface Post extends PostSummary {
  html: string;
  headings: Heading[];
  seo: Seo;
  /** Site path of this post in every language it exists in. */
  alternates: Partial<Record<Locale, string>>;
}

export interface Page {
  id: number;
  path: string;
  title: string;
  excerpt: string;
  updatedAt: Date;
  image: WpImage | null;
  html: string;
  seo: Seo;
  alternates: Partial<Record<Locale, string>>;
}

// ---------------------------------------------------------------- paths

export const postsPath = (lang: string, slug?: string) => `/${lang}/${wordpressOptions().postsPath}${slug ? `/${slug}` : ""}`;
export const categoryPath = (lang: string, slug: string) => `${postsPath(lang)}/category/${slug}`;

/**
 * WordPress URL → site path. The first segment is the language when Polylang puts one
 * there; the default language has none, and the site always prefixes it.
 */
export function sitePathFromWordPress(link: string): string | null {
  const config = wordpressConfig();
  if (!config) return null;
  try {
    const url = new URL(link, config.url);
    const base = new URL(config.url);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname.replace(/\/?$/, "/"))) return null;
    const segments = url.pathname.slice(base.pathname.replace(/\/?$/, "/").length).split("/").filter(Boolean);
    if (segments[0]?.startsWith("wp-")) return null;
    const lang = isLocale(segments[0]) ? segments.shift()! : siteConfig.defaultLocale;
    return `/${[lang, ...segments].join("/")}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Path of a page below its language, e.g. "about/team". */
const pagePathOf = (link: string) => sitePathFromWordPress(link)?.split(/[?#]/)[0]!.split("/").slice(2).join("/") ?? "";

// ---------------------------------------------------------------- mapping

const decode = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(quot|amp|lt|gt|apos|nbsp|hellip|ndash|mdash|laquo|raquo);/g, (_, name: string) =>
      ({ quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", nbsp: " ", hellip: "…", ndash: "-", mdash: "-", laquo: "«", raquo: "»" })[name]!,
    );

const plain = (html: string) => decode(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

function image(media: WpMedia | undefined): WpImage | null {
  if (!media?.source_url) return null;
  const sizes = Object.values(media.media_details?.sizes ?? {}).filter((size) => size.width > 0);
  const widths = [...new Map([...sizes, ...(media.media_details?.width ? [{ source_url: media.source_url, width: media.media_details.width }] : [])].map((s) => [s.width, s.source_url])).entries()].sort(
    ([a], [b]) => a - b,
  );
  return {
    url: media.source_url,
    alt: media.alt_text ?? "",
    width: media.media_details?.width ?? null,
    height: media.media_details?.height ?? null,
    srcset: widths.length > 1 ? widths.map(([width, url]) => `${url} ${width}w`).join(", ") : null,
  };
}

const categoriesOf = (entry: WpEntry): Category[] =>
  (entry._embedded?.["wp:term"] ?? [])
    .flat()
    .filter((term) => term.taxonomy === "category" && !term.slug.startsWith("uncategorized"))
    .map((term) => ({ id: term.id, slug: term.slug, name: decode(term.name), count: term.count ?? 0 }));

function seoOf(entry: WpEntry): Seo {
  const yoast = entry.yoast_head_json;
  return {
    title: yoast?.title ? decode(yoast.title) : null,
    description: yoast?.description ?? (plain(entry.excerpt.rendered).slice(0, 160) || null),
    image: yoast?.og_image?.[0]?.url ?? null,
    noindex: yoast?.robots?.index === "noindex",
  };
}

/**
 * Content HTML for the site: links to WordPress content become site paths, and h2/h3
 * get ids for the table of contents. Media (wp-content) stays on WordPress.
 */
function prepareHtml(html: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Set<string>();
  const withLinks = html.replace(/(<a\b[^>]*?\bhref=")([^"]+)(")/gi, (match, before: string, href: string, after: string) => {
    const path = /^https?:\/\//.test(href) ? sitePathFromWordPress(decode(href)) : null;
    return path ? `${before}${path.replace(/\/(?=[?#]|$)/, "")}${after}` : match;
  });
  const withIds = withLinks.replace(/<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi, (match, level: string, attributes = "", inner: string) => {
    const text = plain(inner);
    if (!text) return match;
    const existing = /\bid="([^"]+)"/.exec(attributes)?.[1];
    let id = existing ?? (slugify(text, 60) || `section-${headings.length + 1}`);
    if (!existing) {
      for (let n = 2; used.has(id); n++) id = `${slugify(text, 56)}-${n}`;
    }
    used.add(id);
    if (level === "2") headings.push({ id, text });
    return existing ? match : `<h${level} id="${id}"${attributes}>${inner}</h${level}>`;
  });
  return { html: withIds, headings };
}

function summary(entry: WpEntry): PostSummary {
  const words = plain(entry.content.rendered).split(" ").length;
  return {
    id: entry.id,
    slug: entry.slug,
    title: decode(entry.title.rendered),
    excerpt: plain(entry.excerpt.rendered),
    publishedAt: new Date(`${entry.date_gmt}Z`),
    updatedAt: new Date(`${entry.modified_gmt}Z`),
    image: image(entry._embedded?.["wp:featuredmedia"]?.[0]),
    categories: categoriesOf(entry),
    author: entry._embedded?.author?.[0]?.name ?? null,
    readingMinutes: Math.max(1, Math.round(words / 200)),
  };
}

function alternatesOf(entry: WpEntry, lang: Locale, path: (l: Locale, translation: WpTranslation) => string): Partial<Record<Locale, string>> {
  const alternates: Partial<Record<Locale, string>> = {};
  for (const [l, translation] of Object.entries(entry.translations ?? {})) {
    if (isLocale(l) && translation) alternates[l] = path(l, translation);
  }
  if (!alternates[lang]) alternates[lang] = path(lang, { id: entry.id, slug: entry.slug, link: entry.link });
  // Without Polylang, the same content serves every locale.
  if (!multilingual() || !entry.translations) for (const l of siteConfig.locales) alternates[l] ??= path(l, { id: entry.id, slug: entry.slug, link: entry.link });
  return alternates;
}

// ---------------------------------------------------------------- queries

const EMBED = "wp:featuredmedia,wp:term,author";

export async function listPosts({ lang, page = 1, categoryId, perPage }: { lang: Locale; page?: number; categoryId?: number; perPage?: number }) {
  try {
    const { data, total, totalPages } = await wpGet<WpEntry[]>("/posts", {
      ...langQuery(lang),
      page,
      per_page: perPage ?? wordpressOptions().postsPerPage,
      categories: categoryId,
      _embed: EMBED,
    });
    return { items: data.map(summary), total, pages: Math.max(1, totalPages) };
  } catch (error) {
    if (error instanceof WordPressError && error.status === 400) return { items: [], total: 0, pages: 1 };
    throw error;
  }
}

export async function listCategories(lang: Locale): Promise<Category[]> {
  const { data } = await wpGet<WpTerm[]>("/categories", { ...langQuery(lang), hide_empty: true, per_page: 100, orderby: "count", order: "desc" });
  return data.filter((term) => !term.slug.startsWith("uncategorized")).map((term) => ({ id: term.id, slug: term.slug, name: decode(term.name), count: term.count ?? 0 }));
}

export async function getCategoryBySlug(slug: string, lang: Locale): Promise<Category | null> {
  const { data } = await wpGet<WpTerm[]>("/categories", { ...langQuery(lang), slug });
  const term = data[0];
  return term ? { id: term.id, slug: term.slug, name: decode(term.name), count: term.count ?? 0 } : null;
}

export async function getPost(slug: string, lang: Locale): Promise<Post | null> {
  const { data } = await wpGet<WpEntry[]>("/posts", { ...langQuery(lang), slug, _embed: EMBED });
  const entry = data.find((item) => item.slug === slug && (!multilingual() || !item.lang || item.lang === lang));
  if (!entry) return null;
  const { html, headings } = prepareHtml(entry.content.rendered);
  return {
    ...summary(entry),
    html,
    headings,
    seo: seoOf(entry),
    alternates: alternatesOf(entry, lang, (l, translation) => postsPath(l, translation.slug)),
  };
}

export async function listRelatedPosts(post: Post, lang: Locale, limit = 3): Promise<PostSummary[]> {
  const categoryId = post.categories[0]?.id;
  if (!categoryId) return [];
  const { items } = await listPosts({ lang, categoryId, perPage: limit + 1 });
  return items.filter((item) => item.id !== post.id).slice(0, limit);
}

/** A page by its path below the language ("about" or "about/team"). */
export async function getPage(path: string, lang: Locale): Promise<Page | null> {
  const slug = path.split("/").pop();
  if (!slug || !/^[\p{L}\p{N}_%-]+$/u.test(slug)) return null;
  const { data } = await wpGet<WpEntry[]>("/pages", { ...langQuery(lang), slug: decodeURIComponent(slug), _embed: "wp:featuredmedia" });
  const entry = data.find((item) => !item.headless_hidden && pagePathOf(item.link) === path && (!multilingual() || !item.lang || item.lang === lang));
  if (!entry) return null;
  const { html } = prepareHtml(entry.content.rendered);
  return {
    id: entry.id,
    path,
    title: decode(entry.title.rendered),
    excerpt: plain(entry.excerpt?.rendered ?? ""),
    updatedAt: new Date(`${entry.modified_gmt}Z`),
    image: image(entry._embedded?.["wp:featuredmedia"]?.[0]),
    html,
    seo: seoOf(entry),
    alternates: alternatesOf(entry, lang, (l, translation) => `/${l}/${pagePathOf(translation.link)}`),
  };
}

/** Every published post and page, in every language, for sitemap.xml. */
export async function sitemapEntries() {
  const { content } = wordpressOptions();
  const languages = multilingual() ? siteConfig.locales : [siteConfig.defaultLocale];
  const entries: { paths: Partial<Record<Locale, string>>; lastModified?: Date }[] = [];
  const seen = new Set<string>();

  const collect = async (type: "posts" | "pages", lang: Locale) => {
    for (let page = 1; page <= 50; page++) {
      const { data, totalPages } = await wpGet<WpEntry[]>(`/${type}`, { ...langQuery(lang), page, per_page: 100, _fields: "id,slug,link,modified_gmt,lang,translations,headless_hidden" });
      for (const entry of data) {
        if (entry.headless_hidden) continue;
        const paths =
          type === "posts"
            ? alternatesOf(entry, lang, (l, translation) => postsPath(l, translation.slug))
            : alternatesOf(entry, lang, (l, translation) => `/${l}/${pagePathOf(translation.link)}`);
        // A page without a path (the front page, plain permalinks) has no URL of its own on the site.
        if (type === "pages" && Object.values(paths).some((path) => path.split("/").length < 3 || path.endsWith("/"))) continue;
        const key = Object.values(paths).sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ paths, lastModified: new Date(`${entry.modified_gmt}Z`) });
      }
      if (page >= totalPages) break;
    }
  };

  if (content.posts) {
    entries.push({ paths: Object.fromEntries(siteConfig.locales.map((l) => [l, postsPath(l)])) });
    for (const lang of languages) await collect("posts", lang);
  }
  if (content.pages) for (const lang of languages) await collect("pages", lang);
  return entries;
}
