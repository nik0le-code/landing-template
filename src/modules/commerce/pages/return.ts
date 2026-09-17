/**
 * Where redirect payment gateways send the shopper back (through the WordPress
 * bridge plugin or the gateway's return URL). Clears the cart after a payment and
 * shows the order page in the language the order was placed in.
 */
import type { APIRoute } from "astro";
import { siteConfig } from "@site-config";
import { forgetCart } from "../lib/cart";
import { readRememberedOrder } from "../lib/checkout";
import { cartPath, shopPath } from "../lib/format";

export const prerender = false;

export const GET: APIRoute = ({ cookies, url, clientAddress }) => {
  const order = readRememberedOrder(cookies);
  const requested = url.searchParams.get("order");
  const failed = ["failed", "cancelled"].includes(url.searchParams.get("payment") ?? "");
  const redirect = (location: string) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });

  if (!order || (requested && requested !== order.id)) {
    // Another browser (or an old order): the order page shows only a generic confirmation.
    const lang = siteConfig.defaultLocale;
    return redirect(/^\d+$/.test(requested ?? "") ? cartPath(lang, `order/${requested}`) : shopPath(lang));
  }

  // A declined or cancelled payment keeps the cart, so the shopper can try again.
  if (!failed) forgetCart({ cookies, url, clientAddress, lang: order.lang });
  return redirect(`${cartPath(order.lang, `order/${order.id}`)}${failed ? "?payment=failed" : ""}`);
};
