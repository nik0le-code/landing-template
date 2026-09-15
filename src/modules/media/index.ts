import { defineModuleRuntime } from "../define";
import el from "./i18n/el.json";
import en from "./i18n/en.json";
import "./options";

export default defineModuleRuntime({
  name: "media",
  adminNav: [{ href: "/admin/media", label: { en: en.title, el: el.title }, icon: "image", order: 80 }],
  i18n: { el, en },
});
