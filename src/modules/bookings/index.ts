import { moduleOptions } from "../.generated/registry";
import { defineModuleRuntime } from "../define";
import el from "./i18n/el.json";
import en from "./i18n/en.json";
import "./options";

export default defineModuleRuntime({
  name: "bookings",
  slots: { "admin.dashboard": () => import("./components/DashboardWidget.astro") },
  publicNav: [{ path: () => `/${(moduleOptions.bookings?.basePath as string | undefined) ?? "booking"}`, label: { el: el.title, en: en.title } }],
  adminNav: [{ href: "/admin/bookings", label: { en: en.title, el: el.title }, icon: "calendar", order: 25 }],
  i18n: { el, en },
});
