import { moduleOptions } from "../.generated/registry";
import { defineModuleRuntime } from "../define";
import el from "./i18n/el.json";
import en from "./i18n/en.json";
import "./options";

export default defineModuleRuntime({
  name: "catalog",
  slots: {
    "home.afterHero": () => import("./components/FeaturedSlot.astro"),
    "admin.dashboard": () => import("./components/DashboardWidget.astro"),
  },
  sitemap: async () => (await import("./lib/items")).catalogSitemapEntries(),
  // Evaluated on use, so the configured basePath is respected.
  publicNav: [{ path: () => `/${(moduleOptions.catalog?.basePath as string | undefined) ?? "products"}`, label: { el: el.title, en: en.title } }],
  adminNav: [{ href: "/admin/catalog", label: { en: en.admin.items, el: el.admin.items }, icon: "layers", order: 40 }],
  i18n: { el, en },
});
