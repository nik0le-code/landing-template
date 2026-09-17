import { defineModuleRuntime } from "../define";
import el from "./i18n/el.json";
import en from "./i18n/en.json";
import "./options";

export default defineModuleRuntime({
  name: "woocommerce",
  slots: {
    "admin.dashboard": () => import("./components/DashboardWidget.astro"),
  },
  provides: {
    commerce: async () => (await import("./lib/provider")).wooProvider,
  },
  i18n: { el, en },
});
