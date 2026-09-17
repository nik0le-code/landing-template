/** WooCommerce Store API → commerce contract. */
import type { Locale } from "@site-config";
import { decodeEntities, fromMinorUnits } from "@/modules/commerce/lib/format";
import type {
  Address,
  Cart,
  CartResponse,
  CheckoutState,
  CheckoutStateResponse,
  Collection,
  CommerceErrorCode,
  CommerceImage,
  CommerceProvider,
  CommerceSession,
  ListingQuery,
  Money,
  OrderSummary,
  Product,
  ProductCardData,
  ProductConnection,
  ProductFilter,
  ProductVariant,
} from "@/modules/commerce/lib/types";
import type { SortOption } from "@/modules/commerce/options";
import { getModuleOptions, translateModule } from "@/modules/registry";
import { PAYMENT_ALIASES, wooDefaults } from "../options";
import { store, WooError } from "./client";
import { wooConfig } from "./config";

// ---------------------------------------------------------------- raw shapes

interface WooPrices {
  price: string;
  regular_price: string;
  sale_price: string;
  price_range: { min_amount: string; max_amount: string } | null;
  currency_code: string;
  currency_minor_unit: number;
}

interface WooImage {
  id: number;
  src: string;
  srcset?: string;
  alt: string;
  name?: string;
}

interface WooTerm {
  id: number;
  name: string;
  slug: string;
}

interface WooProduct {
  id: number;
  name: string;
  slug: string;
  parent: number;
  type: string;
  permalink: string;
  sku: string;
  short_description: string;
  description: string;
  on_sale: boolean;
  prices: WooPrices;
  images: WooImage[];
  categories: (WooTerm & { link: string })[];
  attributes: { id: number; name: string; taxonomy: string; has_variations: boolean; terms: WooTerm[] }[];
  variations: { id: number; attributes: { name: string; value: string }[] }[];
  is_purchasable: boolean;
  is_in_stock: boolean;
  brands?: WooTerm[];
}

interface WooCategory extends WooTerm {
  description: string;
  count: number;
  parent: number;
  image: WooImage | null;
}

interface WooCartTotals {
  total_items: string;
  total_discount: string;
  total_shipping: string | null;
  total_tax: string;
  total_price: string;
  currency_code: string;
  currency_minor_unit: number;
}

interface WooCart {
  items: {
    key: string;
    id: number;
    quantity: number;
    quantity_limits: { maximum: number };
    name: string;
    permalink: string;
    images: WooImage[];
    variation: { attribute: string; value: string }[];
    prices: WooPrices;
    totals: { line_subtotal: string; line_total: string; currency_code: string; currency_minor_unit: number };
  }[];
  coupons: { code: string }[];
  totals: WooCartTotals;
  items_count: number;
  needs_shipping: boolean;
  shipping_rates: {
    package_id: number | string;
    shipping_rates: { rate_id: string; name: string; price: string; selected: boolean; currency_code: string; currency_minor_unit: number }[];
  }[];
  billing_address: Address;
  shipping_address: Omit<Address, "email">;
  payment_methods: string[];
}

// ---------------------------------------------------------------- lookups (categories, attributes)

const cache = new Map<string, { expires: number; value: Promise<unknown> }>();

function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { expires: Date.now() + getModuleOptions("woocommerce", wooDefaults).lookupCacheSeconds * 1000, value });
  value.catch(() => cache.delete(key));
  return value;
}

/** Called by the webhook so renamed categories or new terms show up at once. */
export const clearLookups = () => cache.clear();

const categories = () =>
  remember("categories", async () => (await store<WooCategory[]>("/products/categories", { query: { per_page: 100 } })).data);

const attributes = () =>
  remember("attributes", async () => {
    const { data } = await store<{ id: number; name: string; taxonomy: string }[]>("/products/attributes");
    const { filterAttributes } = getModuleOptions("woocommerce", wooDefaults);
    const wanted = filterAttributes.length ? data.filter((a) => filterAttributes.includes(a.taxonomy)) : data;
    return Promise.all(
      wanted.map(async (a) => ({ ...a, terms: (await store<WooTerm[]>(`/products/attributes/${a.id}/terms`, { query: { per_page: 100 } })).data })),
    );
  });

