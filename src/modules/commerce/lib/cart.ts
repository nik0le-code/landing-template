/**
 * The visitor's cart session. The backend keeps the cart; the visitor holds only
 * its id or token, in an httpOnly cookie (it grants access to the cart). A second,
 * script-readable cookie keeps the item count so the header badge works on
 * prerendered pages without a request.
 */
import type { AstroCookies } from "astro";
import type { Locale } from "@site-config";
import { consume } from "@/lib/rate-limit";
import { getCommerce } from "./provider";
import type { CartResponse, CommerceErrorCode, CommerceSession, SelectedOption } from "./types";

export const CART_COOKIE = "commerce_cart";
export const CART_COUNT_COOKIE = "commerce_cart_count";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const MAX_LINE_QUANTITY = 99;

export interface RequestContext {
  cookies: AstroCookies;
  url: URL;
  clientAddress: string;
  lang: Locale;
}

const isLocalHttp = (url: URL) => url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
export const cookieDefaults = (url: URL) => ({ path: "/", sameSite: "lax", secure: !isLocalHttp(url) }) as const;

export function sessionFrom(context: RequestContext): CommerceSession {
  return { lang: context.lang, clientAddress: context.clientAddress, token: context.cookies.get(CART_COOKIE)?.value ?? null };
}

/** Keeps the cookies in line with what the backend returned (new token, count, or a cart that is gone). */
export function storeSession(context: RequestContext, response: { token: string | null; cart?: { totalQuantity: number } | null }) {
  const common = { ...cookieDefaults(context.url), maxAge: COOKIE_MAX_AGE };
  if (response.token) context.cookies.set(CART_COOKIE, response.token, { ...common, httpOnly: true });
  else context.cookies.delete(CART_COOKIE, { path: "/" });
  if (response.token && response.cart) context.cookies.set(CART_COUNT_COOKIE, String(response.cart.totalQuantity), common);
  else if (!response.token) context.cookies.delete(CART_COUNT_COOKIE, { path: "/" });
}

export function forgetCart(context: RequestContext) {
  storeSession(context, { token: null });
}

/** The visitor's cart (null when there is none), refreshing the cookies. */
export async function readCart(context: RequestContext) {
  const session = sessionFrom(context);
  if (!session.token) return null;
  const commerce = await getCommerce();
  const response = await commerce.getCart(session);
  storeSession(context, response);
  return response.cart;
}

export type CartIntent =
  | { intent: "add"; merchandiseId?: string; handle?: string; options: SelectedOption[]; quantity: number }
  | { intent: "update"; lineId: string; quantity: number }
  | { intent: "remove"; lineId: string }
  | { intent: "discount"; code: string }
  | { intent: "discount-remove"; code: string };

export type CartResult = { ok: true; response: CartResponse } | { ok: false; code: CommerceErrorCode; message?: string };

/** Applies one cart change for the visitor and refreshes the cookies. */
export async function applyCartIntent(context: RequestContext, change: CartIntent): Promise<CartResult> {
  if (!consume(`commerce-cart:${context.clientAddress}`, 60, 60_000).allowed) return { ok: false, code: "rateLimited" };

  try {
    const commerce = await getCommerce();
    const session = sessionFrom(context);
    if (change.intent !== "add" && !session.token) return { ok: false, code: "notFound" };

    const response =
      change.intent === "add"
        ? await commerce.addLine(session, change)
        : change.intent === "update"
          ? change.quantity > 0
            ? await commerce.updateLine(session, change.lineId, change.quantity)
            : await commerce.removeLine(session, change.lineId)
          : change.intent === "remove"
            ? await commerce.removeLine(session, change.lineId)
            : change.intent === "discount"
              ? await commerce.applyDiscount(session, change.code)
              : await commerce.removeDiscount(session, change.code);

    storeSession(context, response);
    if (response.error) return { ok: false, code: response.error.code, message: response.error.message };
    if (!response.cart) return { ok: false, code: "notFound" };
    return { ok: true, response };
  } catch (error) {
    // Details stay in the server log; the visitor gets the generic "shop unavailable" message.
    console.error("[commerce] cart:", error);
    return { ok: false, code: "backend" };
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
    case "discount-remove": {
      const code = text("code");
      return code && code.length <= 100 ? { intent: text("intent") as "discount" | "discount-remove", code } : null;
    }
    default:
      return null;
  }
}
