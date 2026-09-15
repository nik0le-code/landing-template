import { localizePath, splitLocale, type Locale } from "@/i18n";
import type { NavLink } from "@/config/navigation";

/** Localized href for a nav link, keeping any #hash. */
export function navHref(link: NavLink, lang: Locale) {
  const [path = "/", hash] = link.path.split("#");
  return localizePath(path, lang) + (hash ? `#${hash}` : "");
}

/** "page" for the exact current page, "true" for an ancestor section, undefined otherwise. */
export function ariaCurrent(link: NavLink, pathname: string): "page" | "true" | undefined {
  if (link.path.includes("#")) return undefined;
  const { path } = splitLocale(pathname);
  if (path === link.path) return "page";
  if (link.path !== "/" && path.startsWith(`${link.path}/`)) return "true";
  return undefined;
}
