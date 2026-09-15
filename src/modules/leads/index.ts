import { defineModuleRuntime } from "../define";
import el from "./i18n/el.json";
import en from "./i18n/en.json";
import "./options";

export default defineModuleRuntime({
  name: "leads",
  slots: {
    "contact.form": () => import("./components/ContactFormSlot.astro"),
    "layout.beforeFooter": () => import("./components/AttributionCapture.astro"),
    "admin.dashboard": () => import("./components/DashboardWidget.astro"),
  },
  adminNav: [{ href: "/admin/leads", label: { en: en.title, el: el.title }, icon: "mail", order: 20 }],
  i18n: { el, en },
});
