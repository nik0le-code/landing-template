/**
 * Module system contracts.
 *
 * A module lives in `src/modules/<name>/` and is switched on/off in the root
 * `modules.config.ts` — the single source of truth. Disabled modules are never
 * imported, so none of their code, routes, actions or tables reach the build.
 *
 * Files a module can provide:
 *
 *   module.json      REQUIRED  Static manifest (ModuleManifest): name, description,
 *                              dependencies, routes. Plain JSON so the Astro
 *                              integration, drizzle.config.ts and the CLI can read
 *                              it without a TypeScript loader.
 *   index.ts         REQUIRED  Runtime registration (defineModuleRuntime): slots,
 *                              sitemap entries, admin navigation, translations.
 *   actions.ts       optional  `export const actions = { … }` Astro Actions, exposed
 *                              as `actions.<moduleName>.<action>`.
 *   db/schema.ts     optional  Drizzle tables. Import only from `drizzle-orm`;
 *                              prefix table names with the module name.
 *   pages/…          optional  Route entrypoints referenced by the manifest.
 */
import type { Locale } from "../../site.config";

export interface ModuleRoute {
  /** URL pattern, e.g. "/[lang]/blog/[slug]" or "/admin/blog". */
  pattern: string;
  /** Entrypoint relative to the module folder, e.g. "./pages/post.astro". */
  entrypoint: string;
  prerender?: boolean;
}

export interface ModuleManifest {
  /** Must equal the folder name and the key in modules.config.ts. */
  name: string;
  description: string;
  /** The module has admin pages: enables the admin area (login, users, dashboard). */
  admin?: boolean;
  /** Other modules that must be enabled for this one to work. */
  dependsOn?: string[];
  routes?: ModuleRoute[];
}

/**
 * Per-module options, typed by declaration merging from each module's `options.ts`
 * (used for `options` in modules.config.ts):
 *
 * ```ts
 * declare module "@/modules/types" {
 *   interface ModuleOptionsMap { leads: { notifyEmails: string[] } }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ModuleOptionsMap {}

/**
 * modules.config.ts shape. Toggles are plain booleans; options live separately so
 * switching a module is always a one-word change.
 */
export interface ModulesConfig {
  /** Every module folder, `true` = enabled. Unlisted modules are disabled. */
  modules: { [Name in keyof ModuleOptionsMap]?: boolean } & Record<string, boolean>;
  /** Optional per-module options; ignored while the module is disabled. */
  options?: { [Name in keyof ModuleOptionsMap]?: Partial<ModuleOptionsMap[Name]> };
}

/** Named places in core pages where modules can render UI (see <ModuleSlot>). */
export type SlotName =
  | "contact.form"
  | "home.afterHero"
  | "home.beforeCta"
  | "layout.beforeFooter"
  | "admin.dashboard"
  | (string & {});

/** Lazy component loader — only evaluated when a page actually renders the slot. */
export type SlotLoader = () => Promise<{ default: unknown }>;

export interface SitemapEntryLike {
  paths: Partial<Record<Locale, string>>;
  lastModified?: Date;
}

export interface AdminNavItem {
  href: string;
  label: Partial<Record<Locale, string>> & { en: string };
  /** Name from src/components/ui/icons.ts. */
  icon?: string;
  /** Lower sorts first; core items use 0–10. */
  order?: number;
}

export interface ModuleRuntime {
  name: string;
  /** Components rendered into named slots, in registration order. */
  slots?: Partial<Record<SlotName, SlotLoader | SlotLoader[]>>;
  /** Dynamic pages for sitemap.xml (static pages are discovered automatically). */
  sitemap?: () => Promise<SitemapEntryLike[]> | SitemapEntryLike[];
  /** Sidebar entries in the admin dashboard. */
  adminNav?: AdminNavItem[];
  /** Module translations: `translateModule(lang, "blog", "list.title")`. */
  i18n?: Partial<Record<Locale, Record<string, unknown>>>;
}
