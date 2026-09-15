import { defineMiddleware, sequence } from "astro:middleware";
import { siteConfig } from "@site-config";
import { isLocale, splitLocale } from "@/i18n";
import { isNoindexDeployment } from "@/lib/site";
import { ensureMigrated } from "@/db";

/** Resolves `locals.lang` and 404s unknown locale prefixes on `/[lang]/…` routes. */
const locale = defineMiddleware(async (context, next) => {
  const { lang } = splitLocale(context.url.pathname);
  context.locals.lang = lang ?? siteConfig.defaultLocale;

  if (context.routePattern.startsWith("/[lang]") && !isLocale(context.params.lang)) {
    return context.rewrite("/404");
  }
  return next();
});

/** Apply pending DB migrations before the first server-rendered request is handled. */
const database = defineMiddleware(async (context, next) => {
  if (!context.isPrerendered) await ensureMigrated();
  return next();
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

export const onRequest = sequence(locale, database, robots);
