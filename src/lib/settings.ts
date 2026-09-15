/**
 * Site settings editable without a redeploy. Core code reads them through
 * `getSiteSettings()`; the `settings` module provides the database-backed values.
 * Without that module, defaults from site.config.ts are returned, so nothing
 * depends on the module being enabled.
 */
import { siteConfig, type Locale, type SiteConfig } from "@site-config";
import { modules } from "@/modules/registry";

export interface SiteSettings {
  announcement: {
    enabled: boolean;
    text: Partial<Record<Locale, string>>;
    /** Site-relative ("/contact") or absolute URL; empty for no link. */
    href: string;
    linkText: Partial<Record<Locale, string>>;
  };
  socials: SiteConfig["socials"];
  /** Extra recipients for lead/booking emails (added to module options). */
  notifyEmails: string[];
}

export const defaultSettings: SiteSettings = {
  announcement: { enabled: false, text: {}, href: "", linkText: {} },
  socials: siteConfig.socials,
  notifyEmails: [],
};

const provider = modules.find((module) => module.provides?.siteSettings)?.provides?.siteSettings;

/** True when a module provides editable settings (render the dynamic parts as server islands). */
export const hasEditableSettings = Boolean(provider);

export async function getSiteSettings(): Promise<SiteSettings> {
  if (!provider) return defaultSettings;
  return (await provider()).getSettings();
}
