/**
 * Per-client site configuration — the first file to edit when starting a new project.
 *
 * Everything here is static (read at build time and at runtime). Values that the
 * client should be able to change without a redeploy belong to the `settings`
 * module, which overrides the matching fields at runtime.
 */

export const locales = ["el", "en"] as const;
export type Locale = (typeof locales)[number];

export interface SiteConfig {
  /** Brand name, used in titles, JSON-LD and emails. */
  name: string;
  /** Canonical origin, no trailing slash. Overridden by the SITE_URL env var. */
  url: string;
  defaultLocale: Locale;
  locales: readonly Locale[];
  /** `%s` is replaced by the page title. */
  titleTemplate: string;
  description: Record<Locale, string>;
  /** Default Open Graph image, relative to /public. */
  ogImage: string;
  themeColor: string;
  organization: {
    legalName: string;
    /** "Organization" or a LocalBusiness subtype, e.g. "Dentist", "Restaurant". */
    type: string;
    logo: string;
    foundingYear?: number;
  };
  contact: {
    email: string;
    phone?: string;
    address?: {
      street: string;
      city: string;
      postalCode: string;
      region?: string;
      country: string;
    };
    /** Opening hours in schema.org format, e.g. "Mo-Fr 09:00-17:00". */
    openingHours?: string[];
  };
  socials: Partial<Record<"facebook" | "instagram" | "linkedin" | "x" | "youtube" | "tiktok", string>>;
  tracking: {
    /** GA4 measurement id, e.g. "G-XXXXXXX". Empty disables it. */
    ga4Id: string;
    /** Google Ads id, e.g. "AW-XXXXXXX". Empty disables it. */
    googleAdsId: string;
    /**
     * Google Ads conversion labels by name, fired with `trackConversion(name)`.
     * Value is "AW-XXXXXXX/AbCdEfGh" (Ads → Goals → Conversions → Tag setup).
     */
    conversions: Record<string, string>;
  };
  consent: {
    /**
     * Show the cookie banner and keep tracking off until the visitor opts in
     * (Google Consent Mode v2, "basic" implementation). Only disable for sites
     * with no EU visitors. With no tracking ids configured, no banner is shown.
     */
    enabled: boolean;
    /** Bump to ask everyone again (e.g. after adding a new tracker). */
    version: number;
    /** Re-ask after this many days (Greek DPA guidance: at most 6 months). */
    maxAgeDays: number;
  };
  seo: {
    /** Locale-less paths (e.g. "/thank-you") to leave out of sitemap.xml. */
    sitemapExclude: string[];
  };
}

export const siteConfig: SiteConfig = {
  name: "Acme",
  url: "https://example.com",
  defaultLocale: "el",
  locales,
  titleTemplate: "%s | Acme",
  description: {
    el: "Η Acme βοηθά επιχειρήσεις να αναπτυχθούν με σύγχρονες λύσεις.",
    en: "Acme helps businesses grow with modern solutions.",
  },
  ogImage: "/og-default.png",
  themeColor: "#0f172a",
  organization: {
    legalName: "Acme Ltd",
    type: "Organization",
    logo: "/logo.svg",
    foundingYear: 2020,
  },
  contact: {
    email: "hello@example.com",
    phone: "+30 210 000 0000",
    address: {
      street: "Ermou 1",
      city: "Athens",
      postalCode: "10563",
      country: "GR",
    },
    openingHours: ["Mo-Fr 09:00-17:00"],
  },
  socials: {
    linkedin: "https://www.linkedin.com/company/example",
    instagram: "https://www.instagram.com/example",
  },
  tracking: {
    ga4Id: "",
    googleAdsId: "",
    conversions: {
      // lead: "AW-XXXXXXX/AbCdEfGh",
    },
  },
  consent: {
    enabled: true,
    version: 1,
    maxAgeDays: 180,
  },
  seo: {
    sitemapExclude: [],
  },
};
