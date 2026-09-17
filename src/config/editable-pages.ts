/**
 * Pages built in code whose copy (and images) editors can change in a CMS, when a
 * module provides page content (the wordpress module with `content.sitePages`).
 *
 * Text and lists come from the page's namespace in src/i18n/locales/<lang>/<key>.json:
 * every string, list and group there becomes an editable field, and an empty field
 * falls back to that file. Images aren't in the JSON (pages import them), so each
 * editable image is declared here by its path in the copy:
 *
 *   "hero.image"          one image in the hero group
 *   "team.members.photo"  a photo on every item of the team.members list
 *   "gallery.images"      a list of images (gallery)
 *
 * Plain Node reads this file too (npm run wp:fields): no imports.
 */
export interface EditableImage {
  type: "image" | "gallery";
  label: string;
}

export interface EditablePage {
  /** Site path without the language, as linked from the CMS ("View page"). */
  path: string;
  images: Record<string, EditableImage>;
}

export const editablePages = {
  home: { path: "/", images: { "hero.image": { type: "image", label: "Hero image" } } },
  about: {
    path: "/about",
    images: {
      "hero.image": { type: "image", label: "Hero image" },
      "team.members.photo": { type: "image", label: "Photo" },
    },
  },
  services: { path: "/services", images: { "gallery.images": { type: "gallery", label: "Gallery images" } } },
  contact: { path: "/contact", images: {} },
} satisfies Record<string, EditablePage>;

export type EditablePageKey = keyof typeof editablePages;
