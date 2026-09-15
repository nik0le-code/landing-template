import { siteConfig } from "@site-config";
import { defineModuleRuntime } from "../define";
import "./options";

export default defineModuleRuntime({
  name: "example",
  slots: {
    "home.beforeCta": () => import("./components/ExampleNotice.astro"),
  },
  sitemap: () => [{ paths: Object.fromEntries(siteConfig.locales.map((lang) => [lang, `/${lang}/example`])) }],
  adminNav: [{ href: "/admin/example", label: { en: "Example", el: "Παράδειγμα" }, icon: "sparkles" }],
  i18n: {
    el: { title: "Παράδειγμα module", notice: "Το module «example» είναι ενεργό.", add: "Προσθήκη", empty: "Δεν υπάρχουν μηνύματα." },
    en: { title: "Example module", notice: "The “example” module is enabled.", add: "Add", empty: "No messages yet." },
  },
});
