/**
 * Editable copy of the site's own pages: the Strapi single type generated for a page key
 * (npm run strapi:fields), mapped back to the shape of the page's dictionary namespace.
 */
import type { Locale } from "@site-config";
import type { EditablePageKey } from "@/config/editable-pages";
import type { ContentImage, PageContentProvider } from "@/lib/page-content";
import sitePagesJson from "../strapi/src/site-pages.json";
import type { StrapiMedia } from "./blocks";
import { strapiOptions } from "./config";
import { STRAPI_CACHE_TAG } from "./content";
import { mediaUrl, strapiGet, type Query } from "./rest";
import { SITE_DEFAULT_CAPTION, type SiteField, type SitePagesFile } from "./site-fields";

const sitePages = sitePagesJson as unknown as SitePagesFile;

/** Components and media need populating; plain fields always come back. */
function populateOf(fields: SiteField[]): Query | undefined {
  const populate: Query = {};
  for (const field of fields) {
    if (field.kind === "group" || field.kind === "list") {
      const nested = populateOf(field.fields);
      populate[field.attr] = nested ? { populate: nested } : true;
    } else if (field.kind !== "value") {
      populate[field.attr] = true;
    }
  }
  return Object.keys(populate).length ? populate : undefined;
}

/** Uploaded by strapi:sync as what the page shows anyway: the page keeps its own copy. */
const isSiteDefault = (media: StrapiMedia | null | undefined) => media?.caption === SITE_DEFAULT_CAPTION;

function contentImage(media: StrapiMedia | null | undefined): ContentImage | undefined {
  if (!media?.url) return undefined;
  const sizes = Object.fromEntries(Object.entries(media.formats ?? {}).map(([name, format]) => [name, mediaUrl(format.url)]));
  return {
    src: sizes.large ?? mediaUrl(media.url),
    alt: media.alternativeText ?? "",
    width: media.formats?.large?.width ?? media.width,
    height: media.formats?.large?.height ?? media.height,
    sizes: { ...sizes, full: mediaUrl(media.url) },
  };
}

type Raw = Record<string, unknown> | null | undefined;

/** Strapi attribute names → dictionary keys, media → ContentImage, all the way down. */
function reshape(fields: SiteField[], raw: Raw): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (!raw) return values;
  for (const field of fields) {
    const value = raw[field.attr];
    if (value === null || value === undefined) continue;
    switch (field.kind) {
      case "value":
      case "strings":
        values[field.key] = value;
        break;
      case "image":
        if (!isSiteDefault(value as StrapiMedia)) values[field.key] = contentImage(value as StrapiMedia);
        break;
      case "gallery":
        // Only the site's own images: its own gallery. Any other image: the gallery as edited.
        if (!(value as StrapiMedia[]).every(isSiteDefault)) values[field.key] = (value as StrapiMedia[]).map(contentImage).filter(Boolean);
        break;
      case "group":
        values[field.key] = reshape(field.fields, value as Raw);
        break;
      case "list":
        values[field.key] = (value as Raw[]).map((item) => reshape(field.fields, item));
        break;
    }
  }
  return values;
}

export const strapiPageContent: PageContentProvider = {
  cacheTags: [STRAPI_CACHE_TAG],
  get cacheSeconds() {
    return strapiOptions().cacheSeconds;
  },

  async load(lang: Locale, key: EditablePageKey) {
    const page = sitePages.pages[key];
    // Not generated yet (npm run strapi:fields): the code copy is the content.
    if (!page) return null;
    const result = await strapiGet<Raw>(`/${page.apiPath}`, { locale: lang, populate: populateOf(page.fields) });
    // Nobody has saved this page in this language yet.
    return result?.data ? reshape(page.fields, result.data) : null;
  },
};
