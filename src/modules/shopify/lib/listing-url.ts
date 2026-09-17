/** URL helpers for the listing's GET state (filters, price, sort, cursors). */

/** Copy of `url` changed by `mutate`, always back on the first page. */
export function listingHref(url: URL, mutate: (params: URLSearchParams) => void): string {
  const next = new URL(url);
  next.searchParams.delete("after");
  next.searchParams.delete("before");
  mutate(next.searchParams);
  const search = next.searchParams.toString();
  return next.pathname + (search ? `?${search}` : "");
}

export const withoutFilter = (url: URL, input: string) =>
  listingHref(url, (params) => {
    const rest = params.getAll("filter").filter((value) => value !== input);
    params.delete("filter");
    rest.forEach((value) => params.append("filter", value));
  });

export const withPrice = (url: URL, min?: number, max?: number) =>
  listingHref(url, (params) => {
    params.delete("price_min");
    params.delete("price_max");
    if (min !== undefined) params.set("price_min", String(min));
    if (max !== undefined) params.set("price_max", String(max));
  });

/** Upper bound of Shopify's PRICE_RANGE filter (`{"price":{"min":0,"max":120}}`). */
export function priceBounds(input: string | undefined): { min: number; max: number } | null {
  try {
    const { price } = JSON.parse(input ?? "") as { price?: { min?: number; max?: number } };
    return price && typeof price.max === "number" && price.max > (price.min ?? 0) ? { min: Math.floor(price.min ?? 0), max: Math.ceil(price.max) } : null;
  } catch {
    return null;
  }
}
