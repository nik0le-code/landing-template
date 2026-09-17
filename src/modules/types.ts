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
  /** URL pattern, e.g. "/[lang]/blog/[slug]" or "/admin/blog". May use `{option}` placeholders. */
  pattern: string;
  /** Entrypoint relative to the module folder, e.g. "./pages/post.astro". */
  entrypoint: string;
  prerender?: boolean;
  /**
   * Only inject the route when this option is truthy, e.g. "content.pages" (dot path
   * into the module's options, falling back to `optionDefaults`).
   */
  when?: string;
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
  /**
   * Defaults for `{placeholders}` in route patterns, e.g. `{ "basePath": "products" }`
   * with a route `/[lang]/{basePath}`. Site options of the same name override them
   * (keep options.ts defaults in sync).
   */
  optionDefaults?: Record<string, unknown>;
  /**
   * Modules this one switches on, always or when one of its options is truthy:
   * `[{ "module": "commerce", "when": "shop" }]`. Lets a site enable one module
   * (`wordpress: true` + `shop: true`) instead of listing every building block.
   */
  enables?: { module: string; when?: string }[];
  /**
   * Not switched on in modules.config.ts: only enabled by another module's `enables`
   * (e.g. commerce by shopify or wordpress.shop).
   */
  internal?: boolean;
  /**
   * The module provides page content (`provides.pageContent`) while this option is truthy
   * (or always, with `true`): pages calling getPageContent() are then server-rendered.
   */
  pageContent?: boolean | string;
  /**
   * Extra Content-Security-Policy sources while the module is enabled, merged into
   * astro.config.ts, e.g. `{ "img-src": ["https://cdn.shopify.com"] }`. `{env:NAME}` is
   * replaced by the origin of that build-time environment variable (skipped when unset).
   */
  csp?: Record<string, string[]>;
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
 * Services one module implements for another (e.g. a commerce backend), typed by
 * declaration merging from the consuming module, like ModuleOptionsMap:
 *
 * ```ts
 * declare module "@/modules/types" {
 *   interface ModuleServices { commerce: CommerceProvider }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ModuleServices {}

/** Nested option objects may be given partially (`content: { pages: false }`); arrays are whole. */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

/**
 * modules.config.ts shape. Toggles are plain booleans; options live separately so
 * switching a module is always a one-word change.
 */
export interface ModulesConfig {
  /** Every module folder, `true` = enabled. Unlisted modules are disabled. */
  modules: { [Name in keyof ModuleOptionsMap]?: boolean } & Record<string, boolean>;
  /** Optional per-module options; ignored while the module is disabled. */
  options?: { [Name in keyof ModuleOptionsMap]?: DeepPartial<ModuleOptionsMap[Name]> };
}

/** Named places in core pages where modules can render UI (see <ModuleSlot>). */
export type SlotName =
  | "contact.form"
  | "home.afterHero"
  | "home.beforeCta"
  | "layout.beforeFooter"
  | "header.actions"
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
  /** Per-locale label; falls back to the default locale, then any value. */
  label: Partial<Record<Locale, string>>;
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
  /**
   * Links added to the public navbar (after site links, before the CTA) and the
   * footer's first column. `path` is locale-less, e.g. "/blog".
   */
  publicNav?: { path: string | (() => string); label: Partial<Record<Locale, string>>; enabled?: () => boolean }[];
  /** Module translations: `translateModule(lang, "blog", "list.title")`. */
  i18n?: Partial<Record<Locale, Record<string, unknown>>>;
  /**
   * Implementations of core services. Loaded lazily; core falls back to
   * site.config defaults when no enabled module provides a service.
   */
  provides?: {
    siteSettings?: () => Promise<{ getSettings(): Promise<import("../lib/settings").SiteSettings> }>;
    /** Editable copy and images of code-built pages (src/config/editable-pages.ts). */
    pageContent?: () => Promise<import("../lib/page-content").PageContentProvider | null>;
  } & { [Service in keyof ModuleServices]?: () => Promise<ModuleServices[Service]> };
}
