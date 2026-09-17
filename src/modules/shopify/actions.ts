import { ActionError, defineAction } from "astro:actions";
import { isLocale } from "@/i18n";
import { applyCartIntent, intentFromForm } from "./lib/cart";

/** `actions.shopify.*` */
export const actions = {
  /**
   * Public: every cart form (add, quantity, remove, discount) when JavaScript is
   * available; without it the same forms post to /[lang]/<cartPath>/update.
   *
   * Takes the raw FormData instead of a Zod object on purpose: the add form sends
   * one `option:<Name>` field per product option, and those names are only known
   * per product. `intentFromForm` validates every field.
   */
  cart: defineAction({
    accept: "form",
    handler: async (data, context) => {
      const change = intentFromForm(data);
      if (!change) throw new ActionError({ code: "BAD_REQUEST", message: JSON.stringify({ code: "invalid" }) });
      const lang = String(data.get("lang") ?? "");
      const result = await applyCartIntent(
        { cookies: context.cookies, url: context.url, clientAddress: context.clientAddress, lang: isLocale(lang) ? lang : context.locals.lang },
        change,
      );
      if (!result.ok) {
        throw new ActionError({
          code: result.code === "rateLimited" ? "TOO_MANY_REQUESTS" : result.code === "shopify" ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST",
          message: JSON.stringify({ code: result.code, message: result.message }),
        });
      }
      return { totalQuantity: result.cart.totalQuantity };
    },
  }),
};
