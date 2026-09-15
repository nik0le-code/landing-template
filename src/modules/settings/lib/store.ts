/**
 * Database-backed settings with a short in-process cache: pages and server islands
 * read settings on every render, so this avoids a query per request. Saves clear
 * the cache immediately on the pod that handled them; other replicas pick changes
 * up within CACHE_TTL_MS.
 */
import { z } from "astro/zod";
import { eq } from "drizzle-orm";
import { siteConfig } from "@site-config";
import { getDb } from "@/db";
import { defaultSettings, type SiteSettings } from "@/lib/settings";
import { settingsValues } from "../db/schema";

const KEY = "site";
const CACHE_TTL_MS = 30_000;

const localized = z.record(z.enum(siteConfig.locales as unknown as [string, ...string[]]), z.string().max(300)).catch({});
const url = z.union([z.literal(""), z.url({ protocol: /^https?$/ })]);

export const settingsSchema = z.object({
  announcement: z
    .object({
      enabled: z.boolean(),
      text: localized,
      href: z.union([z.literal(""), z.string().regex(/^\/(?!\/)/), z.url({ protocol: /^https?$/ })]).catch(""),
      linkText: localized,
    })
    .catch(defaultSettings.announcement),
  socials: z
    .object({ facebook: url, instagram: url, linkedin: url, x: url, youtube: url, tiktok: url })
    .partial()
    .catch(defaultSettings.socials),
  notifyEmails: z.array(z.email()).max(20).catch([]),
});

let cached: { value: SiteSettings; expires: number } | null = null;

export async function getSettings(): Promise<SiteSettings> {
  if (cached && cached.expires > Date.now()) return cached.value;
  const [row] = await getDb().select().from(settingsValues).where(eq(settingsValues.key, KEY)).limit(1);
  // Stored values are validated on read too, so a bad row can never break rendering.
  const value = row ? ({ ...defaultSettings, ...settingsSchema.parse(row.value) } as SiteSettings) : defaultSettings;
  cached = { value, expires: Date.now() + CACHE_TTL_MS };
  return value;
}

export async function saveSettings(value: SiteSettings, userId: string) {
  await getDb()
    .insert(settingsValues)
    .values({ key: KEY, value, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settingsValues.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
  cached = null;
}
