/**
 * Copy and images of code-built pages, editable in a CMS when a module provides page
 * content (see src/config/editable-pages.ts). Without one, this is the page's
 * dictionary and the page stays prerendered.
 *
 * ```astro
 * const { copy, images } = await getPageContent(Astro, "home");
 * <HeroCentered title={copy.hero.title} image={{ src: images.get("hero.image")?.src ?? heroImage, alt: … }} />
 * ```
 *
 * Pages that call this become server-rendered (and cached) while such a module is
 * enabled; the modules integration switches them automatically.
 */
import type { AstroGlobal } from "astro";
import type { Locale } from "@site-config";
import { getDictionary, type Dictionary } from "@/i18n";
import { modules } from "@/modules/registry";
import type { EditablePageKey } from "@/config/editable-pages";

export interface ContentImage {
  /** A large rendition (about 1500px). */
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
  /** Other renditions by name (thumbnail, medium, large…), when the CMS provides them. */
  sizes: Record<string, string>;
}

export interface PageContentProvider {
  /** Edited values for a page in a language, shaped like its dictionary namespace; null when there are none. */
  load(lang: Locale, key: EditablePageKey): Promise<Record<string, unknown> | null>;
  cacheTags: string[];
  cacheSeconds: number;
}

// Resolved on first use: module runtimes may still be loading when this file is imported.
const providerLoader = () => modules.find((module) => module.provides?.pageContent)?.provides?.pageContent?.() ?? Promise.resolve(null);

type Value = unknown;
const isObject = (value: Value): value is Record<string, Value> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isImage = (value: Value): value is ContentImage => isObject(value) && typeof value.src === "string";

/**
 * Edited values over the code copy, field by field: empty strings and empty lists keep
 * the code value; an edited list replaces the list, and each item falls back to the code
 * item at the same position.
 */
function merge(code: Value, edited: Value): Value {
  if (edited === undefined || edited === null) return code;
  if (typeof code === "string") return typeof edited === "string" && edited.trim() ? edited : code;
  if (typeof code === "number") return typeof edited === "number" || (typeof edited === "string" && edited.trim() !== "" && !Number.isNaN(Number(edited))) ? Number(edited) : code;
  if (typeof code === "boolean") return typeof edited === "boolean" ? edited : code;
  if (Array.isArray(code)) {
    if (!Array.isArray(edited) || edited.length === 0) return code;
    // Lists of strings are stored as rows with a single "value" field.
    if (typeof code[0] === "string") {
      const strings = edited.map((row) => (isObject(row) ? row.value : row)).filter((item): item is string => typeof item === "string" && item.trim() !== "");
      return strings.length ? strings : code;
    }
    // Nothing in the code list to take the shape from (items added in the CMS to an empty list).
    if (code.length === 0) return edited;
    return edited.map((item, index) => merge(code[index] ?? blankLike(code[0]), item));
  }
  if (isObject(code)) {
    if (!isObject(edited)) return code;
    return Object.fromEntries(Object.entries(code).map(([key, value]) => [key, merge(value, edited[key])]));
  }
  return code;
}

/** An item with the shape of `sample` and no values, for list items added in the CMS. */
function blankLike(sample: Value): Value {
  if (typeof sample === "string") return "";
  if (Array.isArray(sample)) return [];
  if (isObject(sample)) return Object.fromEntries(Object.entries(sample).map(([key, value]) => [key, blankLike(value)]));
  return sample;
}

function at(values: Value, dotPath: string): Value {
  return dotPath.split(".").reduce<Value>((node, key) => (Array.isArray(node) ? node[Number(key)] : isObject(node) ? node[key] : undefined), values);
}

export interface PageContent<K extends EditablePageKey> {
  copy: Dictionary[K];
  images: {
    /** An edited image, e.g. "hero.image" or "team.members.2.photo"; undefined keeps the page's own. */
    get(path: string): ContentImage | undefined;
    /** An edited image list (gallery); undefined when none was set. */
    list(path: string): ContentImage[] | undefined;
  };
}

export async function getPageContent<K extends EditablePageKey>(astro: Pick<AstroGlobal, "locals" | "cache">, key: K): Promise<PageContent<K>> {
  const lang = astro.locals.lang;
  const code = getDictionary(lang)[key];
  let edited: Record<string, unknown> | null = null;

  const provider = await providerLoader();
  if (provider) {
    try {
      edited = await provider.load(lang, key);
      astro.cache.set({ maxAge: provider.cacheSeconds, swr: 3600, tags: provider.cacheTags });
    } catch (error) {
      // The CMS being down must not take the page down: code copy, not cached.
      console.error(`[page-content] ${key}:`, error);
    }
  }

  return {
    copy: (edited ? merge(code, edited) : code) as Dictionary[K],
    images: {
      get: (path) => {
        const value = edited ? at(edited, path) : undefined;
        return isImage(value) ? value : undefined;
      },
      list: (path) => {
        const value = edited ? at(edited, path) : undefined;
        const images = Array.isArray(value) ? value.filter(isImage) : [];
        return images.length ? images : undefined;
      },
    },
  };
}
