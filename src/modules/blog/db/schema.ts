import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const blogCategories = sqliteTable("blog_categories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** Shared across locales; used in /[lang]/blog/category/[slug]. */
  slug: text("slug").notNull().unique(),
  /** Display name per locale: { el: "...", en: "..." }. */
  name: text("name", { mode: "json" }).$type<Record<string, string>>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const blogPosts = sqliteTable(
  "blog_posts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Same value on every language version of a post (hreflang, language switcher). */
    translationKey: text("translation_key").notNull(),
    locale: text("locale").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    /** Summary for cards, meta description and RSS. */
    excerpt: text("excerpt").notNull().default(""),
    /** Markdown source, edited in the admin. */
    content: text("content").notNull().default(""),
    /** Sanitized HTML rendered from `content` on save. */
    contentHtml: text("content_html").notNull().default(""),
    /** h2 headings for the table of contents. */
    headings: text("headings", { mode: "json" }).$type<{ id: string; text: string }[]>().notNull().default(sql`'[]'`),
    readingMinutes: integer("reading_minutes").notNull().default(1),
    coverId: text("cover_id"),
    categoryId: text("category_id").references(() => blogCategories.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull().default(""),
    status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
    /** Published posts appear once this time has passed (scheduling). */
    publishedAt: integer("published_at", { mode: "timestamp" }),
    seoTitle: text("seo_title").notNull().default(""),
    seoDescription: text("seo_description").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("blog_posts_locale_slug_idx").on(table.locale, table.slug),
    uniqueIndex("blog_posts_translation_locale_idx").on(table.translationKey, table.locale),
    index("blog_posts_listing_idx").on(table.locale, table.status, table.publishedAt),
  ],
);

export type BlogPost = typeof blogPosts.$inferSelect;
export type BlogCategory = typeof blogCategories.$inferSelect;
