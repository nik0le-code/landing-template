/**
 * Editable copy of the site's own pages: field values of the WordPress page linked to a
 * page key (headless bridge endpoint), shaped like the page's dictionary namespace.
 */
import type { Locale } from "@site-config";
import type { EditablePageKey } from "@/config/editable-pages";
import type { ContentImage, PageContentProvider } from "@/lib/page-content";
import { wordpressConfig, wordpressOptions } from "./config";
import { WORDPRESS_CACHE_TAG } from "./content";
import { WordPressError } from "./rest";

interface AcfImage {
  type: "image";
  url: string;
  alt: string;
  width: number;
  height: number;
  sizes: Record<string, string | number>;
}

const isAcfImage = (value: unknown): value is AcfImage =>
  Boolean(value) && typeof value === "object" && (value as AcfImage).type === "image" && typeof (value as AcfImage).url === "string";

/** ACF image arrays → ContentImage, everywhere in the value tree. */
function normalize(value: unknown): unknown {
  if (isAcfImage(value)) {
    const sizes = Object.fromEntries(Object.entries(value.sizes ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    const image: ContentImage = {
      src: sizes["1536x1536"] ?? sizes.large ?? value.url,
      alt: value.alt ?? "",
      width: value.width ?? null,
      height: value.height ?? null,
      sizes: { ...sizes, full: value.url },
    };
    return image;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  return value;
}

export const wordpressPageContent: PageContentProvider = {
  cacheTags: [WORDPRESS_CACHE_TAG],
  get cacheSeconds() {
    return wordpressOptions().cacheSeconds;
  },

  async load(lang: Locale, key: EditablePageKey) {
    const config = wordpressConfig();
    if (!config) throw new WordPressError("WordPress is not configured: set WORDPRESS_URL.", 503);
    const url = new URL(`${config.url}/wp-json/headless/v1/page-content/${key}`);
    url.searchParams.set("lang", lang);
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    // No WordPress page for this key (yet): the code copy is the content.
    if (response.status === 404) return null;
    if (!response.ok) throw new WordPressError(`WordPress HTTP ${response.status} for page content "${key}"`, response.status);
    const { values } = (await response.json()) as { values: Record<string, unknown> | false | null };
    return values ? (normalize(values) as Record<string, unknown>) : null;
  },
};
