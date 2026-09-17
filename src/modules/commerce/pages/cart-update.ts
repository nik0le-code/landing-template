/**
 * Cart form target when JavaScript is unavailable: applies the change and
 * redirects back (Post/Redirect/Get), with `?cart_error=<code>` on failure.
 */
import type { APIRoute } from "astro";
import { applyCartIntent, intentFromForm } from "../lib/cart";
import { cartPath } from "../lib/format";

export const prerender = false;

/** Only same-site paths, so the form can't be turned into an open redirect. */
const safeReturnPath = (value: FormDataEntryValue | null, fallback: string) => {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : fallback;
};

export const GET: APIRoute = ({ locals }) => new Response(null, { status: 303, headers: { Location: cartPath(locals.lang) } });

export const POST: APIRoute = async ({ request, cookies, url, clientAddress, locals }) => {
  const lang = locals.lang;
  const data = await request.formData().catch(() => new FormData());
  const change = intentFromForm(data);
  const result = change ? await applyCartIntent({ cookies, url, clientAddress, lang }, change) : ({ ok: false, code: "invalid" } as const);

  // A successful add lands on the cart so the visitor sees what happened.
  const target = new URL(result.ok && change?.intent === "add" ? cartPath(lang) : safeReturnPath(data.get("returnTo"), cartPath(lang)), url);
  if (!result.ok) target.searchParams.set("cart_error", result.code);
  return new Response(null, { status: 303, headers: { Location: target.pathname + target.search, "Cache-Control": "no-store" } });
};
