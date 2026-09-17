import { moduleOptions } from "../.generated/registry";
import { defineModuleRuntime } from "../define";
import el from "./i18n/el.json";
import en from "./i18n/en.json";
import "./options";

export default defineModuleRuntime({
  name: "commerce",
  slots: {
    "header.actions": () => import("./components/CartButton.astro"),
    "home.afterHero": () => import("./components/FeaturedSlot.astro"),
  },
  sitemap: async () => (await import("./lib/products")).commerceSitemapEntries(),
  // Evaluated on use, so the configured basePath is respected.
  publicNav: [{ path: () => `/${(moduleOptions.commerce?.basePath as string | undefined) ?? "shop"}`, label: { el: el.nav, en: en.nav } }],
  i18n: { el, en },
});