// ---------------------------------------------------------------- mapping

const money = (value: string | number, unit: { currency_code: string; currency_minor_unit: number }): Money =>
  fromMinorUnits(value, unit.currency_code, unit.currency_minor_unit);

const plain = (html: string) => decodeEntities(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

function image(source: WooImage | null | undefined): CommerceImage | null {
  if (!source?.src) return null;
  return { url: source.src, altText: source.alt || null, width: null, height: null, srcset: source.srcset || null };
}

function card(p: WooProduct): ProductCardData {
  const min = p.prices.price_range?.min_amount ?? p.prices.price;
  const max = p.prices.price_range?.max_amount ?? p.prices.price;
  const regular = Number(p.prices.regular_price);
  return {
    id: String(p.id),
    handle: p.slug,
    title: decodeEntities(p.name),
    vendor: p.brands?.[0] ? decodeEntities(p.brands[0].name) : "",
    availableForSale: p.is_in_stock && p.is_purchasable,
    image: image(p.images[0]),
    price: money(min, p.prices),
    maxPrice: money(max, p.prices),
    compareAtPrice: p.on_sale && regular > Number(min) ? money(regular, p.prices) : null,
  };
}

/** "walnut" → "Walnut" using the product's attribute terms (variations carry slugs). */
function optionValue(p: WooProduct, attributeName: string, slug: string) {
  const attribute = p.attributes.find((a) => a.name === attributeName);
  return decodeEntities(attribute?.terms.find((t) => t.slug === slug)?.name ?? slug);
}

async function product(p: WooProduct): Promise<Product> {
  let variants: ProductVariant[];
  if (p.type === "variable" && p.variations.length) {
    // The parent lists variation ids and attributes only; price, stock and image live on each variation.
    const details = await Promise.all(p.variations.slice(0, 100).map((v) => store<WooProduct>(`/products/${v.id}`).then((r) => r.data)));
    variants = p.variations.slice(0, 100).map((v, index) => {
      const detail = details[index]!;
      const regular = Number(detail.prices.regular_price);
      return {
        id: String(v.id),
        title: v.attributes.map((a) => optionValue(p, a.name, a.value)).join(" / "),
        sku: detail.sku || null,
        availableForSale: detail.is_in_stock && detail.is_purchasable,
        selectedOptions: v.attributes.map((a) => ({ name: decodeEntities(a.name), value: optionValue(p, a.name, a.value) })),
        price: money(detail.prices.price, detail.prices),
        compareAtPrice: regular > Number(detail.prices.price) ? money(regular, detail.prices) : null,
        image: detail.images[0] && detail.images[0].id !== p.images[0]?.id ? image(detail.images[0]) : null,
      };
    });
  } else {
    const regular = Number(p.prices.regular_price);
    variants = [
      {
        id: String(p.id),
        title: decodeEntities(p.name),
        sku: p.sku || null,
        availableForSale: p.is_in_stock && p.is_purchasable,
        selectedOptions: [],
        price: money(p.prices.price, p.prices),
        compareAtPrice: regular > Number(p.prices.price) ? money(regular, p.prices) : null,
        image: null,
      },
    ];
  }

  const images = p.images.map((i) => image(i)!);
  // Variation images that aren't in the gallery are appended, so the gallery can show them.
  for (const variant of variants) if (variant.image && !images.some((i) => i.url === variant.image!.url)) images.push(variant.image);

  return {
    ...card(p),
    description: plain(p.short_description || p.description),
    descriptionHtml: p.description || p.short_description,
    updatedAt: null,
    seo: { title: null, description: plain(p.short_description) || null },
    images,
    options: p.attributes
      .filter((a) => a.has_variations)
      .map((a) => ({ name: decodeEntities(a.name), values: a.terms.map((t) => ({ name: decodeEntities(t.name), swatch: null })) })),
    variants,
    collections: p.categories.filter((c) => c.slug !== "uncategorized").map((c) => ({ handle: c.slug, title: decodeEntities(c.name) })),
  };
}

function collection(c: WooCategory): Collection {
  return {
    id: String(c.id),
    handle: c.slug,
    title: decodeEntities(c.name),
    description: plain(c.description),
    updatedAt: null,
    image: image(c.image),
    seo: { title: null, description: plain(c.description) || null },
  };
}

function handleFromPermalink(permalink: string) {
  try {
    return new URL(permalink).pathname.split("/").filter(Boolean).pop() ?? "";
  } catch {
    return "";
  }
}

function cart(c: WooCart): Cart {
  const t = c.totals;
  const hasRates = c.shipping_rates.some((p) => p.shipping_rates.length > 0);
  return {
    totalQuantity: c.items_count,
    subtotal: money(t.total_items, t),
    discount: Number(t.total_discount) > 0 ? money(t.total_discount, t) : null,
    shipping: c.needs_shipping && hasRates && t.total_shipping !== null ? money(t.total_shipping, t) : null,
    tax: Number(t.total_tax) > 0 ? money(t.total_tax, t) : null,
    total: money(t.total_price, t),
    discountCodes: c.coupons.map((coupon) => ({ code: coupon.code, applicable: true })),
    lines: c.items.map((item) => {
      const regular = Number(item.prices.regular_price);
      return {
        id: item.key,
        quantity: item.quantity,
        total: money(item.totals.line_subtotal, item.totals),
        unitPrice: money(item.prices.price, item.prices),
        compareAtUnitPrice: regular > Number(item.prices.price) ? money(regular, item.prices) : null,
        available: true,
        maxQuantity: item.quantity_limits.maximum >= 9999 ? null : item.quantity_limits.maximum,
        options: item.variation.map((v) => ({ name: decodeEntities(v.attribute), value: decodeEntities(v.value) })),
        image: image(item.images[0]),
        productHandle: handleFromPermalink(item.permalink),
        productTitle: decodeEntities(item.name),
      };
    }),
  };
}

/** The configured payment methods (aliases resolved) that WooCommerce offers for this cart, in config order. */
export function allowedPaymentMethods(available: string[]): string[] {
  const configured = getModuleOptions("woocommerce", wooDefaults).paymentMethods;
  if (!configured.length) return available;
  const ids = configured.map((name) => PAYMENT_ALIASES[name as keyof typeof PAYMENT_ALIASES] ?? name);
  return [...new Set(ids)].filter((id) => available.includes(id));
}

function checkoutState(c: WooCart): CheckoutState {
  return {
    cart: cart(c),
    billing: c.billing_address,
    shipping: { ...c.shipping_address, email: c.billing_address.email },
    needsShipping: c.needs_shipping,
    packages: c.shipping_rates.map((pkg) => ({
      packageId: String(pkg.package_id),
      rates: pkg.shipping_rates.map((rate) => ({ id: rate.rate_id, label: rate.name, price: money(rate.price, rate), selected: rate.selected })),
    })),
    paymentMethods: allowedPaymentMethods(c.payment_methods),
  };
}

// ---------------------------------------------------------------- listing

const SORTS: readonly SortOption[] = ["featured", "best-selling", "newest", "price-asc", "price-desc", "title"];
const ORDER: Record<SortOption, [string, "asc" | "desc"]> = {
  featured: ["menu_order", "asc"],
  "best-selling": ["popularity", "desc"],
  newest: ["date", "desc"],
  "price-asc": ["price", "asc"],
  "price-desc": ["price", "desc"],
  title: ["title", "asc"],
};

interface ParsedFilters {
  attributes: Map<string, string[]>;
  inStock: boolean;
  price: { min?: number; max?: number } | null;
}

function parseFilters(inputs: string[] = []): ParsedFilters {
  const parsed: ParsedFilters = { attributes: new Map(), inStock: false, price: null };
  for (const input of inputs) {
    try {
      const value = JSON.parse(input) as { attribute?: string; slug?: string; stock_status?: string; price?: { min?: number; max?: number } };
      if (value.attribute && value.slug && /^pa_[\w-]+$/.test(value.attribute)) {
        parsed.attributes.set(value.attribute, [...(parsed.attributes.get(value.attribute) ?? []), value.slug]);
      } else if (value.stock_status === "instock") {
        parsed.inStock = true;
      } else if (value.price) {
        parsed.price = value.price;
      }
    } catch {
      // Ignore malformed input from the URL.
    }
  }
  return parsed;
}

/** Store API query parameters for the filters (shared by /products and /products/collection-data). */
function filterParams(params: URLSearchParams, filters: ParsedFilters, minorUnit = 2) {
  let index = 0;
  for (const [taxonomy, slugs] of filters.attributes) {
    params.set(`attributes[${index}][attribute]`, taxonomy);
    slugs.forEach((slug) => params.append(`attributes[${index}][slug][]`, slug));
    params.set(`attributes[${index}][operator]`, "in");
    index++;
  }
  if (filters.inStock) params.append("stock_status[]", "instock");
  if (filters.price?.min !== undefined) params.set("min_price", String(Math.round(filters.price.min * 10 ** minorUnit)));
  if (filters.price?.max !== undefined) params.set("max_price", String(Math.round(filters.price.max * 10 ** minorUnit)));
}

async function facets(base: URLSearchParams, filters: ParsedFilters, lang: Locale): Promise<ProductFilter[]> {
  const attrs = await attributes();
  const params = new URLSearchParams(base);
  params.set("calculate_price_range", "true");
  params.set("calculate_stock_status_counts", "true");
  attrs.forEach((a, i) => {
    params.set(`calculate_attribute_counts[${i}][taxonomy]`, a.taxonomy);
    params.set(`calculate_attribute_counts[${i}][query_type]`, "or");
  });
  // Counts reflect the other active filters, as in WooCommerce's own filter blocks.
  filterParams(params, { ...filters, price: null });
  const { data } = await store<{
    price_range: { min_price: string; max_price: string; currency_code: string; currency_minor_unit: number } | null;
    attribute_counts: { term: number; count: number }[] | null;
    stock_status_counts: { status: string; count: string | number }[] | null;
  }>("/products/collection-data", { query: params });

  const counts = new Map((data.attribute_counts ?? []).map((c) => [c.term, Number(c.count)]));
  const result: ProductFilter[] = [];
  for (const attribute of attrs) {
    const active = filters.attributes.get(attribute.taxonomy) ?? [];
    const values = attribute.terms
      .filter((term) => counts.has(term.id) || active.includes(term.slug))
      .map((term) => ({
        id: `${attribute.taxonomy}:${term.slug}`,
        label: decodeEntities(term.name),
        count: counts.get(term.id) ?? 0,
        input: JSON.stringify({ attribute: attribute.taxonomy, slug: term.slug }),
        swatch: null,
      }));
    if (values.length) result.push({ id: attribute.taxonomy, label: decodeEntities(attribute.name), type: "LIST", values });
  }

  const inStock = Number(data.stock_status_counts?.find((s) => s.status === "instock")?.count ?? 0);
  if (getModuleOptions("woocommerce", wooDefaults).stockFilter && (inStock > 0 || filters.inStock)) {
    const t = (key: string) => translateModule(lang, "woocommerce", key);
    result.push({
      id: "stock_status",
      label: t("filters.availability"),
      type: "BOOLEAN",
      values: [{ id: "instock", label: t("filters.inStock"), count: inStock, input: JSON.stringify({ stock_status: "instock" }), swatch: null }],
    });
  }

  const range = data.price_range;
  if (range && Number(range.max_price) > Number(range.min_price)) {
    const min = money(range.min_price, range).amount;
    const max = money(range.max_price, range).amount;
    result.push({
      id: "price",
      label: "Price",
      type: "PRICE_RANGE",
      values: [{ id: "price", label: "Price", count: 0, input: JSON.stringify({ price: { min: Number(min), max: Number(max) } }), swatch: null }],
    });
  }
  return result;
}

async function listing(query: ListingQuery, extra: Record<string, string>, withFacets: boolean): Promise<ProductConnection> {
  const page = Math.max(1, Number(query.before ?? query.after ?? 1) || 1);
  const filters = parseFilters(query.filters);
  const base = new URLSearchParams(extra);
  const params = new URLSearchParams(base);
  const [orderby, order] = ORDER[query.sort];
  params.set("orderby", orderby);
  params.set("order", order);
  params.set("per_page", String(query.pageSize));
  params.set("page", String(page));
  filterParams(params, filters);

  const [{ data, headers }, filterList] = await Promise.all([
    store<WooProduct[]>("/products", { query: params }),
    withFacets ? facets(base, filters, query.lang).catch(() => []) : Promise.resolve([]),
  ]);
  const totalPages = Number(headers.get("X-WP-TotalPages") ?? 1);
  return {
    products: data.map(card),
    filters: filterList,
    pageInfo: { nextCursor: page < totalPages ? String(page + 1) : null, previousCursor: page > 1 ? String(page - 1) : null },
  };
}

// ---------------------------------------------------------------- cart

const ERROR_CODES: [RegExp, CommerceErrorCode][] = [
  [/coupon/, "coupon"],
  [/cart_invalid_key|cart_item_not_found|invalid_cart_token/, "notFound"],
  [/stock|purchasable|quantity|invalid_variation|missing_variation|product_invalid|invalid_product|too_many/, "unavailable"],
];

function cartError(error: unknown, token: string | null): CartResponse {
  if (!(error instanceof WooError) || error.status >= 500) throw error;
  const code = ERROR_CODES.find(([pattern]) => pattern.test(error.code))?.[1] ?? "invalid";
  return { cart: null, token: error.token ?? token, error: { code, message: decodeEntities(error.message) } };
}

/** Runs a cart request; a failed change still returns the current cart so the UI stays accurate. */
async function cartCall(session: CommerceSession, path: string, body?: unknown): Promise<CartResponse> {
  try {
    const { data, token } = await store<WooCart>(path, { method: body === undefined ? "GET" : "POST", body, token: session.token, clientAddress: session.clientAddress });
    return { cart: cart(data), token };
  } catch (error) {
    const failed = cartError(error, session.token);
    if (failed.error?.code === "notFound" && /token/.test((error as WooError).code)) return { cart: null, token: null, error: failed.error };
    const current = failed.token ? await wooProvider.getCart({ ...session, token: failed.token }).catch(() => null) : null;
    return { cart: current?.cart ?? null, token: current?.token ?? failed.token, error: failed.error };
  }
}

/** A cart token for a visitor without one (the first add creates the session). */
async function ensureToken(session: CommerceSession): Promise<string> {
  if (session.token) return session.token;
  const { token } = await store<WooCart>("/cart", { clientAddress: session.clientAddress });
  if (!token) throw new WooError("WooCommerce did not issue a Cart-Token.", 502, "no_token");
  return token;
}

async function stateCall(session: CommerceSession, path: string, body?: unknown): Promise<CheckoutStateResponse> {
  try {
    const { data, token } = await store<WooCart>(path, { method: body === undefined ? "GET" : "POST", body, token: session.token, clientAddress: session.clientAddress });
    return { state: checkoutState(data), token };
  } catch (error) {
    const failed = cartError(error, session.token);
    const current = failed.token ? await store<WooCart>("/cart", { token: failed.token }).catch(() => null) : null;
    return { state: current ? checkoutState(current.data) : null, token: current?.token ?? failed.token, error: failed.error };
  }
}

const shippingAddress = ({ email: _email, ...address }: Address) => address;

/**
 * Offline gateways "redirect" to the order-received page; redirect gateways (Viva.com,
 * bank gateways, PayPal) to the page where the shopper pays, often WordPress's own
 * order-pay step that forwards to the gateway. Only the latter is followed.
 */
function gatewayRedirect(url: string | undefined): string | null {
  if (!url || !/^https?:\/\//.test(url)) return null;
  const { pathname, searchParams } = new URL(url);
  const orderReceived = pathname.includes("/order-received/") || searchParams.has("order-received") || pathname.endsWith("/commerce/return");
  return orderReceived ? null : url;
}

const ORDER_STATUS: Record<string, OrderSummary["status"]> = {
  processing: "paid",
  completed: "paid",
  "on-hold": "paid",
  pending: "pending",
  "checkout-draft": "pending",
  failed: "failed",
  cancelled: "cancelled",
};

// ---------------------------------------------------------------- provider

export const wooProvider: CommerceProvider = {
  name: "WooCommerce",
  isConfigured: () => wooConfig() !== null,
  sorts: { all: SORTS, collection: SORTS, search: SORTS },

  listProducts: (query) => listing(query, {}, true),

  searchProducts: (term, query) => listing(query, { search: term }, true),

  async getCollection(handle, query) {
    const category = (await categories()).find((c) => c.slug === handle);
    if (!category) return null;
    return { collection: collection(category), connection: await listing(query, { category: String(category.id) }, true) };
  },

  async listCollections() {
    return (await categories()).filter((c) => c.count > 0 && c.slug !== "uncategorized").map(collection);
  },

  async getProduct(handle) {
    const { data } = await store<WooProduct[]>("/products", { query: { slug: handle, per_page: 1 } });
    const found = data.find((p) => p.slug === handle && p.parent === 0);
    return found ? product(found) : null;
  },

  async getRecommendations(item, _lang, limit) {
    const category = item.collections[0] && (await categories()).find((c) => c.slug === item.collections[0]!.handle);
    if (!category) return [];
    const { data } = await store<WooProduct[]>("/products", { query: { category: category.id, per_page: limit + 1, orderby: "popularity", order: "desc" } });
    return data.filter((p) => String(p.id) !== item.id).slice(0, limit).map(card);
  },

  async sitemap() {
    const products: { handle: string; updatedAt: string | null }[] = [];
    for (let page = 1; page <= 50; page++) {
      const { data, headers } = await store<WooProduct[]>("/products", { query: { per_page: 100, page } });
      products.push(...data.map((p) => ({ handle: p.slug, updatedAt: null })));
      if (page >= Number(headers.get("X-WP-TotalPages") ?? 1)) break;
    }
    const collections = (await this.listCollections("en" as Locale)).map((c) => ({ handle: c.handle, updatedAt: null }));
    return { products, collections };
  },

  async getCart(session) {
    if (!session.token) return { cart: null, token: null };
    try {
      const { data, token } = await store<WooCart>("/cart", { token: session.token, clientAddress: session.clientAddress });
      return { cart: cart(data), token };
    } catch (error) {
      // An expired or foreign token: start over rather than fail every page.
      if (error instanceof WooError && error.status < 500) return { cart: null, token: null };
      throw error;
    }
  },

  async addLine(session, input) {
    let id = /^\d+$/.test(input.merchandiseId ?? "") ? Number(input.merchandiseId) : null;
    // Without JavaScript the chosen options arrive instead of a variation id.
    if (input.handle && input.options.length) {
      const found = await this.getProduct(input.handle, session.lang);
      const variant = found?.variants.find((v) => input.options.every((o) => v.selectedOptions.some((s) => s.name === o.name && s.value === o.value)));
      if (variant) id = Number(variant.id);
    }
    if (!id) return { cart: null, token: session.token, error: { code: "unavailable" } };
    const token = await ensureToken(session);
    return cartCall({ ...session, token }, "/cart/add-item", { id, quantity: input.quantity });
  },

  updateLine: (session, lineId, quantity) => cartCall(session, "/cart/update-item", { key: lineId, quantity }),
  removeLine: (session, lineId) => cartCall(session, "/cart/remove-item", { key: lineId }),
  applyDiscount: (session, code) => cartCall(session, "/cart/apply-coupon", { code }),
  removeDiscount: (session, code) => cartCall(session, "/cart/remove-coupon", { code }),

  checkout: {
    kind: "native",

    getState: (session) => stateCall(session, "/cart"),

    updateCustomer: (session, { billing, shipping }) =>
      stateCall(session, "/cart/update-customer", { billing_address: billing, shipping_address: shippingAddress(shipping) }),

    selectShippingRate: (session, packageId, rateId) =>
      stateCall(session, "/cart/select-shipping-rate", { package_id: /^\d+$/.test(packageId) ? Number(packageId) : packageId, rate_id: rateId }),

    async placeOrder(session, input) {
      try {
        const { data, token } = await store<{
          order_id: number;
          order_number: string;
          order_key: string;
          payment_result: { payment_status: string; payment_details: { key: string; value: string }[]; redirect_url: string };
        }>("/checkout", {
          method: "POST",
          token: session.token,
          clientAddress: session.clientAddress,
          body: {
            billing_address: input.billing,
            shipping_address: shippingAddress(input.shipping),
            customer_note: input.note,
            payment_method: input.paymentMethod,
            payment_data: [],
          },
        });
        if (!["success", "pending"].includes(data.payment_result.payment_status)) {
          const message = data.payment_result.payment_details.find((d) => d.key === "message")?.value;
          return { ok: false, code: "backend", message, token };
        }
        return {
          ok: true,
          order: {
            id: String(data.order_id),
            number: data.order_number,
            key: data.order_key,
            email: input.billing.email,
            paymentMethod: input.paymentMethod,
            paymentUrl: gatewayRedirect(data.payment_result.redirect_url),
          },
        };
      } catch (error) {
        if (!(error instanceof WooError) || error.status >= 500) throw error;
        return { ok: false, code: "invalid", message: decodeEntities(error.message), token: error.token ?? session.token };
      }
    },

    async getOrder(_lang, reference) {
      try {
        const { data } = await store<{
          id: number;
          status: string;
          items: { name: string; quantity: number; totals: { line_subtotal: string; currency_code: string; currency_minor_unit: number } }[];
          totals: WooCartTotals & { subtotal: string };
          shipping_address: Omit<Address, "email">;
          billing_address: Address;
          needs_shipping: boolean;
        }>(`/order/${encodeURIComponent(reference.id)}`, { query: { key: reference.key, billing_email: reference.email } });
        const t = data.totals;
        return {
          id: String(data.id),
          number: String(data.id),
          status: ORDER_STATUS[data.status] ?? "other",
          needsPayment: data.status === "pending" || data.status === "failed",
          lines: data.items.map((item) => ({ title: item.name, quantity: item.quantity, total: money(item.totals.line_subtotal, item.totals) })),
          subtotal: money(t.subtotal, t),
          // needs_shipping is false for local pickup orders; a delivery address still means a shipping line.
          shipping: t.total_shipping !== null && (data.needs_shipping || data.shipping_address.address_1) ? money(t.total_shipping, t) : null,
          discount: Number(t.total_discount) > 0 ? money(t.total_discount, t) : null,
          tax: Number(t.total_tax) > 0 ? money(t.total_tax, t) : null,
          total: money(t.total_price, t),
          shippingAddress: { ...data.shipping_address, email: "" },
          billingAddress: data.billing_address,
        };
      } catch (error) {
        if (error instanceof WooError && error.status < 500) return null;
        throw error;
      }
    },
  },
};

/** Connection check for the admin dashboard. */
export async function wooStatus(): Promise<{ products: number; paymentMethods: string[]; missing: string[] }> {
  const [{ headers }, { data }] = await Promise.all([store<WooProduct[]>("/products", { query: { per_page: 1 } }), store<WooCart>("/cart")]);
  const configured = getModuleOptions("woocommerce", wooDefaults).paymentMethods.map((name) => PAYMENT_ALIASES[name as keyof typeof PAYMENT_ALIASES] ?? name);
  return {
    products: Number(headers.get("X-WP-Total") ?? 0),
    paymentMethods: allowedPaymentMethods(data.payment_methods),
    // Listed in modules.config.ts but not offered by WooCommerce (disabled, or missing credentials).
    missing: configured.filter((id) => !data.payment_methods.includes(id)),
  };
}
