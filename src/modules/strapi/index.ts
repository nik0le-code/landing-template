import { moduleOptions } from "../.generated/registry";
import { defineModuleRuntime } from "../define";
import el from "./i18n/el.json";
import en from "./i18n/en.json";
import "./options";

const content = () => (moduleOptions.strapi?.content ?? {}) as { posts?: boolean; sitePages?: boolean };
const postsEnabled = () => content().posts !== false;

export default defineModuleRuntime({
  name: "strapi",
  slots: {
    "home.beforeCta": () => import("./components/LatestPostsSlot.astro"),
    "admin.dashboard": () => import("./components/DashboardWidget.astro"),
  },
  sitemap: async () => (await import("./lib/content")).sitemapEntries(),
  // null while content.sitePages is off: the site's pages then keep their code copy (and stay prerendered).
  provides: { pageContent: async () => (content().sitePages === false ? null : (await import("./lib/page-content")).strapiPageContent) },
  publicNav: [
    {
      path: () => `/${(moduleOptions.strapi?.postsPath as string | undefined) ?? "blog"}`,
      label: { el: el.nav, en: en.nav },
      enabled: postsEnabled,
    },
  ],
  i18n: { el, en },
});
