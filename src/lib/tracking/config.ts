import { siteConfig } from "@site-config";

/** Tracking ids in load order; gtag.js is fetched once for the first id. */
export const trackingIds = [siteConfig.tracking.ga4Id, siteConfig.tracking.googleAdsId].filter(Boolean);

export const trackingEnabled = trackingIds.length > 0;

/** The banner is only needed when something non-essential could run. */
export const consentBannerEnabled = trackingEnabled && siteConfig.consent.enabled;

export type ConsentCategory = "analytics" | "marketing";

/** Categories actually in use, so the banner never offers switches that do nothing. */
export const consentCategories: ConsentCategory[] = [
  ...(siteConfig.tracking.ga4Id ? (["analytics"] as const) : []),
  ...(siteConfig.tracking.googleAdsId ? (["marketing"] as const) : []),
];
