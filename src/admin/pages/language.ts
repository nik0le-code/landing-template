import type { APIRoute } from "astro";
import { isLocale } from "@/i18n";

/** Switches the admin UI language (cookie) and returns to the previous admin page. */
export const GET: APIRoute = ({ params, cookies, request, redirect }) => {
  if (isLocale(params.lang)) {
    cookies.set("admin_lang", params.lang, { path: "/admin", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, httpOnly: true });
  }
  const referer = request.headers.get("referer");
  const back = referer ? new URL(referer).pathname : "/admin";
  return redirect(back.startsWith("/admin") ? back : "/admin", 303);
};
