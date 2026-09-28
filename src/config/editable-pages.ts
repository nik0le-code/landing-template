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
  /**
   * The image(s) the page shows by default (project paths, the files the page imports).
   * `npm run strapi:sync` uploads them so the CMS starts with what the site shows.
   */
  src?: string | string[];
}

export interface EditablePage {
  /** Site path without the language, as linked from the CMS ("View page"). */
  path: string;
  images: Record<string, EditableImage>;
}

export const editablePages = {
  home: { path: "/", images: { "hero.image": { type: "image", label: "Hero image", src: "src/assets/demo/hero.jpg" } } },
  about: {
    path: "/about",
    images: {
      "hero.image": { type: "image", label: "Hero image", src: "src/assets/demo/about.jpg" },
      "team.members.photo": { type: "image", label: "Photo" },
    },
  },
  services: {
    path: "/services",
    images: {
      "gallery.images": {
        type: "gallery",
        label: "Gallery images",
        src: [1, 2, 3, 4, 5, 6].map((n) => `src/assets/demo/gallery-${n}.jpg`),
      },
    },
  },
  contact: { path: "/contact", images: {} },
} satisfies Record<string, EditablePage>;

export type EditablePageKey = keyof typeof editablePages;
