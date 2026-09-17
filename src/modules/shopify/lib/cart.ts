/**
 * Cart state lives in Shopify; the visitor only holds its id, in an httpOnly
 * cookie (the id carries a secret `key`). A second, script-readable cookie keeps
 * the item count so the header badge works on prerendered pages without a request.
 */
import type { AstroCookies } from "astro";
import type { Locale } from "@site-config";
import { consume } from "@/lib/rate-limit";
import { storefront } from "./client";
import {
  CART_CREATE,
  CART_DISCOUNT_CODES,
  CART_LINES_ADD,
  CART_LINES_REMOVE,
  CART_LINES_UPDATE,
  CART_QUERY,
  VARIANT_BY_OPTIONS_QUERY,
} from "./queries";
import type { Cart, CartUserError, SelectedOption } from "./types";

export const CART_COOKIE = "shopify_cart";
export const CART_COUNT_COOKIE = "shopify_cart_count";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const MAX_LINE_QUANTITY = 99;

export interface CartContext {
  cookies: AstroCookies;
  url: URL;
  clientAddress: string;
  lang: Locale;
}

const isLocalHttp = (url: URL) => url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

function storeCart({ cookies, url }: CartContext, cart: Cart) {
  const common = { path: "/", sameSite: "lax", secure: !isLocalHttp(url), maxAge: COOKIE_MAX_AGE } as const;
  cookies.set(CART_COOKIE, cart.id, { ...common, httpOnly: true });
  cookies.set(CART_COUNT_COOKIE, String(cart.totalQuantity), common);
}

function forgetCart({ cookies }: CartContext) {
  cookies.delete(CART_COOKIE, { path: "/" });
  cookies.delete(CART_COUNT_COOKIE, { path: "/" });
}

/** The visitor's cart, or null. Clears the cookies when Shopify no longer knows the cart (expired or checked out). */
export async function readCart(context: CartContext): Promise<Cart | null> {
  const cartId = context.cookies.get(CART_COOKIE)?.value;
  if (!cartId) return null;
  const { cart } = await storefront<{ cart: Cart | null }>({ query: CART_QUERY, lang: context.lang, variables: { cartId }, buyerIp: context.clientAddress });
  if (cart) storeCart(context, cart);
  else forgetCart(context);
  return cart;
}

export type CartIntent =
  | { intent: "add"; merchandiseId?: string; handle?: string; options?: SelectedOption[]; quantity: number }
  | { intent: "update"; lineId: string; quantity: number }
  | { intent: "remove"; lineId: string }
  | { intent: "discount"; code: string };

export type CartErrorCode = "invalid" | "rateLimited" | "unavailable" | "notFound" | "shopify";
export type CartResult = { ok: true; cart: Cart } | { ok: false; code: CartErrorCode; message?: string };

type MutationPayload = { result: { cart: Cart | null; userErrors: CartUserError[] } };

async function resolveMerchandiseId(context: CartContext, intent: Extract<CartIntent, { intent: "add" }>) {
  if (intent.handle && intent.options?.length) {
    const { product } = await storefront<{ product: { variantBySelectedOptions: { id: string } | null } | null }>({
      query: VARIANT_BY_OPTIONS_QUERY,
      lang: context.lang,
      variables: { handle: intent.handle, selectedOptions: intent.options },
    });
    if (product?.variantBySelectedOptions) return product.variantBySelectedOptions.id;
  }
  return intent.merchandiseId?.startsWith("gid://shopify/ProductVariant/") ? intent.merchandiseId : null;
}

/** Applies one cart change for the visitor (creating the cart on first add) and refreshes the cookies. */
export async function applyCartIntent(context: CartContext, change: CartIntent): Promise<CartResult> {
  if (!consume(`shopify-cart:${context.clientAddress}`, 60, 60_000).allowed) return { ok: false, code: "rateLimited" };

  try {
    const cartId = context.cookies.get(CART_COOKIE)?.value;
    const request = { lang: context.lang, buyerIp: context.clientAddress };
    let payload: MutationPayload | null = null;

    if (change.intent === "add") {
      const merchandiseId = await resolveMerchandiseId(context, change);
      if (!merchandiseId) return { ok: false, code: "unavailable" };
      const lines = [{ merchandiseId, quantity: change.quantity }];
      if (cartId) payload = await storefront<MutationPayload>({ ...request, query: CART_LINES_ADD, variables: { cartId, lines } }).catch(() => null);
      // No cart yet, or the stored one expired / was checked out: start a new one.
      if (!payload?.result.cart) payload = await storefront<MutationPayload>({ ...request, query: CART_CREATE, variables: { lines } });
    } else {
      if (!cartId) return { ok: false, code: "notFound" };
      const operation =
        change.intent === "update"
          ? change.quantity > 0
            ? { query: CART_LINES_UPDATE, variables: { cartId, lines: [{ id: change.lineId, quantity: change.quantity }] } }
            : { query: CART_LINES_REMOVE, variables: { cartId, lineIds: [change.lineId] } }
          : change.intent === "remove"
            ? { query: CART_LINES_REMOVE, variables: { cartId, lineIds: [change.lineId] } }
            : { query: CART_DISCOUNT_CODES, variables: { cartId, discountCodes: change.code ? [change.code] : [] } };
      payload = await storefront<MutationPayload>({ ...request, ...operation });
    }

    const { cart, userErrors } = payload.result;
    if (!cart) {
      if (change.intent !== "add") forgetCart(context);
      return { ok: false, code: change.intent === "add" ? "unavailable" : "notFound", message: userErrors[0]?.message };
    }
    storeCart(context, cart);
    // Shopify still returns the cart with a warning-style error (e.g. quantity capped at stock).
    if (userErrors.length) return { ok: false, code: "unavailable", message: userErrors[0]!.message };
    return { ok: true, cart };
  } catch (error) {
    console.error("[shopify] cart:", error);
    // Details stay in the server log; the visitor gets the generic "shop unavailable" message.
    return { ok: false, code: "shopify" };
  }
}

/** Parses the fields posted by the cart forms (shared by the action and the no-JS endpoint). */
export function intentFromForm(data: FormData): CartIntent | null {
  const text = (name: string) => String(data.get(name) ?? "").trim();
  const quantity = Math.trunc(Number(text("quantity") || "1"));
  const validQuantity = Number.isFinite(quantity) && quantity >= 0 && quantity <= MAX_LINE_QUANTITY;

  switch (text("intent")) {
    case "add": {
      const options = [...data.entries()]
        .filter(([key, value]) => key.startsWith("option:") && typeof value === "string" && value)
        .map(([key, value]) => ({ name: key.slice("option:".length), value: String(value) }));
      if (!validQuantity || quantity < 1) return null;
      return { intent: "add", merchandiseId: text("merchandiseId") || undefined, handle: text("handle") || undefined, options, quantity };
    }
    case "update":
      return text("lineId") && validQuantity ? { intent: "update", lineId: text("lineId"), quantity } : null;
    case "remove":
      return text("lineId") ? { intent: "remove", lineId: text("lineId") } : null;
    case "discount":
      return text("code").length <= 100 ? { intent: "discount", code: text("code") } : null;
    default:
      return null;
  }
}
