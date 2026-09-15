import { siteConfig, type Locale } from "@site-config";
import { localizePath } from "@/i18n";

/** One logical page, available under one or more locales. */
export interface SitemapEntry {
  /** Path per locale, e.g. `{ el: "/el/blog/nea", en: "/en/blog/news" }`. */
  paths: Partial<Record<Locale, string>>;
  lastModified?: Date;
}

export type SitemapSource = () => Promise<SitemapEntry[]> | SitemapEntry[];

/**
 * Static pages under src/pages/[lang]/ are discovered from the file system.
 * Dynamic routes (`[slug]`) are skipped — their owners (modules) contribute
 * entries through a SitemapSource instead.
 */
const pageFiles = Object.keys(import.meta.glob("/src/pages/*/**/*.astro"));

export function staticPageEntries(): SitemapEntry[] {
  const prefix = "/src/pages/[lang]";
  return pageFiles
    .filter((file) => file.startsWith(`${prefix}/`))
    .map((file) =>
      file
        .slice(prefix.length)
        .replace(/\.astro$/, "")
        .replace(/\/index$/, "")
        .replace(/^$/, "/"),
    )
    .filter((path) => !path.includes("[") && !siteConfig.seo.sitemapExclude.includes(path))
    .sort()
    .map((path) => ({
      paths: Object.fromEntries(siteConfig.locales.map((l) => [l, localizePath(path, l)])),
    }));
}

const sources: SitemapSource[] = [staticPageEntries];

/** Called by modules to add their dynamic pages (blog posts, catalog items, …). */
export function registerSitemapSource(source: SitemapSource) {
  sources.push(source);
}

export async function collectSitemapEntries(): Promise<SitemapEntry[]> {
  const results = await Promise.all(sources.map((source) => source()));
  return results.flat();
}
