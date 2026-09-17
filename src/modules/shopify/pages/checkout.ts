/** Sends the visitor to Shopify's hosted checkout for their current cart. */
import type { APIRoute } from "astro";
import { readCart } from "../lib/cart";
import { cartPath } from "../lib/format";

export const prerender = false;

export const GET: APIRoute = async ({ cookies, url, clientAddress, locals }) => {
  const cart = await readCart({ cookies, url, clientAddress, lang: locals.lang }).catch((error: unknown) => {
    console.error("[shopify] checkout:", error);
    return null;
  });
  const location = cart && cart.totalQuantity > 0 ? cart.checkoutUrl : `${cartPath(locals.lang)}${cart ? "" : "?cart_error=shopify"}`;
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
};
