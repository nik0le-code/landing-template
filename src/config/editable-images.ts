/**
 * The image each editable image field shows while it is empty, so `npm run strapi:sync`
 * can put it in the CMS: editors see the picture the page shows and replace it there.
 * Keys are the image paths of src/config/editable-pages.ts. Each function gets the group
 * or list item as the site shows it (`slug`, `name`…) and its position in its list:
 *
 *   home: { "projects.items.image": (item) => projectImages[item.slug as string] },
 *   about: { "team.members.photo": (_item, index) => portraits[index] },
 *
 * For a fixed image `src` in editable-pages.ts is enough; this is for images the page
 * picks per item (by slug, by position) from its own imports, so nothing is listed twice.
 *
 * The site keeps showing its own optimized copy, with its own framing, until an editor
 * picks another image (SITE_DEFAULT_CAPTION in src/modules/strapi/lib/site-fields.ts).
 * Loaded through Vite by the sync script only; pages don't import it.
 */
import type { ImageMetadata } from "astro";
import type { EditablePageKey } from "./editable-pages";

type Source = ImageMetadata | string | undefined;
export type DefaultImage = (item: Record<string, unknown>, index: number) => Source | Source[];
export type DefaultImages = { [K in EditablePageKey]?: Record<string, DefaultImage> };

export const defaultImages: DefaultImages = {};
