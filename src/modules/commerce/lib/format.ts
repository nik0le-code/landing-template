/** Paths, money and option helpers shared by pages and components. */
import type { Locale } from "@site-config";
import { localeRegions } from "@/i18n";
import { getModuleOptions, translateModule } from "@/modules/registry";
import { commerceDefaults } from "../options";
import type { Money } from "./types";

export const commerceOptions = () => getModuleOptions("commerce", commerceDefaults);

export const shopPath = (lang: string, handle?: string) => `/${lang}/${commerceOptions().basePath}${handle ? `/${handle}` : ""}`;
export const collectionPath = (lang: string, handle: string) => `${shopPath(lang)}/collections/${handle}`;
export const cartPath = (lang: string, sub?: "panel" | "update" | "checkout" | `order/${string}`) =>
  `/${lang}/${commerceOptions().cartPath}${sub ? `/${sub}` : ""}`;

/** Short, URL-friendly variant key: "gid://shopify/ProductVariant/123" → "123", "45" → "45". */
export const variantKey = (id: string) => id.split("/").pop()?.split("?")[0] ?? id;

export function formatMoney(money: Money, lang: Locale): string {
  const amount = Number(money.amount);
  return new Intl.NumberFormat(localeRegions[lang], {
    style: "currency",
    currency: money.currencyCode,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

/** True when `compareAt` is a real, higher "was" price. */
export const isDiscounted = (price: Money, compareAt: Money | null | undefined): compareAt is Money =>
  Boolean(compareAt && Number(compareAt.amount) > Number(price.amount));

/** Minor units ("1990", 2 decimals) → Money ("19.90"). */
export function fromMinorUnits(value: string | number, currencyCode: string, minorUnit = 2): Money {
  return { amount: (Number(value) / 10 ** minorUnit).toFixed(minorUnit), currencyCode };
}

/**
 * Payment method name for `lang`: `options.commerce.paymentMethodLabels`, then the
 * built-in translations (cod, bacs, vivacom_smart, …), then the backend's id.
 */
export function paymentMethodLabel(id: string, lang: Locale, part: "title" | "description" = "title"): string {
  const custom = commerceOptions().paymentMethodLabels[id]?.[part]?.[lang];
  if (custom) return custom;
  const key = `payment.${id}.${part}`;
  const translated = translateModule(lang, "commerce", key);
  return translated !== key ? translated : part === "title" ? id : "";
}

/** Decodes the HTML entities backends put in plain-text messages and titles. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(quot|amp|lt|gt|apos|nbsp|times|ndash|hellip);/g, (_, name: string) =>
      ({ quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", nbsp: " ", times: "×", ndash: "-", hellip: "…" })[name]!,
    );
}
