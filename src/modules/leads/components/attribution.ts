/**
 * First-touch attribution: the first landing URL's utm_* / click ids and the
 * external referrer are kept for the browser session and attached to lead forms.
 * sessionStorage only — nothing persists beyond the tab session.
 */
const KEY = "lead-attribution";
const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "fbclid"];

export function captureAttribution() {
  try {
    if (sessionStorage.getItem(KEY)) return;
    const url = new URL(location.href);
    const data: Record<string, string> = { landing_page: url.pathname };
    for (const param of PARAMS) {
      const value = url.searchParams.get(param);
      if (value) data[param] = value;
    }
    if (document.referrer) {
      const referrer = new URL(document.referrer);
      if (referrer.host !== location.host) data.referrer = referrer.host;
    }
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage blocked (private mode etc.): attribution is best-effort.
  }
}

export function readAttribution(): Record<string, string> {
  captureAttribution();
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}
