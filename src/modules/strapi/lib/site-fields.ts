/**
 * Shape of strapi/src/site-pages.json, written by `npm run strapi:fields` and read by
 * Strapi (locales, field labels) and by the site (populate + mapping back to the copy).
 * Plain Node reads this file too: no imports.
 */

/** One field of a site page: where it sits in the copy (`key`) and in Strapi (`attr`). */
export type SiteField =
  | { kind: "value"; key: string; attr: string }
  | { kind: "image" | "gallery"; key: string; attr: string }
  /** A list of strings, stored as rows with one `value` field. */
  | { kind: "strings"; key: string; attr: string }
  | { kind: "group" | "list"; key: string; attr: string; fields: SiteField[] };

export interface FieldLabel {
  label: string;
  placeholder?: string;
  description?: string;
  /** Shown as the title of collapsed list items. */
  mainField?: boolean;
}

export interface SitePagesFile {
  generatedBy: string;
  locales: string[];
  defaultLocale: string;
  /** Page key → Strapi single type (REST path /api/<apiPath>) and its fields. */
  pages: Record<string, { uid: string; apiPath: string; path: string; fields: SiteField[] }>;
  /** Content-manager labels per content type / component uid, applied by Strapi on start. */
  labels: Record<string, Record<string, FieldLabel>>;
}
