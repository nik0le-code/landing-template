/** Blog data access: public (published only) and admin queries. */
import { and, asc, count, desc, eq, like, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { siteConfig, type Locale } from "@site-config";
import { getDb } from "@/db";
import { getModuleOptions } from "@/modules/registry";
import { blogCategories, blogPosts, type BlogCategory, type BlogPost } from "../db/schema";
import { blogDefaults } from "../options";

export const blogOptions = () => getModuleOptions("blog", blogDefaults);

/** Published and not scheduled in the future. */
const isLive = () => and(eq(blogPosts.status, "published"), lte(blogPosts.publishedAt, new Date()));

export const postPath = (post: Pick<BlogPost, "locale" | "slug">) => `/${post.locale}/blog/${post.slug}`;

export async function listPublished({
  locale,
  categoryId,
  page = 1,
  pageSize = blogOptions().postsPerPage,
}: {
  locale: Locale;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = getDb();
  const where = and(isLive(), eq(blogPosts.locale, locale), categoryId ? eq(blogPosts.categoryId, categoryId) : undefined);
  const [items, [total]] = await Promise.all([
    db
      .select()
      .from(blogPosts)
      .where(where)
      .orderBy(desc(blogPosts.publishedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(blogPosts).where(where),
  ]);
  return { items, total: total?.value ?? 0, pages: Math.max(1, Math.ceil((total?.value ?? 0) / pageSize)) };
}

export async function getPublishedBySlug(locale: Locale, slug: string) {
  const [post] = await getDb()
    .select()
    .from(blogPosts)
    .where(and(isLive(), eq(blogPosts.locale, locale), eq(blogPosts.slug, slug)))
    .limit(1);
  return post ?? null;
}

/** Live language versions of a post, as a hreflang-ready `{ locale: path }` map. */
export async function getTranslationPaths(translationKey: string): Promise<Partial<Record<Locale, string>>> {
  const rows = await getDb()
    .select({ locale: blogPosts.locale, slug: blogPosts.slug })
    .from(blogPosts)
    .where(and(isLive(), eq(blogPosts.translationKey, translationKey)));
  return Object.fromEntries(rows.map((row) => [row.locale, postPath(row)]));
}

export async function listRelated(post: BlogPost, limit = 3) {
  return getDb()
    .select()
    .from(blogPosts)
    .where(
      and(
        isLive(),
        eq(blogPosts.locale, post.locale),
        ne(blogPosts.id, post.id),
        post.categoryId ? eq(blogPosts.categoryId, post.categoryId) : undefined,
      ),
    )
    .orderBy(desc(blogPosts.publishedAt))
    .limit(limit);
}

export async function listCategories(): Promise<BlogCategory[]> {
  return getDb().select().from(blogCategories).orderBy(asc(blogCategories.sortOrder), asc(blogCategories.slug));
}

export async function getCategory(id: string) {
  const [category] = await getDb().select().from(blogCategories).where(eq(blogCategories.id, id)).limit(1);
  return category ?? null;
}

export async function getCategoryBySlug(slug: string) {
  const [category] = await getDb().select().from(blogCategories).where(eq(blogCategories.slug, slug)).limit(1);
  return category ?? null;
}

export const categoryName = (category: Pick<BlogCategory, "name" | "slug">, locale: Locale) =>
  category.name[locale] || category.name[siteConfig.defaultLocale] || category.slug;

/** Sitemap: every live post with its translations as alternates. */
export async function sitemapEntries() {
  const rows = await getDb()
    .select({ translationKey: blogPosts.translationKey, locale: blogPosts.locale, slug: blogPosts.slug, updatedAt: blogPosts.updatedAt })
    .from(blogPosts)
    .where(isLive());
  const groups = new Map<string, { paths: Partial<Record<Locale, string>>; lastModified: Date }>();
  for (const row of rows) {
    const group = groups.get(row.translationKey) ?? { paths: {}, lastModified: row.updatedAt };
    group.paths[row.locale as Locale] = postPath(row);
    if (row.updatedAt > group.lastModified) group.lastModified = row.updatedAt;
    groups.set(row.translationKey, group);
  }
  const indexes = [{ paths: Object.fromEntries(siteConfig.locales.map((l) => [l, `/${l}/blog`])) }];
  return [...indexes, ...groups.values()];
}

// ---------------------------------------------------------------- admin

export interface AdminPostFilters {
  locale?: string;
  status?: string;
  query?: string;
}

export async function listAdminPosts(filters: AdminPostFilters, page = 1, pageSize = 25) {
  const conditions: SQL[] = [];
  if (filters.locale) conditions.push(eq(blogPosts.locale, filters.locale));
  if (filters.status === "draft") conditions.push(eq(blogPosts.status, "draft"));
  if (filters.status === "published") conditions.push(isLive()!);
  if (filters.status === "scheduled") conditions.push(and(eq(blogPosts.status, "published"), sql`${blogPosts.publishedAt} > unixepoch()`)!);
  if (filters.query) conditions.push(or(like(blogPosts.title, `%${filters.query}%`), like(blogPosts.slug, `%${filters.query}%`))!);
  const where = conditions.length ? and(...conditions) : undefined;
  const db = getDb();
  const [items, [total]] = await Promise.all([
    db.select().from(blogPosts).where(where).orderBy(desc(blogPosts.updatedAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(blogPosts).where(where),
  ]);
  return { items, total: total?.value ?? 0 };
}

export async function getPost(id: string) {
  const [post] = await getDb().select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
  return post ?? null;
}

/** All language versions (any status) sharing a translation key, by locale. */
export async function getTranslationSiblings(translationKey: string) {
  const rows = await getDb()
    .select({ id: blogPosts.id, locale: blogPosts.locale, title: blogPosts.title, status: blogPosts.status })
    .from(blogPosts)
    .where(eq(blogPosts.translationKey, translationKey));
  return new Map(rows.map((row) => [row.locale, row]));
}

export async function slugTaken(locale: string, slug: string, exceptId?: string) {
  const [row] = await getDb()
    .select({ id: blogPosts.id })
    .from(blogPosts)
    .where(and(eq(blogPosts.locale, locale), eq(blogPosts.slug, slug), exceptId ? ne(blogPosts.id, exceptId) : undefined))
    .limit(1);
  return Boolean(row);
}

export async function translationTaken(translationKey: string, locale: string, exceptId?: string) {
  const [row] = await getDb()
    .select({ id: blogPosts.id })
    .from(blogPosts)
    .where(and(eq(blogPosts.translationKey, translationKey), eq(blogPosts.locale, locale), exceptId ? ne(blogPosts.id, exceptId) : undefined))
    .limit(1);
  return Boolean(row);
}

export async function countPosts() {
  const rows = await getDb()
    .select({ status: blogPosts.status, value: count() })
    .from(blogPosts)
    .groupBy(blogPosts.status);
  return Object.fromEntries(rows.map((row) => [row.status, row.value])) as Partial<Record<"draft" | "published", number>>;
}
