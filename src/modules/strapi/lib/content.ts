/**
 * Posts, categories and pages from Strapi, mapped to what the pages render.
 *
 * Languages: every site locale is a Strapi locale (npm run strapi:up creates them); a
 * post's translations are the other locales of the same document (same documentId).
 */
import { siteConfig, type Locale } from "@site-config";
import { renderBlocks, srcsetOf, type Heading, type StrapiMedia } from "./blocks";
import { strapiOptions } from "./config";
import { mediaUrl, strapiGet, StrapiError, type Query } from "./rest";

export type { Heading };

/** Cache tag on every page that shows Strapi content; the webhook invalidates it. */
export const STRAPI_CACHE_TAG = "strapi";

const multilingual = () => siteConfig.locales.length > 1;

// ---------------------------------------------------------------- raw shapes

interface RawSeo {
  title: string | null;
  description: string | null;
  noindex: boolean | null;
  image: StrapiMedia | null;
}

interface RawCategory {
  id: number;
  documentId: string;
  name: string;
  slug: string;
}

interface RawPost {
  id: number;
  documentId: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: unknown;
  author: string | null;
  publishedAt: string;
  updatedAt: string;
  locale: string;
  cover?: StrapiMedia | null;
  category?: RawCategory | null;
  seo?: RawSeo | null;
}

interface RawPage {
  id: number;
  documentId: string;
  title: string;
  slug: string;
  content: unknown;
  updatedAt: string;
  cover?: StrapiMedia | null;
  seo?: RawSeo | null;
}

// ---------------------------------------------------------------- shapes for pages

export interface Picture {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  srcset: string | null;
}

export interface Category {
  documentId: string;
  slug: string;
  name: string;
}

export interface Seo {
  title: string | null;
  description: string | null;
  image: string | null;
  noindex: boolean;
}

export interface PostSummary {
  documentId: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: Date;
  updatedAt: Date;
  image: Picture | null;
  categories: Category[];
  author: string | null;
  readingMinutes: number;
}

export interface Post extends PostSummary {
  html: string;
  headings: Heading[];
  seo: Seo;
  /** Site path of this post in every language it exists in. */
  alternates: Partial<Record<Locale, string>>;
}

export interface Page {
  documentId: string;
  path: string;
  title: string;
  updatedAt: Date;
  image: Picture | null;
  html: string;
  seo: Seo;
  alternates: Partial<Record<Locale, string>>;
}

// ---------------------------------------------------------------- paths

export const postsPath = (lang: string, slug?: string) => `/${lang}/${strapiOptions().postsPath}${slug ? `/${slug}` : ""}`;
export const categoryPath = (lang: string, slug: string) => `${postsPath(lang)}/category/${slug}`;

// ---------------------------------------------------------------- mapping

export function image(media: StrapiMedia | null | undefined): Picture | null {
  if (!media?.url) return null;
  return { url: mediaUrl(media.url), alt: media.alternativeText ?? "", width: media.width, height: media.height, srcset: srcsetOf(media) };
}

const category = (raw: RawCategory): Category => ({ documentId: raw.documentId, slug: raw.slug, name: raw.name });

function seoOf(raw: RawSeo | null | undefined, fallbackDescription: string | null): Seo {
  return {
    title: raw?.title?.trim() || null,
    description: raw?.description?.trim() || fallbackDescription?.slice(0, 160) || null,
    image: raw?.image?.url ? mediaUrl(raw.image.url) : null,
    noindex: raw?.noindex ?? false,
  };
}

function summary(raw: RawPost): PostSummary {
  const { words } = renderBlocks(raw.content);
  return {
    documentId: raw.documentId,
    slug: raw.slug,
    title: raw.title,
    excerpt: raw.excerpt?.trim() ?? "",
    publishedAt: new Date(raw.publishedAt),
    updatedAt: new Date(raw.updatedAt),
    image: image(raw.cover),
    categories: raw.category ? [category(raw.category)] : [],
    author: raw.author?.trim() || null,
    readingMinutes: Math.max(1, Math.round(words / 200)),
  };
}

/** Slugs of a document in every site language it exists in (published only). */
async function localizedSlugs(type: "posts" | "pages", documentId: string, lang: Locale, slug: string): Promise<Partial<Record<Locale, string>>> {
  const slugs: Partial<Record<Locale, string>> = { [lang]: slug };
  if (!multilingual()) return slugs;
  await Promise.all(
    siteConfig.locales
      .filter((l) => l !== lang)
      .map(async (l) => {
        const result = await strapiGet<{ slug: string }[]>(`/${type}`, { locale: l, filters: { documentId: { $eq: documentId } }, fields: ["slug"] });
        const found = result?.data[0]?.slug;
        if (found) slugs[l] = found;
      }),
  );
  return slugs;
}

// ---------------------------------------------------------------- queries

const POST_POPULATE: Query = { cover: true, category: true };

