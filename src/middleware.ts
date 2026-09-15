import { defineMiddleware, sequence } from "astro:middleware";
import { siteConfig } from "@site-config";
import { isLocale, splitLocale } from "@/i18n";
import { isNoindexDeployment } from "@/lib/site";
import { loadAuth, loadDatabase } from "@/modules/.generated/features";

const ADMIN_LANG_COOKIE = "admin_lang";
const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/admin/setup"]);

const isAdminPath = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/");
const isAdminApiPath = (pathname: string) => pathname.startsWith("/api/admin/");
const isActionRequest = (url: URL) => url.pathname.startsWith("/_actions/") || url.searchParams.has("_action");

/** Resolves `locals.lang` and 404s unknown locale prefixes on `/[lang]/…` routes. */
const locale = defineMiddleware(async (context, next) => {
  const { lang } = splitLocale(context.url.pathname);
  // Cookies only on admin routes: reading them on prerendered pages isn't possible.
  const adminLang = isAdminPath(context.url.pathname) ? context.cookies.get(ADMIN_LANG_COOKIE)?.value : undefined;
  context.locals.lang = lang ?? (isLocale(adminLang) ? adminLang : siteConfig.defaultLocale);

  if (context.routePattern.startsWith("/[lang]") && !isLocale(context.params.lang)) {
    return context.rewrite("/404");
  }
  return next();
});

/** Apply pending DB migrations before the first server-rendered request is handled. */
const database = defineMiddleware(async (context, next) => {
  if (loadDatabase && !context.isPrerendered) await (await loadDatabase()).ensureMigrated();
  return next();
});

/**
 * Admin authentication. Loads the session for admin pages, admin APIs and action
 * requests (actions enforce roles themselves via requireUser), and keeps
 * unauthenticated visitors out of /admin — including form posts to admin pages.
 */
const auth = defineMiddleware(async (context, next) => {
  context.locals.user = null;
  context.locals.sessionId = null;
  const { pathname } = context.url;
  const needsSession = isAdminPath(pathname) || isAdminApiPath(pathname) || isActionRequest(context.url);
  if (!loadAuth || !needsSession || context.isPrerendered) return next();

  const { validateSession } = await loadAuth();
  const session = await validateSession(context);
  if (session) {
    context.locals.user = session.user;
    context.locals.sessionId = session.sessionId;
  }

  if (!session && isAdminApiPath(pathname)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session && isAdminPath(pathname) && !PUBLIC_ADMIN_PATHS.has(pathname)) {
    const nextUrl = pathname + context.url.search;
    return context.redirect(`/admin/login?next=${encodeURIComponent(nextUrl)}`, 302);
  }

  const response = await next();
  if (isAdminPath(pathname) || isAdminApiPath(pathname)) {
    try {
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Frame-Options", "DENY");
      response.headers.set("Referrer-Policy", "same-origin");
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
    } catch {
      // Immutable headers (e.g. redirects) — nothing sensitive to protect there.
    }
  }
  return response;
});

/** Staging deployments must never be indexed, whatever the page says. */
const robots = defineMiddleware(async (_context, next) => {
  const response = await next();
  if (!isNoindexDeployment()) return response;
  try {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  } catch {
    // Some responses (e.g. Response.redirect) have immutable headers.
    const copy = new Response(response.body, response);
    copy.headers.set("X-Robots-Tag", "noindex, nofollow");
    return copy;
  }
});

export const onRequest = sequence(locale, database, auth, robots);
