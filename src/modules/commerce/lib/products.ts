/** Listing helpers on top of the provider: sorting, featured products, sitemap. */
import { siteConfig, type Locale } from "@site-config";
import type { SitemapEntryLike } from "@/modules/types";
import type { SortOption } from "../options";
import { collectionPath, commerceOptions, shopPath } from "./format";
import { getCommerce } from "./provider";
import type { CommerceProvider, ListingKind, ListingQuery, ProductCardData } from "./types";

/** Cache tag on every page that shows catalogue data; backend webhooks invalidate it. */
export const COMMERCE_CACHE_TAG = "commerce";

export function resolveSort(provider: CommerceProvider, kind: ListingKind, requested: string | null): SortOption {
  const allowed = provider.sorts[kind];
  return allowed.includes(requested as SortOption) ? (requested as SortOption) : allowed[0]!;
}

export const listingQuery = (query: Omit<ListingQuery, "pageSize">): ListingQuery => ({ ...query, pageSize: commerceOptions().pageSize });

/** Home page products: the configured collection, or the default listing. */
export async function getFeaturedProducts(lang: Locale): Promise<ProductCardData[]> {
  const { featuredCollection, featuredOnHome } = commerceOptions();
  if (featuredOnHome <= 0) return [];
  const commerce = await getCommerce();
  const pageSize = Math.max(featuredOnHome, 1);
  if (featuredCollection) {
    const result = await commerce.getCollection(featuredCollection, { lang, sort: commerce.sorts.collection[0]!, pageSize });
    return result?.connection.products.slice(0, featuredOnHome) ?? [];
  }
  const { products } = await commerce.listProducts({ lang, sort: commerce.sorts.all[0]!, pageSize });
  return products.slice(0, featuredOnHome);
}

export async function commerceSitemapEntries(): Promise<SitemapEntryLike[]> {
  const all = (path: (l: string) => string) => Object.fromEntries(siteConfig.locales.map((l) => [l, path(l)]));
  const entries: SitemapEntryLike[] = [{ paths: all((l) => shopPath(l)) }];
  try {
    const { products, collections } = await (await getCommerce()).sitemap();
    const date = (value: string | null) => (value ? new Date(value) : undefined);
    for (const c of collections) entries.push({ paths: all((l) => collectionPath(l, c.handle)), lastModified: date(c.updatedAt) });
    for (const p of products) entries.push({ paths: all((l) => shopPath(l, p.handle)), lastModified: date(p.updatedAt) });
  } catch (error) {
    // A backend outage must not take the whole sitemap down.
    console.error("[commerce] sitemap:", error);
  }
  return entries;
}
