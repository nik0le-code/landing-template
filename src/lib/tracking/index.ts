/**
 * Client-side tracking helpers. Safe to call anywhere: without consent (or
 * without configured ids) calls are queued or dropped by gtag, never thrown.
 *
 * ```ts
 * import { trackConversion, trackEvent } from "@/lib/tracking";
 * trackEvent("generate_lead", { form: "contact" });
 * trackConversion("lead");
 * ```
 *
 * Declarative alternative for links/buttons (no script needed):
 * `<a data-track="cta_click" data-track-label="hero">` and
 * `data-track-conversion="lead"`.
 */
import { siteConfig } from "@site-config";

export interface ConsentState {
  v: number;
  t: number;
  analytics: boolean;
  marketing: boolean;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    siteConsent?: {
      /** Stored, still-valid choice, or null if the visitor hasn't decided. */
      get(): ConsentState | null;
      set(choice: { analytics: boolean; marketing: boolean }): void;
      /** False when the consent banner is disabled in site.config. */
      required: boolean;
      onChange(listener: (state: ConsentState) => void): void;
    };
  }
}

export type EventParams = Record<string, string | number | boolean | undefined>;

export function trackEvent(name: string, params?: EventParams) {
  window.gtag?.("event", name, params);
}

/** Fires a Google Ads conversion configured in `siteConfig.tracking.conversions`. */
export function trackConversion(name: string, params?: EventParams & { value?: number; currency?: string }) {
  const sendTo = siteConfig.tracking.conversions[name];
  if (!sendTo) {
    if (import.meta.env.DEV) console.warn(`[tracking] No conversion label configured for "${name}"`);
    return;
  }
  window.gtag?.("event", "conversion", { send_to: sendTo, ...params });
}