export async function listPosts({ lang, page = 1, categoryId, perPage }: { lang: Locale; page?: number; categoryId?: string; perPage?: number }) {
  const result = await strapiGet<RawPost[]>("/posts", {
    locale: lang,
    sort: ["publishedAt:desc"],
    populate: POST_POPULATE,
    filters: categoryId ? { category: { documentId: { $eq: categoryId } } } : undefined,
    pagination: { page, pageSize: perPage ?? strapiOptions().postsPerPage },
  });
  if (!result) return { items: [], total: 0, pages: 1 };
  return { items: result.data.map(summary), total: result.pagination.total, pages: Math.max(1, result.pagination.pageCount) };
}

export async function listCategories(lang: Locale): Promise<Category[]> {
  const result = await strapiGet<(RawCategory & { posts: { count: number } })[]>("/categories", {
    locale: lang,
    sort: ["name:asc"],
    populate: { posts: { count: true } },
    pagination: { pageSize: 100 },
  });
  return (result?.data ?? []).filter((raw) => raw.posts.count > 0).map(category);
}

export async function getCategoryBySlug(slug: string, lang: Locale): Promise<Category | null> {
  const result = await strapiGet<RawCategory[]>("/categories", { locale: lang, filters: { slug: { $eq: slug } } });
  const raw = result?.data[0];
  return raw ? category(raw) : null;
}

export async function getPost(slug: string, lang: Locale): Promise<Post | null> {
  const result = await strapiGet<RawPost[]>("/posts", { locale: lang, filters: { slug: { $eq: slug } }, populate: { ...POST_POPULATE, seo: { populate: { image: true } } } });
  const raw = result?.data[0];
  if (!raw) return null;
  const { html, headings } = renderBlocks(raw.content);
  const slugs = await localizedSlugs("posts", raw.documentId, lang, raw.slug);
  return {
    ...summary(raw),
    html,
    headings,
    seo: seoOf(raw.seo, raw.excerpt),
    alternates: Object.fromEntries(Object.entries(slugs).map(([l, s]) => [l, postsPath(l, s)])),
  };
}

export async function listRelatedPosts(post: Post, lang: Locale, limit = 3): Promise<PostSummary[]> {
  const categoryId = post.categories[0]?.documentId;
  if (!categoryId) return [];
  const { items } = await listPosts({ lang, categoryId, perPage: limit + 1 });
  return items.filter((item) => item.documentId !== post.documentId).slice(0, limit);
}

/** A page by its slug ("team"); nested paths aren't pages in Strapi. */
export async function getPage(path: string, lang: Locale): Promise<Page | null> {
  if (!/^[\p{L}\p{N}_-]+$/u.test(path)) return null;
  const result = await strapiGet<RawPage[]>("/pages", { locale: lang, filters: { slug: { $eq: path } }, populate: { cover: true, seo: { populate: { image: true } } } });
  const raw = result?.data[0];
  if (!raw) return null;
  const { html, words } = renderBlocks(raw.content);
  const slugs = await localizedSlugs("pages", raw.documentId, lang, raw.slug);
  return {
    documentId: raw.documentId,
    path: raw.slug,
    title: raw.title,
    updatedAt: new Date(raw.updatedAt),
    image: image(raw.cover),
    html,
    seo: seoOf(raw.seo, words ? html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : null),
    alternates: Object.fromEntries(Object.entries(slugs).map(([l, s]) => [l, `/${l}/${s}`])),
  };
}

/** Every published post and page, in every language, for sitemap.xml. */
export async function sitemapEntries() {
  const { content } = strapiOptions();
  const languages = multilingual() ? siteConfig.locales : [siteConfig.defaultLocale];
  const entries: { paths: Partial<Record<Locale, string>>; lastModified?: Date }[] = [];

  const collect = async (type: "posts" | "pages", path: (lang: Locale, slug: string) => string) => {
    const documents = new Map<string, { paths: Partial<Record<Locale, string>>; lastModified: Date }>();
    for (const lang of languages) {
      for (let page = 1; page <= 50; page++) {
        const result = await strapiGet<{ documentId: string; slug: string; updatedAt: string }[]>(`/${type}`, {
          locale: lang,
          fields: ["slug", "updatedAt"],
          pagination: { page, pageSize: 100 },
        });
        for (const raw of result?.data ?? []) {
          const entry = documents.get(raw.documentId) ?? { paths: {}, lastModified: new Date(0) };
          entry.paths[lang] = path(lang, raw.slug);
          const updated = new Date(raw.updatedAt);
          if (updated > entry.lastModified) entry.lastModified = updated;
          documents.set(raw.documentId, entry);
        }
        if (!result || page >= result.pagination.pageCount) break;
      }
    }
    entries.push(...documents.values());
  };

  try {
    if (content.posts) {
      entries.push({ paths: Object.fromEntries(siteConfig.locales.map((l) => [l, postsPath(l)])) });
      await collect("posts", (lang, slug) => postsPath(lang, slug));
    }
    if (content.pages) await collect("pages", (lang, slug) => `/${lang}/${slug}`);
  } catch (error) {
    if (!(error instanceof StrapiError)) throw error;
    console.error("[strapi] sitemap:", error.message);
  }
  return entries;
}
