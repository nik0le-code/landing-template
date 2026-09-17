import { moduleOptions } from "../.generated/registry";
import { defineModuleRuntime } from "../define";
import el from "./i18n/el.json";
import en from "./i18n/en.json";
import "./options";

const postsEnabled = () => (moduleOptions.wordpress?.content as { posts?: boolean } | undefined)?.posts !== false;

export default defineModuleRuntime({
  name: "wordpress",
  slots: {
    "home.beforeCta": () => import("./components/LatestPostsSlot.astro"),
    "admin.dashboard": () => import("./components/DashboardWidget.astro"),
  },
  sitemap: async () => (await import("./lib/content")).sitemapEntries(),
  publicNav: [
    {
      path: () => `/${(moduleOptions.wordpress?.postsPath as string | undefined) ?? "blog"}`,
      label: { el: el.nav, en: en.nav },
      enabled: postsEnabled,
    },
  ],
  i18n: { el, en },
});
