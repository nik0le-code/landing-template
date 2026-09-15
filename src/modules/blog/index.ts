import { defineModuleRuntime } from "../define";
import el from "./i18n/el.json";
import en from "./i18n/en.json";
import "./options";

export default defineModuleRuntime({
  name: "blog",
  slots: {
    "home.beforeCta": () => import("./components/LatestPostsSlot.astro"),
    "admin.dashboard": () => import("./components/DashboardWidget.astro"),
  },
  sitemap: async () => (await import("./lib/posts")).sitemapEntries(),
  publicNav: [{ path: "/blog", label: { el: el.nav, en: en.nav } }],
  adminNav: [{ href: "/admin/blog", label: { en: en.title, el: el.title }, icon: "file-text", order: 30 }],
  i18n: { el, en },
});
