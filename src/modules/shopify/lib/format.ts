/** Paths, money and image helpers shared by pages and components. */
import type { Locale } from "@site-config";
import { localeRegions } from "@/i18n";
import { getModuleOptions } from "@/modules/registry";
import { shopifyDefaults } from "../options";
import type { Money, ShopifyImage } from "./types";

export const shopifyOptions = () => getModuleOptions("shopify", shopifyDefaults);

export const shopPath = (lang: string, handle?: string) => `/${lang}/${shopifyOptions().basePath}${handle ? `/${handle}` : ""}`;
export const collectionPath = (lang: string, handle: string) => `${shopPath(lang)}/collections/${handle}`;
export const cartPath = (lang: string, sub?: "panel" | "update" | "checkout") => `/${lang}/${shopifyOptions().cartPath}${sub ? `/${sub}` : ""}`;

/** "gid://shopify/ProductVariant/123" → "123" (short, stable URL parameter). */
export const numericId = (gid: string) => gid.split("/").pop()?.split("?")[0] ?? gid;

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

const DEFAULT_WIDTHS = [240, 360, 480, 640, 800, 1080, 1440, 1920];

/** Resized URL from Shopify's image CDN (it serves WebP/AVIF automatically). */
export function imageUrl(image: Pick<ShopifyImage, "url">, width: number): string {
  const url = new URL(image.url);
  url.searchParams.set("width", String(width));
  return url.toString();
}

export function imageSrcset(image: ShopifyImage, widths = DEFAULT_WIDTHS): string {
  const max = image.width ?? Infinity;
  const usable = widths.filter((w) => w <= max);
  return (usable.length ? usable : [Math.min(widths[0]!, max)]).map((w) => `${imageUrl(image, w)} ${w}w`).join(", ");
}
