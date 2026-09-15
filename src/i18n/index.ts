import { siteConfig, type Locale } from "@site-config";
import el from "./locales/el.json";
import en from "./locales/en.json";

export type { Locale };

/** The default locale's dictionary is the source of truth for keys. */
export type Dictionary = typeof el;

/**
 * Every configured locale must have a complete dictionary — a missing key in
 * any locale file is a type error here.
 */
const dictionaries: Record<Locale, Dictionary> = { el, en };

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? Leaves<T[K], `${Prefix}${K}.`>
    : `${Prefix}${K}`;
}[keyof T & string];

export type TranslationKey = Leaves<Dictionary>;
export type TranslateParams = Record<string, string | number>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (siteConfig.locales as readonly string[]).includes(value);
}

function lookup(dict: unknown, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Returns a translator bound to `lang`. Falls back to the default locale, then to
 * the key itself, so a missing string is visible instead of crashing a page.
 *
 * ```astro
 * const t = useTranslations(lang);
 * t("notFound.title");
 * t("blog.postedOn", { date });
 * ```
 */
export function useTranslations(lang: Locale) {
  return (key: TranslationKey, params?: TranslateParams): string => {
    const value =
      lookup(dictionaries[lang], key) ?? lookup(dictionaries[siteConfig.defaultLocale], key) ?? key;
    return interpolate(value, params);
  };
}

/** Untyped variant for keys contributed by modules (see src/modules). */
export function translateDynamic(lang: Locale, dict: Partial<Record<Locale, unknown>>, key: string, params?: TranslateParams) {
  const value = lookup(dict[lang], key) ?? lookup(dict[siteConfig.defaultLocale], key) ?? key;
  return interpolate(value, params);
}

/** `/about` + `en` → `/en/about`; `/` + `en` → `/en`. */
export function localizePath(path: string, lang: Locale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return clean === "/" ? `/${lang}` : `/${lang}${clean}`;
}

/** `/en/about` → `{ lang: "en", path: "/about" }`. Unprefixed paths return `lang: undefined`. */
export function splitLocale(pathname: string): { lang: Locale | undefined; path: string } {
  const [, first, ...rest] = pathname.split("/");
  if (isLocale(first)) {
    const path = `/${rest.join("/")}`.replace(/\/+$/, "");
    return { lang: first, path: path === "" ? "/" : path };
  }
  return { lang: undefined, path: pathname };
}

/**
 * Locale-equivalent paths for the current page: used by hreflang tags and the
 * language switcher. Pages whose slugs differ per locale (e.g. blog posts) pass
 * their own map instead.
 */
export function localeAlternates(pathname: string): Record<Locale, string> {
  const { path } = splitLocale(pathname);
  return Object.fromEntries(siteConfig.locales.map((l) => [l, localizePath(path, l)])) as Record<Locale, string>;
}

/** BCP 47 tag for `Intl` formatting and `og:locale` (el → el_GR). */
export const localeRegions: Record<Locale, string> = {
  el: "el-GR",
  en: "en-US",
};

/**
 * Font subsets to preload per locale (must be listed in astro.config `fonts[].subsets`).
 * Other subsets still load on demand via unicode-range; this only avoids
 * preloading bytes a page won't use (e.g. Greek glyphs on English pages).
 */
export const localeFontSubsets: Record<Locale, string[]> = {
  el: ["latin", "greek"],
  en: ["latin"],
};
