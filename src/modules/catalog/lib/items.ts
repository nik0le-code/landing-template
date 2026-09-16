/** Catalog data access and formatting helpers. */
import { and, asc, count, desc, eq, like, ne, or, type SQL } from "drizzle-orm";
import { siteConfig, type Locale } from "@site-config";
import { getDb } from "@/db";
import { localeRegions, pickLocalized } from "@/i18n";
import { getModuleOptions } from "@/modules/registry";
import { catalogCategories, catalogItems, type CatalogCategory, type CatalogItem } from "../db/schema";
import { catalogDefaults } from "../options";

export const catalogOptions = () => getModuleOptions("catalog", catalogDefaults);

export const catalogPath = (lang: string, slug?: string) => `/${lang}/${catalogOptions().basePath}${slug ? `/${slug}` : ""}`;

const ordered = [asc(catalogItems.sortOrder), desc(catalogItems.updatedAt)];

export async function listPublishedItems({ categoryId, featured, limit = 200 }: { categoryId?: string; featured?: boolean; limit?: number } = {}) {
  return getDb()
    .select()
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.published, true),
        categoryId ? eq(catalogItems.categoryId, categoryId) : undefined,
        featured ? eq(catalogItems.featured, true) : undefined,
      ),
    )
    .orderBy(...ordered)
    .limit(limit);
}

export async function getPublishedItem(slug: string) {
  const [item] = await getDb()
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.published, true), eq(catalogItems.slug, slug)))
    .limit(1);
  return item ?? null;
}

export async function listRelatedItems(item: CatalogItem, limit = 3) {
  if (!item.categoryId) return [];
  return getDb()
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.published, true), eq(catalogItems.categoryId, item.categoryId), ne(catalogItems.id, item.id)))
    .orderBy(...ordered)
    .limit(limit);
}

export async function listCatalogCategories(): Promise<CatalogCategory[]> {
  return getDb().select().from(catalogCategories).orderBy(asc(catalogCategories.sortOrder), asc(catalogCategories.slug));
}

export async function getCatalogCategory(id: string) {
  const [row] = await getDb().select().from(catalogCategories).where(eq(catalogCategories.id, id)).limit(1);
  return row ?? null;
}

export async function getCatalogCategoryBySlug(slug: string) {
  const [row] = await getDb().select().from(catalogCategories).where(eq(catalogCategories.slug, slug)).limit(1);
  return row ?? null;
}

/** Price text for `lang`, or null when prices are hidden / not set. */
export function formatPrice(item: Pick<CatalogItem, "priceCents" | "priceNote">, lang: Locale): string | null {
  const { showPrices, currency } = catalogOptions();
  if (!showPrices || item.priceCents === null) return null;
  const amount = new Intl.NumberFormat(localeRegions[lang], {
    style: "currency",
    currency,
    minimumFractionDigits: item.priceCents % 100 === 0 ? 0 : 2,
  }).format(item.priceCents / 100);
  const note = pickLocalized(item.priceNote, lang);
  return note ? (note.startsWith("/") ? `${amount}${note}` : `${note} ${amount}`) : amount;
}

export async function catalogSitemapEntries() {
  const items = await getDb()
    .select({ slug: catalogItems.slug, updatedAt: catalogItems.updatedAt })
    .from(catalogItems)
    .where(eq(catalogItems.published, true));
  const all = (slug?: string) => Object.fromEntries(siteConfig.locales.map((l) => [l, catalogPath(l, slug)]));
  return [{ paths: all() }, ...items.map((item) => ({ paths: all(item.slug), lastModified: item.updatedAt }))];
}

// ---------------------------------------------------------------- admin

export async function listAdminItems({ categoryId, query }: { categoryId?: string; query?: string }) {
  const conditions: SQL[] = [];
  if (categoryId) conditions.push(eq(catalogItems.categoryId, categoryId));
  if (query) conditions.push(or(like(catalogItems.name, `%${query}%`), like(catalogItems.slug, `%${query}%`), like(catalogItems.sku, `%${query}%`))!);
  return getDb()
    .select()
    .from(catalogItems)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...ordered)
    .limit(500);
}

export async function getItem(id: string) {
  const [row] = await getDb().select().from(catalogItems).where(eq(catalogItems.id, id)).limit(1);
  return row ?? null;
}

export async function countItems() {
  const rows = await getDb().select({ published: catalogItems.published, value: count() }).from(catalogItems).groupBy(catalogItems.published);
  return {
    published: rows.find((r) => r.published)?.value ?? 0,
    hidden: rows.find((r) => !r.published)?.value ?? 0,
  };
}
