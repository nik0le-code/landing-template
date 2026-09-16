import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

type Localized = Record<string, string>;

export const catalogCategories = sqliteTable("catalog_categories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  name: text("name", { mode: "json" }).$type<Localized>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const catalogItems = sqliteTable(
  "catalog_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Shared by all locales: /el/products/<slug> and /en/products/<slug>. */
    slug: text("slug").notNull().unique(),
    name: text("name", { mode: "json" }).$type<Localized>().notNull(),
    /** Short text for cards and meta descriptions. */
    summary: text("summary", { mode: "json" }).$type<Localized>().notNull().default(sql`'{}'`),
    /** Markdown per locale, and its sanitized HTML rendered on save. */
    content: text("content", { mode: "json" }).$type<Localized>().notNull().default(sql`'{}'`),
    contentHtml: text("content_html", { mode: "json" }).$type<Localized>().notNull().default(sql`'{}'`),
    coverId: text("cover_id"),
    /** Additional images, in display order. */
    gallery: text("gallery", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    categoryId: text("category_id").references(() => catalogCategories.id, { onDelete: "set null" }),
    /** Price in cents; null = "ask for a price". */
    priceCents: integer("price_cents"),
    /** Short suffix/prefix per locale, e.g. { el: "από", en: "from" } or "/month". */
    priceNote: text("price_note", { mode: "json" }).$type<Localized>().notNull().default(sql`'{}'`),
    sku: text("sku").notNull().default(""),
    availability: text("availability", { enum: ["InStock", "OutOfStock", "PreOrder"] }).notNull().default("InStock"),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    published: integer("published", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("catalog_items_listing_idx").on(table.published, table.sortOrder)],
);

export type CatalogItem = typeof catalogItems.$inferSelect;
export type CatalogCategory = typeof catalogCategories.$inferSelect;
