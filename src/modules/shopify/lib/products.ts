/** Catalogue reads: products, collections, search, recommendations, sitemap. */
import { siteConfig, type Locale } from "@site-config";
import type { SitemapEntryLike } from "@/modules/types";
import type { SortOption } from "../options";
import { storefront } from "./client";
import { collectionPath, shopPath, shopifyOptions } from "./format";
import {
  COLLECTION_QUERY,
  COLLECTIONS_QUERY,
  PRODUCT_QUERY,
  PRODUCTS_QUERY,
  RECOMMENDATIONS_QUERY,
  SEARCH_QUERY,
  SHOP_QUERY,
  SITEMAP_PRODUCTS_QUERY,
} from "./queries";
import type { Collection, Product, ProductCardData, ProductConnection, ShopInfo } from "./types";

/** Cache tag on every page that shows Shopify data; the webhook invalidates it. */
export const SHOPIFY_CACHE_TAG = "shopify";

export type ListingKind = "all" | "collection" | "search";

/** Sort choices each Storefront listing supports. */
export const SORTS_BY_KIND: Record<ListingKind, readonly SortOption[]> = {
  all: ["best-selling", "newest", "price-asc", "price-desc", "title"],
  collection: ["featured", "best-selling", "newest", "price-asc", "price-desc", "title"],
  search: ["featured", "price-asc", "price-desc"],
};

const SORT_KEYS: Record<ListingKind, Partial<Record<SortOption, [string, boolean]>>> = {
  all: { "best-selling": ["BEST_SELLING", false], newest: ["CREATED_AT", true], "price-asc": ["PRICE", false], "price-desc": ["PRICE", true], title: ["TITLE", false] },
  collection: {
    featured: ["COLLECTION_DEFAULT", false],
    "best-selling": ["BEST_SELLING", false],
    newest: ["CREATED", true],
    "price-asc": ["PRICE", false],
    "price-desc": ["PRICE", true],
    title: ["TITLE", false],
  },
  search: { featured: ["RELEVANCE", false], "price-asc": ["PRICE", false], "price-desc": ["PRICE", true] },
};

export function resolveSort(kind: ListingKind, requested: string | null): SortOption {
  const allowed = SORTS_BY_KIND[kind];
  return allowed.includes(requested as SortOption) ? (requested as SortOption) : allowed[0]!;
}

export interface ListingQuery {
  lang: Locale;
  sort: SortOption;
  after?: string | null;
  before?: string | null;
  /** Filter inputs as JSON strings, exactly as Shopify returned them in `filters[].values[].input`. */
  filters?: string[];
}

function paginate({ after, before }: Pick<ListingQuery, "after" | "before">) {
  const size = shopifyOptions().pageSize;
  return before ? { last: size, before } : { first: size, after: after || null };
}

function parseFilters(inputs: string[] = []): Record<string, unknown>[] {
  return inputs.flatMap((input) => {
    try {
      const value = JSON.parse(input) as unknown;
      return value && typeof value === "object" && !Array.isArray(value) ? [value as Record<string, unknown>] : [];
    } catch {
      return [];
    }
  });
}

const sortVariables = (kind: ListingKind, sort: SortOption) => {
  const [sortKey, reverse] = SORT_KEYS[kind][sort] ?? [null, false];
  return { sortKey, reverse };
};

export async function listProducts(query: ListingQuery): Promise<ProductConnection> {
  const data = await storefront<{ products: Omit<ProductConnection, "filters"> }>({
    query: PRODUCTS_QUERY,
    lang: query.lang,
    variables: { ...paginate(query), ...sortVariables("all", query.sort) },
  });
  return { ...data.products, filters: [] };
}

export async function searchProducts(term: string, query: ListingQuery): Promise<ProductConnection> {
  const data = await storefront<{ search: ProductConnection }>({
    query: SEARCH_QUERY,
    lang: query.lang,
    variables: { ...paginate(query), ...sortVariables("search", query.sort), query: term, filters: parseFilters(query.filters) },
  });
  return data.search;
}

export async function getCollectionWithProducts(handle: string, query: ListingQuery) {
  const data = await storefront<{ collection: (Collection & { products: ProductConnection }) | null }>({
    query: COLLECTION_QUERY,
    lang: query.lang,
    variables: { ...paginate(query), ...sortVariables("collection", query.sort), handle, filters: parseFilters(query.filters) },
  });
  return data.collection;
}

export async function listCollections(lang: Locale, limit = 50): Promise<Collection[]> {
  const data = await storefront<{ collections: { nodes: Collection[] } }>({ query: COLLECTIONS_QUERY, lang, variables: { first: limit } });
  return data.collections.nodes;
}

export async function getProduct(handle: string, lang: Locale): Promise<Product | null> {
  const data = await storefront<{ product: Product | null }>({ query: PRODUCT_QUERY, lang, variables: { handle } });
  return data.product;
}

export async function getRecommendations(productId: string, lang: Locale, limit = 4): Promise<ProductCardData[]> {
  const data = await storefront<{ productRecommendations: ProductCardData[] | null }>({ query: RECOMMENDATIONS_QUERY, lang, variables: { productId } });
  return (data.productRecommendations ?? []).slice(0, limit);
}

/** Home page products: the configured collection, or best sellers. */
export async function getFeaturedProducts(lang: Locale): Promise<ProductCardData[]> {
  const { featuredCollection, featuredOnHome } = shopifyOptions();
  if (featuredOnHome <= 0) return [];
  if (featuredCollection) {
    const collection = await getCollectionWithProducts(featuredCollection, { lang, sort: "featured" });
    return collection?.products.nodes.slice(0, featuredOnHome) ?? [];
  }
  const { nodes } = await listProducts({ lang, sort: "best-selling" });
  return nodes.slice(0, featuredOnHome);
}

export async function getShopInfo(lang: Locale): Promise<ShopInfo> {
  return (await storefront<{ shop: ShopInfo }>({ query: SHOP_QUERY, lang })).shop;
}

/** Listing, every collection and every product (capped at 5 000) in all locales. */
export async function shopifySitemapEntries(): Promise<SitemapEntryLike[]> {
  const lang = siteConfig.defaultLocale;
  const all = (path: (l: string) => string) => Object.fromEntries(siteConfig.locales.map((l) => [l, path(l)]));
  const entries: SitemapEntryLike[] = [{ paths: all((l) => shopPath(l)) }];
  try {
    for (const collection of await listCollections(lang, 250)) {
      entries.push({ paths: all((l) => collectionPath(l, collection.handle)), lastModified: new Date(collection.updatedAt) });
    }
    let after: string | null = null;
    for (let page = 0; page < 20; page++) {
      const { products }: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { handle: string; updatedAt: string }[] } } =
        await storefront({ query: SITEMAP_PRODUCTS_QUERY, lang, variables: { after } });
      for (const product of products.nodes) {
        entries.push({ paths: all((l) => shopPath(l, product.handle)), lastModified: new Date(product.updatedAt) });
      }
      if (!products.pageInfo.hasNextPage) break;
      after = products.pageInfo.endCursor;
    }
  } catch (error) {
    // A Shopify outage must not take the whole sitemap down.
    console.error("[shopify] sitemap:", error);
  }
  return entries;
}
