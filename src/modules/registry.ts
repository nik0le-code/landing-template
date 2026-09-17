/**
 * Runtime access to enabled modules. Everything here reads the generated
 * registry, which only imports modules enabled in modules.config.ts.
 */
import type { Locale } from "@site-config";
import { pickLocalized, translateDynamic, type TranslateParams } from "@/i18n";
import { adminEnabled, enabledModules, moduleOptions, moduleRuntimes } from "./.generated/registry";
import type { AdminNavItem, ModuleOptionsMap, ModuleRuntime, SlotLoader, SlotName } from "./types";

export const modules: readonly ModuleRuntime[] = moduleRuntimes;

/** True when an enabled module declares `"admin": true` (the /admin area exists). */
export const isAdminEnabled: boolean = adminEnabled;

export function isModuleEnabled(name: string): boolean {
  return (enabledModules as readonly string[]).includes(name);
}

/** Options from modules.config.ts, merged over the module's own defaults. */
export function getModuleOptions<Name extends keyof ModuleOptionsMap & string>(
  name: Name,
  defaults: ModuleOptionsMap[Name],
): ModuleOptionsMap[Name] {
  return { ...(defaults as object), ...moduleOptions[name] } as unknown as ModuleOptionsMap[Name];
}

export function getSlotLoaders(name: SlotName): SlotLoader[] {
  return modules.flatMap((module) => {
    const entry = module.slots?.[name];
    return entry ? (Array.isArray(entry) ? entry : [entry]) : [];
  });
}

export function getAdminNav(): AdminNavItem[] {
  return modules.flatMap((module) => module.adminNav ?? []).sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}

/** Label for `lang`, falling back to the default locale and then any provided value. */
export const navLabel = (label: Partial<Record<Locale, string>>, lang: Locale) =>
  pickLocalized(label, lang) || Object.values(label).find(Boolean) || "";

/** Public navigation links contributed by enabled modules, labels resolved for `lang`. */
export function getPublicNav(lang: Locale) {
  return modules
    .flatMap((module) => module.publicNav ?? [])
    .filter((item) => item.enabled?.() ?? true)
    .map((item) => ({ path: typeof item.path === "function" ? item.path() : item.path, label: navLabel(item.label, lang) }));
}

/** Translation lookup inside a module's `i18n` dictionaries. */
export function translateModule(lang: Locale, moduleName: string, key: string, params?: TranslateParams): string {
  const module = modules.find((m) => m.name === moduleName);
  return module?.i18n ? translateDynamic(lang, module.i18n, key, params) : key;
}
