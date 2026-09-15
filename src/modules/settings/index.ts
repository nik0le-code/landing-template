import { defineModuleRuntime } from "../define";
import el from "./i18n/el.json";
import en from "./i18n/en.json";

export default defineModuleRuntime({
  name: "settings",
  adminNav: [{ href: "/admin/settings", label: { en: en.title, el: el.title }, icon: "settings", order: 90 }],
  i18n: { el, en },
  provides: {
    siteSettings: () => import("./lib/store"),
  },
});
